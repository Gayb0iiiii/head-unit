import test from 'node:test';
import assert from 'node:assert/strict';
import {createSystemMetrics} from '../electron/system-metrics.mjs';

test('CPU reports aggregate non-idle share between fixed /proc/stat samples',async()=>{
 const values=['cpu  100 0 100 800 0 0 0 0 0 0\n','cpu  150 0 150 900 0 0 0 0 0 0\n'];
 const metrics=createSystemMetrics({read:async path=>path==='/proc/stat'?values.shift():null,now:(()=>{let t=0;return()=>t+=2000;})(),ping:async()=>null});
 assert.equal((await metrics.sample()).cpuPercent,null);
 assert.equal((await metrics.sample()).cpuPercent,50);
});
test('unsupported or malformed counters stay unavailable and rapid calls reuse the last sample',async()=>{
 let reads=0,time=0;
 const metrics=createSystemMetrics({read:async path=>path==='/proc/stat'?(reads++===0?'cpu 10 0 0 90 0\n':'invalid'):null,now:()=>time,ping:async()=>null});
 assert.equal((await metrics.sample()).cpuPercent,null);
 time=100;await metrics.sample();assert.equal(reads,1);
 time=2000;assert.equal((await metrics.sample()).cpuPercent,null);assert.equal(reads,2);
});
test('RAM and active default-route interface rates use only fixed proc files',async()=>{
 const values=[
  {'/proc/stat':'cpu 10 0 0 90 0\n','/proc/meminfo':'MemTotal: 4000000 kB\nMemAvailable: 1000000 kB\n','/proc/net/route':'Iface Destination Gateway Flags RefCnt Use Metric Mask\neth0 00000000 01010101 0003 0 0 100 00000000\n','/proc/net/dev':'Inter-| Receive | Transmit\n eth0: 1000 0 0 0 0 0 0 0 2000 0 0 0 0 0 0 0\n lo: 99999 0 0 0 0 0 0 0 99999 0 0 0 0 0 0 0\n'},
  {'/proc/stat':'cpu 20 0 0 180 0\n','/proc/meminfo':'MemTotal: 4000000 kB\nMemAvailable: 1200000 kB\n','/proc/net/route':'Iface Destination Gateway Flags RefCnt Use Metric Mask\neth0 00000000 01010101 0003 0 0 100 00000000\n','/proc/net/dev':' eth0: 5000 0 0 0 0 0 0 0 8000 0 0 0 0 0 0 0\n'}
 ];let index=0,time=0;
 const metrics=createSystemMetrics({read:async path=>{assert.ok(Object.hasOwn(values[index],path));return values[index][path];},now:()=>time,ping:async()=>42});
 const first=await metrics.sample();assert.equal(first.ramUsedBytes,3000000*1024);assert.equal(first.ramTotalBytes,4000000*1024);assert.equal(first.networkDownBytesPerSec,null);assert.equal(first.pingMs,42);
 index=1;time=2000;const second=await metrics.sample();assert.equal(second.ramUsedBytes,2800000*1024);assert.equal(second.networkDownBytesPerSec,2000);assert.equal(second.networkUpBytesPerSec,3000);assert.equal(second.pingMs,42);
});
test('network counter reset and route change suppress rate; ping is sparse and cancellable',async()=>{
 let time=0,pings=0,aborted=0,index=0;
 const routes=['eth0','eth0','wlan0'];const dev=[['1000','2000'],['100','150'],['10000','20000']];
 const metrics=createSystemMetrics({read:async path=>path==='/proc/stat'?'cpu 10 0 0 90 0\n':path==='/proc/meminfo'?'MemTotal: 1000 kB\nMemAvailable: 500 kB\n':path==='/proc/net/route'?`Iface Destination Gateway Flags RefCnt Use Metric Mask\n${routes[index]} 00000000 01010101 0003 0 0 100 00000000\n`:` ${routes[index]}: ${dev[index][0]} 0 0 0 0 0 0 0 ${dev[index][1]} 0 0 0 0 0 0 0\n`,now:()=>time,ping:async signal=>{pings++;signal.addEventListener('abort',()=>aborted++);return 7;}});
 await metrics.sample();index=1;time=2000;assert.equal((await metrics.sample()).networkDownBytesPerSec,null);index=2;time=4000;assert.equal((await metrics.sample()).networkUpBytesPerSec,null);assert.equal(pings,1);metrics.stop();assert.equal(aborted,1);
});
test('stop aborts an in-flight Google reachability probe',async()=>{
 let aborted=0;
 const metrics=createSystemMetrics({read:async()=>null,now:()=>0,ping:signal=>new Promise(resolve=>signal.addEventListener('abort',()=>{aborted++;resolve(null);},{once:true}))});
 const pending=metrics.sample();await new Promise(resolve=>setImmediate(resolve));metrics.stop();await pending;
 assert.equal(aborted,1);
 metrics.stop();
});
test('stop during slow proc reads prevents a late ping',async()=>{
 const releases=[];let pings=0;
 const read=()=>new Promise(resolve=>{releases.push(resolve);});
 const metrics=createSystemMetrics({read,now:()=>0,ping:async()=>{pings++;return 1;}});
 const pending=metrics.sample();metrics.stop();for(const release of releases)release(null);await pending;
 assert.equal(pings,0);
});
