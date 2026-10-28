"""Drive the built app in headless Chromium with a fake microphone.

usage: run_app.py WAV OUT_PREFIX [seconds]
Serves dist/ over localhost, feeds WAV as the fake mic, polls the DOM, writes
OUT_PREFIX.timeline.json, OUT_PREFIX.png and prints a summary.
"""
import http.server, json, os, re, socketserver, sys, threading, time
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DIST = os.path.join(ROOT, "dist")

def serve(port):
    class Q(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k): super().__init__(*a, directory=DIST, **k)
        def log_message(self, *a): pass
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(("127.0.0.1", port), Q)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

def main(wav, out, seconds=9.0):
    srv = serve(0)
    port = srv.server_address[1]
    timeline, logs = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=[
            "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
            f"--use-file-for-fake-audio-capture={os.path.abspath(wav)}",
            "--autoplay-policy=no-user-gesture-required"])
        page = browser.new_page(viewport={"width": 1200, "height": 900})
        page.on("console", lambda m: logs.append(f"console.{m.type}: {m.text}"))
        page.on("pageerror", lambda e: logs.append(f"pageerror: {e}"))
        page.goto(f"http://127.0.0.1:{port}/index.html")
        page.click("#startButton")
        t0 = time.time()
        while time.time() - t0 < seconds:
            snap = page.evaluate("""() => ({
              status: document.querySelector('#status').textContent,
              pitch: document.querySelector('#pitchState').textContent,
              latency: document.querySelector('#latency').textContent,
              fps: document.querySelector('#framesPerSecond').textContent,
              level: document.querySelector('#level').textContent,
              rows: [...document.querySelectorAll('#harmonicRows tr')].map(r => [...r.children].map(c => c.textContent))})""")
            snap["t"] = round(time.time() - t0, 3)
            timeline.append(snap)
            time.sleep(0.05)
        page.screenshot(path=out + ".png")
        browser.close()
    srv.shutdown()
    json.dump({"timeline": timeline, "logs": logs}, open(out + ".timeline.json", "w"), indent=1)
    print("logs:", *logs[:10], sep="\n  ")
    print("statuses:", sorted({s["status"] for s in timeline}))
    f0s = [float(m.group(1)) for s in timeline if (m := re.search(r"F0 ([\d.]+) Hz", s["pitch"]))]
    print(f"samples={len(timeline)} with_f0={len(f0s)}", f"f0 min/max={min(f0s)}/{max(f0s)}" if f0s else "")
    print("latency:", sorted({s["latency"] for s in timeline}), "fps:", sorted({s["fps"] for s in timeline}))

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 9.0)
