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
              formants: document.querySelector('#formantState').textContent,
              rows: [...document.querySelectorAll('#harmonicRows tr')].map(r => [...r.children].map(c => c.textContent))})""")
            snap["t"] = round(time.time() - t0, 3)
            timeline.append(snap)
            time.sleep(0.05)
        page.screenshot(path=out + ".png", full_page=True)
        browser.close()
    srv.shutdown()
    json.dump({"timeline": timeline, "logs": logs}, open(out + ".timeline.json", "w"), indent=1)
    print("logs:", *logs[:10], sep="\n  ")
    print("statuses:", sorted({s["status"] for s in timeline}))
    f0s = [float(m.group(1)) for s in timeline if (m := re.search(r"F0 ([\d.]+) Hz", s["pitch"]))]
    print("sample formants:", [s["formants"] for s in timeline[::40]])
    print(f"samples={len(timeline)} with_f0={len(f0s)}", f"f0 min/max={min(f0s)}/{max(f0s)}" if f0s else "")
    print("latency:", sorted({s["latency"] for s in timeline}), "fps:", sorted({s["fps"] for s in timeline}))
    # Gate (voiced synthetic input, 110-170 Hz): fails the process on regression.
    settled = [s for s in timeline if s["t"] > 2.5]  # skip warm-up (WASM load, partial first fps window)
    voiced = [s for s in settled if re.search(r"F0 ([\d.]+) Hz", s["pitch"])]
    lat = [int(m.group(1)) for s in settled if (m := re.match(r"(\d+) ms", s["latency"]))]
    fps = [int(s["fps"]) for s in settled if s["fps"].isdigit()]
    checks = {
        "f0 coverage >= 85%": len(voiced) / max(1, len(settled)) >= 0.85,
        "f0 within 105-175 Hz": all(105 <= float(re.search(r"F0 ([\d.]+)", s["pitch"]).group(1)) <= 175 for s in voiced),
        "formants reported >= 85%": sum("F1" in s["formants"] for s in settled) / max(1, len(settled)) >= 0.85,
        "transport latency p95 < 60 ms": bool(lat) and sorted(lat)[int(0.95 * (len(lat) - 1))] < 60,
        "analysis fps >= 80": bool(fps) and min(fps) >= 80,
        "no page errors": not any(l.startswith("pageerror") for l in logs),
    }
    truth_path = os.path.splitext(wav)[0] + ".truth.json"
    if os.path.exists(truth_path):
        # Real-voice mode: gaps are expected, so replace the continuous-voicing checks with per-token recall.
        for k in ("f0 coverage >= 85%", "formants reported >= 85%", "f0 within 105-175 Hz"): checks.pop(k)
        f0v = [float(re.search(r"F0 ([\d.]+)", s["pitch"]).group(1)) for s in voiced]
        share = sum(80 <= v <= 330 for v in f0v) / max(1, len(f0v))
        print(f"voiced snapshots with F0 in 80-330 Hz: {100 * share:.0f}% ({len(f0v)} voiced)")
        checks["real voices: >= 85% of F0 readings in 80-330 Hz"] = share >= 0.85
        tokens = json.load(open(truth_path))["tokens"]
        seen = []
        for token in tokens:
            hits = 0
            for snap in timeline:
                got = [float(v) for v in re.findall(r"F\d (\d+) Hz", snap["formants"])]
                if len(got) >= 2 and all(abs(got[k] - token["formants"][k]) / token["formants"][k] < 0.12 for k in (0, 1)): hits += 1
            seen.append(hits); print(f"token {token['id']}: F1/F2 within 12% of measured in {hits} snapshots")
        checks["every token seen with measured F1/F2 (>=3 snapshots)"] = all(h >= 3 for h in seen)
    for name, ok in checks.items(): print(("PASS " if ok else "FAIL ") + name)
    if not all(checks.values()): sys.exit(1)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 9.0)
