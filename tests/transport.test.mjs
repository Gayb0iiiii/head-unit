import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {CoreTransport} from '../src/transport.mjs';import {encode,Decoder} from '../src/protocol.mjs';
class Socket extends EventEmitter{writes=[];write(b){this.writes.push(b);return true}destroy(){this.emit('close')}}
test('local-only transport sends hello, receives state, and isolates old socket events',()=>{const sockets=[];const t=new CoreTransport('/run/user/1000/livi/core.sock',()=>{const s=new Socket();sockets.push(s);return s});t.connect();sockets[0].emit('connect');assert.equal(new Decoder().push(sockets[0].writes[0])[0].type,'hello');sockets[0].emit('data',encode({type:'welcome',protocol:8,rev:0,state:{front:{main:'livi'}}}));assert.equal(t.session.ready,true);t.reconnect();sockets[0].emit('data',encode({type:'welcome',protocol:8,rev:99,state:{}}));assert.equal(t.session.ready,false);sockets[1].emit('connect');assert.equal(sockets[1].writes.length,1);t.close();assert.equal(t.session.state,null);});
test('unsafe target and corrupt peer are rejected without exposing TCP',()=>{assert.throws(()=>new CoreTransport('ws://localhost:4000'));const socket=new Socket();const t=new CoreTransport('/tmp/livi-test/core.sock',()=>socket);t.connect();socket.emit('connect');const b=Buffer.alloc(4);b.writeUInt32LE(17000000);socket.emit('data',b);assert.equal(t.session.ready,false);assert.match(t.error,/frame/);});
test('backpressure blocks further writes until drain',()=>{const socket=new Socket();let allow=false;socket.write=function(b){this.writes.push(b);return allow};const t=new CoreTransport('/tmp/livi-test/core.sock',()=>socket);t.connect();socket.emit('connect');socket.emit('data',encode({type:'welcome',protocol:8,rev:0,state:{}}));assert.throws(()=>t.session.action({kind:'nextDevice'}),/backpressure/);assert.equal(socket.writes.length,1);allow=true;socket.emit('drain');assert.doesNotThrow(()=>t.session.action({kind:'nextDevice'}));assert.equal(socket.writes.length,2);t.close();});

class Clock {
 now=0;nextId=1;timers=new Map();cancelled=[];
 setTimeout(fn,delay){const id=this.nextId++;this.timers.set(id,{fn,at:this.now+delay});return id;}
 clearTimeout(id){const timer=this.timers.get(id);if(timer)this.cancelled.push(timer.fn);this.timers.delete(id);}
 tick(ms){const end=this.now+ms;while(true){const next=[...this.timers.entries()].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!next)break;this.now=next[1].at;this.timers.delete(next[0]);next[1].fn();}this.now=end;}
}
function lifecycle(options={}) {
 const clock=new Clock();const sockets=[];
 const transport=new CoreTransport('/tmp/livi-test/core.sock',()=>{const socket=new Socket();sockets.push(socket);return socket;},{clock,connectTimeoutMs:20,handshakeTimeoutMs:30,actionTimeoutMs:40,reconnectInitialMs:5,reconnectMaxMs:12,...options});
 return {clock,sockets,transport};
}
const welcome={type:'welcome',protocol:8,rev:0,state:{config:{huVolume:.5}}};
function synchronize(socket){socket.emit('connect');socket.emit('data',encode(welcome));}
function messages(socket){return new Decoder().push(Buffer.concat(socket.writes));}

test('managed lifecycle is opt-in and connect deadline disables one-shot sessions',()=>{
 const {transport:t,clock,sockets}=lifecycle();
 clock.tick(100);assert.equal(sockets.length,0);
 t.connect();assert.equal(t.snapshot().status,'connecting');
 clock.tick(20);assert.equal(t.snapshot().status,'error');assert.match(t.error,/connect.*timed out/i);assert.equal(t.session.ready,false);assert.equal(t.socket,null);
 clock.tick(100);assert.equal(sockets.length,1);assert.equal(clock.timers.size,0);
});

test('managed connection failures use capped exponential reconnect delays',()=>{
 const {transport:t,clock,sockets}=lifecycle();t.start();
 for(const [index,delay] of [5,10,12,12].entries()){
  sockets[index].emit('error',new Error('unavailable'));
  assert.equal(t.snapshot().status,'backoff');assert.equal(t.snapshot().retryInMs,delay);assert.equal(t.snapshot().retryAttempt,index+1);
  clock.tick(delay-1);assert.equal(sockets.length,index+1);clock.tick(1);assert.equal(sockets.length,index+2);
 }
 t.stop();assert.equal(clock.timers.size,0);
});

test('handshake deadline starts at connection and a ready welcome cancels it',()=>{
 const {transport:t,clock,sockets}=lifecycle();t.start();clock.tick(19);sockets[0].emit('connect');
 assert.equal(t.snapshot().status,'handshaking');clock.tick(29);assert.equal(sockets.length,1);assert.equal(t.socket,sockets[0]);
 clock.tick(1);assert.equal(t.snapshot().status,'backoff');assert.match(t.error,/handshake.*timed out/i);
 clock.tick(5);synchronize(sockets[1]);assert.equal(t.snapshot().status,'ready');assert.equal(clock.timers.size,0);
 clock.tick(100);assert.equal(t.session.ready,true);t.stop();
});

test('successful synchronization resets retry delay and a later disconnect retries fresh',()=>{
 const {transport:t,clock,sockets}=lifecycle();t.start();sockets[0].emit('error',new Error('unavailable'));clock.tick(5);
 sockets[1].emit('error',new Error('unavailable'));clock.tick(10);synchronize(sockets[2]);
 assert.equal(t.snapshot().retryAttempt,0);sockets[2].emit('close');assert.equal(t.snapshot().retryInMs,5);clock.tick(5);
 assert.equal(sockets.length,4);assert.equal(t.session.ready,false);assert.equal(sockets[3].writes.length,0);t.stop();
});

test('action reply deadline reports unknown outcome, drops pending commands, and never replays',()=>{
 const {transport:t,clock,sockets}=lifecycle();t.start();synchronize(sockets[0]);
 const id=t.action({kind:'nextDevice'});assert.equal(t.snapshot().pending,1);clock.tick(39);assert.equal(t.session.pending.has(id),true);
 clock.tick(1);assert.equal(t.snapshot().status,'backoff');assert.match(t.error,/reply.*timed out/i);assert.match(t.error,/outcome unknown/i);assert.equal(t.session.pending.size,0);assert.equal(t.session.state,null);
 clock.tick(5);synchronize(sockets[1]);assert.deepEqual(messages(sockets[1]).map(m=>m.type),['hello']);t.stop();
});

test('only a matching reply cancels an action deadline, including direct session actions',()=>{
 const {transport:t,clock,sockets}=lifecycle();t.connect();synchronize(sockets[0]);
 const id=t.session.action({kind:'nextDevice'});clock.tick(10);sockets[0].emit('data',encode({type:'reply',id:id+1}));assert.equal(clock.timers.size,1);
 sockets[0].emit('data',encode({type:'reply',id,error:'not connected'}));assert.equal(clock.timers.size,0);assert.equal(t.snapshot().pending,0);assert.equal(t.snapshot().error,'not connected');clock.tick(100);assert.equal(t.session.ready,true);t.stop();
});

test('stop cancels retry, connection, handshake and action timers without stale callbacks',()=>{
 for(const stage of ['connecting','handshaking','ready','backoff']){
  const {transport:t,clock,sockets}=lifecycle();t.start();
  if(stage==='handshaking')sockets[0].emit('connect');
  if(stage==='ready'){synchronize(sockets[0]);t.action({kind:'nextDevice'});}
  if(stage==='backoff')sockets[0].emit('error',new Error('offline'));
  t.stop();assert.equal(clock.timers.size,0);assert.equal(t.snapshot().status,'stopped');assert.equal(t.snapshot().managed,false);
  for(const fn of [...clock.cancelled])fn();clock.tick(100);sockets[0].emit('connect');sockets[0].emit('data',encode(welcome));sockets[0].emit('error',new Error('late'));
  assert.equal(sockets.length,1);assert.equal(t.socket,null);assert.equal(t.session.ready,false);assert.equal(t.snapshot().status,'stopped');
 }
});

test('old generation timers, replies and disconnects cannot alter a replacement session',()=>{
 const {transport:t,clock,sockets}=lifecycle();t.start();synchronize(sockets[0]);const oldId=t.action({kind:'nextDevice'});t.start();synchronize(sockets[1]);const id=t.action({kind:'nextDevice'});
 for(const fn of [...clock.cancelled])fn();sockets[0].emit('data',encode({type:'reply',id}));sockets[0].emit('close');sockets[0].emit('error',new Error('late'));
 assert.equal(t.snapshot().status,'ready');assert.equal(t.session.pending.has(id),true);assert.notEqual(id,oldId);assert.equal(sockets.length,2);t.stop();
});

test('refusal and incompatible welcome end managed retry until explicitly restarted',()=>{
 for(const message of [{type:'refused',reason:'protocol mismatch'},{...welcome,protocol:9}]){
  const {transport:t,clock,sockets}=lifecycle();t.start();sockets[0].emit('connect');sockets[0].emit('data',Buffer.concat([encode(message),encode(welcome)]));
  assert.equal(t.snapshot().status,'refused');assert.equal(t.snapshot().managed,false);assert.equal(t.socket,null);assert.equal(t.session.ready,false);assert.equal(clock.timers.size,0);
  clock.tick(1000);assert.equal(sockets.length,1);t.start();assert.equal(sockets.length,2);synchronize(sockets[1]);assert.equal(t.snapshot().status,'ready');assert.equal(t.error,null);assert.equal(t.snapshot().error,null);t.stop();
 }
});

test('resync invalidates pending deadlines and requires a bounded new snapshot',()=>{
 const {transport:t,clock,sockets}=lifecycle();t.start();synchronize(sockets[0]);t.action({kind:'nextDevice'});clock.tick(20);
 sockets[0].emit('data',encode({type:'patch',rev:3,ops:[]}));assert.equal(t.snapshot().status,'resyncing');assert.equal(t.snapshot().pending,0);assert.equal(clock.timers.size,1);
 clock.tick(29);assert.equal(t.snapshot().status,'resyncing');clock.tick(1);assert.equal(t.snapshot().status,'backoff');assert.match(t.error,/handshake.*timed out/i);t.stop();
});

test('status subscribers receive detached snapshots and cannot break transport handling',()=>{
 const {transport:t,sockets}=lifecycle();const events=[];const unsubscribe=t.subscribe(snapshot=>events.push(snapshot));
 t.subscribe(snapshot=>{if(snapshot.state)snapshot.state.config.huVolume=999;throw new Error('broken view')});
 t.start();synchronize(sockets[0]);assert.deepEqual(events.map(s=>s.status),['idle','connecting','handshaking','ready']);assert.equal(t.session.state.config.huVolume,.5);
 const snapshot=t.snapshot();snapshot.state.config.huVolume=999;assert.equal(t.session.state.config.huVolume,.5);
 sockets[0].emit('data',encode({type:'patch',rev:1,ops:[{op:'set',path:['config','huVolume'],value:.7}]}));assert.equal(events.at(-1).state.config.huVolume,.7);assert.equal(events.at(-2).state.config.huVolume,.5);
 unsubscribe();const count=events.length;t.stop();assert.equal(events.length,count);
});

test('synchronous socket creation and hello-write failures follow managed backoff',()=>{
 const clock=new Clock();const t=new CoreTransport('/tmp/livi-test/core.sock',()=>{throw new Error('connect failed')},{clock,connectTimeoutMs:20,handshakeTimeoutMs:30,actionTimeoutMs:40,reconnectInitialMs:5,reconnectMaxMs:12});
 assert.doesNotThrow(()=>t.start());assert.equal(t.snapshot().status,'backoff');assert.equal(t.snapshot().retryInMs,5);t.stop();
 const f=lifecycle();f.transport.start();f.sockets[0].write=()=>{throw new Error('write failed')};assert.doesNotThrow(()=>f.sockets[0].emit('connect'));assert.equal(f.transport.snapshot().status,'backoff');f.transport.stop();
});

test('explicit connect and reconnect leave managed mode and cancel scheduled retry',()=>{
 const {transport:t,clock,sockets}=lifecycle();t.start();sockets[0].emit('error',new Error('offline'));t.reconnect();assert.equal(t.snapshot().managed,false);synchronize(sockets[1]);clock.tick(100);assert.equal(sockets.length,2);sockets[1].emit('close');clock.tick(100);assert.equal(sockets.length,2);assert.equal(clock.timers.size,0);t.close();
});

test('lifecycle settings reject invalid durations and retry bounds before connecting',()=>{
 for(const options of [{connectTimeoutMs:0},{handshakeTimeoutMs:Infinity},{actionTimeoutMs:-1},{reconnectInitialMs:10,reconnectMaxMs:5},{reconnectMaxMs:2**31},{clock:{}}])assert.throws(()=>lifecycle(options),/clock|duration|timeout|reconnect/i);
});

test('cleared deadlines cannot fire later within the same connection generation',()=>{
 const {transport:t,clock,sockets}=lifecycle();t.start();synchronize(sockets[0]);const id=t.action({kind:'nextDevice'});sockets[0].emit('data',encode({type:'reply',id}));
 for(const fn of [...clock.cancelled])fn();assert.equal(t.snapshot().status,'ready');assert.equal(t.session.ready,true);assert.equal(clock.timers.size,0);t.stop();
});

test('a subscriber may stop a connecting lifecycle before socket creation',()=>{
 const {transport:t,clock,sockets}=lifecycle();t.subscribe(snapshot=>{if(snapshot.status==='connecting')t.stop()});t.start();
 assert.equal(t.snapshot().status,'stopped');assert.equal(sockets.length,0);assert.equal(clock.timers.size,0);
});

test('late cancellation callbacks cannot replace a newer action deadline',()=>{
 const {transport:t,clock,sockets}=lifecycle();t.start();synchronize(sockets[0]);const first=t.action({kind:'nextDevice'});
 sockets[0].emit('data',encode({type:'reply',id:first}));const cancelled=[...clock.cancelled];const second=t.action({kind:'nextDevice'});
 for(const fn of cancelled)fn();assert.equal(t.session.pending.has(second),true);assert.equal(t.snapshot().status,'ready');clock.tick(40);assert.equal(t.snapshot().status,'backoff');t.stop();
});

test('a synchronous action-write error disables readiness and schedules a fresh managed connection',()=>{
 const {transport:t,clock,sockets}=lifecycle();t.start();synchronize(sockets[0]);sockets[0].write=()=>{throw new Error('write failed')};
 assert.throws(()=>t.action({kind:'nextDevice'}),/write failed/);assert.equal(t.session.ready,false);assert.equal(t.session.pending.size,0);assert.equal(t.snapshot().status,'backoff');
 clock.tick(5);synchronize(sockets[1]);assert.deepEqual(messages(sockets[1]).map(m=>m.type),['hello']);t.stop();
});

test('a synchronous socket error during write cannot leave an action timer in a newer generation',()=>{
 const {transport:t,clock,sockets}=lifecycle();t.start();synchronize(sockets[0]);sockets[0].write=()=>{sockets[0].emit('error',new Error('write failed'));return true;};
 assert.throws(()=>t.action({kind:'nextDevice'}),/socket|connection/i);assert.equal(t.snapshot().status,'backoff');assert.equal(clock.timers.size,1);
 clock.tick(5);synchronize(sockets[1]);clock.tick(100);assert.equal(t.snapshot().status,'ready');assert.equal(t.session.pending.size,0);t.stop();
});

test('explicitly managed retries keep a standalone process alive until stop',async()=>{
 const {spawnSync}=await import('node:child_process');
 const transportUrl=new URL('../src/transport.mjs',import.meta.url).href;
 const script=`import {EventEmitter} from 'node:events';import {CoreTransport} from ${JSON.stringify(transportUrl)};class Socket extends EventEmitter{destroy(){this.emit('close')}}const t=new CoreTransport('/tmp/no-real-connection/core.sock',()=>new Socket(),{connectTimeoutMs:5,reconnectInitialMs:5,reconnectMaxMs:5});let attempts=0;t.subscribe(s=>{if(s.status==='backoff'&&++attempts===2){t.stop();process.stdout.write('stopped after retry');}});t.start();`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',timeout:2000});
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'stopped after retry');
});

test('backpressure during revision-gap resync retries managed sessions without replaying the accepted action',()=>{
 const {transport:t,clock,sockets}=lifecycle();t.start();synchronize(sockets[0]);
 sockets[0].write=function(frame){this.writes.push(frame);return false;};
 const id=t.action({kind:'setConfig',patch:{huVolume:.8}});assert.equal(t.session.pending.has(id),true);assert.equal(t.backpressured,true);
 sockets[0].emit('data',encode({type:'patch',rev:3,ops:[]}));
 assert.equal(t.snapshot().status,'backoff');assert.equal(t.snapshot().managed,true);assert.match(t.error,/backpressure/i);assert.equal(t.session.ready,false);assert.equal(t.session.pending.size,0);assert.equal(clock.timers.size,1);
 clock.tick(5);synchronize(sockets[1]);assert.deepEqual(messages(sockets[1]).map(m=>m.type),['hello']);assert.equal(t.snapshot().status,'ready');t.stop();
});

test('backpressure during resync never opts a one-shot connection into retries',()=>{
 const {transport:t,clock,sockets}=lifecycle();t.connect();synchronize(sockets[0]);sockets[0].write=()=>false;t.action({kind:'nextDevice'});
 sockets[0].emit('data',encode({type:'patch',rev:3,ops:[]}));assert.equal(t.snapshot().status,'error');assert.equal(t.snapshot().managed,false);assert.equal(t.session.ready,false);assert.equal(clock.timers.size,0);clock.tick(100);assert.equal(sockets.length,1);t.stop();
});

test('corrupt frames remain terminal in managed mode instead of reconnecting forever',()=>{
 const {transport:t,clock,sockets}=lifecycle();t.start();synchronize(sockets[0]);const corrupt=Buffer.alloc(4);corrupt.writeUInt32LE(17000000);sockets[0].emit('data',corrupt);
 assert.equal(t.snapshot().status,'error');assert.equal(t.snapshot().managed,false);assert.equal(clock.timers.size,0);clock.tick(100);assert.equal(sockets.length,1);t.stop();
});
test('one bounded cancellation frame may drain held touches during backpressure without replay',()=>{const socket=new Socket();socket.write=function(b){this.writes.push(b);return false};const t=new CoreTransport('/tmp/livi-test/core.sock',()=>socket);t.connect();socket.emit('connect');socket.emit('data',encode({type:'welcome',protocol:8,rev:0,state:{}}));const points=[{id:0,x:.1,y:.2,phase:'cancel'}];assert.doesNotThrow(()=>t.session.pointer(points));assert.throws(()=>t.session.pointer(points),/backpressure/);assert.equal(socket.writes.length,2);t.close();});

for(const phase of ['welcome','patch'])test(`malformed GNSS ${phase} preserves managed transport and subsequent reconnect`,()=>{
 const {transport:t,clock,sockets}=lifecycle();
 try{
  t.start();const socket=sockets[0];
  const telemetry={gnss:{connected:true,updatedAt:{toString:null}}};
  if(phase==='welcome'){
   socket.emit('connect');socket.emit('data',encode({...welcome,state:{telemetry}}));
  }else{
   synchronize(socket);socket.emit('data',encode({type:'patch',rev:1,ops:[{op:'set',path:['telemetry'],value:telemetry}]}));
  }
  assert.equal(t.snapshot().status,'ready');assert.equal(t.snapshot().managed,true);assert.equal(t.error,null);
  socket.emit('data',encode({type:'patch',rev:t.session.rev+1,ops:[{op:'set',path:['config'],value:{huVolume:.25}}]}));
  assert.equal(t.session.state.config.huVolume,.25);
  socket.emit('close');assert.equal(t.snapshot().status,'backoff');clock.tick(5);
  assert.equal(sockets.length,2);synchronize(sockets[1]);assert.equal(t.snapshot().status,'ready');
 }finally{t.stop();}
});
