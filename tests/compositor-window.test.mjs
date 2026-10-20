import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {filterWindowConfig} from '../electron/window-config.mjs';
import {attachCompositorWindow} from '../electron/compositor-window.mjs';
function fixture(t,{kiosk=false,applyDelay=0,clamp=false,fullscreenDelay=0,configStream=false}={}) {
 t.mock.timers.enable({apis:['setTimeout']});
 let publish,unsubscribed=0;
 const win=new EventEmitter(),calls=[];let size=[913,517],destroyed=false,full=false,display={width:1600,height:900};
 Object.assign(win,{webContents:{setZoomFactor:value=>calls.push(['zoom',value])},isDestroyed:()=>destroyed,isFullScreen:()=>full,getContentSize:()=>size,getBounds:()=>({x:2,y:3,width:size[0],height:size[1]}),setContentSize:(w,h)=>{calls.push(['size',w,h]);const apply=()=>{size=[w,clamp?480:h];win.emit('resize');};if(applyDelay)setTimeout(apply,applyDelay);else apply();},setFullScreen:value=>{calls.push(['fullscreen',value]);const apply=()=>{full=value;win.emit(value?'enter-full-screen':'leave-full-screen');};if(fullscreenDelay)setTimeout(apply,fullscreenDelay);else apply();}});
 const screen={getDisplayMatching:()=>({size:display})};
 const subscribeConfig=configStream?fn=>{publish=fn;fn(filterWindowConfig(null));return()=>unsubscribed++;}:undefined;
 const dispose=attachCompositorWindow({window:win,screen,kiosk,subscribeConfig});
 return {win,calls,dispose,config:cfg=>publish?.(filterWindowConfig(cfg===null?null:{ready:true,status:'ready',state:{config:cfg}})),unsubscribed:()=>unsubscribed,tick:ms=>t.mock.timers.tick(ms),resize:(w,h)=>{size=[w,clamp?480:h];win.emit('resize');},destroy:()=>{destroyed=true;win.emit('closed');},display:value=>{display=value;},size:()=>size};
}
test('explicit kiosk waits for compositor settling and reads current display size once',t=>{
 const f=fixture(t,{kiosk:true});f.win.emit('ready-to-show');f.win.emit('ready-to-show');f.tick(399);assert.deepEqual(f.calls,[]);
 f.display({width:1920,height:1080});f.tick(1);assert.deepEqual(f.calls,[['size',1920,1080],['fullscreen',true]]);f.tick(1000);assert.equal(f.calls.length,2);f.dispose();
});
test('ordinary compositor startup does not impose size or fullscreen',t=>{
 const f=fixture(t);f.win.emit('ready-to-show');f.tick(1000);assert.deepEqual(f.calls,[]);f.dispose();
});
test('resize reflow debounces repeated events and restores the latest content size',t=>{
 const f=fixture(t);f.resize(700,400);f.tick(150);f.resize(801,601);f.tick(199);assert.deepEqual(f.calls,[]);f.tick(1);assert.deepEqual(f.size(),[801,602]);f.tick(60);assert.deepEqual(f.size(),[801,601]);f.tick(1000);assert.equal(f.calls.length,2);f.dispose();
});
test('external resize during reflow cannot be overwritten with old bounds',t=>{
 const f=fixture(t);f.resize(801,601);f.tick(200);f.resize(900,650);f.tick(60);assert.deepEqual(f.size(),[900,650]);f.tick(1000);assert.deepEqual(f.size(),[900,650]);assert.equal(f.calls.length,1);f.dispose();
});
for(const phase of ['debounce','restore','fullscreen'])test(`dispose during ${phase} removes listeners and cancels delayed writes`,t=>{
 const f=fixture(t,{kiosk:true});f.win.emit('ready-to-show');f.resize(800,480);if(phase==='restore')f.tick(200);if(phase==='fullscreen')f.tick(100);
 f.dispose();f.dispose();const before=f.calls.length;f.tick(2000);f.win.emit('resize');f.win.emit('ready-to-show');f.tick(2000);assert.equal(f.calls.length,before);for(const event of ['resize','closed','ready-to-show','enter-full-screen','leave-full-screen'])assert.equal(f.win.listenerCount(event),0);
});
test('fullscreen interrupts a pending reflow without reverting native size',t=>{
 const f=fixture(t);f.resize(800,480);f.tick(200);f.win.setFullScreen(true);f.resize(1920,1080);f.tick(1000);assert.deepEqual(f.size(),[1920,1080]);assert.equal(f.calls.length,2);f.dispose();
});
test('closed window cancels delayed fullscreen and resize work',t=>{
 const f=fixture(t,{kiosk:true});f.win.emit('ready-to-show');f.resize(800,480);f.destroy();f.tick(1000);assert.deepEqual(f.calls,[]);
});

test('delayed host application starts restoration only after the nudge is observed',t=>{
 const f=fixture(t,{applyDelay:100});f.resize(800,480);f.tick(200);assert.deepEqual(f.size(),[800,480]);
 f.tick(100);assert.deepEqual(f.size(),[800,481]);f.tick(60);assert.deepEqual(f.calls,[['size',800,481],['size',800,480]]);
 f.tick(100);assert.deepEqual(f.size(),[800,480]);f.tick(1000);assert.equal(f.calls.length,2);f.dispose();
});

test('host-rejected geometry does not create a programmatic resize retry loop',t=>{
 const f=fixture(t,{clamp:true});f.resize(800,480);f.tick(200);
 for(let i=0;i<10;i++)f.tick(200);
 assert.equal(f.calls.length,1);assert.deepEqual(f.size(),[800,480]);f.dispose();
});

test('synchronized startup config controls kiosk and zoom after readiness without configured geometry writes',t=>{
 const f=fixture(t,{configStream:true});f.config({kiosk:{main:true},uiZoomPercent:120,mainScreenWidth:800,mainScreenHeight:480});assert.deepEqual(f.calls,[]);
 f.win.emit('ready-to-show');assert.deepEqual(f.calls,[['zoom',1.2]]);f.tick(400);assert.deepEqual(f.calls.slice(-2),[['size',1600,900],['fullscreen',true]]);
 f.config({kiosk:{main:false},uiZoomPercent:150});assert.deepEqual(f.calls.slice(-2),[['zoom',1.5],['fullscreen',false]]);f.dispose();
});
test('invalidated config cancels pending config-driven fullscreen and stale zoom',t=>{
 const f=fixture(t,{configStream:true});f.config({kiosk:{main:true},uiZoomPercent:120});f.win.emit('ready-to-show');f.tick(200);f.config(null);f.tick(200);
 assert.ok(!f.calls.some(call=>call[0]==='fullscreen'));const before=f.calls.length;f.resize(800,250);assert.equal(f.calls.length,before);f.dispose();
});
test('config changes during startup settle delay use only latest valid values',t=>{
 const f=fixture(t,{configStream:true});f.win.emit('ready-to-show');f.config({kiosk:{main:true},uiZoomPercent:100});f.tick(200);f.config({kiosk:{main:false},uiZoomPercent:130});f.tick(200);
 assert.ok(!f.calls.some(call=>call[0]==='fullscreen'));f.config({kiosk:{main:true},uiZoomPercent:130});assert.deepEqual(f.calls.at(-1),['fullscreen',true]);f.dispose();
});
test('zoom follows actual content height and ignores invalid values',t=>{
 const f=fixture(t,{configStream:true});f.win.emit('ready-to-show');f.config({uiZoomPercent:100});f.resize(800,146);assert.deepEqual(f.calls.at(-1),['zoom',0.5]);
 f.config({uiZoomPercent:'150',kiosk:{main:'true'}});const before=f.calls.length;f.resize(800,100);assert.equal(f.calls.length,before);f.dispose();
});
test('disposed config consumer ignores late updates and unsubscribes exactly once',t=>{
 const f=fixture(t,{configStream:true});f.win.emit('ready-to-show');f.config({kiosk:{main:true},uiZoomPercent:100});f.dispose();f.dispose();const before=f.calls.length;
 f.config({kiosk:{main:true},uiZoomPercent:200});f.tick(1000);assert.equal(f.calls.length,before);assert.equal(f.unsubscribed(),1);
});

test('a config reversal during asynchronous fullscreen is applied after the pending transition',t=>{
 const f=fixture(t,{configStream:true,fullscreenDelay:100});f.win.emit('ready-to-show');f.tick(400);
 f.config({kiosk:{main:true}});f.config({kiosk:{main:false}});f.tick(100);f.tick(100);
 assert.equal(f.win.isFullScreen(),false);assert.deepEqual(f.calls.filter(call=>call[0]==='fullscreen'),[['fullscreen',true],['fullscreen',false]]);f.dispose();
});
test('invalidated config cannot trigger a queued fullscreen reversal after asynchronous acknowledgment',t=>{
 const f=fixture(t,{configStream:true,fullscreenDelay:100});f.win.emit('ready-to-show');f.tick(400);
 f.config({kiosk:{main:true}});f.config({kiosk:{main:false}});f.config(null);f.tick(100);f.tick(100);
 assert.deepEqual(f.calls.filter(call=>call[0]==='fullscreen'),[['fullscreen',true]]);f.dispose();
});
test('host-rejected fullscreen acknowledgment does not cause a retry loop',t=>{
 const f=fixture(t,{configStream:true});f.win.emit('ready-to-show');f.tick(400);
 f.win.setFullScreen=value=>{f.calls.push(['fullscreen',value]);f.win.emit('enter-full-screen');};
 f.config({kiosk:{main:true}});f.tick(1000);assert.deepEqual(f.calls.filter(call=>call[0]==='fullscreen'),[['fullscreen',true]]);f.dispose();
});
test('shutdown prevents a queued config reversal after a late fullscreen acknowledgment',t=>{
 const f=fixture(t,{configStream:true,fullscreenDelay:100});f.win.emit('ready-to-show');f.tick(400);
 f.config({kiosk:{main:true}});f.config({kiosk:{main:false}});f.dispose();f.tick(1000);
 assert.deepEqual(f.calls.filter(call=>call[0]==='fullscreen'),[['fullscreen',true]]);
});
test('unchanged config cannot force a manually exited fullscreen window back',t=>{
 const f=fixture(t,{configStream:true});f.win.emit('ready-to-show');f.tick(400);f.config({kiosk:{main:true}});f.win.setFullScreen(false);
 f.config({kiosk:{main:true},uiZoomPercent:120});assert.equal(f.win.isFullScreen(),false);f.dispose();
});
