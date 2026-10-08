"""Local Chromium check. All market-feed responses are intercepted fixtures."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parent.parent
artifact = root / "build/site"
screens = Path("/workspace/work/app-review")
screens.mkdir(parents=True, exist_ok=True)
payload = json.loads((artifact / "api/v2-portfolio.json").read_text())
state = {"feed": "live", "worker_version": 1, "requests": 0}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(artifact), **kwargs)

    def log_message(self, *args):
        pass

    def translate_path(self, path):
        parsed = urlsplit(path).path
        if parsed.startswith("/beta/"):
            path = parsed[len("/beta"):]
        return super().translate_path(path)

    def do_GET(self):
        if urlsplit(self.path).path == "/beta/sw.js":
            body = (artifact / "sw.js").read_text().replace("20261008-app-1", f"20261008-app-{state['worker_version']}").encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/javascript")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
thread = Thread(target=server.serve_forever, daemon=True)
thread.start()
try:
    with sync_playwright() as playwright:
        profile = TemporaryDirectory(prefix="browser-profile-", dir=screens)
        context = playwright.chromium.launch_persistent_context(profile.name, executable_path="/usr/bin/chromium", headless=True,
                                                                 args=["--no-sandbox"], viewport={"width": 1280, "height": 960})
        try:
            def feed(route):
                state["requests"] += 1
                if state["feed"] == "live":
                    route.fulfill(json=payload)
                else:
                    route.abort("internetdisconnected" if state["feed"] == "offline" else "failed")
            context.route("https://raw.githubusercontent.com/irruyan/trading-master-data/main/v2-snapshot.json", feed)
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(f"http://127.0.0.1:{server.server_port}/beta/", wait_until="networkidle")
            expect(page.locator("#app h1")).to_have_text("관심종목")
            page.wait_for_function("Boolean(navigator.serviceWorker.controller)")
            expect(page.locator("#app-update-note")).not_to_be_visible()
            manifest = context.new_cdp_session(page).send("Page.getAppManifest")
            assert not manifest["errors"], manifest["errors"]
            installation = context.new_cdp_session(page).send("Page.getInstallabilityErrors")
            assert not installation["installabilityErrors"], installation["installabilityErrors"]

            # Exercise the platform prompt lifecycle without installing an OS application.
            page.evaluate("""() => {
                window.promptCalls = 0;
                const event = new Event('beforeinstallprompt', {cancelable: true});
                event.prompt = async () => { window.promptCalls++; };
                event.userChoice = Promise.resolve({outcome: 'dismissed'});
                window.dispatchEvent(event);
            }""")
            expect(page.locator("#app-install")).to_have_text("앱 설치")
            page.locator("#app-install").click()
            expect(page.locator("#app-install")).to_have_text("설치 안내")
            assert page.evaluate("window.promptCalls") == 1
            page.locator("#app-install").click()
            expect(page.locator("#install-guide")).to_be_visible()
            assert "Safari" in page.locator("#install-guide").inner_text()
            page.get_by_role("button", name="확인", exact=True).click()
            expect(page.locator("#install-guide")).not_to_be_visible()
            page.screenshot(path=str(screens / "app-desktop.png"))

            for width in (320, 360, 390, 414, 768, 1280):
                page.set_viewport_size({"width": width, "height": 844})
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"horizontal overflow at {width}px"
            page.set_viewport_size({"width": 390, "height": 844})
            page.locator("#mobile-ks_mid").click()
            expect(page.locator("#app h1")).to_have_text("코스피")
            page.screenshot(path=str(screens / "app-mobile.png"))
            before = page.evaluate("({portfolio: DATA, watchlist: WATCHLIST})")

            state["feed"] = "offline"
            context.set_offline(True)
            expect(page.locator("#connection-note")).to_be_visible()
            expect(page.locator("#status-tag")).to_have_text("인터넷 끊김")
            expect(page.locator("#data-retry")).to_be_disabled()
            assert page.evaluate("({portfolio: DATA, watchlist: WATCHLIST})") == before
            page.screenshot(path=str(screens / "app-offline.png"))
            page.reload(wait_until="domcontentloaded")
            expect(page.locator("#app .empty b")).to_have_text("데이터를 불러오지 못했습니다.")
            expect(page.locator("#connection-copy")).to_contain_text("인터넷 연결")
            assert page.evaluate("DATA === null")

            state["feed"] = "live"
            context.set_offline(False)
            # Chromium's emulation can reset navigator.onLine on cached navigation;
            # deliver the browser lifecycle event explicitly for this reconnect case.
            page.evaluate("window.dispatchEvent(new Event('online'))")
            expect(page.locator("#app h1")).to_have_text("코스피")
            expect(page.locator("#connection-note")).not_to_be_visible()
            assert page.evaluate("({portfolio: DATA, watchlist: WATCHLIST})") == before

            state["feed"] = "fail"
            page.evaluate("window.TRADING_MASTER_REFRESH()")
            expect(page.locator("#connection-note")).to_be_visible()
            expect(page.locator("#connection-copy")).to_contain_text("새 운용 기록을 불러오지 못했습니다.")
            assert page.evaluate("({portfolio: DATA, watchlist: WATCHLIST})") == before
            state["feed"] = "live"
            page.locator("#data-retry").click()
            expect(page.locator("#connection-note")).not_to_be_visible()

            keys = page.evaluate("""async () => {
                const result = [];
                for (const key of await caches.keys()) {
                    for (const request of await (await caches.open(key)).keys()) result.push(request.url);
                }
                return result;
            }""")
            assert len(keys) == 9, keys
            assert all("/api/" not in key and "snapshot" not in key and "raw.githubusercontent.com" not in key for key in keys), keys

            # The new worker waits, then updates only after the user clicks.
            old_hash = page.evaluate("location.hash")
            page.evaluate("window.keepUntilUpdate = 1")
            state["worker_version"] = 2
            page.evaluate("async () => (await navigator.serviceWorker.getRegistration()).update()")
            expect(page.locator("#app-update-note")).to_be_visible()
            assert page.evaluate("window.keepUntilUpdate") == 1
            with page.expect_navigation(wait_until="networkidle"):
                page.locator("#app-update").click()
            assert page.evaluate("location.hash") == old_hash
            expect(page.locator("#app h1")).to_have_text("코스피")
            expect(page.locator("#app-update-note")).not_to_be_visible()
            assert not errors, errors
            print(json.dumps({"browser": "Chromium", "mobile_widths": [320, 360, 390, 414, 768, 1280],
                              "installability": "passed", "offline_shell": "passed", "reconnect": "passed",
                              "user_controlled_update": "passed", "financial_data_unchanged": True,
                              "cached_market_data": 0}, ensure_ascii=False))
        finally:
            context.close()
            profile.cleanup()
finally:
    server.shutdown()
    server.server_close()
    thread.join(timeout=2)
