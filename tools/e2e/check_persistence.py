"""Change settings, reload the page, and assert they were restored. usage: check_persistence.py"""
import http.server, os, socketserver, sys, threading
from playwright.sync_api import sync_playwright

DIST = os.path.join(os.path.dirname(__file__), "..", "..", "dist")

class Q(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=os.path.abspath(DIST), **k)
    def log_message(self, *a): pass

srv = socketserver.TCPServer(("127.0.0.1", 0), Q)
threading.Thread(target=srv.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{srv.server_address[1]}/index.html"
with sync_playwright() as p:
    page = p.chromium.launch().new_page()
    page.goto(url)
    fresh = {k: page.eval_on_selector(s, "e => e.value") for k, s in (("voice", "#voiceType"), ("range", "#rangeSelect"), ("mode", "#modeSelect"))}
    page.select_option("#voiceType", "5000"); page.select_option("#rangeSelect", "3000"); page.select_option("#modeSelect", "0.03")
    page.click("#formantToggle")
    page.reload()
    got = {k: page.eval_on_selector(s, "e => e.value") for k, s in (("voice", "#voiceType"), ("range", "#rangeSelect"), ("mode", "#modeSelect"))}
    pressed = page.get_attribute("#formantToggle", "aria-pressed")
    print("defaults", fresh, "restored", got, "formants pressed", pressed)
    ok = got == {"voice": "5000", "range": "3000", "mode": "0.03"} and pressed == "false"
    print("PASS settings persist across reload" if ok else "FAIL settings persistence")
    sys.exit(0 if ok else 1)
