"""Browser pointer route fixture. Requires npm start, Playwright and Chromium.
This proves renderer mapping and click stacking, not native or physical touch.
"""
import os
from playwright.sync_api import sync_playwright, expect

bridge = """
let listener;
const state={connected:true,route:'projection',front:'projection',projectionReady:true,touchReady:false,
 picture:{width:800,height:480,insets:{top:24,bottom:0,left:80,right:0}},phones:[]};
window.testHost={calls:[],emit(patch){Object.assign(state,patch);listener?.(structuredClone(state));}};
window.headunit={getView:async()=>structuredClone(state),onView:fn=>{listener=fn;return()=>{};},
 touch:async points=>{testHost.calls.push(['touch',points]);},cancelTouch:async()=>{testHost.calls.push(['cancel']);},
 navigate:async route=>{testHost.calls.push(['navigate',route]);testHost.emit({route,front:route==='projection'?'projection':'livi'});},
 getUpdateStatus:async()=>({phase:'idle'}),getMetrics:async()=>({})};
"""
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('HEADUNIT_TEST_CHROMIUM','/usr/bin/chromium'),headless=True)
 page=browser.new_page(viewport={'width':800,'height':480},has_touch=True)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script(bridge)
 page.goto(os.environ.get('HEADUNIT_TEST_BASE_URL','http://127.0.0.1:8095')+'/production.html')
 picture=page.locator('.native-picture');expect(picture).to_be_visible()
 rect=picture.bounding_box();assert rect and rect['width']>0 and rect['height']>0
 x=rect['x']+rect['width']*.5;y=rect['y']+rect['height']*.5
 cdp=page.context.new_cdp_session(page)
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
 assert not page.evaluate('testHost.calls')
 page.evaluate('testHost.emit({touchReady:true})')
 assert page.evaluate('([x,y])=>document.elementFromPoint(x,y)?.classList.contains("native-picture")',[x,y])
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
 page.wait_for_timeout(100)
 calls=page.evaluate('testHost.calls')
 assert calls[0][0]=='touch' and calls[0][1][0]['phase']=='down',calls
 assert abs(calls[0][1][0]['x']-.5)<.01 and abs(calls[0][1][0]['y']-.5)<.01,calls
 assert any(item[0]=='touch' and item[1][0]['phase']=='up' for item in calls),calls
 page.locator('aside [data-action=home]').click()
 expect(page.locator('main')).to_have_attribute('data-screen','home')
 assert not errors,errors
 print('PASS production picture hit test, normalized touch and shell navigation')
 browser.close()
