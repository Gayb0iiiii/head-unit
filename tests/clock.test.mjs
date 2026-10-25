import test from 'node:test';
import assert from 'node:assert/strict';
import {startClock,formatClock} from '../src/clock.mjs';
test('clock formatting follows the confirmed host timezone rather than a saved offset',()=>{
 const date=new Date('2026-10-25T00:30:00Z');
 assert.match(formatClock(date,'Australia/Perth').time,/08:30/);
 assert.match(formatClock(date,'Etc/UTC').time,/00:30/);
 assert.equal(formatClock(date,'Australia/Perth').timezone,'Australia/Perth');
});
test('clock updates at minute boundaries without a model render and stops cleanly',()=>{
 let now=61500,nextId=0;const pending=new Map(),seen=[];
 const stop=startClock(date=>seen.push(date.getTime()),{now:()=>now,setTimeout:(fn,delay)=>{pending.set(++nextId,{fn,delay});return nextId;},clearTimeout:id=>pending.delete(id)});
 assert.deepEqual(seen,[61500]);assert.equal([...pending.values()][0].delay,58500);
 const [id,timer]=[...pending][0];pending.delete(id);now=120000;timer.fn();
 assert.deepEqual(seen,[61500,120000]);assert.equal([...pending.values()][0].delay,60000);
 stop();assert.equal(pending.size,0);
});
test('default clock calls browser timers with the global receiver',()=>{
 const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
 let timer;
 try{
   globalThis.setTimeout=function(fn,delay){assert.equal(this,globalThis);timer={fn,delay};return 7;};
   globalThis.clearTimeout=function(id){assert.equal(this,globalThis);assert.equal(id,7);};
   const stop=startClock(()=>{});
   assert.ok(timer.delay>0&&timer.delay<=60000);
   stop();
 }finally{globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}
});
