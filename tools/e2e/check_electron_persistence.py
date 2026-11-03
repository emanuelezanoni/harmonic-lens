"""The desktop app must remember its settings across restarts (Electron profile persistence).
usage: check_electron_persistence.py   (run under xvfb-run; uses an isolated XDG_CONFIG_HOME)"""
import os, shutil, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ELECTRON = os.path.join(ROOT, "node_modules", "electron", "dist", "electron")
if not os.path.exists(ELECTRON):
    subprocess.run(["node", os.path.join(ROOT, "node_modules", "electron", "install.js")], check=True)
cfg = tempfile.mkdtemp(prefix="hl-cfg-")

def session(action):
    env = dict(os.environ, XDG_CONFIG_HOME=cfg)
    proc = subprocess.Popen([ELECTRON, "--no-sandbox", "--remote-debugging-port=9334", ROOT], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(60):
            try: urllib.request.urlopen("http://127.0.0.1:9334/json/version", timeout=1); break
            except Exception: time.sleep(0.5)
        with sync_playwright() as p:
            page = next(pg for c in p.chromium.connect_over_cdp("http://127.0.0.1:9334").contexts for pg in c.pages)
            page.wait_for_load_state("load")
            return action(page)
    finally:
        proc.terminate()
        try: proc.wait(timeout=10)
        except Exception: proc.kill()
        time.sleep(1)

def change(page):
    page.select_option("#voiceType", "5000"); page.select_option("#rangeSelect", "3000"); time.sleep(0.5)
def read(page):
    return page.eval_on_selector("#voiceType", "e => e.value"), page.eval_on_selector("#rangeSelect", "e => e.value")

session(change)
got = session(read)
shutil.rmtree(cfg, ignore_errors=True)
print("after restart:", got)
ok = got == ("5000", "3000")
print("PASS desktop settings persist across restarts" if ok else "FAIL desktop settings are lost on exit")
sys.exit(0 if ok else 1)
