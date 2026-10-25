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
 assert.match(text.textContent,/UI FPS/);assert.match(text.textContent,/CPU 37\.5%/);assert.match(text.textContent,/GPU use unsupported/);
 assert.match(text.textContent,/RAM 1\.0 GiB\/4\.0 GiB/);assert.match(text.textContent,/↓ 2\.0 KiB\/s ↑ 1\.0 KiB\/s/);assert.match(text.textContent,/Google TCP latency 31 ms/);
 const before=reads;stop();assert.equal(cancelled,1);assert.equal(cleared,1);assert.equal(stopCalls,1);
 interval();await Promise.resolve();assert.equal(reads,before);
});
test('route replacement repaints the same live readings without restarting the sampler',async()=>{
 let interval,now=0,reads=0;let node={textContent:''};
 const stop=startDebugOverlay({getMetrics:async()=>{reads++;return {cpuPercent:42,ramUsedBytes:1073741824,ramTotalBytes:4294967296,pingMs:35,cpuStatus:'current',ramStatus:'current',pingStatus:'current',gpuStatus:'unsupported'};}},()=>node,{
  now:()=>now,requestFrame:()=>1,cancelFrame:()=>{},setInterval:fn=>{interval=fn;return 1;},clearInterval:()=>{}
 });
 now=2000;await interval();const before=reads;
 node={textContent:'UI FPS unavailable · RAM unavailable'};
 stop.repaint();
 assert.equal(reads,before);assert.match(node.textContent,/CPU 42\.0%/);assert.match(node.textContent,/RAM 1\.0 GiB\/4\.0 GiB/);
 assert.match(node.textContent,/Google TCP latency 35 ms/);
 stop();
});
test('stale host readings are explicitly labelled while pending and unsupported remain distinct',async()=>{
 let interval,now=0;const node={textContent:''};
 const samples=[
  {cpuPercent:null,cpuStatus:'pending',gpuStatus:'unsupported',ramStatus:'pending',pingStatus:'pending'},
  {cpuPercent:38,cpuStatus:'stale',ramUsedBytes:1073741824,ramTotalBytes:4294967296,ramStatus:'stale',pingMs:34,pingStatus:'stale'}
 ];
 const stop=startDebugOverlay({getMetrics:async()=>samples.shift()},()=>node,{now:()=>now,setInterval:fn=>{interval=fn;return 1;},clearInterval:()=>{}});
 now=2000;await interval();assert.match(node.textContent,/CPU measuring/);assert.match(node.textContent,/RAM measuring/);assert.match(node.textContent,/GPU use unsupported/);
 now=4000;await interval();assert.match(node.textContent,/CPU 38\.0% \(stale\)/);assert.match(node.textContent,/RAM 1\.0 GiB\/4\.0 GiB \(stale\)/);assert.match(node.textContent,/Google TCP latency 34 ms \(stale\)/);
 stop();
});
