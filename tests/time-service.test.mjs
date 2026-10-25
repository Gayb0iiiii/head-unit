import test from 'node:test';
import assert from 'node:assert/strict';
import {createTimeService,parseTimeStatus,parseLocalTime} from '../electron/time-service.mjs';

const synced='Timezone=Australia/Perth\nCanNTP=yes\nNTP=yes\nNTPSynchronized=yes\n';
test('manual local time is converted using host timezone even when process timezone differs',()=>{
  assert.equal(parseLocalTime('2026-10-25T12:30','Australia/Perth'),Date.UTC(2026,9,25,4,30));
  assert.equal(parseLocalTime('2026-10-25T12:30','Etc/UTC'),Date.UTC(2026,9,25,12,30));
});
test('clock status keeps timezone, NTP enabled, and synchronization separate',()=>{
  assert.deepEqual(parseTimeStatus(synced),{timezone:'Australia/Perth',canNtp:true,ntpEnabled:true,synchronized:true});
  assert.deepEqual(parseTimeStatus('Timezone=Etc/UTC\nCanNTP=yes\nNTP=yes\nNTPSynchronized=no\n'),{timezone:'Etc/UTC',canNtp:true,ntpEnabled:true,synchronized:false});
  assert.equal(parseTimeStatus('Timezone=bad value\nCanNTP=yes\nNTP=yes\nNTPSynchronized=yes\n'),null);
});

test('manual absolute time validates local date before disabling NTP and using interactive timedated',async()=>{
  let state=synced,clock=Date.UTC(2026,9,25,4);const calls=[];
  const service=createTimeService({now:()=>clock,run:async(command,args)=>{calls.push([command,...args]);if(command==='timedatectl')return state;if(args.includes('SetNTP'))state=state.replace(/^NTP=yes$/m,'NTP=no');if(args.includes('SetTime'))clock=Date.UTC(2026,9,25,4,30);return '';}});
  await assert.rejects(()=>service.setManualTime('2026-02-30T12:00'),/invalid/i);assert.equal(calls.length,0);
  const result=await service.setManualTime('2026-10-25T12:30');
  assert.equal(result.changed,true);
  assert.deepEqual(calls[1].slice(0,5),['busctl','call','org.freedesktop.timedate1','/org/freedesktop/timedate1','org.freedesktop.timedate1']);
  assert.equal(calls[1].includes('SetNTP'),true);
  assert.equal(calls[2].includes('SetTime'),true);
  assert.equal(calls[2].at(-2),'false');assert.equal(calls[2].at(-1),'true');
});

test('failed manual setting attempts NTP restoration and reports partial failure honestly',async()=>{
  let state=synced;const calls=[];
  const service=createTimeService({run:async(command,args)=>{calls.push([command,...args]);if(command==='timedatectl')return state;if(args.includes('SetTime'))throw Error('not authorized');if(args.includes('SetNTP'))state=state.replace(/^NTP=(yes|no)$/m,`NTP=${args.at(-2)==='true'?'yes':'no'}`);return '';}});
  const result=await service.setManualTime('2026-10-25T12:30');
  assert.equal(result.changed,false);assert.equal(result.ntpRestored,true);
  assert.equal(calls.filter(call=>call.includes('SetNTP')).length,2);
});

test('successful time command with failed verification reports unknown outcome',async()=>{
  let reads=0;
  const service=createTimeService({run:async(command)=>{if(command==='timedatectl')return ++reads===1?synced:'broken';return '';}});
  const result=await service.setManualTime('2026-10-25T12:30');
  assert.equal(result.changed,null);
  assert.equal(result.status,null);
});

test('timezone changes use only an approved local-zone choice and interactive timedated',async()=>{
  let state=synced;const calls=[];
  const service=createTimeService({run:async(command,args)=>{calls.push([command,...args]);if(command==='timedatectl')return state;if(args.includes('SetTimezone'))state=state.replace('Australia/Perth','Etc/UTC');return '';}});
  await assert.rejects(()=>service.setTimezone('../etc/passwd'),/timezone/i);
  assert.equal(calls.length,0);
  const result=await service.setTimezone('Etc/UTC');
  assert.equal(result.changed,true);
  assert.equal(calls[1].includes('SetTimezone'),true);
  assert.deepEqual(calls[1].slice(-3),['sb','Etc/UTC','true']);
});

test('denied automatic time and timezone authorization leaves OS state unchanged',async()=>{
  const calls=[];
  const service=createTimeService({run:async(command,args)=>{
    calls.push([command,...args]);
    if(command==='timedatectl')return synced;
    throw Error('Interactive authorization denied');
  }});
  await assert.rejects(()=>service.setNtp(false),/authorization denied/);
  await assert.rejects(()=>service.setTimezone('Etc/UTC'),/authorization denied/);
  assert.deepEqual(await service.status(),parseTimeStatus(synced));
  assert.deepEqual(calls.filter(([command])=>command==='busctl').map(call=>call[5]),['SetNTP','SetTimezone']);
});
