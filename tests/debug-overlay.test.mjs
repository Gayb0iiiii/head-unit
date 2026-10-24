import test from 'node:test';
import assert from 'node:assert/strict';
import {startDebugOverlay} from '../src/debug-overlay.mjs';

test('overlay samples only while enabled, labels unavailable GPU and stops all work',async()=>{
 let frame,interval,now=0,reads=0,cancelled=0,cleared=0,stopCalls=0;
 const text={textContent:''};
 const stop=startDebugOverlay({getMetrics:async()=>{reads++;return {cpuPercent:37.5,gpuPercent:null,ramUsedBytes:1073741824,ramTotalBytes:4294967296,networkDownBytesPerSec:2048,networkUpBytesPerSec:1024,pingMs:31};},stopMetrics:async()=>{stopCalls++;}},()=>text,{
  now:()=>now,requestFrame:fn=>{frame=fn;return 1;},cancelFrame:()=>cancelled++,setInterval:fn=>{interval=fn;return 2;},clearInterval:()=>cleared++
 });
 assert.equal(reads,0);
 now=1000;frame();now=2000;frame();interval();await Promise.resolve();await Promise.resolve();
 assert.match(text.textContent,/UI FPS/);assert.match(text.textContent,/CPU 37\.5%/);assert.match(text.textContent,/GPU use unavailable/);
 assert.match(text.textContent,/RAM 1\.0 GiB\/4\.0 GiB/);assert.match(text.textContent,/↓ 2\.0 KiB\/s ↑ 1\.0 KiB\/s/);assert.match(text.textContent,/Ping 31 ms/);
 const before=reads;stop();assert.equal(cancelled,1);assert.equal(cleared,1);assert.equal(stopCalls,1);
 interval();await Promise.resolve();assert.equal(reads,before);
});
