import test from 'node:test';
import assert from 'node:assert/strict';
import {mapPicturePoint,createProjectionInput} from '../src/projection-input.mjs';

const picture={width:800,height:480,insets:{top:24,bottom:0,left:80,right:0}};
const rect={left:100,top:50,width:800,height:480};
const tick=()=>new Promise(setImmediate);
function fixture(){
 const calls=[],events=new Map(),captured=new Set();let ready=true,box={...rect};
 const element={getBoundingClientRect:()=>box,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:(name)=>events.delete(name),setPointerCapture:id=>captured.add(id),releasePointerCapture:id=>captured.delete(id)};
 const bridge={touch:async points=>{calls.push(points)},cancelTouch:async()=>{calls.push('cancel')}};
 const input=createProjectionInput({element,bridge,picture,ready:()=>ready,requestFrame:fn=>setImmediate(fn),cancelFrame:clearImmediate});
 const fire=(name,id,x=200,y=100,extra={})=>events.get(name)?.({pointerId:id,pointerType:'touch',clientX:x,clientY:y,preventDefault(){},...extra});
 return {calls,fire,input,captured,setReady:v=>ready=v,setBox:v=>box=v};
}
test('measured contained picture maps insets and rejects bars and malformed bounds',()=>{
 assert.deepEqual(mapPicturePoint(180,74,rect,picture),{x:.1,y:.05});
 assert.equal(mapPicturePoint(99,100,rect,picture),null);
 assert.equal(mapPicturePoint(100,50,rect,picture),null);
 assert.equal(mapPicturePoint(901,100,rect,picture),null);
 assert.equal(mapPicturePoint(200,100,{...rect,width:0},picture),null);
});
test('down, move, up and cancel use stable ids and a bounded serialized path',async()=>{
 const f=fixture();f.fire('pointerdown',40,180,74);f.fire('pointerdown',41,300,150);await tick();
 assert.deepEqual(f.calls[0],[{id:0,x:.1,y:.05,phase:'down'}]);
 assert.deepEqual(f.calls[1],[{id:1,x:.25,y:100/480,phase:'down'}]);
 f.fire('pointermove',40,260,130);await tick();
 assert.deepEqual(f.calls.at(-1),[{id:0,x:.2,y:80/480,phase:'move'}]);
 f.fire('pointerup',40,260,130);f.fire('pointercancel',41,300,150);await tick();
 assert.deepEqual(f.calls.at(-2)[0].phase,'up');assert.deepEqual(f.calls.at(-1)[0].phase,'cancel');
 assert.equal(f.captured.size,0);f.input.dispose();
});
test('unverified geometry blocks touch, and interruption cancels tracked contacts',async()=>{
 const f=fixture();f.setReady(false);f.fire('pointerdown',1);await tick();assert.deepEqual(f.calls,[]);
 f.setReady(true);f.fire('pointerdown',1);await tick();f.input.interrupt();await tick();assert.equal(f.calls.at(-1),'cancel');
 f.fire('pointermove',1);f.fire('pointerup',1);await tick();assert.equal(f.calls.at(-1),'cancel');f.input.dispose();
});
test('out-of-bounds release uses last valid coordinate, resize invalidates interaction',async()=>{
 const f=fixture();f.fire('pointerdown',1,180,74);await tick();f.fire('pointerup',1,5,5);await tick();assert.deepEqual(f.calls.at(-1),[{id:0,x:.1,y:.05,phase:'up'}]);
 f.fire('pointerdown',2,180,74);await tick();f.setBox({...rect,width:600});f.fire('pointermove',2,200,100);await tick();assert.equal(f.calls.at(-1),'cancel');f.input.dispose();
});
test('capture loss cancels and the eleventh contact cannot enter the native ledger',async()=>{
 const f=fixture();for(let id=0;id<11;id++)f.fire('pointerdown',id,180+id,74);
 await tick();assert.equal(f.calls.filter(Array.isArray).length,10);
 f.fire('lostpointercapture',0);await tick();assert.equal(f.calls.at(-1),'cancel');f.input.dispose();
});
test('interruption waits for an in-flight input and discards pending frames',async()=>{
 let finish;const calls=[],events=new Map();
 const element={getBoundingClientRect:()=>rect,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name),setPointerCapture(){},releasePointerCapture(){}};
 const bridge={touch:points=>{calls.push(points);return new Promise(resolve=>{finish=resolve})},cancelTouch:()=>{calls.push('cancel')}};
 const input=createProjectionInput({element,bridge,picture,ready:()=>true});
 const fire=(name,id)=>events.get(name)({pointerId:id,pointerType:'touch',clientX:180,clientY:74,preventDefault(){}});
 fire('pointerdown',1);fire('pointerdown',2);input.interrupt();await tick();
 assert.equal(calls.length,1);finish();await tick();
 assert.deepEqual(calls.map(item=>Array.isArray(item)?item[0].phase:item),['down','cancel']);input.dispose();
});
