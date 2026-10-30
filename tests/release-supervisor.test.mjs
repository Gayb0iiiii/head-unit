import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter,once} from 'node:events';
import {spawn} from 'node:child_process';
import {createReleaseSupervisor} from '../electron/release-supervisor.mjs';

const old='a'.repeat(40),next='b'.repeat(40),third='c'.repeat(40);
const oldRelease={sha:old,path:'/releases/old'},candidate={sha:next,path:'/releases/new'},thirdRelease={sha:third,path:'/releases/third'};
const tick=()=>new Promise(setImmediate);

function harness({candidateHealthy=true}={}){
  const children=[],states=[],timers=new Map();let timerId=0,fatal=0;
  const supervisor=createReleaseSupervisor({initial:oldRelease,
    launch:async release=>{const child=new EventEmitter();child.release=release;child.sent=[];child.send=message=>child.sent.push(message);child.kill=()=>{queueMicrotask(()=>child.emit('exit',0));return true;};children.push(child);return child;},
    verifyRelease:async sha=>sha===next?candidate:sha===third?thirdRelease:null,
    saveState:async state=>states.push({...state}),
    setTimer:fn=>{timers.set(++timerId,fn);return timerId;},clearTimer:id=>timers.delete(id),
    onFatal:()=>{fatal++;}});
  return {supervisor,children,states,timers,get fatal(){return fatal;},candidateHealthy};
}

test('candidate is activated only after renderer readiness; failed startup rolls back while Cage owner stays',async()=>{
  const h=harness();await h.supervisor.start();
  const first=h.children[0];first.emit('message',{kind:'ready',sha:old});await h.supervisor.idle();
  first.emit('message',{kind:'activate',id:7,sha:next});await h.supervisor.idle();
  assert.deepEqual(first.sent.at(-1),{kind:'update-ack',id:7,accepted:true});
  await tick();await h.supervisor.idle();
  assert.equal(h.children[1].release.sha,next);
  assert.equal(h.states.at(-1).pending,next);
  h.children[1].emit('exit',1);await h.supervisor.idle();
  assert.equal(h.children[2].release.sha,old);
  assert.deepEqual(h.states.at(-1),{active:old,pending:null,previous:null});
  assert.equal(h.fatal,0);
  h.supervisor.dispose();
});
test('a healthy promoted release can request another update without restarting Cage',async()=>{
  const h=harness();await h.supervisor.start();h.children[0].emit('message',{kind:'ready',sha:old});await h.supervisor.idle();
  h.children[0].emit('message',{kind:'activate',id:1,sha:next});await h.supervisor.idle();await tick();await h.supervisor.idle();
  h.children[1].emit('message',{kind:'ready',sha:next});await h.supervisor.idle();
  [...h.timers.values()].at(-1)();await h.supervisor.idle();
  h.children[1].emit('message',{kind:'activate',id:2,sha:third});await h.supervisor.idle();await tick();await h.supervisor.idle();
  assert.deepEqual(h.children[1].sent.at(-1),{kind:'update-ack',id:2,accepted:true});
  assert.equal(h.children[2].release.sha,third);
  assert.deepEqual(h.states.at(-1),{active:next,pending:third,previous:null});
  h.supervisor.dispose();
});

test('healthy candidate commits and becomes active only after matching readiness',async()=>{
  const h=harness();await h.supervisor.start();h.children[0].emit('message',{kind:'ready',sha:old});await h.supervisor.idle();
  h.children[0].emit('message',{kind:'activate',id:1,sha:next});await h.supervisor.idle();await tick();await h.supervisor.idle();
  h.children[1].emit('message',{kind:'ready',sha:next});await h.supervisor.idle();
  assert.equal(h.states.at(-1).pending,next);
  [...h.timers.values()].at(-1)();await h.supervisor.idle();
  assert.deepEqual(h.states.at(-1),{active:next,pending:null,previous:old});
  h.supervisor.dispose();
});
test('candidate exit during the health window restores the previous release',async()=>{
  const h=harness();await h.supervisor.start();h.children[0].emit('message',{kind:'ready',sha:old});await h.supervisor.idle();
  h.children[0].emit('message',{kind:'activate',id:1,sha:next});await h.supervisor.idle();await tick();await h.supervisor.idle();
  h.children[1].emit('message',{kind:'ready',sha:next});await h.supervisor.idle();
  h.children[1].emit('exit',1);await h.supervisor.idle();
  assert.equal(h.children.at(-1).release.sha,old);
  assert.deepEqual(h.states.at(-1),{active:old,pending:null,previous:null});h.supervisor.dispose();
});

test('unverified, concurrent, or pre-ready activation is rejected without stopping old UI',async()=>{
  const h=harness();await h.supervisor.start();const first=h.children[0];
  first.emit('message',{kind:'activate',id:1,sha:next});await h.supervisor.idle();
  assert.equal(first.sent.at(-1).accepted,false);assert.equal(h.children.length,1);
  first.emit('message',{kind:'ready',sha:old});await h.supervisor.idle();
  first.emit('message',{kind:'activate',id:2,sha:'d'.repeat(40)});await h.supervisor.idle();
  assert.equal(first.sent.at(-1).accepted,false);assert.equal(h.children.length,1);
  first.emit('message',{kind:'activate',id:3,sha:next});
  first.emit('message',{kind:'activate',id:4,sha:next});await h.supervisor.idle();
  assert.equal(first.sent.at(-1).accepted,false);
  h.supervisor.dispose();
});

test('candidate readiness timeout rolls back; repeated active failures become fatal',async()=>{
  const h=harness();await h.supervisor.start();h.children[0].emit('message',{kind:'ready',sha:old});await h.supervisor.idle();
  h.children[0].emit('message',{kind:'activate',id:1,sha:next});await h.supervisor.idle();await tick();await h.supervisor.idle();
  const candidateTimer=[...h.timers.values()].at(-1);candidateTimer();await tick();await h.supervisor.idle();
  assert.equal(h.children.at(-1).release.sha,old);
  for(let i=0;i<3;i++){h.children.at(-1).emit('exit',1);await h.supervisor.idle();}
  assert.equal(h.fatal,1);h.supervisor.dispose();
});
test('active release that reports ready then exits repeatedly still reaches the failure limit',async()=>{
  const h=harness();await h.supervisor.start();
  for(let i=0;i<3;i++){
    const child=h.children.at(-1);
    child.emit('message',{kind:'ready',sha:old});await h.supervisor.idle();
    child.emit('exit',1);await h.supervisor.idle();
  }
  assert.equal(h.fatal,1);
  assert.equal(h.children.length,3);
  h.supervisor.dispose();
});
test('a stable active release clears transient failures after its health interval',async()=>{
  const h=harness();await h.supervisor.start();
  h.children[0].emit('exit',1);await h.supervisor.idle();
  const child=h.children.at(-1);child.emit('message',{kind:'ready',sha:old});await h.supervisor.idle();
  const stableTimer=[...h.timers.values()].at(-1);stableTimer();await h.supervisor.idle();
  for(let i=0;i<2;i++){h.children.at(-1).emit('exit',1);await h.supervisor.idle();}
  assert.equal(h.fatal,0);
  h.supervisor.dispose();
});
test('shutdown during asynchronous launch stops the late child instead of orphaning it',async()=>{
 let finish,kills=[],timers=[];const child=new EventEmitter();child.kill=signal=>{kills.push(signal);return true;};
 const supervisor=createReleaseSupervisor({initial:oldRelease,launch:()=>new Promise(resolve=>{finish=resolve;}),verifyRelease:async()=>candidate,saveState:async()=>{},setTimer:fn=>{timers.push(fn);return fn;},clearTimer:()=>{}});
 const starting=supervisor.start();await tick();supervisor.dispose();finish(child);await starting;
 assert.deepEqual(kills,['SIGTERM']);timers.at(-1)();assert.deepEqual(kills,['SIGTERM','SIGKILL']);
});
test('shutdown while verification waits cannot persist or activate a candidate',async()=>{
 let finish;const states=[],child=new EventEmitter();child.kill=()=>true;child.send=()=>{};
 const supervisor=createReleaseSupervisor({initial:oldRelease,launch:async()=>child,verifyRelease:()=>new Promise(resolve=>{finish=resolve;}),saveState:async value=>states.push(value),setTimer:()=>1,clearTimer:()=>{}});
 await supervisor.start();child.emit('message',{kind:'ready',sha:old});await supervisor.idle();child.emit('message',{kind:'activate',id:1,sha:next});await tick();supervisor.dispose();finish(candidate);await supervisor.idle();assert.deepEqual(states,[]);
});
test('starting twice cannot create competing child owners',async()=>{
 const h=harness();await h.supervisor.start();await h.supervisor.start();assert.equal(h.children.length,1);h.supervisor.dispose();
});

test('real child ignoring graceful shutdown is killed within the shutdown deadline',{timeout:3000},async()=>{
 let child;const supervisor=createReleaseSupervisor({initial:oldRelease,shutdownMs:50,
  launch:async()=>{child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});process.send({kind:'ready',sha:'"+old+"'});setInterval(()=>{},1000)"],{stdio:['ignore','ignore','ignore','ipc']});return child;},
  verifyRelease:async()=>null,saveState:async()=>{}});
 try{await supervisor.start();await once(child,'message');const exited=once(child,'exit');supervisor.dispose();const [code,signal]=await exited;assert.equal(code,null);assert.equal(signal,'SIGKILL');}
 finally{supervisor.dispose();if(child?.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}
});

test('candidate launch rejection immediately restores the verified previous release',async()=>{
 const launches=[],states=[],children=[],fatal=[];
 const supervisor=createReleaseSupervisor({initial:oldRelease,
  launch:async release=>{launches.push(release.sha);if(release.sha===next)throw Error('spawn unavailable');const child=new EventEmitter();child.send=()=>{};child.kill=()=>{queueMicrotask(()=>child.emit('exit',0));return true;};children.push(child);return child;},
  verifyRelease:async()=>candidate,saveState:async state=>states.push(state),setTimer:()=>1,clearTimer:()=>{},onFatal:error=>fatal.push(error)});
 try{await supervisor.start();children[0].emit('message',{kind:'ready',sha:old});await supervisor.idle();children[0].emit('message',{kind:'activate',id:1,sha:next});await supervisor.idle();await tick();await supervisor.idle();
  assert.deepEqual(launches,[old,next,old]);assert.deepEqual(states.at(-1),{active:old,pending:null,previous:null});assert.equal(fatal.length,0);
 }finally{supervisor.dispose();}
});
