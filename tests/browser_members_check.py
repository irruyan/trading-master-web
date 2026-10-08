"""Real member HTTP API + Chromium; only fictional numbers and mock verification."""
import json
from pathlib import Path
import re
import sys
from tempfile import TemporaryDirectory
from threading import Thread
import time

from playwright.sync_api import expect, sync_playwright

root = Path(__file__).resolve().parent.parent
module = Path("/workspace/trading-master-engine/services/trading-master-members")
sys.path.insert(0, str(module))
from trading_master_members.server import make_server
from trading_master_members.service import MemberService, MockSms, REMEMBER_TTL

screens = Path("/workspace/work/member-review")
screens.mkdir(parents=True, exist_ok=True)
temp = TemporaryDirectory(prefix="members-browser-")
offset = [0]
service = MemberService(Path(temp.name)/"members.sqlite3", sms=MockSms(), clock=lambda: time.time()+offset[0])
server = make_server(service, static_dir=root/"build/site", port=0, base_path="/beta/")
thread = Thread(target=server.serve_forever, daemon=True)
thread.start()
url = f"http://127.0.0.1:{server.server_port}/beta/"
errors, requests = [], []


def watch(page):
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("request", lambda request: requests.append(request.url))


def get_code(page, phone):
    page.locator("#member-phone").fill(phone)
    with page.expect_response(lambda response: response.url.endswith("/api/auth/code")) as pending:
        page.locator("#member-send-code").click()
    result = pending.value.json()
    assert pending.value.status == 200, result
    assert "mock_code" in result
    expect(page.locator("#member-code-help")).to_contain_text(result["mock_code"])
    return result["mock_code"]


try:
    with sync_playwright() as playwright:
        options = dict(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"], viewport={"width":390,"height":844})
        context = playwright.chromium.launch_persistent_context(str(Path(temp.name)/"browser"), **options)
        try:
            page = context.new_page()
            watch(page)
            page.goto(url+"#/overview", wait_until="networkidle")
            expect(page.locator("#app h1")).to_have_text("회원 로그인")
            assert not any("/api/v2/" in request or "/api/v2-portfolio.json" in request for request in requests)
            assert page.evaluate("TRADING_MASTER_DATA_STATE().hasData") is False
            page.screenshot(path=str(screens/"login-mobile.png"), full_page=True)
            page.get_by_role("link", name="회원가입", exact=True).click()
            code = get_code(page, "01000000001")
            page.locator("#member-code").fill(code)
            page.locator("#member-password").fill("test password one")
            page.locator("#member-confirm").fill("different password")
            page.locator("#member-submit").click()
            expect(page.locator("#member-feedback")).to_contain_text("서로 다릅니다")
            page.locator("#member-confirm").fill("test password one")
            page.locator('[data-password="member-password"]').click()
            expect(page.locator("#member-password")).to_have_attribute("type", "text")
            page.locator('[data-password="member-password"]').click()
            page.screenshot(path=str(screens/"signup-mobile.png"), full_page=True)
            page.locator("#member-code").fill("000000" if code != "000000" else "111111")
            page.locator("#member-submit").click()
            expect(page.locator("#member-feedback")).to_contain_text("맞지 않습니다")
            page.locator("#member-code").fill(code)
            page.locator("#member-submit").click()
            expect(page.locator("#app h1")).to_have_text("운용 현황")
            assert page.evaluate("location.hash") == "#/overview"
            assert page.evaluate("localStorage.length") == 0
            cookie = next(cookie for cookie in context.cookies() if cookie["name"]=="tm_member_session")
            assert cookie["httpOnly"] and cookie["sameSite"]=="Strict" and cookie["path"]=="/beta/" and cookie["expires"]>time.time()
            page.reload(wait_until="networkidle")
            expect(page.locator("#app h1")).to_have_text("운용 현황")
            page.locator("#member-menu").click()
            expect(page.locator("#app h1")).to_have_text("내 계정")
            expect(page.locator(".member-details")).to_contain_text("010-0000-0001")
            page.screenshot(path=str(screens/"member-mobile.png"), full_page=True)
            page.get_by_role("button", name="로그아웃", exact=True).click()
            expect(page.locator("#app h1")).to_have_text("회원 로그인")
            assert page.evaluate("TRADING_MASTER_DATA_STATE().hasData") is False
            assert page.evaluate("fetch(new URL('api/members/me',document.baseURI)).then(r=>r.status)") == 401
            page.get_by_role("link", name="비밀번호 찾기", exact=True).click()
            offset[0] += 61
            code = get_code(page, "01000000001")
            page.locator("#member-code").fill(code)
            page.locator("#member-password").fill("new password two")
            page.locator("#member-confirm").fill("new password two")
            page.locator("#member-submit").click()
            expect(page.locator("#app h1")).to_have_text("회원 로그인")
            expect(page.locator("#member-feedback")).to_contain_text("새 비밀번호")
            page.locator("#member-phone").fill("01000000001")
            page.locator("#member-password").fill("test password one")
            page.locator("#member-submit").click()
            expect(page.locator("#member-feedback")).to_contain_text("맞지 않습니다")
            page.locator("#member-password").fill("new password two")
            page.locator("#member-submit").click()
            expect(page.locator("#app h1")).to_have_text("운용 현황")
            page.locator("#member-menu").click()
            identity = page.evaluate("fetch(new URL('api/members/me',document.baseURI)).then(r=>r.json()).then(r=>r.member.id)")
            page.get_by_role("link", name="휴대폰 번호 변경", exact=True).click()
            code = get_code(page, "01000000002")
            page.locator("#member-code").fill(code)
            page.evaluate("TRADING_MASTER_REFRESH()")
            expect(page.locator("#member-code")).to_have_value(code)
            page.locator("#member-submit").click()
            expect(page.locator("#app h1")).to_have_text("내 계정")
            expect(page.locator(".member-details")).to_contain_text("010-0000-0002")
            assert identity == page.evaluate("fetch(new URL('api/members/me',document.baseURI)).then(r=>r.json()).then(r=>r.member.id)")
            for width in (320,360,390,414,768,1280):
                page.set_viewport_size({"width":width,"height":900})
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), width
            page.wait_for_function("Boolean(navigator.serviceWorker.controller)")
            keys = page.evaluate("caches.keys().then(keys=>caches.open(keys.find(k=>k.startsWith('tm-shell-')))).then(cache=>cache.keys()).then(requests=>requests.map(r=>r.url))")
            assert len(keys)==10 and all("/api/" not in key for key in keys), keys
            page.set_viewport_size({"width":390,"height":844})
            page.goto(url+"#/overview", wait_until="networkidle")
            expect(page.locator("#app h1")).to_have_text("운용 현황")
            context.set_offline(True)
            page.reload(wait_until="networkidle")
            expect(page.locator("#app h1")).to_have_text("회원 서비스")
            expect(page.locator(".member-lede")).to_contain_text("연결")
            assert page.evaluate("TRADING_MASTER_DATA_STATE().hasData") is False
            context.set_offline(False)
            page.get_by_role("button", name="다시 시도", exact=True).click()
            expect(page.locator("#app h1")).to_have_text("운용 현황")
        finally:
            context.close()
        # Verify a remembered login survives a full browser-process restart.
        context = playwright.chromium.launch_persistent_context(str(Path(temp.name)/"browser"), **options)
        try:
            page = context.new_page()
            watch(page)
            page.goto(url+"#/overview", wait_until="networkidle")
            expect(page.locator("#app h1")).to_have_text("운용 현황")
            offset[0] += REMEMBER_TTL+1
            page.evaluate("dispatchEvent(new Event('online'))")
            expect(page.locator("#app h1")).to_have_text("회원 로그인")
            assert page.evaluate("TRADING_MASTER_DATA_STATE().hasData") is False
            assert not errors, errors
            print(json.dumps({"browser":"Chromium","flow":"signup/login/reset/change-phone/logout","remembered_browser_restart":True,
                              "offline_boot_protects_members":True,"server_expiry_clears_data":True,"mobile_widths":[320,360,390,414,768,1280],
                              "cached_static_assets":len(keys),"real_sms":0,"javascript_errors":errors}, ensure_ascii=False))
        finally:
            context.close()
finally:
    server.shutdown()
    server.server_close()
    thread.join(timeout=2)
    temp.cleanup()
