"""Injected Bluetooth UI contract; no system bus, actual pairing or hardware audio."""
import os,json,tempfile,wave
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
bridge='''
const id='11111111-1111-1111-1111-111111111111',token='22222222-2222-2222-2222-222222222222';let listener;
const bt={availability:'available',parked:true,sinkReady:true,devices:[{id,name:'Fixture phone <not HTML>',paired:false,musicSupported:true}]};
window.testBluetooth={calls:[],emit(patch){Object.assign(bt,patch);listener?.(structuredClone(bt));}};
window.headunit={getView:async()=>({connected:false,front:'livi',route:'home'}),onView:()=>()=>{},navigate:async()=>({accepted:true}),
getBluetooth:async()=>structuredClone(bt),onBluetooth:fn=>{listener=fn;return()=>{};},
discoverBluetooth:async()=>{testBluetooth.calls.push(['discover']);testBluetooth.emit({discovering:true});},stopBluetoothDiscovery:async()=>testBluetooth.emit({discovering:false}),
pairBluetooth:async selected=>{testBluetooth.calls.push(['pair',selected]);testBluetooth.emit({busy:'pairing',confirmation:{token,deviceId:id,passkey:'000042'}});},
confirmBluetooth:async(t,yes)=>{testBluetooth.calls.push(['confirm',t,yes]);if(yes)bt.devices[0].paired=true;testBluetooth.emit({busy:null,confirmation:null});},
cancelBluetoothPairing:async()=>testBluetooth.emit({busy:null,confirmation:null}),
connectBluetoothMusic:async selected=>{testBluetooth.calls.push(['connect',selected]);testBluetooth.emit({pauseRequest:token});},
acknowledgeBluetoothPause:async(t,paused)=>{testBluetooth.calls.push(['pause',t,paused]);testBluetooth.emit({pauseRequest:null,audioOwned:paused});},
releaseBluetoothMusic:async()=>testBluetooth.emit({audioOwned:false})};
'''
with tempfile.TemporaryDirectory() as folder,sync_playwright() as p:
 path=Path(folder)/'Offline fixture.wav'
 with wave.open(str(path),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(8000);w.writeframes(b'\0'*8000*4*20)
 browser=p.chromium.launch(executable_path=os.environ.get('HEADUNIT_TEST_CHROMIUM','/usr/bin/chromium'),headless=True)
 page=browser.new_page(viewport={'width':800,'height':480});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script(bridge)
 page.goto(os.environ.get('HEADUNIT_TEST_BASE_URL','http://127.0.0.1:8095')+'/production.html')
 def nav(route):page.locator(f'aside [data-action={route}]').click()
 nav('audio');page.locator('[data-local-files]').first.set_input_files(str(path));page.get_by_role('button',name='Play Offline fixture',exact=True).click();expect(page.get_by_role('button',name='Pause local audio')).to_be_visible()
 # A host focus request must pause actual local HTMLAudio before acknowledging.
 page.evaluate("testBluetooth.emit({pauseRequest:'22222222-2222-2222-2222-222222222222'})")
 expect(page.get_by_role('button',name='Play local audio',exact=True)).to_be_visible()
 assert ['pause','22222222-2222-2222-2222-222222222222',True] in page.evaluate('testBluetooth.calls')
 page.evaluate('testBluetooth.emit({audioOwned:false})');nav('bluetooth')
 expect(page.get_by_text('Fixture phone <not HTML>',exact=True)).to_be_visible();page.get_by_role('button',name='Find devices',exact=True).click();page.get_by_role('button',name='Stop discovery',exact=True).click()
 page.get_by_role('button',name='Pair',exact=True).click();expect(page.get_by_text('000042',exact=True)).to_be_visible()
 assert not any(c[0]=='confirm' for c in page.evaluate('testBluetooth.calls'))
 page.get_by_role('button',name='Reject',exact=True).click();page.get_by_role('button',name='Pair',exact=True).click();page.get_by_role('button',name='Confirm code',exact=True).click()
 expect(page.get_by_role('button',name='Connect music',exact=True)).to_be_enabled()
 page.evaluate('testBluetooth.emit({parked:false})');expect(page.get_by_role('button',name='Connect music',exact=True)).to_be_disabled();expect(page.get_by_role('button',name='Find devices',exact=True)).to_be_disabled()
 page.evaluate('testBluetooth.emit({parked:true,sinkReady:false})');expect(page.get_by_role('button',name='Connect music',exact=True)).to_be_disabled()
 for width,height in [(800,480),(480,800)]:
  page.set_viewport_size({'width':width,'height':height});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=f'/tmp/bluetooth-fixture-{width}x{height}.png')
 assert not errors,errors
 print(json.dumps({'passed':True,'checks':['literal device names','discovery controls','explicit confirm and reject','unknown sink and motion gates','actual HTMLAudio pause acknowledgement','two viewport overflow checks'],'hardware':False}));browser.close()
