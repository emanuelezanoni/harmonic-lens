"""Calibration + CSV export in the built app. usage: check_tools.py WAV"""
import csv, http.server, io, os, socketserver, sys, threading, time
from playwright.sync_api import sync_playwright

DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "dist"))
class Q(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=DIST, **k)
    def log_message(self, *a): pass
srv = socketserver.TCPServer(("127.0.0.1", 0), Q); threading.Thread(target=srv.serve_forever, daemon=True).start()

with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
                                f"--use-file-for-fake-audio-capture={os.path.abspath(sys.argv[1])}", "--autoplay-policy=no-user-gesture-required"])
    page = b.new_page(accept_downloads=True); errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(f"http://127.0.0.1:{srv.server_address[1]}/index.html")
    ok = {}
    open_panels = lambda: page.evaluate("document.querySelectorAll('details').forEach(d => d.open = true)")
    open_panels()
    ok["export disabled before any audio"] = page.is_disabled("#exportButton")
    page.click("#startButton"); page.wait_for_function("document.querySelector('#status').textContent.startsWith('Listening')", timeout=15000)
    time.sleep(6)
    before = page.text_content("#level"); print("level before:", before)
    page.fill("#splReading", "72"); page.click("#calibrateButton"); time.sleep(1.5)
    after = page.text_content("#level"); print("level after calibrate:", after, "|", page.text_content("#calibrationState"))
    ok["level shows dBFS first"] = "dBFS" in before
    ok["level shows SPL after calibration"] = "dB SPL" in after
    page.reload(); open_panels()
    page.click("#startButton"); page.wait_for_function("document.querySelector('#status').textContent.startsWith('Listening')", timeout=15000); time.sleep(2.5)
    ok["calibration persists per device across reload"] = "dB SPL" in page.text_content("#level")
    with page.expect_download() as d: page.click("#exportButton")
    path = d.value.path(); rows = list(csv.DictReader(open(path)))
    print("csv:", d.value.suggested_filename, len(rows), "rows;", list(rows[0].keys()))
    voiced = [r for r in rows if r["f0_hz"]]
    ok["csv has rows"] = len(rows) > 100
    ok["csv has voiced frames with formants"] = len(voiced) > 30 and sum(1 for r in voiced if r["f1_hz"] and r["f2_hz"]) > 20
    ok["csv has SPL column when calibrated"] = "level_db_spl" in rows[0]
    page.click("#calibrationReset"); time.sleep(1.2)
    ok["reset returns to dBFS"] = "dBFS" in page.text_content("#level")
    ok["no page errors"] = not errs
    print(ok); print("PASS calibration + export" if all(ok.values()) else "FAIL calibration + export", errs[:3])
    sys.exit(0 if all(ok.values()) else 1)
