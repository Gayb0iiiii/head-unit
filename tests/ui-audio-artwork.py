"""Original generated artwork + silent encoded MP3 fixtures, never user music.
Requires ffmpeg, Pillow, Python Playwright and Chromium. No external network.
"""
import os,tempfile,subprocess,wave,json
from pathlib import Path
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright,expect
with tempfile.TemporaryDirectory() as folder,sync_playwright() as p:
 root=Path(folder);wav=root/'silence.wav'
 with wave.open(str(wav),'wb') as w:
  w.setnchannels(2);w.setsampwidth(2);w.setframerate(8000);w.writeframes(b'\0'*8000*4*10)
 files=[]
 for i,title in enumerate(['After the Rain','Coastal Passage','Evening Lines','Quiet Roads','Southern Light','The Long Way Home']):
  im=Image.new('RGB',(320,320),(14+i*3,31+i*2,39+i*5));draw=ImageDraw.Draw(im)
  draw.ellipse((170,35,250,115),fill=(120+i*8,175,180-i*8))
  draw.polygon([(0,250),(100,145),(185,230),(270,155),(320,215),(320,320),(0,320)],fill=(35+i*5,78,88))
  draw.line([(0,290),(320,210)],fill=(130,179,183),width=3)
  draw.text((18,20),'OFFLINE TEST SESSIONS',fill=(200,220,220))
  art=root/f'{i}.png';im.save(art);out=root/f'{i}.mp3'
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav),'-i',str(art),'-map','0:a','-map','1:v','-c:a','libmp3lame','-c:v','copy','-id3v2_version','3','-metadata',f'title={title}','-metadata','artist=Head-unit Test Ensemble','-metadata','album=Offline Test Sessions','-metadata:s:v','comment=Cover (front)',str(out)],check=True)
  files.append(str(out))
 browser=p.chromium.launch(executable_path=os.environ.get('HEADUNIT_TEST_CHROMIUM','/usr/bin/chromium'))
 page=browser.new_page(viewport={'width':1280,'height':720},has_touch=True)
 page.add_init_script("window.headunit={getView:async()=>({connected:false,route:'home'}),onView:()=>()=>{}}")
 page.goto(os.environ.get('HEADUNIT_TEST_BASE_URL','http://127.0.0.1:8095')+'/production.html')
 page.locator('aside [data-action=audio]').click();page.locator('[data-local-files]').first.set_input_files(files)
 expect(page.locator('.local-count')).to_contain_text('6 tracks')
 page.get_by_role('button',name='Play After the Rain',exact=True).click();expect(page.locator('.local-art img')).to_be_visible()
 expect(page.locator('.local-now')).to_contain_text('Head-unit Test Ensemble · Offline Test Sessions')
 expect(page.locator('#local-duration')).to_have_text('0:10');assert page.locator('.local-art img').evaluate('el=>el.complete&&el.naturalWidth===320')
 page.get_by_role('button',name='Pause local audio').click()
 for width,height in [(1920,1080),(1280,720),(1024,600),(800,480),(480,800),(390,844)]:
  page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(150);page.locator('.local-list').evaluate('el=>el.scrollTop=0');page.mouse.move(2,2)
  if width>=650:
   player=page.locator('.local-player').bounding_box()
   if height>600:assert player['y']+player['height']<=height+1,('player below viewport',width,player)
   else:
    page.locator('.local-player').scroll_into_view_if_needed();expect(page.locator('.local-player')).to_be_in_viewport();page.evaluate('scrollTo(0,0)')
   assert page.locator('[data-local=play]').bounding_box()['height']>=64
   assert page.locator('.local-tools summary').bounding_box()['height']>=56
   controls=page.locator('.local-driver-controls').bounding_box();library=page.locator('.local-library').bounding_box();assert controls['x']>=library['x']+library['width']
   assert player['y']>=library['y']+library['height']
   listing=page.locator('.local-list').bounding_box();assert listing['y']+listing['height']<=library['y']+library['height']
  if width==1920:
   assert page.locator('.local-cover').first.bounding_box()['width']>=230
   assert page.locator('[data-local=play]').bounding_box()['height']>=70
  if width<650:
   page.evaluate('scrollTo(0,0)');dock=page.locator('aside').bounding_box();controls=page.locator('.local-driver-controls').bounding_box();assert controls['y']>=dock['y']+dock['height'],('portrait transport covered',controls,dock)
   assert controls['y']+controls['height']<=height,'portrait primary controls below fold'
  if width==800 or width<650:
   listing=page.locator('.local-list').bounding_box()
   first=page.locator('.local-library-track').first
   cover=first.locator('.local-cover').bounding_box()
   assert abs(cover['width']-cover['height'])<2,('cropped cover',cover)
   for target in [first.locator('strong'),first.locator('small'),first.locator('[data-local=favourite]'),first.locator('[data-local=enqueue]')]:
    box=target.bounding_box();assert box['y']>=listing['y'] and box['y']+box['height']<=listing['y']+listing['height'],('first row clipped',box,listing)
  if width<650:
   expect(page.locator('.local-scroll-hint')).to_contain_text('Swipe or scroll')
  listing=page.locator('.local-list')
  listing.evaluate('el=>el.scrollTop=0')
  if listing.evaluate('el=>el.scrollHeight>el.clientHeight+20'):
   box=listing.bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']-12
   page.mouse.move(x,y);page.mouse.wheel(0,400);page.wait_for_timeout(200)
   assert listing.evaluate('el=>el.scrollTop')>20,('wheel failed',width)
   listing.evaluate('el=>el.scrollTop=0')
   client=page.context.new_cdp_session(page)
   client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
   distance=min(120,box['height']-24)
   for step in range(1,9):
    client.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y-distance*step/8}]});page.wait_for_timeout(20)
   client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_timeout(250);client.detach()
   assert listing.evaluate('el=>el.scrollTop')>20,('touch failed',width)
   expect(page.get_by_role('button',name='Play local audio',exact=True)).to_be_visible()
   listing.focus();page.keyboard.press('Home');page.keyboard.press('PageDown');page.wait_for_timeout(250)
   expect(listing).to_be_focused()
   listing.evaluate('el=>el.scrollTop=0')
  repeat=page.locator('[data-local=repeat]')
  for mode in ['all','one','off']:
   repeat.click();expect(repeat).to_have_attribute('aria-label','Repeat: '+mode)
   expect(repeat).to_be_focused()
  assert page.locator('aside').bounding_box()['y']>=0,'Audio app bar scrolled out of view'
  page.evaluate('scrollTo(0,0)')
  page.screenshot(path=f'/tmp/audio-tagged-{width}x{height}.png')
  if width==480:
   page.locator('.local-list').scroll_into_view_if_needed();page.screenshot(path='/tmp/audio-tagged-portrait-library.png')
 for width,height in [(800,480),(480,800)]:
  page.set_viewport_size({'width':width,'height':height})
  for scale in [90,100,115]:
   page.locator('aside [data-action=settings]').click()
   page.locator('[data-ui-scale]').evaluate('(el,v)=>{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));}',scale)
   page.locator('aside [data-action=audio]').click()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),('scaled overflow',width,scale)
   for selector in ['[data-local=play]','[data-local=repeat]','[data-local=shuffle]','.local-tools summary','.local-track [data-local=favourite]','.local-track [data-local=enqueue]']:
    target=page.locator(selector).first;target.scroll_into_view_if_needed();box=target.bounding_box()
    assert min(box['width'],box['height'])>=56,('small target',selector,width,scale,box)
    center=target.evaluate('el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}')
    assert center,('covered target',selector,width,scale)
   page.locator('[data-local=repeat]').click();expect(page.locator('[data-local=repeat]')).to_have_attribute('aria-label','Repeat: all')
   page.locator('[data-local=repeat]').click();page.locator('[data-local=repeat]').click()
 page.locator('aside [data-action=settings]').click();page.locator('[data-reset-ui-scale]').click();page.locator('aside [data-action=audio]').click()
 page.set_viewport_size({'width':1280,'height':720});page.locator('.local-tools summary').click();page.locator('[data-local-search]').fill('After the Rain');page.keyboard.press('Escape')
 expect(page.locator('.local-track')).to_have_count(1);assert page.locator('.local-cover').bounding_box()['width']<=220
 title=page.locator('.local-track').bounding_box();listing=page.locator('.local-list').bounding_box();assert title['y']+title['height']<=listing['y']+listing['height'], (title,listing)
 page.screenshot(path='/tmp/audio-tagged-single-track.png')
 page.reload();page.locator('aside [data-action=audio]').click();expect(page.locator('.local-art img')).to_be_visible();expect(page.get_by_role('button',name='Play local audio',exact=True)).to_be_visible()
 print(json.dumps({'passed':True,'fixtures':'six original covers + silent MP3s','checks':['ID3 title/artist/album','embedded PNG decode','MP3 duration','paused restart with artwork','six distinct viewport captures','bottom player visible on tall landscape, reachable by scroll on short screens','separate right playback controls','touch targets and contained library','single filtered track cover width bounded','square short-screen covers and visible metadata/actions','portrait browsing cue','wheel and touch gestures on every overflowing viewport','repeat cycling preserves focus','90/100/115 percent scales: minimum 56px and unobstructed action centers']}));browser.close()
