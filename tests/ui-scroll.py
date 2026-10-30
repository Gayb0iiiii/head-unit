"""Actual Chromium wheel and touch gestures; injected offline host, no hardware claims."""
import os,tempfile,wave
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
with tempfile.TemporaryDirectory() as folder,sync_playwright() as p:
 files=[]
 for i in range(30):
  file=Path(folder)/f'Track {i:02}.wav'
  with wave.open(str(file),'wb') as w:
   w.setnchannels(1);w.setsampwidth(2);w.setframerate(8000);w.writeframes(b'\0'*160)
  files.append(str(file))
 browser=p.chromium.launch(executable_path=os.environ.get('HEADUNIT_TEST_CHROMIUM','/usr/bin/chromium'))
 page=browser.new_page(viewport={'width':1280,'height':720},has_touch=True)
 page.add_init_script("window.headunit={getView:async()=>({connected:false,route:'home'}),onView:fn=>{window.emitHost=fn;return()=>{};}}")
 page.goto(os.environ.get('HEADUNIT_TEST_BASE_URL','http://127.0.0.1:8095')+'/production.html')
 page.locator('aside [data-action=audio]').click();page.locator('[data-local-files]').first.set_input_files(files)
 expect(page.locator('.local-count')).to_contain_text('30 tracks')
 listing=page.locator('.local-list');box=listing.bounding_box()
 page.mouse.move(box['x']+box['width']/2,box['y']+50);page.mouse.wheel(0,650);page.wait_for_timeout(300)
 before=listing.evaluate('el=>el.scrollTop');assert before>100,('wheel',before)
 page.evaluate("emitHost({connected:false,route:'home'})")
 assert abs(listing.evaluate('el=>el.scrollTop')-before)<2,'background state refresh reset library scroll'
 listing.evaluate('el=>el.scrollTop=0');box=listing.bounding_box();client=page.context.new_cdp_session(page)
 x=box['x']+box['width']/2;y=min(box['y']+box['height']-15,680)
 client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
 for step in range(1,9):
  client.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y-step*20}]});page.wait_for_timeout(20)
 client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_timeout(300)
 assert listing.evaluate('el=>el.scrollTop')>50,'touch swipe did not scroll'
 expect(page.get_by_role('button',name='Pause local audio')).to_have_count(0)
 expect(page.locator('body')).to_have_attribute('data-dock-side','right')
 assert page.locator('aside').bounding_box()['height']<=64
 assert page.locator('.local-driver-controls').bounding_box()['width']<=80
 assert page.locator('main>header').bounding_box()['height']<=64
 for width,height in [(1920,1080),(1280,720),(800,480),(480,800)]:
  page.set_viewport_size({'width':width,'height':height})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.mouse.move(2,2)
  page.screenshot(path=f'/tmp/audio-populated-{width}x{height}.png',full_page=True)
 page.set_viewport_size({'width':480,'height':800})
 page.evaluate('scrollTo(0,0)');page.screenshot(path='/tmp/audio-portrait-player-top.png')
 listing.scroll_into_view_if_needed();listing.evaluate('el=>el.scrollTop=0');page.wait_for_timeout(150)
 row=page.get_by_role('button',name='Play Track 00',exact=True);expect(row).to_be_visible();assert row.inner_text().startswith('Track 00')
 page.screenshot(path='/tmp/audio-portrait-visible-list.png')
 page.evaluate('scrollTo(0,0)')
 controls=page.locator('.local-driver-controls').bounding_box();dock=page.locator('aside').bounding_box();assert controls['y']+controls['height']<=dock['y']
 before=listing.evaluate('el=>el.scrollTop');listing.evaluate('el=>el.scrollTop+=300');assert listing.evaluate('el=>el.scrollTop')>before
 page.screenshot(path='/tmp/audio-portrait-player-bottom.png')
 page.locator('.local-tools summary').click()
 page.locator('[data-local=manage]').scroll_into_view_if_needed()
 dock=page.locator('aside').bounding_box();control=page.locator('[data-local=manage]').bounding_box()
 assert control['y']+control['height']<=dock['y'],('dock overlaps import controls',control,dock)
 page.screenshot(path='/tmp/audio-portrait-visible-controls.png')
 print('PASS: 30-track library mouse wheel, refresh position, touch swipe without playback')
 browser.close()
