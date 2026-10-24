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
        if width == 1920:
            media = page.locator('.home-media').bounding_box()
            weather = page.locator('.home-weather').bounding_box()
            assert media and media['height'] <= height * .46, ('offline media card dominates Home', media)
            assert weather and weather['height'] <= height * .18, ('unavailable weather card is too tall', weather)
            assert weather['width'] <= 450, ('weather status should be a compact chip', weather)
            tiles = page.locator('.home-shortcut').evaluate_all('els => els.map(el => ({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,icon:el.querySelector("svg").getBoundingClientRect().width}))')
            assert len(tiles) == 3 and all(150 <= t['width'] <= 380 and 120 <= t['height'] <= 220 and t['icon'] >= 44 for t in tiles), tiles
            assert page.locator('.media-browse').is_visible()
            page.keyboard.press('Tab')
            assert page.evaluate('document.activeElement?.tagName') == 'BUTTON'
            assert page.evaluate("getComputedStyle(document.activeElement).outlineStyle") != 'none'
            page.keyboard.press('Enter')
            assert page.locator('h1').inner_text() == 'Radio'
            page.keyboard.press('Escape')
            assert page.locator('h1').inner_text() == 'Home'
            for scale in (90,100,115):
                page.locator('aside [data-action="settings"]').click()
                page.locator('[data-ui-scale]').evaluate("(el, value) => { el.value = String(value); el.dispatchEvent(new Event('input', {bubbles:true})); }", scale)
                page.locator('aside [data-action="home"]').click()
                time_bounds = page.evaluate('''() => {
                  const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return {top:r.top,bottom:r.bottom}; };
                  return {card:box('.home-time'),clock:box('#headunit-home-clock'),date:box('#headunit-home-date'),sources:box('.home-shortcuts')};
                }''')
                assert time_bounds['clock']['top'] >= time_bounds['card']['top'] and time_bounds['clock']['bottom'] <= time_bounds['card']['bottom'], (scale,time_bounds)
                assert time_bounds['date']['top'] >= time_bounds['card']['top'] and time_bounds['date']['bottom'] <= time_bounds['card']['bottom'], (scale,time_bounds)
                if scale == 100:
                    assert time_bounds['sources']['bottom'] >= 780, ('Home ends too high above the wallpaper', time_bounds)
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
            page.locator('[data-ui-scale]').evaluate("el => { el.value = '115'; el.dispatchEvent(new Event('input', {bubbles:true})); }")
            page.locator('aside [data-action="home"]').click()
            bounds = page.evaluate('''() => {
              const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}; };
              return {scrollHeight:document.documentElement.scrollHeight,viewport:innerHeight,
                dock:box('aside'),title:box('h1'),media:box('.home-media'),clock:box('.home-time'),
                overlay:box('#debug-overlay')};
            }''')
            assert bounds['scrollHeight'] <= bounds['viewport'] + 2, ('Home unexpectedly scrolls at 115%', bounds)
            assert bounds['media']['bottom'] <= bounds['viewport'] and bounds['clock']['bottom'] <= bounds['viewport'], bounds
            assert bounds['overlay']['bottom'] <= bounds['viewport'], ('Debug readout is outside the Home viewport', bounds)
            def intersects(a,b):
                return a['left'] < b['right'] and a['right'] > b['left'] and a['top'] < b['bottom'] and a['bottom'] > b['top']
            assert not intersects(bounds['overlay'],bounds['title']) and not intersects(bounds['overlay'],bounds['dock']), bounds
            page.locator('aside [data-action="settings"]').click()
            page.locator('[data-ui-scale]').evaluate("el => { el.value = '100'; el.dispatchEvent(new Event('input', {bubbles:true})); }")
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
