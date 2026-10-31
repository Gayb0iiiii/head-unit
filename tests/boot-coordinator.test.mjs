import test from 'node:test';
import assert from 'node:assert/strict';
import {createBootCoordinator} from '../electron/boot-coordinator.mjs';
const uid=1000;
function fixture(){
 const session=(id,vt,instance)=>({id,vt,instance,uid,seat:'seat0',remote:false,sessionClass:'user',state:'online',active:false});
 return {displayConnected:true,sessions:[session('ui',1,'ui-1'),session('desk',2,'desk-1')],processes:[{name:'cage',sessionId:'ui',instance:'ui-1',headunit:true},{name:'kwin_wayland',sessionId:'desk',instance:'desk-1'},{name:'plasmashell',sessionId:'desk',instance:'desk-1',wayland:true}],readiness:{headunit:{sessionId:'ui',instance:'ui-1',ready:true,observedAt:100},desktop:{sessionId:'desk',instance:'desk-1',ready:true,observedAt:100}}};
}
function harness(options={}){
 let state=fixture(),reads=0;const activated=[];
 const coordinator=createBootCoordinator({uid,now:()=>100,pollMs:1,callMs:30,attempts:3,
  discover:async()=>{reads++;return structuredClone(state);},
  activate:async(id)=>{activated.push(id);state.sessions.forEach(s=>{s.active=s.id===id;});return {accepted:true};},...options});
 return {coordinator,activated,get state(){return state;},set state(value){state=value;},get reads(){return reads;}};
}
test('simultaneous startup coalesces callers, selects UI and stops after observed activation',async()=>{
 const h=harness();const a=h.coordinator.run(),b=h.coordinator.run();assert.equal(a,b);assert.equal((await a).status,'headunit');assert.deepEqual(h.activated,['ui']);
 h.state.sessions.forEach(s=>{s.active=s.id==='desk';});await h.coordinator.run();assert.deepEqual(h.activated,['ui'],'completed boot must not steal a later manual desktop switch');h.coordinator.dispose();
});
test('delayed renderer readiness waits and does not activate just because Cage exists',async()=>{
 let reads=0;const state=fixture(),calls=[];
 const h=harness({discover:async()=>{reads++;state.readiness.headunit.ready=reads>=3;return structuredClone(state);},activate:async id=>{calls.push(id);state.sessions.forEach(s=>{s.active=s.id===id;});return {accepted:true};}});
 assert.equal((await h.coordinator.run()).status,'headunit');assert.ok(reads>=4);assert.deepEqual(calls,['ui']);
});
test('missing UI readiness falls back only to verified desktop',async()=>{
 const h=harness();h.state.readiness.headunit.ready=false;assert.equal((await h.coordinator.run()).status,'desktop');assert.deepEqual(h.activated,['desk']);
});
test('missing display never activates a local VT and preserves independent recovery',async()=>{
 const h=harness();h.state.displayConnected=false;assert.equal((await h.coordinator.run()).status,'recovery-required');assert.deepEqual(h.activated,[]);
});
test('unknown, remote, stale and ambiguous evidence never activates UI',async()=>{
 for(const alter of [s=>{s.readiness.headunit.observedAt=-10000;},s=>{s.sessions[0].remote=true;},s=>{s.readiness.headunit.instance='old';},s=>{s.sessions.push({...s.sessions[0],id:'other',vt:3});s.processes.push({...s.processes[0],sessionId:'other'});}]){
  const h=harness();alter(h.state);assert.equal((await h.coordinator.run()).status,'desktop');assert.deepEqual(h.activated,['desk']);
 }
});
test('restart between discovery and activation rejects stale instance and uses desktop',async()=>{
 let reads=0;const state=fixture(),calls=[];
 const h=harness({discover:async()=>{if(++reads>=2)state.sessions[0].instance='ui-2';return structuredClone(state);},activate:async id=>{calls.push(id);state.sessions.forEach(s=>{s.active=s.id===id;});return {accepted:true};}});
 assert.equal((await h.coordinator.run()).status,'desktop');assert.deepEqual(calls,['desk']);
});
test('explicit activation rejection uses verified desktop; uncertain timeout cannot race fallback',async()=>{
 const state=fixture(),calls=[];
 const h=harness({discover:async()=>structuredClone(state),activate:async id=>{calls.push(id);if(id==='ui')return {accepted:false};state.sessions[1].active=true;return {accepted:true};}});
 assert.equal((await h.coordinator.run()).status,'desktop');assert.deepEqual(calls,['ui','desk']);
 const stalled=harness({activate:()=>new Promise(()=>{})});assert.equal((await stalled.coordinator.run()).reason,'activation-uncertain');assert.deepEqual(stalled.activated,[]);
});
test('unobserved or competing active session cannot report a foreground success',async()=>{
 const h=harness({activate:async()=>({accepted:true})});assert.equal((await h.coordinator.run()).status,'recovery-required');
 const both=harness();both.state.sessions.push({...both.state.sessions[0],id:'unrelated',uid:2000,vt:4,active:true});
 // A provider returning accepted without making the seat exclusive is not success.
 const state=both.state;const c=harness({discover:async()=>structuredClone(state),activate:async()=>{state.sessions[0].active=true;return {accepted:true};}});assert.equal((await c.coordinator.run()).status,'recovery-required');
});
test('hung discovery is bounded and disposal cancels without late activation',async()=>{
 const h=harness({discover:()=>new Promise(()=>{})});assert.equal((await h.coordinator.run()).status,'recovery-required');
 let resolve;const stopped=harness({discover:()=>new Promise(r=>{resolve=r;})});const running=stopped.coordinator.run();stopped.coordinator.dispose();resolve(fixture());assert.equal((await running).status,'cancelled');assert.deepEqual(stopped.activated,[]);
});

test('malformed readiness timestamps fail closed without coercing provider objects',async()=>{
 const h=harness();h.state.readiness.headunit.observedAt={toString:null};assert.equal((await h.coordinator.run()).status,'desktop');assert.deepEqual(h.activated,['desk']);
});
test('late activation completion after timeout never starts a competing fallback',async()=>{
 let finish;const calls=[];
 const h=harness({activate:id=>{calls.push(id);return new Promise(resolve=>{finish=resolve;});}});
 assert.equal((await h.coordinator.run()).reason,'activation-uncertain');finish({accepted:true});await new Promise(setImmediate);assert.deepEqual(calls,['ui']);
});
test('missing readiness for both sessions never turns process presence into readiness',async()=>{
 const h=harness();h.state.readiness={};assert.equal((await h.coordinator.run()).reason,'no-verified-session');assert.deepEqual(h.activated,[]);
});

test('future readiness and foreign session UID cannot select headunit',async()=>{
 for(const alter of [s=>{s.readiness.headunit.observedAt=101;},s=>{s.sessions[0].uid=2000;}]){const h=harness();alter(h.state);assert.equal((await h.coordinator.run()).status,'desktop');assert.deepEqual(h.activated,['desk']);}
});
test('already exclusively active ready UI requires no activation',async()=>{
 const h=harness();h.state.sessions[0].active=true;assert.equal((await h.coordinator.run()).reason,'already-active');assert.deepEqual(h.activated,[]);
});
test('malformed activation acknowledgement never permits competing fallback',async()=>{
 const calls=[];const h=harness({activate:async id=>{calls.push(id);return {accepted:'yes'};}});assert.equal((await h.coordinator.run()).reason,'activation-uncertain');assert.deepEqual(calls,['ui']);
});
test('disposal during activation prevents readback and fallback after late success',async()=>{
 let finish;const calls=[];const h=harness({activate:id=>{calls.push(id);return new Promise(resolve=>{finish=resolve;});}});const pending=h.coordinator.run();await new Promise(setImmediate);h.coordinator.dispose();finish({accepted:true});assert.equal((await pending).status,'cancelled');assert.deepEqual(calls,['ui']);
});
test('disposal during readback cannot report successful foreground selection',async()=>{
 let reads=0,finish;const state=fixture();const h=harness({discover:async()=>{if(++reads===3)return new Promise(resolve=>{finish=resolve;});return structuredClone(state);},activate:async()=>{state.sessions[0].active=true;return {accepted:true};}});
 const pending=h.coordinator.run();await new Promise(setImmediate);h.coordinator.dispose();finish(state);assert.equal((await pending).status,'cancelled');
});
