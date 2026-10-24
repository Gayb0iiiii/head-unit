import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeHeadunit} from '../src/native-model.mjs';

function bridge() {
  const calls = [];
  let listener;
  return {
    calls,
    onView(callback) { listener = callback; return () => { listener = null; }; },
    getView: async () => ({connected:false, route:'disconnected', phones:[]}),
    navigate: async route => { calls.push(['navigate',route]); return {accepted:true}; },
    selectPhone: async id => { calls.push(['selectPhone',id]); return {accepted:true}; },
    emit(view) { listener?.(view); }
  };
}
test('initial backend absence leaves local settings usable without host commands or an action error',async()=>{
 const host=bridge();const model=new NativeHeadunit(undefined,host);await model.start();
 host.emit({connected:false,connectionPhase:'backoff'});
 assert.equal(model.everConnected,false);assert.equal(model.state.commandError,false);
 assert.equal(model.state.screen,'home');
 model.navigate('settings');assert.equal(model.state.screen,'settings');assert.deepEqual(host.calls,[]);
 host.emit({connected:false,connectionPhase:'backoff'});assert.equal(model.state.screen,'settings');
 model.home();assert.equal(model.state.screen,'home');assert.deepEqual(host.calls,[]);
 model.stop();
});
test('a lost backend is distinguished from initial absence and restores authoritative route on return',async()=>{
 const host=bridge();const model=new NativeHeadunit(undefined,host);await model.start();
 host.emit({connected:true,route:'home',front:'livi',phones:[]});assert.equal(model.everConnected,true);
 model.state.commandError=true;
 host.emit({connected:false,connectionPhase:'backoff',notice:'projection-reconnecting'});assert.equal(model.state.screen,'home');
 assert.equal(model.state.commandError,false);assert.equal(model.state.notice,null);
 model.navigate('settings');host.emit({connected:true,route:'phones',front:'livi',phones:[]});
 assert.equal(model.state.screen,'phones');assert.deepEqual(host.calls,[]);model.stop();
});
test('a failed initial view read is not reported as a failed user action',async()=>{
 const host=bridge();host.getView=async()=>{throw Error('socket unavailable');};
 const model=new NativeHeadunit(undefined,host);await model.start();
 assert.equal(model.state.commandError,false);assert.equal(model.state.screen,'home');model.stop();
});
test('local Radio Bluetooth and Apps routes never call the LIVI navigation bridge',async()=>{
 const host=bridge();const model=new NativeHeadunit(undefined,host);await model.start();
 for(const route of ['radio','bluetooth','apps']){
   model.navigate(route);assert.equal(model.state.screen,route);
   host.emit({connected:false,connectionPhase:'backoff'});assert.equal(model.state.screen,route);
 }
 assert.deepEqual(host.calls,[]);
 host.emit({connected:true,front:'livi',route:'home',phones:[]});assert.equal(model.state.screen,'apps');
 host.emit({connected:true,front:'camera',route:'camera',phones:[]});assert.equal(model.state.screen,'camera');
 model.stop();
});

test('native phone switching waits for observed active phone and never invents a device', async () => {
  const host = bridge();
  const model = new NativeHeadunit(undefined, host, () => {});
  await model.start();
  assert.deepEqual(model.state.phones, []);
  host.emit({connected:true,projectionReady:true,route:'phones',front:'livi',phones:[
    {id:'one',name:'Driver',status:'active'}, {id:'two',name:'Passenger',status:'available'}
  ]});
  model.connect('two');
  assert.deepEqual(host.calls, [['selectPhone','two']]);
  assert.equal(model.state.activePhone,'one');
  host.emit({connected:true,projectionReady:true,route:'phones',front:'livi',phones:[
    {id:'one',name:'Driver',status:'available'}, {id:'two',name:'Passenger',status:'active'}
  ]});
  assert.equal(model.state.activePhone,'two');
  await Promise.resolve();
  assert.deepEqual(host.calls, [['selectPhone','two'],['navigate','projection']]);
  host.emit({connected:false,route:'disconnected',phones:[]});
  assert.equal(model.state.activePhone,null);
  assert.deepEqual(model.state.phones,[]);
  model.stop();
});

test('manual Home cancels a pending phone selection and a late initial snapshot cannot replace a newer view', async () => {
  const host = bridge();
  let resolveInitial;
  host.getView = () => new Promise(resolve => { resolveInitial = resolve; });
  const model = new NativeHeadunit(undefined, host, () => {});
  const starting = model.start();
  host.emit({connected:true,projectionReady:true,route:'phones',front:'livi',phones:[{id:'two',name:'Passenger',status:'available'}]});
  resolveInitial({connected:false,route:'disconnected',phones:[]});
  await starting;
  assert.equal(model.state.screen,'phones');
  model.connect('two');
  model.home();
  host.emit({connected:true,projectionReady:true,route:'home',front:'livi',phones:[{id:'two',name:'Passenger',status:'active'}]});
  assert.deepEqual(host.calls,[['selectPhone','two'],['navigate','home']]);
  model.stop();
});

test('rejected selection cannot navigate when that phone later becomes active independently', async () => {
  const host = bridge();
  host.selectPhone = async () => { throw Error('core rejected'); };
  const model = new NativeHeadunit(undefined, host, () => {});
  await model.start();
  host.emit({connected:true,projectionReady:true,route:'phones',front:'livi',phones:[{id:'two',name:'Passenger',status:'available'}]});
  model.connect('two');
  await Promise.resolve();
  await Promise.resolve();
  host.emit({connected:true,projectionReady:true,route:'phones',front:'livi',phones:[{id:'two',name:'Passenger',status:'active'}]});
  assert.equal(model.state.commandError,true);
  assert.deepEqual(host.calls,[]);
  model.stop();
});

test('opening the already observed active phone requests projection without another selection', async () => {
  const host = bridge();
  const model = new NativeHeadunit(undefined, host, () => {});
  await model.start();
  host.emit({connected:true,projectionReady:true,route:'phones',front:'livi',phones:[{id:'one',name:'Driver',status:'active'}]});
  model.connect('one');
  assert.deepEqual(host.calls,[['navigate','projection']]);
  model.stop();
});

test('native status expires without view traffic and cancels its timer on stop',async()=>{
 let now=0, next=0;const timers=new Map();
 const clock={now:()=>now,setTimeout:(fn,delay)=>{timers.set(++next,{fn,at:now+delay});return next;},clearTimeout:id=>timers.delete(id)};
 const host=bridge();const model=new NativeHeadunit(undefined,host,()=>{},clock);await model.start();
 host.emit({connected:true,route:'home',front:'livi',phones:[{id:'a',status:'active'}],homeStatus:{media:{status:'available',phoneId:'a',title:'Track',playing:false,freshForMs:10}}});
 assert.equal(model.state.homeStatus.media.title,'Track');
 now=10;for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}
 assert.equal(model.state.homeStatus.media.status,'stale');assert.equal(model.state.homeStatus.media.title,null);
 model.stop();assert.equal(timers.size,0);
});

for (const destination of ['phones','dashboard']) test(`native navigation ends layout editing: ${destination}`,async()=>{
  const host=bridge();const model=new NativeHeadunit(undefined,host);await model.start();
  host.emit({connected:true,route:'home',front:'livi',phones:[]});
  model.beginLayoutEdit();
  if(destination==='dashboard')model.setHomeMode('dashboard');else model.navigate(destination);
  assert.equal(model.state.editingLayout,false);
  assert.deepEqual(host.calls,[['navigate',destination]]);
  model.stop();
});

for (const interruption of [
  {connected:false,route:'disconnected',front:'livi'},
  {connected:true,route:'camera',front:'camera'},
  {connected:true,route:'cluster',front:'cluster'},
  {connected:true,route:'projection',front:'projection'},
  {connected:true,route:'phones',front:'livi'},
  {connected:true,route:'dashboard',front:'livi'}
]) test(`native view departure ends layout editing: ${interruption.route}`,async()=>{
  const host=bridge();const model=new NativeHeadunit(undefined,host);await model.start();
  host.emit({connected:true,route:'home',front:'livi',phones:[]});model.beginLayoutEdit();
  host.emit({connected:true,route:'home',front:'livi',phones:[]});
  assert.equal(model.state.editingLayout,true,'same-route status updates preserve editing');
  host.emit({...interruption,phones:[]});
  assert.equal(model.state.editingLayout,false);
  host.emit({connected:true,route:'home',front:'livi',phones:[]});
  assert.equal(model.state.editingLayout,false,'returning Home does not restore editing');
  model.stop();
});
