import test from 'node:test';
import assert from 'node:assert/strict';
import {startClock} from '../src/clock.mjs';
test('clock updates at minute boundaries without a model render and stops cleanly',()=>{
 let now=61500,nextId=0;const pending=new Map(),seen=[];
 const stop=startClock(date=>seen.push(date.getTime()),{now:()=>now,setTimeout:(fn,delay)=>{pending.set(++nextId,{fn,delay});return nextId;},clearTimeout:id=>pending.delete(id)});
 assert.deepEqual(seen,[61500]);assert.equal([...pending.values()][0].delay,58500);
 const [id,timer]=[...pending][0];pending.delete(id);now=120000;timer.fn();
 assert.deepEqual(seen,[61500,120000]);assert.equal([...pending.values()][0].delay,60000);
 stop();assert.equal(pending.size,0);
});
