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
 page=browser.new_page(viewport={'width':1280,'height':720})
 page.add_init_script("window.headunit={getView:async()=>({connected:false,route:'home'}),onView:()=>()=>{}}")
 page.goto(os.environ.get('HEADUNIT_TEST_BASE_URL','http://127.0.0.1:8095')+'/production.html')
 page.locator('aside [data-action=audio]').click();page.locator('[data-local-files]').first.set_input_files(files)
 expect(page.locator('.local-count')).to_contain_text('6 tracks')
 page.get_by_role('button',name='Play After the Rain',exact=True).click();expect(page.locator('.local-art img')).to_be_visible()
 expect(page.locator('.local-now')).to_contain_text('Head-unit Test Ensemble · Offline Test Sessions')
 expect(page.locator('#local-duration')).to_have_text('0:10');assert page.locator('.local-art img').evaluate('el=>el.complete&&el.naturalWidth===320')
 page.get_by_role('button',name='Pause local audio').click()
 for width,height in [(1920,1080),(1280,720),(800,480),(480,800)]:
  page.set_viewport_size({'width':width,'height':height});page.mouse.move(2,2)
  if width>=650:
   player=page.locator('.local-player').bounding_box();assert player['y']+player['height']<=height+1,('player below viewport',width,player)
   assert page.locator('[data-local=play]').bounding_box()['height']>=50
   assert page.locator('.local-tools summary').bounding_box()['height']>=48
   controls=page.locator('.local-driver-controls').bounding_box();library=page.locator('.local-library').bounding_box();assert controls['x']>=library['x']+library['width']
   assert player['y']>=library['y']+library['height']
   listing=page.locator('.local-list').bounding_box();assert listing['y']+listing['height']<=library['y']+library['height']
  if width==1920:
   assert page.locator('.local-cover').first.bounding_box()['width']>=230
   assert page.locator('[data-local=play]').bounding_box()['height']>=70
  if width==480:
   dock=page.locator('aside').bounding_box();controls=page.locator('.local-driver-controls').bounding_box();assert controls['y']+controls['height']<=dock['y'],('portrait transport covered',controls,dock)
  page.screenshot(path=f'/tmp/audio-tagged-{width}x{height}.png')
  if width==480:
   page.locator('.local-list').scroll_into_view_if_needed();page.screenshot(path='/tmp/audio-tagged-portrait-library.png')
 page.set_viewport_size({'width':1280,'height':720});page.locator('.local-tools summary').click();page.locator('[data-local-search]').fill('After the Rain');page.keyboard.press('Escape')
 expect(page.locator('.local-track')).to_have_count(1);assert page.locator('.local-cover').bounding_box()['width']<=220
 title=page.locator('.local-track').bounding_box();listing=page.locator('.local-list').bounding_box();assert title['y']+title['height']<=listing['y']+listing['height'], (title,listing)
 page.screenshot(path='/tmp/audio-tagged-single-track.png')
 page.reload();page.locator('aside [data-action=audio]').click();expect(page.locator('.local-art img')).to_be_visible();expect(page.get_by_role('button',name='Play local audio',exact=True)).to_be_visible()
 print(json.dumps({'passed':True,'fixtures':'six original covers + silent MP3s','checks':['ID3 title/artist/album','embedded PNG decode','MP3 duration','paused restart with artwork','four viewport captures','bottom player in landscape viewport','separate right playback controls','touch targets and contained library','single filtered track cover width bounded']}));browser.close()
