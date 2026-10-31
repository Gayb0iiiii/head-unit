"""Read-only GNSS browser contract with labelled injected data; no receiver access."""
import os,json,time
from playwright.sync_api import sync_playwright,expect
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('HEADUNIT_TEST_CHROMIUM','/usr/bin/chromium'))
 page=browser.new_page(viewport={'width':800,'height':480},has_touch=True)
 requests=[];page.on('request',lambda request:requests.append(request.url))
 page.add_init_script("""window.fixtureView={connected:true,front:'livi',route:'settings',phones:[]};window.headunit={getView:async()=>fixtureView,onView:fn=>{window.emitLocation=location=>{fixtureView={...fixtureView,location};fn(fixtureView)};return()=>{}},navigate:async()=>({accepted:true})};""")
 page.goto(os.environ.get('HEADUNIT_TEST_BASE_URL','http://127.0.0.1:8095')+'/production.html')
 page.locator('aside [data-action=settings]').click()
 card=page.locator('.settings-location');expect(card).to_have_attribute('data-location-status','unavailable')
 page.context.set_offline(True)
 fix={'status':'current','latitude':12.34567,'longitude':-45.12345,'fixQuality':'gps','fixMode':'3d','satellitesUsed':7,'satellitesVisible':11,'sampledAt':int(time.time()*1000),'freshForMs':10000,'device':'/dev/private','error':'<script>bad()</script>'}
 for width,height in [(1280,720),(800,480),(480,800)]:
  page.set_viewport_size({'width':width,'height':height});page.evaluate('value=>emitLocation(value)',fix)
  expect(card).to_have_attribute('data-location-status','current');expect(card).to_contain_text('12.34567, -45.12345')
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  card.evaluate("el=>el.scrollIntoView({block:'center',behavior:'instant'})");page.wait_for_timeout(150);page.screenshot(path=f'/tmp/gnss-fixture-{width}x{height}.png')
  assert '/dev/private' not in card.inner_text() and '<script>' not in card.inner_text()
 page.evaluate('value=>emitLocation(value)',{**fix,'freshForMs':100})
 expect(card).to_have_attribute('data-location-status','stale');expect(card.locator('.location-coordinate')).to_have_count(0)
 for status in ['no-fix','unsupported-fix','receiver-unavailable','disabled','unavailable']:
  page.evaluate('value=>emitLocation(value)',{**fix,'status':status})
  expect(card).to_have_attribute('data-location-status',status);expect(card.locator('.location-coordinate')).to_have_count(0)
 page.evaluate("fixtureView.connected=false;emitLocation({status:'current',latitude:12.34567,longitude:-45.12345,freshForMs:10000})")
 expect(card).to_have_attribute('data-location-status','disconnected')
 assert '12.34567' not in page.evaluate('JSON.stringify(localStorage)')
 assert all('/production.html' in url or '/src/' in url or url.endswith('/favicon.ico') for url in requests),requests
 print(json.dumps({'passed':True,'fixture':'injected GNSS, no receiver','checks':['absent receiver status','offline current coordinates','three viewport bounds','stale timer removes coordinates','no-fix/simulated/disabled/disconnected hides coordinates','no raw paths or errors','no location persistence or external requests']}))
 browser.close()
