"""Production renderer feature audit with explicit, injected host responses.
No native services, updates, desktop handoff, system clock or network are changed.
Run with npm start; requires Python Playwright and Chromium.
"""
import json, os
from playwright.sync_api import sync_playwright, expect
bridge='''
let listener,updateListener;
const state={connected:false,route:'home',front:'livi',phones:[]};
const weather={status:'current',location:{id:1,label:'Albany'},temperatureC:17,weatherCode:3,fetchedAt:Date.now(),observedAt:Date.now()};
window.testHost={calls:[],emit(patch){Object.assign(state,patch);listener?.(structuredClone(state));}};
window.headunit={getView:async()=>structuredClone(state),onView:fn=>{listener=fn;return()=>{};},
 navigate:async route=>{testHost.calls.push(['navigate',route]);testHost.emit({route,front:route==='projection'?'projection':'livi'});},
 exitToDesktop:async()=>{testHost.calls.push(['desktop']);return {accepted:true};},
 getWeather:async()=>weather,searchWeather:async query=>[{id:2,label:'Perth'}],selectWeather:async id=>{testHost.calls.push(['weather',id]);weather.location={id,label:'Perth'};},
 getTimeStatus:async()=>({timezone:'Australia/Perth',ntpEnabled:true,synchronized:false,canNtp:true}),
 setNtp:async value=>{testHost.calls.push(['ntp',value]);return {changed:true};},
 setTimezone:async value=>{testHost.calls.push(['timezone',value]);return {changed:true};},
 setManualTime:async value=>{testHost.calls.push(['time',value]);return {changed:true};},
 getUpdateStatus:async()=>({phase:'idle'}),onUpdateStatus:fn=>{updateListener=fn;return()=>{};},
 requestUpdate:async confirmed=>{testHost.calls.push(['update',confirmed]);updateListener({phase:'current'});return {accepted:true};},
 getMetrics:async()=>({cpuPercent:null,gpuPercent:null,ramStatus:'unavailable',networkStatus:'unavailable',pingStatus:'unavailable'})};
'''
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('HEADUNIT_TEST_CHROMIUM','/usr/bin/chromium'),headless=True)
 page=b.new_page(viewport={'width':800,'height':480});errors=[];csp=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:csp.append(m.text) if 'Content Security Policy' in m.text else None)
 page.add_init_script(bridge);page.goto(os.environ.get('HEADUNIT_TEST_BASE_URL','http://127.0.0.1:8095')+'/production.html')
 def nav(route):page.locator(f'aside [data-action={route}]').click()
 expect(page.locator('.weather-reading')).to_contain_text('17°C')
 nav('settings')
 page.mouse.move(650,350);page.mouse.wheel(0,650);page.wait_for_timeout(300)
 before=page.evaluate('scrollY');assert before>100,('wheel did not scroll',before)
 page.evaluate("testHost.emit({connected:false,route:'home',front:'livi'})")
 assert abs(page.evaluate('scrollY')-before)<2,'host refresh must preserve scroll'
 page.locator('[data-weather-search]').fill('Perth');page.locator('[data-action=search-weather]').click();page.locator('[data-weather-city="2"]').click()
 expect(page.locator('.settings-weather')).to_contain_text('Location saved')
 nav('home');expect(page.locator('.weather-heading')).to_contain_text('Perth')
 nav('settings');page.locator('[data-clock-ntp=false]').click();expect(page.locator('.settings-clock')).to_contain_text('Automatic time setting updated')
 page.locator('[data-clock-zone="Etc/UTC"]').click();expect(page.locator('.settings-clock')).to_contain_text('System time zone updated')
 page.locator('[data-manual-time]').fill('2026-10-30T15:00');page.locator('[data-action=apply-manual-time]').click();expect(page.locator('.settings-clock')).to_contain_text('System time updated')
 expect(page.locator('[data-action=exit-to-desktop]')).to_be_disabled()
 page.evaluate('testHost.emit({desktopAvailable:true})');expect(page.locator('[data-action=exit-to-desktop]')).to_be_enabled()
 page.locator('[data-action=exit-to-desktop]').click();assert ['desktop'] in page.evaluate('testHost.calls')
 page.locator('[data-action=arm-update]').click();expect(page.locator('[data-action=confirm-update]')).to_be_visible()
 page.locator('[data-action=dismiss-update]').click();assert not any(c[0]=='update' for c in page.evaluate('testHost.calls'))
 page.locator('[data-action=arm-update]').click();page.locator('[data-action=confirm-update]').click();expect(page.locator('.settings-update')).to_contain_text('Already up to date')
 page.locator('[data-action=wallpaper-gallery]').click();page.locator('.wallpaper-option[data-wallpaper=meadow]').click();page.locator('button[data-accent=coral]').click()
 page.locator('[data-wallpaper-dim]').evaluate('(el)=>{el.value=35;el.dispatchEvent(new Event("input",{bubbles:true}));}')
 page.reload();expect(page.locator('body')).to_have_attribute('data-wallpaper','meadow');expect(page.locator('body')).to_have_attribute('data-accent','coral')
 nav('settings');page.locator('[data-action=wallpaper-gallery]').click();page.locator('[data-action=reset-wallpaper-tuning]').click();expect(page.locator('body')).to_have_attribute('data-accent','sea');page.keyboard.press('Escape');expect(page.locator('h1')).to_have_text('Settings')
 nav('apps');page.locator('[data-action=edit-layout]').click();page.locator('[data-move="apps:settings:-1"]').click();page.locator('[data-action=done-layout]').click()
 order=page.locator('main .tile').evaluate_all('els=>els.map(el=>el.dataset.action)');page.reload();nav('apps');assert page.locator('main .tile').evaluate_all('els=>els.map(el=>el.dataset.action)')==order
 nav('settings');page.locator('[data-debug-overlay=true]').click();expect(page.locator('#debug-overlay')).to_be_visible();page.locator('[data-debug-overlay=false]').click();expect(page.locator('#debug-overlay')).to_have_count(0)
 page.evaluate("async()=>{const app=await import('/src/app.mjs');app.updateVehicleMotion('moving');}")
 for selector in ['[data-glass-strength]','[data-ui-scale]','[data-wallpaper-file]','[data-manual-time]','[data-action=arm-update]']:
  expect(page.locator(selector)).to_be_disabled()
 nav('audio');expect(page.locator('[data-local-search]')).to_be_disabled();expect(page.get_by_text('Park to browse and manage music.')).to_be_visible()
 page.evaluate("async()=>{const app=await import('/src/app.mjs');app.updateVehicleMotion('stationary');}")
 # Geometry must work under unchanged production CSP; no inline-style exception.
 page.evaluate("testHost.emit({connected:true,route:'projection',front:'projection',projectionReady:true,picture:{width:800,height:480,insets:{top:24,bottom:0,left:80,right:0}},phones:[]})")
 expect(page.locator('.native-picture')).to_be_visible();box=page.locator('.native-picture').bounding_box();assert box['width']==800 and box['height']==480,box
 assert page.locator('.native-picture-mask.top').bounding_box()['height']==24
 nav('apps');expect(page.locator('h1')).to_have_text('Apps')
 page.evaluate("testHost.emit({front:'camera',route:'camera'})");expect(page.get_by_role('heading',name='Camera unavailable')).to_be_visible();expect(page.locator('.native-picture')).to_have_count(0)
 page.evaluate("testHost.emit({front:'cluster',route:'cluster'})");expect(page.get_by_role('heading',name='Display in use')).to_be_visible()
 page.evaluate("testHost.emit({connected:false,front:'livi',route:'home'})");expect(page.get_by_role('heading',name='Home')).to_be_visible()
 assert not errors,errors;assert not csp,csp
 print(json.dumps({'result':'passed','checks':['weather search/select','clock outcomes','update confirmation/cancel','wallpaper/accent persistence + reset','app reordering persistence','debug toggle','known-motion locks','CSP projection geometry + mask','projection return to Apps','camera/cluster/disconnect honesty'],'page_errors':errors,'csp_errors':csp}))
 b.close()
