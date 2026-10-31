"""Pixel checks on real Home surface: broad colour transmission and stripe blur."""
import os
from pathlib import Path
from io import BytesIO
from PIL import Image, ImageStat
from playwright.sync_api import sync_playwright
out=Path('evidence/top-navigation');out.mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
 page=browser.new_page(viewport={'width':1280,'height':720})
 page.add_init_script("window.headunit={getView:async()=>({connected:false,route:'home'}),onView:()=>()=>{}}")
 if os.environ.get('GLASS_BASELINE_CSS'):page.route('**/src/style.css',lambda route:route.fulfill(path=os.environ['GLASS_BASELINE_CSS'],content_type='text/css'))
 page.goto('http://127.0.0.1:8097/production.html');page.wait_for_timeout(150)
 cdp=page.context.new_cdp_session(page)
 for mode in ['day','night']:
  page.locator('aside [data-action=settings]').click();page.locator(f'[data-appearance={mode}]').click();page.locator('aside [data-action=home]').click()
  # Test wallpaper only; production surface paint/blur are untouched.
  page.evaluate("document.body.dataset.testPattern='broad';if(!document.querySelector('#pattern-style')){const link=document.createElement('link');link.id='pattern-style';link.rel='stylesheet';link.href='/tests/fixtures/glass-pattern.css';document.head.append(link)}")
  page.wait_for_timeout(100)
  panel=page.locator('.home-time');box=panel.bounding_box()
  # Empty lower band within the actual panel avoids text/borders/shadows.
  clip={'x':box['x']+25,'y':box['y']+box['height']-35,'width':box['width']-50,'height':8}
  def capture(name):
   page.wait_for_timeout(100);page.screenshot(path=str(out/f'glass-{mode}-{name}.png'))
   return Image.open(BytesIO(page.screenshot(clip=clip))).convert('RGB')
  normal=capture('normal');spread=max(ImageStat.Stat(normal).stddev)
  assert spread>6,(mode,'surface obscures patterned wallpaper',spread)
  cdp.send('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-transparency','value':'reduce'}]})
  assert page.evaluate("matchMedia('(prefers-reduced-transparency: reduce)').matches")
  reduced=capture('reduced');flat=max(ImageStat.Stat(reduced).stddev)
  assert flat<1,(mode,'reduced transparency must be opaque',flat)
  cdp.send('Emulation.setEmulatedMedia',{'features':[]})
  # Fine stripes should be smoothed; disable only backdrop blur for negative control.
  page.evaluate("document.body.dataset.testPattern='fine'")
  blurred=capture('fine-blurred');blurspread=max(ImageStat.Stat(blurred).stddev)
  page.evaluate("document.body.dataset.testBlur='off'")
  sharp=capture('fine-no-blur');sharpness=max(ImageStat.Stat(sharp).stddev)
  assert sharpness>blurspread*2+2,(mode,blurspread,sharpness)
  page.evaluate("delete document.body.dataset.testBlur")
  print(f'PASS {mode}: broad pattern SD {spread:.2f}; reduced SD {flat:.2f}; fine blur SD {blurspread:.2f} vs no blur {sharpness:.2f}')
 browser.close()
