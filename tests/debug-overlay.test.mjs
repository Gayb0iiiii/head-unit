import test from 'node:test';
import assert from 'node:assert/strict';
import {startDebugOverlay} from '../src/debug-overlay.mjs';

test('overlay samples only while enabled, labels unavailable GPU and stops all work',async()=>{
 let frame,interval,now=0,reads=0,cancelled=0,cleared=0;
 const text={textContent:''};
 const stop=startDebugOverlay({getMetrics:async()=>{reads++;return {cpuPercent:37.5,gpuPercent:null};}},()=>text,{
  now:()=>now,requestFrame:fn=>{frame=fn;return 1;},cancelFrame:()=>cancelled++,setInterval:fn=>{interval=fn;return 2;},clearInterval:()=>cleared++
 });
 assert.equal(reads,0);
 now=1000;frame();now=2000;frame();interval();await Promise.resolve();await Promise.resolve();
 assert.match(text.textContent,/UI FPS/);assert.match(text.textContent,/CPU 37\.5%/);assert.match(text.textContent,/GPU unavailable/);
 const before=reads;stop();assert.equal(cancelled,1);assert.equal(cleared,1);
 interval();await Promise.resolve();assert.equal(reads,before);
});
