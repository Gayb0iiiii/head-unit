"""Actual Chromium wheel and touch gestures; injected offline host, no hardware claims."""
import os,tempfile,wave
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
with tempfile.TemporaryDirectory() as folder,sync_playwright() as p:
 files=[]
 for i in range(30):
  file=Path(folder)/(f'Track {i:02}'+(' A long offline recording title to check wrapping and stable control targets' if i==15 else '')+'.wav')
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
 page.locator('aside [data-action=settings]').click();page.locator('aside [data-action=audio]').click()
 assert abs(listing.evaluate('el=>el.scrollTop')-before)<2,'returning to Audio lost scroll position'
 page.get_by_role('button',name='Favourites',exact=True).click();assert listing.evaluate('el=>el.scrollTop')==0
 page.get_by_role('button',name='Library',exact=True).click();assert abs(listing.evaluate('el=>el.scrollTop')-before)<2,'library tab lost its own position'
 listing.evaluate('el=>el.scrollTop=0');box=listing.bounding_box();client=page.context.new_cdp_session(page)
 x=box['x']+box['width']/2;y=min(box['y']+box['height']-15,680)
 client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
 for step in range(1,9):
  client.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y-step*20}]});page.wait_for_timeout(20)
 client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_timeout(300)
 assert listing.evaluate('el=>el.scrollTop')>50,'touch swipe did not scroll'
 expect(page.get_by_role('button',name='Pause local audio')).to_have_count(0)
 # Cancelled touch and mouse drag over a track must not activate playback.
 listing.evaluate('el=>el.scrollTop=0');page.evaluate('scrollTo(0,0)')
 track=page.get_by_role('button',name='Play Track 00',exact=True);track.scroll_into_view_if_needed();box=track.bounding_box();x=box['x']+25;y=box['y']+25
 client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
 client.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]})
 expect(page.get_by_role('button',name='Pause local audio')).to_have_count(0)
 page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+25,y+25,steps=5);page.mouse.up();page.wait_for_timeout(150)
 expect(page.locator('.local-state')).to_have_text('Ready when you are')
 # Last and first tracks are reachable by scroll; returning restores the same view.
 listing.evaluate('el=>el.scrollTop=el.scrollHeight');expect(page.get_by_role('button',name='Play Track 29',exact=True)).to_be_in_viewport()
 listing.evaluate('el=>el.scrollTop=0');expect(track).to_be_in_viewport()
 for _ in range(3):
  page.locator('[data-local=repeat]').click()
 expect(page.locator('[data-local=repeat]')).to_have_text('Repeat off')
 expect(page.locator('body')).to_have_attribute('data-dock-side','right')
 assert page.locator('aside').bounding_box()['y']<30
 assert page.locator('main').bounding_box()['y']>=page.locator('aside').bounding_box()['y']+page.locator('aside').bounding_box()['height']
 assert page.locator('[data-local=play]').bounding_box()['width']>=64
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
 controls=page.locator('.local-driver-controls').bounding_box();dock=page.locator('aside').bounding_box();assert controls['y']>=dock['y']+dock['height']
 before=listing.evaluate('el=>el.scrollTop');listing.evaluate('el=>el.scrollTop+=300');assert listing.evaluate('el=>el.scrollTop')>before
 page.screenshot(path='/tmp/audio-portrait-player-bottom.png')
 page.locator('.local-tools summary').click()
 page.locator('[data-local=manage]').scroll_into_view_if_needed()
 dock=page.locator('aside').bounding_box();control=page.locator('[data-local=manage]').bounding_box()
 assert control['y']>=dock['y']+dock['height'],('dock overlaps import controls',control,dock)
 page.screenshot(path='/tmp/audio-portrait-visible-controls.png')
 print('PASS: 30 tracks, wheel/touch, route and tab scroll restoration, long label, first/last reachability, touch cancellation and mouse drag without playback, repeated Repeat, top-bar geometry')
 browser.close()
