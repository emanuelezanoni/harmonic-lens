"""Microphone lifecycle: start, stop, restart, switch device, switch while running. usage: check_lifecycle.py WAV"""
import http.server, os, socketserver, sys, threading, time
from playwright.sync_api import sync_playwright

DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "dist"))
class Q(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=DIST, **k)
    def log_message(self, *a): pass
srv = socketserver.TCPServer(("127.0.0.1", 0), Q)
threading.Thread(target=srv.serve_forever, daemon=True).start()

def run(wav):
    logs, results = [], {}
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
                                    f"--use-file-for-fake-audio-capture={os.path.abspath(wav)}", "--autoplay-policy=no-user-gesture-required"])
        page = b.new_page()
        page.on("console", lambda m: logs.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: logs.append(f"pageerror: {e}"))
        page.goto(f"http://127.0.0.1:{srv.server_address[1]}/index.html")
        def listening(label, secs=5):
            page.wait_for_function("document.querySelector('#status').textContent.startsWith('Listening')", timeout=15000)
            hits = 0; t0 = time.time()
            while time.time() - t0 < secs:
                if "Hz" in page.inner_text("#pitchState"): hits += 1
                time.sleep(0.1)
            results[label] = hits > 8
            print(f"{label}: f0 readings={hits} -> {'ok' if hits > 8 else 'FAIL'} | status={page.inner_text('#status')!r}")
        page.click("#startButton"); listening("first start")
        page.click("#stopButton"); time.sleep(0.5)
        print("after stop:", page.inner_text("#status"), "| start enabled:", page.is_enabled("#startButton"))
        results["stop re-enables start"] = page.is_enabled("#startButton")
        page.click("#startButton"); listening("restart")
        page.click("#stopButton"); time.sleep(0.5)
        opts = page.eval_on_selector_all("#audioInput option", "o => o.map(x => [x.value, x.textContent])")
        other = next((v for v, t in opts if v and "Fake Audio Input 1" in t), None)
        if other:
            page.select_option("#audioInput", other); page.click("#startButton"); listening("other device")
            # Switching the input while listening must restart on the new device by itself.
            before = page.inner_text("#actualInput")
            page.select_option("#audioInput", "")
            time.sleep(0.5)
            listening("live switch to default")
            after = page.inner_text("#actualInput")
            print(f"live switch: {before!r} -> {after!r}")
            results["live switch changes device"] = before != after
        for i in range(4):  # rapid start/stop cycles must not wedge the page
            if page.is_enabled("#startButton"): page.click("#startButton")
            time.sleep(0.4)
            if page.is_enabled("#stopButton"): page.click("#stopButton")
            time.sleep(0.4)
        time.sleep(1)
        if page.is_enabled("#startButton"): page.click("#startButton")
        listening("after rapid cycles")
    errs = [l for l in logs if "pageerror" in l or l.startswith("error")]
    print("errors:", errs[:6])
    ok = all(results.values()) and not errs
    print("PASS microphone lifecycle" if ok else "FAIL microphone lifecycle", results)
    return 0 if ok else 1
sys.exit(run(sys.argv[1]))
