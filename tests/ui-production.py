"""Run the current production feature/comfort/audio browser contracts on dist.
Build first. Requires Python Playwright and Chromium; no remote services.
Replaces obsolete pixel/opacity assertions that enforced the opaque glass bug.
"""
import http.server, os, pathlib, subprocess, sys, threading
root=pathlib.Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(root/'dist'),**kwargs)
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
env={**os.environ,'HEADUNIT_TEST_BASE_URL':f'http://127.0.0.1:{server.server_port}'}
try:
    for script in ['ui-comfort.py','ui-feature-audit.py','local-audio-browser.py','ui-scroll.py','ui-bluetooth.py']:
        subprocess.run([sys.executable,str(root/'tests'/script)],env=env,check=True)
finally:server.shutdown()
