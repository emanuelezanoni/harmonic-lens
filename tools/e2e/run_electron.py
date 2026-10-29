"""Launch the real Electron app under Xvfb with a fake microphone and report what it does.

usage: run_electron.py WAV OUT_PREFIX [seconds] [--app PATH_TO_APP_DIR_OR_BINARY]
Default target is this checkout (electron . with dist/). Chromium's fake-device flags are passed straight
through Electron, so the production permission policy, file:// loading, worker and WASM paths are exercised.
Reads state through the DevTools protocol (--remote-debugging-port), not through a dev server.
"""
import json, os, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

def main(wav, out, seconds=12.0, app=None):
    electron = os.path.join(ROOT, "node_modules", "electron", "dist", "electron")
    if not os.path.exists(electron):  # Electron >= 44 downloads its binary lazily, not on npm install
        subprocess.run(["node", os.path.join(ROOT, "node_modules", "electron", "install.js")], check=True)
    # HL_REAL_PERMISSIONS=1 drops the fake-UI flag so the app's own permission handlers decide (production path).
    fake_ui = [] if os.environ.get("HL_REAL_PERMISSIONS") else ["--use-fake-ui-for-media-stream"]
    cmd = [electron, "--no-sandbox", "--remote-debugging-port=9333", "--use-fake-device-for-media-stream", *fake_ui,
           f"--use-file-for-fake-audio-capture={os.path.abspath(wav)}", "--autoplay-policy=no-user-gesture-required"]
    cmd += [app] if app else [ROOT]
    env = dict(os.environ, ELECTRON_ENABLE_LOGGING="1")
    proc = subprocess.Popen(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    logs, timeline = [], []
    try:
        for _ in range(60):
            try:
                urllib.request.urlopen("http://127.0.0.1:9333/json/version", timeout=1); break
            except Exception: time.sleep(0.5)
        else:
            print("FAIL electron did not expose DevTools"); return 1
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp("http://127.0.0.1:9333")
            page = next((pg for c in browser.contexts for pg in c.pages), None)
            if page is None:
                print("FAIL no window"); return 1
            page.on("console", lambda m: logs.append(f"console.{m.type}: {m.text}"))
            page.on("pageerror", lambda e: logs.append(f"pageerror: {e}"))
            page.wait_for_load_state("load")
            print("url", page.url, "| title", page.title(), "| secure", page.evaluate("window.isSecureContext"))
            page.click("#startButton")
            t0 = time.time()
            while time.time() - t0 < seconds:
                timeline.append(page.evaluate("""() => ({
                  status: document.querySelector('#status').textContent,
                  pitch: document.querySelector('#pitchState').textContent,
                  formants: document.querySelector('#formantState').textContent})"""))
                time.sleep(0.1)
            page.screenshot(path=out + ".png")
            devices = page.evaluate("[...document.querySelector('#audioInput').options].map(o => o.textContent)")
        statuses = list(dict.fromkeys(t["status"] for t in timeline))
        f0 = sum(1 for t in timeline if "Hz" in t["pitch"])
        fm = sum(1 for t in timeline if t["formants"].count("Hz") >= 2)
        print("statuses", statuses); print("devices", devices)
        print(f"snapshots={len(timeline)} with_f0={f0} with_formants={fm}")
        errs = [l for l in logs if l.startswith("pageerror") or l.startswith("console.error")]
        print("page errors:", errs[:5])
        ok = f0 > 20 and fm > 20 and not errs and any(s.startswith("Listening") for s in statuses)
        print("PASS electron app: microphone -> analysis works" if ok else "FAIL electron app")
        return 0 if ok else 1
    finally:
        proc.terminate()
        try: proc.wait(timeout=5)
        except Exception: proc.kill()
        json.dump(timeline, open(out + ".timeline.json", "w"))

if __name__ == "__main__":
    a = sys.argv[1:]
    app = a[a.index("--app") + 1] if "--app" in a else None
    pos = [x for i, x in enumerate(a) if not x.startswith("--") and (i == 0 or a[i - 1] != "--app")]
    sys.exit(main(pos[0], pos[1], float(pos[2]) if len(pos) > 2 else 12.0, app))
