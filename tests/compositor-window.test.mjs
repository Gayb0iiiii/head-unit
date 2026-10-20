import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {attachCompositorWindow} from '../electron/compositor-window.mjs';
function fixture(t,{kiosk=false,applyDelay=0,clamp=false}={}) {
 t.mock.timers.enable({apis:['setTimeout']});
 const win=new EventEmitter(),calls=[];let size=[913,517],destroyed=false,full=false,display={width:1600,height:900};
 Object.assign(win,{isDestroyed:()=>destroyed,isFullScreen:()=>full,getContentSize:()=>size,getBounds:()=>({x:2,y:3,width:size[0],height:size[1]}),setContentSize:(w,h)=>{calls.push(['size',w,h]);const apply=()=>{size=[w,clamp?480:h];win.emit('resize');};if(applyDelay)setTimeout(apply,applyDelay);else apply();},setFullScreen:value=>{full=value;calls.push(['fullscreen',value]);win.emit(value?'enter-full-screen':'leave-full-screen');}});
 const screen={getDisplayMatching:()=>({size:display})};
 const dispose=attachCompositorWindow({window:win,screen,kiosk});
 return {win,calls,dispose,tick:ms=>t.mock.timers.tick(ms),resize:(w,h)=>{size=[w,clamp?480:h];win.emit('resize');},destroy:()=>{destroyed=true;win.emit('closed');},display:value=>{display=value;},size:()=>size};
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
