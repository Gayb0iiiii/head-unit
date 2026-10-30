import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter,getEventListeners} from 'node:events';
import {createReleaseSupervisor} from '../electron/release-supervisor.mjs';
import {createOwnedReadiness} from '../electron/boot-readiness.mjs';
import {correlateProcessSession} from '../electron/session-correlation.mjs';
const sha='a'.repeat(40),next='b'.repeat(40),tick=()=>new Promise(setImmediate);
async function harness(overrides={}){
 let time=100;const children=[],states=[];let holdReply=false;let identity={pid:55,ppid:22,uid:1000,sessionId:'s2',instance:'c'.repeat(64)};
 const readIdentity=async pid=>pid===55?{...identity}:{pid:20,ppid:1,uid:1000,sessionId:'s2',instance:'d'.repeat(64)};
 const correlate=args=>correlateProcessSession({...args,readIdentity,readSession:async()=>({id:'s2',uid:1000,seat:'seat0',vt:1,remote:false,state:'online',sessionClass:'user',active:true,leader:20})});
 const supervisor=createReleaseSupervisor({initial:{sha,path:'/old'},launch:async()=>{const child=new EventEmitter();child.pid=55;child.connected=true;child.sent=[];child.send=(message,callback)=>{child.sent.push(message);callback?.();if(message.kind==='boot-readiness-probe'&&!holdReply)queueMicrotask(()=>child.emit('message',{kind:'boot-readiness',nonce:message.nonce,ready:true}));};child.kill=()=>true;children.push(child);return child;},verifyRelease:async()=>({sha:next,path:'/new'}),saveState:async value=>states.push(value),setTimer:()=>1,clearTimer:()=>{},
  readinessOptions:{uid:1000,now:()=>time,timeoutMs:50,createProbe:args=>createOwnedReadiness({...args,parentPid:22,readIdentity}),correlate,...overrides}});
 await supervisor.start();const child=children[0];child.emit('message',{kind:'ready',sha});await supervisor.idle();
 return {supervisor,children,states,child,setTime:value=>{time=value;},setHold:value=>{holdReply=value;},setIdentity:value=>{identity={...identity,...value};}};
}
test('supervisor composes owned IPC with session correlation and preserves original probe time',async()=>{
 const h=await harness();try{const proof=await h.supervisor.probeReadiness();assert.equal(proof.ready,true);assert.equal(proof.observedAt,100);assert.equal(proof.sessionId,'s2');assert.equal(proof.instance,'d'.repeat(64));assert.deepEqual(h.states,[]);assert.equal(h.child.listenerCount('message'),1);}finally{h.supervisor.dispose();}
});
test('late correlation cannot freshen expired evidence or accept session reassignment',async()=>{
 let finish;const h=await harness({correlate:()=>new Promise(resolve=>{finish=resolve;})});try{const pending=h.supervisor.probeReadiness();await tick();h.setTime(2201);finish({pid:55,uid:1000,processInstance:'c'.repeat(64),sessionId:'s2',instance:'d'.repeat(64),seat:'seat0',vt:1,active:true});assert.equal(await pending,null);}finally{h.supervisor.dispose();}
 const changed=await harness({correlate:async()=>({pid:55,uid:1000,processInstance:'c'.repeat(64),sessionId:'other',instance:'d'.repeat(64),seat:'seat0',vt:1,active:true})});try{assert.equal(await changed.supervisor.probeReadiness(),null);}finally{changed.supervisor.dispose();}
});
for(const event of ['exit','disconnect','dispose'])test(`${event} revokes pending supervisor readiness and cleans probe listeners`,async()=>{
 const h=await harness();h.setHold(true);const pending=h.supervisor.probeReadiness();await tick();
 if(event==='dispose')h.supervisor.dispose();else h.child.emit(event,0);
 assert.equal(await pending,null);assert.equal(h.child.listenerCount('message'),1);if(event!=='exit')assert.equal(await h.supervisor.probeReadiness(),null);h.supervisor.dispose();
});
test('replacement child cannot inherit late old-child correlation',async()=>{
 let finish;const h=await harness({correlate:()=>new Promise(resolve=>{finish=resolve;})});try{const pending=h.supervisor.probeReadiness();await tick();h.child.emit('exit',0);await h.supervisor.idle();finish({pid:55,uid:1000,processInstance:'c'.repeat(64),sessionId:'s2',instance:'d'.repeat(64),seat:'seat0',vt:1,active:true});assert.equal(await pending,null);assert.equal(h.children.length,2);assert.equal(await h.supervisor.probeReadiness(),null,'new child has not reported release readiness');}finally{h.supervisor.dispose();}
});
test('query timeout and cancellation do not change release state or stop the child',async()=>{
 const h=await harness({correlate:()=>new Promise(()=>{})});try{assert.equal(await h.supervisor.probeReadiness(),null);assert.deepEqual(h.states,[]);const controller=new AbortController();const pending=h.supervisor.probeReadiness({signal:controller.signal});controller.abort();assert.equal(await pending,null);}finally{h.supervisor.dispose();}
});
test('activation invalidates in-flight query without changing update acknowledgement',async()=>{
 const h=await harness();try{h.setHold(true);const pending=h.supervisor.probeReadiness();await tick();h.child.emit('message',{kind:'activate',id:4,sha:next});await h.supervisor.idle();h.child.emit('message',{kind:'boot-readiness',nonce:h.child.sent.find(m=>m.kind==='boot-readiness-probe').nonce,ready:true});assert.equal(await pending,null);assert.deepEqual(h.child.sent.at(-1),{kind:'update-ack',id:4,accepted:true});assert.equal(h.states.at(-1).pending,next);}finally{h.supervisor.dispose();}
});

test('disposal while creating a probe cleans the late handle without probing it',async()=>{
 let finish,disposed=0,probes=0;const h=await harness({createProbe:()=>new Promise(resolve=>{finish=resolve;})});
 const pending=h.supervisor.probeReadiness();await tick();h.supervisor.dispose();assert.equal(await pending,null);
 finish({probe:()=>{probes++;return null;},dispose:()=>{disposed++;}});await tick();assert.equal(disposed,1);assert.equal(probes,0);
});
test('readiness queries coalesce only while pending and re-probe after completion',async()=>{
 const h=await harness();try{
  const first=h.supervisor.probeReadiness(),same=h.supervisor.probeReadiness();assert.equal(first,same);assert.equal((await first).ready,true);
  const count=h.child.sent.filter(m=>m.kind==='boot-readiness-probe').length;assert.equal((await h.supervisor.probeReadiness()).ready,true);assert.equal(h.child.sent.filter(m=>m.kind==='boot-readiness-probe').length,count+1);
  h.setIdentity({sessionId:'changed'});assert.equal(await h.supervisor.probeReadiness(),null);
 }finally{h.supervisor.dispose();}
});

test('a changed session-leader binding permanently revokes readiness for that child',async()=>{
 let instance='d'.repeat(64);const h=await harness({correlate:async()=>({pid:55,uid:1000,processInstance:'c'.repeat(64),sessionId:'s2',instance,seat:'seat0',vt:1,active:true})});
 try{assert.equal((await h.supervisor.probeReadiness()).ready,true);instance='e'.repeat(64);assert.equal(await h.supervisor.probeReadiness(),null);const count=h.child.sent.length;assert.equal(await h.supervisor.probeReadiness(),null);assert.equal(h.child.sent.length,count);}finally{h.supervisor.dispose();}
});

test('later coalesced caller cancellation revokes shared proof but permits a fresh query',async()=>{
 let finish,delay=true;const proof={pid:55,uid:1000,processInstance:'c'.repeat(64),sessionId:'s2',instance:'d'.repeat(64),seat:'seat0',vt:1,active:true};
 const h=await harness({correlate:()=>delay?new Promise(resolve=>{finish=resolve;}):Promise.resolve(proof)});
 try{
  const first=h.supervisor.probeReadiness();await tick();const caller=new AbortController();
  const second=h.supervisor.probeReadiness({signal:caller.signal});assert.equal(second,first);
  caller.abort();finish(proof);assert.equal(await second,null);assert.equal(await first,null);
  delay=false;assert.equal((await h.supervisor.probeReadiness()).ready,true);assert.deepEqual(h.states,[]);
 }finally{h.supervisor.dispose();}
});

for(const outcome of ['success','abort','already-aborted'])test(`coalesced caller listeners are cleaned after ${outcome}`,async()=>{
 const h=await harness();const firstCaller=new AbortController(),laterCaller=new AbortController();
 try{
  const first=h.supervisor.probeReadiness({signal:firstCaller.signal});
  if(outcome==='already-aborted')laterCaller.abort();
  const second=h.supervisor.probeReadiness({signal:laterCaller.signal});assert.equal(first,second);
  if(outcome==='abort')laterCaller.abort();
  const result=await first;assert.equal(result?.ready??false,outcome==='success');
  for(const caller of [firstCaller,laterCaller])assert.equal(getEventListeners(caller.signal,'abort').length,0);
  const fresh=h.supervisor.probeReadiness();firstCaller.abort();laterCaller.abort();
  assert.equal((await fresh).ready,true,'settled callers cannot cancel a new query');assert.deepEqual(h.states,[]);
 }finally{h.supervisor.dispose();}
});
