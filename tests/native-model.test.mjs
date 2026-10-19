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

test('native phone switching waits for observed active phone and never invents a device', async () => {
  const host = bridge();
  const model = new NativeHeadunit(undefined, host, () => {});
  await model.start();
  assert.deepEqual(model.state.phones, []);
  host.emit({connected:true,route:'phones',front:'livi',phones:[
    {id:'one',name:'Driver',status:'active'}, {id:'two',name:'Passenger',status:'available'}
  ]});
  model.connect('two');
  assert.deepEqual(host.calls, [['selectPhone','two']]);
  assert.equal(model.state.activePhone,'one');
  host.emit({connected:true,route:'phones',front:'livi',phones:[
    {id:'one',name:'Driver',status:'available'}, {id:'two',name:'Passenger',status:'active'}
  ]});
  assert.equal(model.state.activePhone,'two');
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
  host.emit({connected:true,route:'phones',front:'livi',phones:[{id:'two',name:'Passenger',status:'available'}]});
  resolveInitial({connected:false,route:'disconnected',phones:[]});
  await starting;
  assert.equal(model.state.screen,'phones');
  model.connect('two');
  model.home();
  host.emit({connected:true,route:'home',front:'livi',phones:[{id:'two',name:'Passenger',status:'active'}]});
  assert.deepEqual(host.calls,[['selectPhone','two'],['navigate','home']]);
  model.stop();
});

test('rejected selection cannot navigate when that phone later becomes active independently', async () => {
  const host = bridge();
  host.selectPhone = async () => { throw Error('core rejected'); };
  const model = new NativeHeadunit(undefined, host, () => {});
  await model.start();
  host.emit({connected:true,route:'phones',front:'livi',phones:[{id:'two',name:'Passenger',status:'available'}]});
  model.connect('two');
  await Promise.resolve();
  await Promise.resolve();
  host.emit({connected:true,route:'phones',front:'livi',phones:[{id:'two',name:'Passenger',status:'active'}]});
  assert.equal(model.state.commandError,true);
  assert.deepEqual(host.calls,[]);
  model.stop();
});

test('opening the already observed active phone requests projection without another selection', async () => {
  const host = bridge();
  const model = new NativeHeadunit(undefined, host, () => {});
  await model.start();
  host.emit({connected:true,route:'phones',front:'livi',phones:[{id:'one',name:'Driver',status:'active'}]});
  model.connect('one');
  assert.deepEqual(host.calls,[['navigate','projection']]);
  model.stop();
});
