import test from 'node:test';
import assert from 'node:assert/strict';
import {createSystemMetrics} from '../electron/system-metrics.mjs';

test('CPU reports aggregate non-idle share between fixed /proc/stat samples',async()=>{
 const values=['cpu  100 0 100 800 0 0 0 0 0 0\n','cpu  150 0 150 900 0 0 0 0 0 0\n'];
 const metrics=createSystemMetrics({read:async path=>{assert.equal(path,'/proc/stat');return values.shift();},now:(()=>{let t=0;return()=>t+=2000;})()});
 assert.deepEqual(await metrics.sample(),{cpuPercent:null,gpuPercent:null});
 assert.deepEqual(await metrics.sample(),{cpuPercent:50,gpuPercent:null});
});
test('unsupported or malformed counters stay unavailable and rapid calls reuse the last sample',async()=>{
 let reads=0,time=0;
 const metrics=createSystemMetrics({read:async()=>{reads++;return reads===1?'cpu 10 0 0 90 0\n':'invalid';},now:()=>time});
 assert.deepEqual(await metrics.sample(),{cpuPercent:null,gpuPercent:null});
 time=100;await metrics.sample();assert.equal(reads,1);
 time=2000;assert.deepEqual(await metrics.sample(),{cpuPercent:null,gpuPercent:null});assert.equal(reads,2);
});
