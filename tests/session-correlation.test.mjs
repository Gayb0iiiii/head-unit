import test from 'node:test';import assert from 'node:assert/strict';
import {correlateProcessSession,parseSessionIdentity} from '../electron/session-correlation.mjs';
const reporter={pid:50,ppid:20,uid:1000,sessionId:'s2',instance:'a'.repeat(64)};
const leader={pid:20,ppid:1,uid:1000,sessionId:'s2',instance:'b'.repeat(64)};
const session={id:'s2',uid:1000,seat:'seat0',vt:2,remote:false,state:'online',sessionClass:'user',active:false,leader:20};
function options(overrides={}){return {pid:50,uid:1000,processInstance:reporter.instance,readIdentity:async pid=>pid===50?{...reporter}:{...leader},readSession:async()=>({...session}),...overrides};}
test('current process proof correlates to a shared verified logind leader instance',async()=>{
 const result=await correlateProcessSession(options());assert.deepEqual(result,{sessionId:'s2',instance:leader.instance,processInstance:reporter.instance,pid:50,uid:1000,seat:'seat0',vt:2,active:false});
 const other={...reporter,pid:51,instance:'c'.repeat(64)};
 const second=await correlateProcessSession(options({pid:51,processInstance:other.instance,readIdentity:async pid=>pid===51?other:leader}));assert.equal(second.instance,result.instance);assert.notEqual(second.processInstance,result.processInstance);
});
test('remote foreign UID absent session and mismatched leader fail closed',async()=>{
 for(const change of [{remote:true},{uid:0},{seat:'seat1'},{vt:0},{leader:99},{sessionClass:'manager'},{state:'closing'}])assert.equal(await correlateProcessSession(options({readSession:async()=>({...session,...change})})),null);
 assert.equal(await correlateProcessSession(options({readIdentity:async()=>({...reporter,sessionId:null})})),null);
 assert.equal(await correlateProcessSession(options({processInstance:'c'.repeat(64)})),null);
});
test('leader or reporter replacement and session reassignment during read are rejected',async()=>{
 for(const target of [20,50]){let calls=0;assert.equal(await correlateProcessSession(options({readIdentity:async pid=>{const value=pid===50?reporter:leader;return pid===target&&++calls>1?{...value,instance:'d'.repeat(64)}:value;}})),null);}
 let calls=0;assert.equal(await correlateProcessSession(options({readSession:async()=>({...session,vt:++calls>1?3:2})})),null);
});
test('missing permissions and hung readers settle unavailable within a bounded call',async()=>{
 assert.equal(await correlateProcessSession(options({readSession:async()=>{throw Error('denied');}})),null);
 assert.equal(await correlateProcessSession(options({readIdentity:()=>new Promise(()=>{}),timeoutMs:10})),null);
});
test('logind parser requires exact bounded leader and rejects duplicate identity properties',()=>{
 const output='Id=s2\nUser=1000\nSeat=seat0\nVTNr=2\nRemote=no\nState=online\nClass=user\nType=tty\nActive=no\nLeader=20\n';
 assert.equal(parseSessionIdentity(output).leader,20);assert.equal(parseSessionIdentity(output+'Leader=50\n'),null);assert.equal(parseSessionIdentity(output.replace('Leader=20','Leader=0')),null);
});

test('abort and late discovery cannot publish session evidence or continue probing',async()=>{
 let finish,reads=0;const controller=new AbortController();
 const pending=correlateProcessSession(options({signal:controller.signal,readIdentity:()=>{reads++;return new Promise(resolve=>{finish=resolve;});}}));controller.abort();finish(reporter);assert.equal(await pending,null);await new Promise(setImmediate);assert.equal(reads,1);
});
test('caller strings cannot become a loginctl target or a forged correlated identity',async()=>{
 let reads=0;assert.equal(await correlateProcessSession(options({pid:'50;command',readIdentity:()=>{reads++;}})),null);assert.equal(reads,0);
 assert.equal(await correlateProcessSession(options({readIdentity:async()=>({...reporter,sessionId:'s2\nother'})})),null);
});
