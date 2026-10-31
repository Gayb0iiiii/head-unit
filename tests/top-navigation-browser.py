"""Shared production navigation; fake offline host, real Chromium input/layout."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
out=Path('evidence/top-navigation');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
 page=browser.new_page(has_touch=True)
 page.add_init_script("window.headunit={getView:async()=>({connected:false,route:'home'}),onView:()=>()=>{},navigate:async()=>({accepted:true})};")
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 for w,h in [(800,480),(480,800),(1280,720),(1920,1080)]:
  page.set_viewport_size({'width':w,'height':h});page.goto('http://127.0.0.1:8097/production.html')
  expect(page.locator('aside [data-action=apps]')).to_have_count(0)
  for route in ['audio','bluetooth','projection','phones','settings','home','audio']:
   target=page.locator(f'aside [data-action={route}]');target.tap()
   expect(page.locator('main')).to_have_attribute('data-screen',route)
   expect(target).to_have_attribute('aria-current','page')
   expect(target).to_be_visible();page.wait_for_timeout(80);bounds=target.evaluate('(el)=>el.getBoundingClientRect().toJSON()');assert bounds['height']>=48 and bounds['width']>=48
   nav=page.locator('aside').bounding_box();main=page.locator('main').bounding_box()
   assert nav['y']<30 and nav['width']>w*.85 and main['y']>=nav['y']+nav['height']
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   if route in ['settings','home','audio']:page.screenshot(path=str(out/f'{route}-{w}x{h}.png'))
  page.locator('aside [data-action=settings]').focus();page.keyboard.press('Enter');expect(page.locator('main')).to_have_attribute('data-screen','settings')
  page.mouse.move(w//2,h-40);page.mouse.wheel(0,700);page.wait_for_timeout(150)
  assert page.evaluate('scrollY>0')
  assert page.locator('aside').bounding_box()['y']<30
  print(f'PASS {w}x{h}: touch navigation, target sizes, active route, no overlap/overflow, keyboard and wheel')
 page.set_viewport_size({'width':800,'height':480});page.goto('http://127.0.0.1:8097/production.html')
 for scale in [90,115]:
  page.locator('aside [data-action=settings]').click()
  page.locator('[data-ui-scale]').fill(str(scale));page.locator('[data-ui-scale]').dispatch_event('change')
  page.wait_for_timeout(100)
  target=page.locator('aside [data-action=audio]');target.tap();expect(page.locator('main')).to_have_attribute('data-screen','audio')
  assert target.evaluate('(el)=>el.getBoundingClientRect().toJSON()')['height']>=48, f'{scale}% touch target too small'
  page.screenshot(path=str(out/f'audio-800x480-scale-{scale}.png'))
 print('PASS 90% and 115% UI scale: top-bar targets remain at least 48px')
 # Narrow display: real Chromium touch swipe reveals clipped navigation, no tiny targets.
 page.set_viewport_size({'width':320,'height':640});page.goto('http://127.0.0.1:8097/production.html')
 expect(page.locator('aside')).to_be_visible();page.wait_for_timeout(100)
 cdp=page.context.new_cdp_session(page)
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':270,'y':42}]})
 for x in [230,180,130,70]:cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':42}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_timeout(150)
 assert page.locator('.dock-apps').evaluate('(el)=>el.scrollLeft>0')
 page.locator('aside [data-action=settings]').tap();expect(page.locator('main')).to_have_attribute('data-screen','settings')
 page.screenshot(path=str(out/'settings-320x640-swiped.png'))
 print('PASS 320x640: genuine touch swipe scrolls app bar; Settings remains reachable')
 assert not errors,errors
 browser.close()
