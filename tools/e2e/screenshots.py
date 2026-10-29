"""Screenshots of the built app: idle and listening, at several window sizes. usage: screenshots.py WAV OUT_PREFIX"""
import http.server, os, socketserver, sys, threading, time
from playwright.sync_api import sync_playwright

DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "dist"))
class Q(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=DIST, **k)
    def log_message(self, *a): pass
srv = socketserver.TCPServer(("127.0.0.1", 0), Q); threading.Thread(target=srv.serve_forever, daemon=True).start()
wav, out = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
                                f"--use-file-for-fake-audio-capture={os.path.abspath(wav)}", "--autoplay-policy=no-user-gesture-required"])
    for name, (w, h) in {"wide": (1440, 900), "mid": (1100, 760), "min": (760, 580)}.items():
        page = b.new_page(viewport={"width": w, "height": h})
        page.goto(f"http://127.0.0.1:{srv.server_address[1]}/index.html")
        page.screenshot(path=f"{out}.idle.{name}.png", full_page=True)
        if name != "min":
            page.click("#startButton"); page.wait_for_function("document.querySelector('#status').textContent.startsWith('Listening')", timeout=15000)
            time.sleep(9)
            page.screenshot(path=f"{out}.live.{name}.png", full_page=True)
        print(name, "page scroll size", page.evaluate("[document.documentElement.scrollWidth, document.documentElement.scrollHeight]"))
        page.close()
