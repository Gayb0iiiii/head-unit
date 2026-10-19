from playwright.sync_api import sync_playwright
from pathlib import Path
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1280,'height':720},device_scale_factor=1)
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8095')
 page.locator('main').get_by_role('button',name='Phones',exact=True).click()
 page.get_by_role('button',name='Connect Driver’s iPhone',exact=True).click()
 assert page.get_by_text('Projection preview',exact=True).is_visible()
 page.get_by_role('button',name='Home',exact=True).click()
 assert page.get_by_text('Driver’s iPhone',exact=True).is_visible()
 page.get_by_role('button',name='Settings',exact=True).click()
 page.get_by_role('button',name='Dusk',exact=True).click()
 page.reload()
 assert page.locator('body').get_attribute('data-wallpaper')=='dusk'
 page.get_by_role('button',name='Settings',exact=True).click()
 page.get_by_role('button',name='Diagnostics',exact=True).click()
 assert page.get_by_text('Hardware not connected',exact=True).is_visible()
 page.get_by_role('button',name='Back',exact=True).click()
 assert page.get_by_role('heading',name='Settings',exact=True).is_visible()
 page.get_by_role('button',name='Home',exact=True).click()
 Path('evidence').mkdir(exist_ok=True)
 for w,h in [(1280,720),(800,480),(480,800)]:
  page.set_viewport_size({'width':w,'height':h})
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
  page.screenshot(path=f'evidence/home-{w}x{h}.png')
 assert not errors,errors
 b.close()
 print('PASS: navigation, connection preview, home retention, appearance persistence, diagnostics, responsive screenshots; no browser errors')
