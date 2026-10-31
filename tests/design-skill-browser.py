"""HZJ105 project criteria, real Chromium pixels/input with offline host fixture."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
out=Path('evidence/design-skill');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
 page=browser.new_page(has_touch=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script("window.headunit={getView:async()=>({connected:false,route:'home'}),onView:fn=>{window.emitHost=fn;return()=>{}}};")
 page.goto('http://127.0.0.1:8097/production.html')
 for w,h in [(1920,1080),(800,480),(480,800)]:
  page.set_viewport_size({'width':w,'height':h})
  for mode in ['day','night']:
   page.locator('aside [data-action=settings]').click();page.locator(f'[data-appearance={mode}]').click()
   for route in ['home','audio','bluetooth','projection','phones','settings','wallpapers']:
    if route=='wallpapers':page.locator('[data-action=wallpaper-gallery]').click()
    else:page.locator(f'aside [data-action={route}]').click()
    expect(page.locator('main')).to_have_attribute('data-screen',route)
    page.wait_for_timeout(80)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(route,w,'overflow')
    panels=page.locator('main :is(.panel,.settings-card,.feature-stage,.home-time,.home-media,.home-weather,.home-shortcut)')
    for item in panels.all():
     assert item.evaluate('(el)=>getComputedStyle(el).backdropFilter')=='none',(route,'content blur')
     assert item.evaluate('(el)=>getComputedStyle(el).backgroundImage')=='none',(route,'decorative content gradient')
     assert item.evaluate('(el)=>getComputedStyle(el).backgroundColor').startswith('rgb('),(route,'content not opaque')
    for button in page.locator('aside button').all():
     size=button.evaluate('(el)=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height})');assert size['w']>=56 and size['h']>=56,size
    assert float(page.locator('.dock-apps').evaluate('(el)=>getComputedStyle(el).gap').replace('px',''))>=8
    page.screenshot(path=str(out/f'{route}-{mode}-{w}x{h}.png'))
   print(f'PASS {w}x{h} {mode}: seven screens, opaque content, shared 56px/8px bar, no overflow')
 # Accessibility variants keep true glass bounded to the bar, then remove it.
 page.locator('aside [data-action=home]').click()
 cdp=page.context.new_cdp_session(page)
 for feature,value in [('prefers-reduced-transparency','reduce'),('prefers-contrast','more'),('prefers-reduced-motion','reduce'),('forced-colors','active')]:
  cdp.send('Emulation.setEmulatedMedia',{'features':[{'name':feature,'value':value}]})
  if feature!='prefers-reduced-motion':assert page.locator('aside').evaluate('(el)=>getComputedStyle(el).backdropFilter')=='none'
  page.screenshot(path=str(out/f'accessibility-{feature}.png'))
 cdp.send('Emulation.setEmulatedMedia',{'features':[]})
 page.reload();expect(page.locator('aside')).to_be_visible();assert not errors,errors
 print('PASS accessibility variants, offline reload, no page errors')
 browser.close()
