import http.server,threading,pathlib,os
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1] / 'dist'
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*a,**k):super().__init__(*a,directory=str(root),**k)
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/production.html'
bridge='''
let listener;
const phone={id:'p',name:'Fixture phone',status:'active'};
const state={connected:true,route:'home',front:'livi',phones:[phone],homeStatus:{phone:{status:'available',phoneId:'p',batteryPercent:73,charging:true,freshForMs:30000},media:{status:'available',phoneId:'p',title:'Observed fixture track',artist:'Fixture artist',playing:true,freshForMs:30000}}};
window.testHost={emit(patch){Object.assign(state,patch);listener?.(structuredClone(state));},calls:[]};
window.headunit=Object.freeze({getView:async()=>structuredClone(state),onView:fn=>{listener=fn;return()=>listener=null;},navigate:async route=>{testHost.calls.push(['navigate',route]);testHost.emit({route});return {accepted:true}},media:async(control,phoneId)=>{testHost.calls.push(['media',control,phoneId]);return {accepted:true}},getMetrics:async()=>({cpuPercent:null,gpuPercent:null})});
'''
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('HEADUNIT_TEST_CHROMIUM','/usr/bin/chromium'),headless=True,
                           chromium_sandbox=os.environ.get('HEADUNIT_TEST_CHROMIUM_NO_SANDBOX')!='1')
 page=browser.new_page(viewport={'width':800,'height':480},reduced_motion='reduce')
 errors=[];page.on('pageerror',lambda e:errors.append(e.stack or str(e)))
 page.add_init_script(bridge);page.goto(url)
 assert page.get_by_text('Observed fixture track').count()==1
 assert page.get_by_text('73% · Charging').count()==1
 if os.environ.get('HEADUNIT_TEST_SCREENSHOT_DIR'):
  page.screenshot(path=str(pathlib.Path(os.environ['HEADUNIT_TEST_SCREENSHOT_DIR'])/'ui-connected-fixture-800x480.png'))
 page.locator('[data-media=pause]').click()
 assert page.evaluate('testHost.calls')==[['media','pause','p']]
 page.evaluate("testHost.emit({homeStatus:{media:{status:'stale',phoneId:'p'}}})")
 assert page.locator('[data-media=pause]').count()==0
 assert page.get_by_text('Media update paused').count()==1
 page.evaluate('document.activeElement.blur()')
 page.keyboard.press('Tab')
 focused=page.evaluate('({name:document.activeElement.getAttribute("aria-label")||document.activeElement.textContent.trim(),outline:getComputedStyle(document.activeElement).outlineStyle})')
 assert focused['outline']!='none',focused
 assert not errors,errors
 print('connected media/stale/keyboard/reduced-motion passed',focused)
 browser.close()
server.shutdown()
