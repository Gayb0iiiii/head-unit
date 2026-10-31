"""Production graphite screenshots and pixel separation, without wallpaper replacement."""
import os
from pathlib import Path
from io import BytesIO
from PIL import Image,ImageStat
from playwright.sync_api import sync_playwright
out=Path(os.environ.get('GRAPHITE_EVIDENCE_DIR','evidence/design-skill/opaque-content'));out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
 page=browser.new_page(viewport={'width':1280,'height':720})
 page.add_init_script("window.headunit={getView:async()=>({connected:false,route:'home'}),onView:()=>()=>{}}")
 if os.environ.get('GLASS_BASELINE_CSS'):page.route('**/src/style.css',lambda route:route.fulfill(path=os.environ['GLASS_BASELINE_CSS'],content_type='text/css'))
 page.goto('http://127.0.0.1:8097/production.html');page.wait_for_timeout(100)
 cdp=page.context.new_cdp_session(page)
 for mode in ['day','night']:
  page.locator('aside [data-action=settings]').click();page.locator(f'[data-appearance={mode}]').click();page.locator('aside [data-action=home]').click()
  assert page.locator('body').get_attribute('data-wallpaper')=='graphite'
  page.wait_for_timeout(100);box=page.locator('.home-time').bounding_box()
  def sample(y):
   img=Image.open(BytesIO(page.screenshot(clip={'x':box['x']+box['width']-70,'y':y,'width':30,'height':12}))).convert('RGB')
   return sum(ImageStat.Stat(img).mean)/3
  upper=sample(box['y']+25);lower=sample(box['y']+box['height']-32)
  page.screenshot(path=str(out/f'home-{mode}-1280x720.png'))
  assert abs(upper-lower)<1,(mode,'content must be uniform opaque material',upper,lower)
  assert upper<85,(mode,'avoid bright glare',upper)
  for route in ['audio','settings']:
   page.locator(f'aside [data-action={route}]').click();page.wait_for_timeout(100);page.screenshot(path=str(out/f'{route}-{mode}-1280x720.png'))
  page.locator('aside [data-action=home]').click()
  cdp.send('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-transparency','value':'reduce'}]})
  page.wait_for_timeout(100);box=page.locator('.home-time').bounding_box()
  assert abs(sample(box['y']+25)-sample(box['y']+box['height']-32))<1,'reduced transparency removes decorative lighting'
  page.screenshot(path=str(out/f'home-{mode}-reduced.png'))
  cdp.send('Emulation.setEmulatedMedia',{'features':[]})
  for feature in ['prefers-contrast','forced-colors']:
   cdp.send('Emulation.setEmulatedMedia',{'features':[{'name':feature,'value':'more' if feature=='prefers-contrast' else 'active'}]})
   assert page.locator('.home-time').evaluate('(el)=>getComputedStyle(el).backgroundImage')=='none'
  cdp.send('Emulation.setEmulatedMedia',{'features':[]})
  print(f'PASS {mode}: unchanged graphite, upper/lower opaque content intensity {upper:.2f}/{lower:.2f}, opaque flat accessibility fallback')
 for w,h in [(800,480),(480,800),(1920,1080)]:
  page.set_viewport_size({'width':w,'height':h})
  for route in ['home','audio','settings']:
   page.locator(f'aside [data-action={route}]').click();page.wait_for_timeout(100);page.screenshot(path=str(out/f'{route}-{w}x{h}.png'))
 browser.close()
