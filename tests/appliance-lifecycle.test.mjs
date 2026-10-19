import test from 'node:test';
import assert from 'node:assert/strict';
import {ApplianceLifecycle} from '../src/appliance-lifecycle.mjs';
class FakeClock {value=0;now(){return this.value;}advance(ms){this.value+=ms;}}
class FakeOwner {
 constructor(policy){this.policy=policy;this.effects=[];this.generations={};}
 drain(){const effects=this.policy.takeEffects();this.effects.push(...effects);for(const e of effects)if(e.type==='start')this.generations[e.component]=e.generation;return effects;}
 event(component,type,extra={}){const accepted=this.policy.handle({type,component,generation:this.generations[component],...extra});this.drain();return accepted;}
 ready(component){const extra=component==='engine'?{protocol:8,compositorReady:true}:component==='shell'?{appId:'dev.f-io.livi',fullscreen:true,role:'main'}:{};return this.event(component,'ready',extra);}
 heartbeats(){for(const e of this.drain())if(e.type==='probe')this.event(e.component,'heartbeat',{probeId:e.probeId});}
}
function fixture(options={}){
 assert.equal(typeof ApplianceLifecycle,'function','ApplianceLifecycle policy must exist');
 const clock=new FakeClock();const p=new ApplianceLifecycle({clock,startupTimeoutMs:{outerWayland:10,engine:20,shell:15},heartbeatIntervalMs:50,heartbeatTimeoutMs:10,stopTimeoutMs:5,forceStopTimeoutMs:3,retryInitialMs:2,retryMaxMs:5,maxRetries:2,...options});
 const owner=new FakeOwner(p);return {p,clock,owner,tick(ms){clock.advance(ms);p.tick();return owner.drain();}};
}
function running(f){f.p.start();f.owner.drain();for(const c of ['outerWayland','engine','shell'])f.owner.ready(c);assert.equal(f.p.snapshot().status,'running');}
const starts=effects=>effects.filter(e=>e.type==='start');

test('ordered readiness gates preserve one owner and request fullscreen before shell readiness',()=>{
 const f=fixture();assert.equal(f.p.snapshot().status,'idle');f.p.start();let effects=f.owner.drain();assert.deepEqual(starts(effects).map(e=>[e.component,e.owner]),[['outerWayland','appliance']]);
 f.owner.event('outerWayland','alive');assert.equal(starts(f.owner.effects).length,1);f.owner.ready('outerWayland');assert.equal(starts(f.owner.effects).at(-1).component,'engine');
 f.owner.event('engine','alive');f.owner.event('engine','ready',{protocol:8,compositorReady:false});assert.equal(starts(f.owner.effects).length,2);
 f.owner.ready('engine');assert.equal(starts(f.owner.effects).at(-1).owner,'core-ui-supervisor');assert.deepEqual(f.owner.effects.filter(e=>e.type==='fullscreen').map(e=>e.component),['shell']);
 f.owner.event('shell','ready',{appId:'wrong',fullscreen:true,role:'main'});assert.notEqual(f.p.snapshot().status,'running');
 f.owner.event('shell','ready',{appId:'dev.f-io.livi',fullscreen:false,role:'main'});assert.notEqual(f.p.snapshot().status,'running');
 f.owner.ready('shell');assert.equal(f.p.snapshot().status,'running');assert.equal(f.p.snapshot().components.engine.ready,true);
});

test('liveness does not reset startup readiness deadlines',()=>{
 const f=fixture();f.p.start();f.owner.drain();f.tick(9);f.owner.event('outerWayland','alive');const effects=f.tick(1);
 assert.equal(f.p.snapshot().status,'recovering');assert.deepEqual(effects.filter(e=>e.type==='stop').map(e=>[e.component,e.mode]),[['outerWayland','graceful']]);
 f.owner.event('outerWayland','stopped');assert.equal(f.p.snapshot().components.outerWayland.phase,'backoff');
 f.tick(1);assert.equal(starts(f.owner.effects).length,1);f.tick(1);assert.equal(starts(f.owner.effects).length,2);
});

test('a shell crash retries only shell and retains the healthy engine',()=>{
 const f=fixture();running(f);const engine=f.owner.generations.engine;f.owner.event('shell','exited');assert.equal(f.p.snapshot().status,'recovering');f.tick(2);
 assert.equal(starts(f.owner.effects).filter(e=>e.component==='engine').length,1);assert.equal(f.owner.generations.engine,engine);assert.equal(f.p.snapshot().components.engine.ready,true);assert.equal(starts(f.owner.effects).at(-1).component,'shell');f.owner.ready('shell');assert.equal(f.p.snapshot().status,'running');
});

test('retries use a bounded lifetime budget and latch recovery until explicit operator retry',()=>{
 const f=fixture({maxRetries:3});running(f);
 for(const delay of [2,4,5]){f.owner.event('shell','exited');f.tick(delay-1);assert.equal(f.p.snapshot().components.shell.phase,'backoff');f.tick(1);f.owner.ready('shell');}
 f.owner.event('shell','exited');assert.equal(f.p.snapshot().status,'recovery');assert.equal(f.p.snapshot().recovery.reason,'retry-exhausted');
 const count=starts(f.owner.effects).length;f.p.start();f.p.tick();f.p.tick();assert.equal(starts(f.owner.drain()).length,0);assert.equal(starts(f.owner.effects).length,count);
 assert.equal(f.p.retryRecovery(),true);f.owner.drain();assert.equal(starts(f.owner.effects).at(-1).component,'shell');f.owner.ready('shell');assert.equal(f.p.snapshot().status,'running');
});

test('current generation heartbeat challenge requires its matching response',()=>{
 const f=fixture({heartbeatIntervalMs:5});running(f);const effects=f.tick(5);const probes=effects.filter(e=>e.type==='probe');assert.equal(probes.length,3);
 assert.equal(f.owner.event('shell','heartbeat',{probeId:999}),false);assert.equal(f.owner.event('shell','alive'),true);
 for(const probe of probes)assert.equal(f.owner.event(probe.component,'heartbeat',{probeId:probe.probeId}),true);
 assert.equal(f.owner.event('shell','heartbeat',{probeId:probes.at(-1).probeId}),false);f.tick(5);assert.equal(f.p.snapshot().status,'running');
});

test('a hung shell is stopped before replacement while parent health remains valid',()=>{
 const f=fixture({heartbeatIntervalMs:5});running(f);const probes=f.tick(5).filter(e=>e.type==='probe');
 for(const probe of probes.filter(e=>e.component!=='shell'))f.owner.event(probe.component,'heartbeat',{probeId:probe.probeId});
 const next=f.tick(5).filter(e=>e.type==='probe');for(const probe of next)f.owner.event(probe.component,'heartbeat',{probeId:probe.probeId});
 const timeout=f.tick(5);assert.equal(f.p.snapshot().components.shell.phase,'stopping');assert.equal(f.p.snapshot().components.engine.ready,true);assert.equal(starts(timeout).length,0);
 const force=f.tick(5);assert.deepEqual(force.filter(e=>e.type==='stop').map(e=>e.mode),['force']);assert.equal(starts(force).length,0);
 f.owner.event('shell','stopped');f.tick(2);assert.equal(starts(f.owner.effects).at(-1).component,'shell');
});

test('unconfirmed termination latches recovery and blocks unsafe manual replacement',()=>{
 const f=fixture();running(f);f.owner.event('shell','failed');f.tick(5);f.tick(3);
 assert.equal(f.p.snapshot().status,'recovery');assert.equal(f.p.snapshot().recovery.reason,'stop-unconfirmed');assert.equal(f.p.retryRecovery(),false);
 const count=starts(f.owner.effects).length;f.p.tick();f.p.tick();assert.equal(starts(f.owner.drain()).length,0);assert.equal(starts(f.owner.effects).length,count);
 f.owner.event('shell','stopped');assert.equal(f.p.snapshot().status,'recovery');assert.equal(f.p.retryRecovery(),true);f.owner.drain();assert.equal(starts(f.owner.effects).length,count+1);
});

test('an engine failure stops shell first, retains outer Wayland, and waits before restarting engine',()=>{
 const f=fixture();running(f);f.owner.event('engine','failed');let stops=f.owner.effects.filter(e=>e.type==='stop');assert.deepEqual(stops.map(e=>e.component),['shell']);assert.equal(f.p.snapshot().components.outerWayland.ready,true);
 f.owner.event('shell','stopped');stops=f.owner.effects.filter(e=>e.type==='stop');assert.deepEqual(stops.map(e=>e.component),['shell','engine']);
 f.owner.event('engine','stopped');f.tick(2);assert.equal(starts(f.owner.effects).at(-1).component,'engine');assert.equal(starts(f.owner.effects).filter(e=>e.component==='outerWayland').length,1);
 f.owner.ready('engine');assert.equal(starts(f.owner.effects).at(-1).component,'shell');f.owner.ready('shell');assert.equal(f.p.snapshot().status,'running');
});

test('outer Wayland failure tears down dependent children in reverse order',()=>{
 const f=fixture();running(f);f.owner.event('outerWayland','exited');assert.equal(f.owner.effects.filter(e=>e.type==='stop').at(-1).component,'shell');f.owner.event('shell','stopped');assert.equal(f.owner.effects.filter(e=>e.type==='stop').at(-1).component,'engine');f.owner.event('engine','stopped');f.tick(2);assert.equal(starts(f.owner.effects).at(-1).component,'outerWayland');
});

test('incompatible engine handshake is terminal with no automatic retries',()=>{
 const f=fixture();f.p.start();f.owner.drain();f.owner.ready('outerWayland');f.owner.event('engine','ready',{protocol:9,compositorReady:true});f.owner.event('engine','stopped');assert.equal(f.p.snapshot().status,'recovery');assert.equal(f.p.snapshot().recovery.reason,'incompatible-engine');f.tick(20);assert.equal(starts(f.owner.effects).filter(e=>e.component==='engine').length,1);
});

test('stale generation events cannot revive or stop replacement processes',()=>{
 const f=fixture();running(f);const old=f.owner.generations.shell;f.owner.event('shell','exited');f.tick(2);f.owner.ready('shell');
 for(const type of ['alive','ready','failed','exited','stopped']){const extras=type==='ready'?{appId:'dev.f-io.livi',fullscreen:true,role:'main'}:{};assert.equal(f.p.handle({type,component:'shell',generation:old,...extras}),false);}
 assert.equal(f.p.snapshot().status,'running');assert.equal(f.p.takeEffects().length,0);
});

test('manual stop cancels retry and prevents stale restart effects from being replayed',()=>{
 const f=fixture();running(f);f.owner.event('shell','exited');f.p.stop();f.owner.drain();f.owner.event('engine','stopped');f.owner.event('outerWayland','stopped');assert.equal(f.p.snapshot().status,'stopped');const count=starts(f.owner.effects).length;f.tick(100);f.p.tick();assert.equal(starts(f.owner.effects).length,count);assert.deepEqual(f.p.takeEffects(),[]);
});

test('repeated ticks are idempotent and backward or nonfinite clocks are rejected',()=>{
 const f=fixture();f.p.start();f.owner.drain();f.p.tick();f.p.tick();assert.deepEqual(f.p.takeEffects(),[]);f.clock.value=-1;assert.throws(()=>f.p.tick(),/monotonic|backward/i);f.clock.value=Infinity;assert.throws(()=>f.p.tick(),/clock|time/i);
});

test('snapshots and effects are detached and input/effect vocabulary cannot launch commands or power actions',()=>{
 const f=fixture();f.p.start();const effects=f.p.takeEffects();effects[0].type='poweroff';const snapshot=f.p.snapshot();snapshot.components.outerWayland.phase='ready';assert.equal(f.p.snapshot().components.outerWayland.phase,'starting');assert.deepEqual(f.p.takeEffects(),[]);
 for(const event of [{type:'poweroff'},{type:'start',component:'shell',command:'sh'},{type:'alive',component:'unknown',generation:1},{type:'alive',component:'outerWayland',generation:1,command:'sh'}])assert.throws(()=>f.p.handle(event),/event|component|field/i);
 assert.throws(()=>fixture({maxRetries:Infinity}),/retry|option/i);assert.throws(()=>fixture({retryInitialMs:9,retryMaxMs:2}),/retry|option/i);
});

test('brief monotonic time passage has no ignition or host-power side effects',()=>{
 const f=fixture({startupTimeoutMs:{outerWayland:10000,engine:15000,shell:10000},heartbeatIntervalMs:1000,heartbeatTimeoutMs:5000});running(f);const effects=f.tick(2000);assert.ok(effects.every(e=>e.type==='probe'));assert.equal(f.p.snapshot().status,'running');assert.throws(()=>f.p.handle({type:'ignition',on:false}),/event/i);
});

test('recovery presentation stays unconfirmed until the independent presenter acknowledges its token',()=>{
 const f=fixture({maxRetries:0});running(f);f.owner.event('shell','exited');let snapshot=f.p.snapshot();assert.equal(snapshot.status,'recovery');assert.equal(snapshot.presentation.screen,'recovery');assert.equal(snapshot.presentation.confirmed,false);
 const id=snapshot.presentation.presentationId;assert.equal(f.p.handle({type:'presented',owner:'appliance-presenter',presentationId:id-1}),false);assert.equal(f.p.handle({type:'presented',owner:'appliance-presenter',presentationId:id}),true);assert.equal(f.p.snapshot().presentation.confirmed,true);
});

test('shell interruption declares owner-side contact and PTT revocation once per generation',()=>{
 const f=fixture();running(f);const generation=f.owner.generations.shell;f.owner.event('shell','failed');f.owner.event('shell','failed');f.owner.event('shell','stopped');f.tick(2);
 const revoke=f.owner.effects.filter(e=>e.type==='revoke-input'&&e.generation===generation);assert.equal(revoke.length,1);assert.equal(revoke[0].owner,'core-ui-supervisor');assert.equal(revoke[0].component,'shell');
});

test('stop before draining effects removes every queued start and fullscreen request',()=>{
 const f=fixture();f.p.start();f.p.stop();const effects=f.p.takeEffects();assert.equal(starts(effects).length,0);assert.equal(effects.filter(e=>e.type==='fullscreen').length,0);assert.equal(effects.filter(e=>e.type==='stop').length,1);
});

test('parent failure invalidates a queued child start before the owner receives it',()=>{
 const f=fixture();f.p.start();f.owner.drain();f.owner.ready('outerWayland');const engine=f.owner.generations.engine;
 f.p.handle({type:'ready',component:'engine',generation:engine,protocol:8,compositorReady:true});
 f.p.handle({type:'failed',component:'engine',generation:engine});const effects=f.p.takeEffects();assert.equal(starts(effects).length,0);assert.equal(effects.filter(e=>e.type==='fullscreen').length,0);assert.equal(effects.filter(e=>e.type==='stop').at(-1).component,'shell');
});

test('repeated parent failure reports during child shutdown do not spend more retry budget',()=>{
 const f=fixture();running(f);f.owner.event('engine','failed');f.owner.event('engine','failed');f.p.tick();f.p.tick();assert.equal(f.p.snapshot().components.engine.failures,1);f.owner.event('shell','stopped');f.owner.event('engine','stopped');f.tick(2);f.owner.ready('engine');f.owner.ready('shell');assert.equal(f.p.snapshot().status,'running');
});

test('parent exits during a manual stop cannot turn shutdown into automatic recovery',()=>{
 const f=fixture();running(f);f.p.stop();f.owner.drain();f.owner.event('engine','exited');f.owner.event('shell','stopped');f.owner.event('outerWayland','stopped');assert.equal(f.p.snapshot().status,'stopped');f.tick(100);assert.equal(f.p.snapshot().status,'stopped');assert.equal(starts(f.owner.effects).filter(e=>e.component==='engine').length,1);
});

test('future owners can reject previously drained effects after lifecycle state changes',()=>{
 const f=fixture();f.p.start();const start=f.p.takeEffects().find(e=>e.type==='start');assert.equal(f.p.isEffectCurrent(start),true);assert.equal(f.p.isEffectCurrent({...start,command:'sh'}),false);f.p.stop();assert.equal(f.p.isEffectCurrent(start),false);
 const stop=f.p.takeEffects().find(e=>e.type==='stop');assert.equal(f.p.isEffectCurrent(stop),true);f.clock.advance(5);f.p.tick();assert.equal(f.p.isEffectCurrent(stop),false);
});

test('late readiness at the exact startup deadline cannot resurrect the timed-out generation',()=>{
 const f=fixture();f.p.start();f.owner.drain();f.clock.advance(10);assert.equal(f.owner.ready('outerWayland'),false);assert.equal(f.p.snapshot().components.outerWayland.phase,'stopping');
});

test('an engine heartbeat timeout stops the shell first while retaining healthy outer Wayland',()=>{
 const f=fixture({heartbeatIntervalMs:5});running(f);let probes=f.tick(5).filter(e=>e.type==='probe');
 for(const probe of probes.filter(e=>e.component!=='engine'))f.owner.event(probe.component,'heartbeat',{probeId:probe.probeId});
 probes=f.tick(5).filter(e=>e.type==='probe');for(const probe of probes)f.owner.event(probe.component,'heartbeat',{probeId:probe.probeId});
 const effects=f.tick(5);assert.deepEqual(effects.filter(e=>e.type==='stop').map(e=>e.component),['shell']);assert.equal(f.p.snapshot().components.outerWayland.ready,true);assert.equal(f.p.snapshot().components.engine.ready,false);
});

test('a delayed scheduler grants a fresh challenge its full response window',()=>{
 const f=fixture({heartbeatIntervalMs:5,heartbeatTimeoutMs:10});running(f);const probes=f.tick(20).filter(e=>e.type==='probe');assert.equal(probes.length,3);assert.equal(f.p.snapshot().status,'running');assert.ok(Object.values(f.p.snapshot().components).every(s=>s.probe.deadlineAt===30));
 for(const probe of probes.filter(e=>e.component!=='shell'))f.owner.event(probe.component,'heartbeat',{probeId:probe.probeId});
 f.tick(9);assert.equal(f.p.snapshot().components.shell.ready,true);f.tick(1);assert.equal(f.p.snapshot().components.shell.phase,'stopping');
});

test('recovery immediately invalidates operational presentation until independently confirmed',()=>{
 const f=fixture();running(f);const id=f.p.snapshot().presentation.presentationId;f.p.handle({type:'presented',owner:'appliance-presenter',presentationId:id});f.owner.event('shell','exited');
 const presentation=f.p.snapshot().presentation;assert.equal(presentation.screen,'recovery');assert.equal(presentation.confirmed,false);assert.notEqual(presentation.presentationId,id);assert.equal(f.p.handle({type:'presented',owner:'appliance-presenter',presentationId:id}),false);
});

test('manual shutdown suppresses startup and health failures while waiting for child stop',()=>{
 const f=fixture({heartbeatIntervalMs:1,heartbeatTimeoutMs:1,stopTimeoutMs:10});running(f);f.tick(1);f.p.stop();f.owner.drain();f.tick(1);assert.equal(f.p.snapshot().status,'stopping');assert.equal(f.p.snapshot().components.outerWayland.failures,0);f.owner.event('shell','stopped');f.owner.event('engine','stopped');f.owner.event('outerWayland','stopped');assert.equal(f.p.snapshot().status,'stopped');
});

test('effect drain discards superseded stop modes',()=>{
 const f=fixture();running(f);f.p.handle({type:'failed',component:'shell',generation:f.owner.generations.shell});f.clock.advance(5);f.p.tick();const effects=f.p.takeEffects();assert.deepEqual(effects.filter(e=>e.type==='stop').map(e=>e.mode),['force']);
});

test('stopping invalidates pending presentation and malformed effect checks are harmless',()=>{
 const f=fixture();const malformed={type:'present',owner:'appliance-presenter',screen:'shell',reason:null,presentationId:undefined,confirmed:false};assert.equal(f.p.isEffectCurrent(malformed),false);
 f.p.start();const presentation=f.p.takeEffects().find(e=>e.type==='present');f.p.stop();assert.equal(f.p.isEffectCurrent(presentation),false);assert.equal(f.p.snapshot().presentation,null);assert.equal(f.p.takeEffects().filter(e=>e.type==='present').length,0);
});

test('readiness and matching health responses do not replenish the retry budget',()=>{
 const f=fixture({heartbeatIntervalMs:1});running(f);f.owner.event('shell','exited');f.tick(2);f.owner.ready('shell');const probes=f.tick(1).filter(e=>e.type==='probe');for(const probe of probes)f.owner.event(probe.component,'heartbeat',{probeId:probe.probeId});assert.equal(f.p.snapshot().components.shell.failures,1);
});
