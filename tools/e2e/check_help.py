"""Every ? button opens a readable, on-screen help popover without moving the page. usage: check_help.py"""
import http.server, os, socketserver, sys, threading, time
from playwright.sync_api import sync_playwright

DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "dist"))
class Q(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=DIST, **k)
    def log_message(self, *a): pass
srv = socketserver.TCPServer(("127.0.0.1", 0), Q); threading.Thread(target=srv.serve_forever, daemon=True).start()
LAYOUT = "() => [...document.querySelectorAll('.now, .side, #vowelSpace, #spectrogram, .controls, .topbar')].map(e => { const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map(Math.round).join(','); }).join('|')"

def run(width, height):
    problems = []
    with sync_playwright() as p:
        page = p.chromium.launch().new_page(viewport={"width": width, "height": height}); errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.goto(f"http://127.0.0.1:{srv.server_address[1]}/index.html")
        page.evaluate("document.querySelectorAll('details').forEach(d => d.open = true)")
        keys = page.eval_on_selector_all("[data-help]", "els => els.map(e => e.dataset.help)")
        before = page.evaluate(LAYOUT)
        for i, key in enumerate(keys):
            btn = page.locator(f"[data-help='{key}']").first
            btn.scroll_into_view_if_needed(); layout = page.evaluate(LAYOUT)
            btn.click()
            pop = page.locator("#helpPopover")
            if not pop.is_visible(): problems.append(f"{key}: popover not visible"); continue
            box = pop.bounding_box(); title = page.inner_text("#helpTitle"); text = page.inner_text(".help-body")
            if not title or len(text) < 40: problems.append(f"{key}: empty content")
            if box["x"] < 0 or box["y"] < 0 or box["x"] + box["width"] > width + 1 or box["y"] + box["height"] > height + 1:
                problems.append(f"{key}: popover outside window {box}")
            if btn.get_attribute("aria-expanded") != "true": problems.append(f"{key}: aria-expanded not true")
            if page.evaluate(LAYOUT) != layout: problems.append(f"{key}: opening moved the layout")
            page.keyboard.press("Escape"); time.sleep(0.05)
            if pop.is_visible(): problems.append(f"{key}: Esc did not close")
            if btn.get_attribute("aria-expanded") != "false": problems.append(f"{key}: aria-expanded not reset")
        # clicking the same button twice must close it, not flicker open again
        b0 = page.locator("[data-help='voice']").first; b0.click(); b0.click(); time.sleep(0.4)
        if page.locator("#helpPopover").is_visible(): problems.append("second click on the same ? did not close it")
        # clicking elsewhere closes; clicking a ? opens a different entry
        page.locator("[data-help='level']").first.click(); page.locator("[data-help='now']").first.click(); time.sleep(0.2)
        if page.inner_text("#helpTitle") != "Now": problems.append("switching between two ? buttons failed")
        page.mouse.click(5, height - 5); time.sleep(0.2)
        if page.locator("#helpPopover").is_visible(): problems.append("outside click did not close")
        # the label still focuses its select
        page.click("label[for='voiceType']"); 
        if page.evaluate("document.activeElement.id") != "voiceType": problems.append("label no longer focuses the select")
        if errs: problems.append(f"page errors: {errs[:2]}")
        print(f"{width}x{height}: {len(keys)} help buttons checked", "OK" if not problems else problems)
    return problems

bad = run(1440, 900) + run(760, 580) + run(390, 800)
print("PASS help popovers" if not bad else "FAIL help popovers")
sys.exit(0 if not bad else 1)
