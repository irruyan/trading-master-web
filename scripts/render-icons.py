"""Rasterize the existing SVG through the browser, without changing the artwork.

Development-only tool: requires Playwright and an installed Chromium browser.
The generated PNG files are committed; the static build does not run this tool.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent.parent
svg = (root / "dist/icon.svg").read_text()
output = root / "dist/icons"
output.mkdir(exist_ok=True)
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
    try:
        for filename, size in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)):
            page = browser.new_page(viewport={"width": size, "height": size}, device_scale_factor=1)
            page.set_content('<style>html,body{margin:0;width:100%;height:100%;background:#101a2e}svg{display:block;width:100%;height:100%}</style>' + svg)
            page.screenshot(path=str(output / filename))
            page.close()
    finally:
        browser.close()
