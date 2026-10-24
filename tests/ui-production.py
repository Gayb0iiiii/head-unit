import http.server
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright

root = pathlib.Path(__file__).resolve().parents[1] / 'dist'
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(root), **kwargs)
    def log_message(self, *args):
        pass

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/production.html'
bridge = "window.headunit=Object.freeze({getView:async()=>({connected:false,route:'disconnected',connectionPhase:'backoff',phones:[]}),onView:()=>()=>{},getMetrics:async()=>({cpuPercent:null,gpuPercent:null})});"
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('HEADUNIT_TEST_CHROMIUM','/usr/bin/chromium'), headless=True,
                                chromium_sandbox=os.environ.get('HEADUNIT_TEST_CHROMIUM_NO_SANDBOX') != '1')
    for width, height in [(1920,1080),(1280,720),(1024,600),(800,480),(480,800)]:
        page = browser.new_page(viewport={'width':width,'height':height})
        errors = []
        page.on('pageerror', lambda error: errors.append(error.stack or str(error)))
        page.add_init_script(bridge)
        page.goto(url)
        page.wait_for_timeout(100)
        assert page.locator('h1').inner_text() == 'Home'
        for route, title in [('radio','Radio'),('bluetooth','Bluetooth'),('projection','CarPlay'),('settings','Settings'),('apps','Apps'),('home','Home')]*2:
            page.locator(f'aside [data-action="{route}"]').click()
            assert page.locator('h1').inner_text() == title, (width,height,route)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width,height,route)
        targets = page.locator('aside button').evaluate_all('(els)=>els.map(e=>({label:e.textContent.trim(),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))')
        assert all(t['width'] >= 48 and t['height'] >= 48 for t in targets), (width,height,targets)
        assert not errors, (width,height,errors)
        print('routes/width/targets', width,height,targets)
        if width==800:
            page.locator('aside [data-action="settings"]').click()
            page.locator('[data-appearance="day"]').click()
            page.locator('[data-wallpaper="dusk"]').click()
            page.locator('[data-debug-overlay="true"]').click()
            page.wait_for_timeout(1200)
            assert page.locator('#debug-overlay').count()==1
            page.reload();page.wait_for_timeout(1200)
            assert page.locator('body').get_attribute('data-appearance')=='day'
            assert page.locator('body').get_attribute('data-wallpaper')=='dusk'
            assert page.locator('#debug-overlay').count()==1
            page.locator('aside [data-action="settings"]').click()
            page.locator('[data-debug-overlay="false"]').click()
            assert page.locator('#debug-overlay').count()==0
            page.locator('aside [data-action="apps"]').click()
            page.locator('[data-action="edit-layout"]').click()
            assert page.locator('[data-move="apps:radio:1"]').count()==1
            page.locator('[data-move="apps:radio:1"]').click()
            assert page.locator('.app-entry').first.get_attribute('data-layout-id')=='bluetooth'
            page.reload();page.wait_for_timeout(100)
            page.locator('aside [data-action="apps"]').click()
            assert page.locator('.app-entry').first.get_attribute('data-layout-id')=='bluetooth'
            page.locator('[data-action="edit-layout"]').click()
            page.locator('[data-action="reset-layout"]').click()
            assert page.locator('.app-entry').first.get_attribute('data-layout-id')=='radio'
            print('settings/overlay/apps-persistence', 'passed')
        assert not errors, (width,height,errors)
        page.close()
    browser.close()
server.shutdown()
