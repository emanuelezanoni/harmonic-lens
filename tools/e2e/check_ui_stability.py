"""UI regressions: (1) layout must not move between idle / listening-without-voice / listening-with-voice;
(2) the H1-H8 harmonic guides must actually draw on the spectrogram. usage: check_ui_stability.py WAV"""
import http.server, os, re, socketserver, sys, threading, time
from playwright.sync_api import sync_playwright

DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "dist"))
class Q(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=DIST, **k)
    def log_message(self, *a): pass
srv = socketserver.TCPServer(("127.0.0.1", 0), Q); threading.Thread(target=srv.serve_forever, daemon=True).start()

RECTS = """() => { const r = s => { const b = document.querySelector(s).getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; };
  return { now: r('.now'), side: r('.side'), vowel: r('#vowelSpace'), spectro: r('#spectrogram'), pitch: r('#pitchCanvas'), pitchState: r('#pitchState'), formants: r('#formantState'), page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] }; }"""
# count pixels close to a colour in the spectrogram canvas (H7 violet is used by no formant line)
COUNT = """(rgb) => { const c = document.querySelector('#spectrogram'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
  for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i]-rgb[0]) < 28 && Math.abs(d[i+1]-rgb[1]) < 28 && Math.abs(d[i+2]-rgb[2]) < 28) n++; return n; }"""

with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
                                f"--use-file-for-fake-audio-capture={os.path.abspath(sys.argv[1])}", "--autoplay-policy=no-user-gesture-required"])
    page = b.new_page(viewport={"width": 1440, "height": 900}); errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(f"http://127.0.0.1:{srv.server_address[1]}/index.html")
    seen = [page.evaluate(RECTS)]
    page.click("#startButton"); page.wait_for_function("document.querySelector('#status').textContent.startsWith('Listening')", timeout=15000)
    states = set()
    t0 = time.time()
    while time.time() - t0 < 14:
        r = page.evaluate(RECTS); seen.append(r)
        states.add("voice" if re.search(r"\d+ Hz", page.text_content("#formantState")) else "no-formants")
        time.sleep(0.1)
    print("states seen while listening:", sorted(states))
    ok = {"saw both states (with and without formants)": states == {"voice", "no-formants"}}
    for key in ("now", "side", "vowel", "spectro", "pitch", "pitchState", "formants"):
        for axis, name in ((1, "y"), (3, "height"), (2, "width")):
            vals = [r[key][axis] for r in seen]; spread = max(vals) - min(vals)
            if spread > 1.0: print(f"  layout moves: {key}.{name} varies by {spread:.1f}px ({min(vals):.0f}..{max(vals):.0f})")
            ok[f"{key}.{name} stable"] = spread <= 1.0
    pv = [r["page"][1] for r in seen]; ok["page height stable"] = max(pv) - min(pv) <= 1

    # harmonic guides
    page.evaluate("document.querySelectorAll('details').forEach(d => d.open = true)")
    violet = [167, 123, 255]
    before = page.evaluate(COUNT, violet)
    page.click("#harmonicToggles button:nth-child(7)"); time.sleep(5)
    after = page.evaluate(COUNT, violet)
    print(f"harmonic guide H7 pixels: off={before} on={after}")
    ok["H7 guide draws pixels when enabled"] = after > before + 40
    page.click("#harmonicToggles button:nth-child(7)")
    ok["no page errors"] = not errs
    bad = [k for k, v in ok.items() if not v]
    print("PASS ui stability + harmonic guides" if not bad else f"FAIL: {bad}")
    sys.exit(0 if not bad else 1)
