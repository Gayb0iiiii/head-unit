import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter,once} from 'node:events';import {spawn} from 'node:child_process';
import {createOwnedReadiness,attachReadinessResponder} from '../electron/boot-readiness.mjs';
const identity={pid:55,ppid:22,uid:1000,sessionId:'s1',instance:'a'.repeat(64)};
async function fixture(options={}){const child=new EventEmitter();child.pid=55;child.connected=true;child.send=(message,callback)=>{child.sent=message;callback?.();};const probe=await createOwnedReadiness({child,uid:1000,parentPid:22,readIdentity:async()=>identity,timeoutMs:20,now:()=>100,...options});return {child,probe};}
test('only matching current challenge and exact schema produce fresh identity-bound readiness',async()=>{
 const {child,probe}=await fixture();const pending=probe.probe();await new Promise(setImmediate);
 child.emit('message',{kind:'boot-readiness',nonce:'stale',ready:true});child.emit('message',{...child.sent,kind:'boot-readiness',ready:true,sessionId:'forged'});
 child.emit('message',{kind:'boot-readiness',nonce:child.sent.nonce,ready:true});const result=await pending;assert.equal(result.ready,true);assert.equal(result.instance,identity.instance);assert.equal(result.sessionId,'s1');assert.equal(result.observedAt,100);assert.equal(child.listenerCount('message'),0);probe.dispose();
});
test('PID reuse and foreign parent never acquire readiness',async()=>{
 const foreign=await fixture({parentPid:23});assert.equal(foreign.probe,null);
 let current=identity;const {child,probe}=await fixture({readIdentity:async()=>current});const pending=probe.probe();await new Promise(setImmediate);current={...identity,instance:'b'.repeat(64)};child.emit('message',{kind:'boot-readiness',nonce:child.sent.nonce,ready:true});assert.equal(await pending,null);probe.dispose();
});
test('timeout disconnect disposal and abort remove listeners and never cache a previous ready',async()=>{
 for(const mode of ['timeout','disconnect','dispose','abort']){const {child,probe}=await fixture();const controller=new AbortController();const pending=probe.probe({signal:controller.signal});await new Promise(setImmediate);
 if(mode==='disconnect')child.emit('disconnect');if(mode==='dispose')probe.dispose();if(mode==='abort')controller.abort();assert.equal(await pending,null);assert.equal(child.listenerCount('message'),0);assert.equal(child.listenerCount('disconnect'),0);probe.dispose();}
});
test('responder reports only host-supplied readiness and removes handlers on disposal',async()=>{
 const channel=new EventEmitter();channel.connected=true;const messages=[];channel.send=(m,callback)=>{messages.push(m);callback?.();};let ready=false;
 const stop=attachReadinessResponder({channel,isReady:()=>ready});const nonce='a'.repeat(48);
 channel.emit('message',{kind:'boot-readiness-probe',nonce});await new Promise(setImmediate);assert.equal(messages[0].ready,false);
 ready=true;channel.emit('message',{kind:'boot-readiness-probe',nonce,command:'shell'});await new Promise(setImmediate);assert.equal(messages.length,1);stop();assert.equal(channel.listenerCount('message'),0);
});
test('real owned Node child exchanges readiness over inherited IPC without a public socket',{timeout:3000},async()=>{
 const moduleUrl=new URL('../electron/boot-readiness.mjs',import.meta.url).href;
 const child=spawn(process.execPath,['--input-type=module','-e',`import {attachReadinessResponder} from ${JSON.stringify(moduleUrl)};attachReadinessResponder({isReady:()=>true});process.send({kind:'fixture-started'});`],{stdio:['ignore','ignore','ignore','ipc']});
 let probe;try{await once(child,'message');probe=await createOwnedReadiness({child,uid:process.getuid(),timeoutMs:500});assert.ok(probe);const observed=await probe.probe();assert.equal(observed.ready,true);assert.equal(observed.pid,child.pid);assert.match(observed.instance,/^[a-f0-9]{64}$/);}finally{probe?.dispose();const ended=once(child,'exit');child.kill();await ended;}
});

test('previous valid response cannot satisfy a new challenge and child identity cannot assert another session',async()=>{
 let current=identity;const {child,probe}=await fixture({readIdentity:async()=>current});
 const first=probe.probe();await new Promise(setImmediate);const reply={kind:'boot-readiness',nonce:child.sent.nonce,ready:true};child.emit('message',reply);assert.equal((await first).ready,true);
 const second=probe.probe();await new Promise(setImmediate);child.emit('message',reply);current={...identity,sessionId:'other'};child.emit('message',{...reply,nonce:child.sent.nonce});assert.equal(await second,null);probe.dispose();
});
test('send failure, hung identity provider and concurrent probes are bounded',async()=>{
 const {child,probe}=await fixture();child.send=()=>{throw Error('closed');};assert.equal(await probe.probe(),null);assert.equal(child.listenerCount('message'),0);probe.dispose();
 const hung=await fixture({readIdentity:()=>new Promise(()=>{})});assert.equal(hung.probe,null);
 const h=await fixture();const first=h.probe.probe(),second=h.probe.probe();assert.equal(first,second);h.probe.dispose();assert.equal(await first,null);
});
