"""Injected Bluetooth UI contract; no system bus, actual pairing or hardware audio."""
import os,json,tempfile,wave
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
bridge='''
const id='11111111-1111-1111-1111-111111111111',token='22222222-2222-2222-2222-222222222222';let listener;
const mediaToken='44444444-4444-4444-4444-444444444444',forgetToken='55555555-5555-5555-5555-555555555555',connectToken='66666666-6666-6666-6666-666666666666';
const bt={remembered:{available:true,enabled:false,deviceId:id,paused:true},availability:'available',parked:true,sinkReady:true,musicReady:true,devices:[{id,name:'Fixture phone <not HTML>',paired:false,musicSupported:true}]};
window.testBluetooth={calls:[],emit(patch){Object.assign(bt,patch);listener?.(structuredClone(bt));}};
window.headunit={getView:async()=>({connected:false,front:'livi',route:'home'}),onView:()=>()=>{},navigate:async()=>({accepted:true}),
getBluetooth:async()=>structuredClone(bt),onBluetooth:fn=>{listener=fn;return()=>{};},
discoverBluetooth:async()=>{testBluetooth.calls.push(['discover']);testBluetooth.emit({discovering:true});},stopBluetoothDiscovery:async()=>testBluetooth.emit({discovering:false}),
pairBluetooth:async selected=>{testBluetooth.calls.push(['pair',selected]);testBluetooth.emit({busy:'pairing',confirmation:{token,deviceId:id,passkey:'000042'}});},
confirmBluetooth:async(t,yes)=>{testBluetooth.calls.push(['confirm',t,yes]);if(yes){bt.devices[0].paired=true;bt.devices[0].canForget=true;}testBluetooth.emit({busy:null,confirmation:null});},
cancelBluetoothPairing:async()=>testBluetooth.emit({busy:null,confirmation:null}),
connectBluetoothMusic:async selected=>{testBluetooth.calls.push(['connect',selected]);bt.devices[0].connected=true;bt.devices[0].canForget=false;testBluetooth.emit({pauseRequest:connectToken});},
acknowledgeBluetoothPause:async(t,paused)=>{testBluetooth.calls.push(['pause',t,paused]);testBluetooth.emit({pauseRequest:null,audioOwned:paused,...(t===connectToken&&paused?{media:{token:mediaToken,deviceId:id,title:'Original <fixture> track',artist:'Test artist',status:'paused',positionMs:2500,durationMs:10000,controls:['play','next','previous']}}:{})});},
releaseBluetoothMusic:async()=>{bt.devices[0].connected=false;bt.devices[0].canForget=true;testBluetooth.emit({audioOwned:false,media:null});},
controlBluetoothMedia:async(t,control)=>{testBluetooth.calls.push(['media',t,control]);testBluetooth.emit({media:{...bt.media,status:control==='play'?'playing':'paused',controls:control==='play'?['pause','next','previous']:['play','next','previous']}});},
rememberBluetooth:async(selected,enabled)=>{testBluetooth.calls.push(['remember',selected,enabled]);testBluetooth.emit({remembered:{available:true,deviceId:selected,enabled,paused:true}});},
requestBluetoothForget:async selected=>{testBluetooth.calls.push(['forget-request',selected]);testBluetooth.emit({forget:{token:forgetToken,deviceId:selected}});},
confirmBluetoothForget:async(t,yes)=>{testBluetooth.calls.push(['forget-confirm',t,yes]);testBluetooth.emit({forget:null,...(yes?{devices:[]}:{})});}};
'''
with tempfile.TemporaryDirectory() as folder,sync_playwright() as p:
 path=Path(folder)/'Offline fixture.wav'
 with wave.open(str(path),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(8000);w.writeframes(b'\0'*8000*4*20)
 browser=p.chromium.launch(executable_path=os.environ.get('HEADUNIT_TEST_CHROMIUM','/usr/bin/chromium'),headless=True)
 page=browser.new_page(viewport={'width':800,'height':480});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script(bridge)
 page.goto(os.environ.get('HEADUNIT_TEST_BASE_URL','http://127.0.0.1:8095')+'/production.html')
 def nav(route):page.locator(f'aside [data-action={route}]').click()
 nav('audio');page.locator('[data-local-files]').first.set_input_files(str(path));page.get_by_role('button',name='Play Offline fixture',exact=True).click();expect(page.get_by_role('button',name='Pause local audio')).to_be_visible()
 page.evaluate("testBluetooth.emit({pauseRequest:'33333333-3333-3333-3333-333333333333',pauseAutomatic:true})")
 expect(page.get_by_role('button',name='Pause local audio')).to_be_visible()
 assert ['pause','33333333-3333-3333-3333-333333333333',False] in page.evaluate('testBluetooth.calls')
 page.evaluate('testBluetooth.emit({pauseAutomatic:false})')
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
 page.get_by_role('button',name='Connect music',exact=True).click();expect(page.get_by_role('heading',name='Original <fixture> track',exact=True)).to_be_visible()
 page.get_by_role('button',name='Play phone audio',exact=True).click();expect(page.get_by_role('button',name='Pause phone audio',exact=True)).to_be_enabled();page.get_by_role('button',name='Pause phone audio',exact=True).click()
 page.get_by_role('button',name='Disconnect music',exact=True).click();page.get_by_role('button',name='Remember for startup reconnect',exact=True).click();expect(page.get_by_text('Startup reconnect is held',exact=False)).to_be_visible();page.get_by_role('button',name='Disable startup reconnect',exact=True).click()
 page.evaluate('testBluetooth.emit({parked:false})');expect(page.get_by_role('button',name='Connect music',exact=True)).to_be_disabled();expect(page.get_by_role('button',name='Find devices',exact=True)).to_be_disabled()
 page.evaluate('testBluetooth.emit({parked:true,sinkReady:false})');expect(page.get_by_role('button',name='Connect music',exact=True)).to_be_disabled()
 for width,height in [(800,480),(480,800)]:
  page.set_viewport_size({'width':width,'height':height});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=f'/tmp/bluetooth-fixture-{width}x{height}.png')
 page.get_by_role('button',name='Forget…',exact=True).click();expect(page.get_by_role('group',name='Forget Bluetooth phone')).to_be_visible();assert not any(c[0]=='forget-confirm' for c in page.evaluate('testBluetooth.calls'))
 page.get_by_role('button',name='Keep phone',exact=True).click();page.get_by_role('button',name='Forget…',exact=True).click();page.get_by_role('button',name='Forget phone',exact=True).click();expect(page.get_by_text('No devices observed.',exact=True)).to_be_visible()
 assert not errors,errors
 print(json.dumps({'passed':True,'checks':['literal device names','discovery controls','explicit confirm and reject','unknown sink and motion gates','actual HTMLAudio pause acknowledgement','automatic reconnect does not interrupt local playback','AVRCP control wiring and literal metadata','explicit reconnect opt-in','two-step forget confirmation','two viewport overflow checks'],'hardware':False}));browser.close()
