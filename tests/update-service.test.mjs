import test from 'node:test';
import assert from 'node:assert/strict';
import {createUpdateService} from '../electron/update-service.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('update needs parked confirmation, is single flight, and leaves old app available on build failure',async()=>{
  let release,reject,builds=0,activations=0;
  const service=createUpdateService({prepare:()=>{builds++;return new Promise((yes,no)=>{release=yes;reject=no;});},activate:async()=>{activations++;}});
  assert.equal(service.start(false),false);
  assert.equal(builds,0);
  assert.equal(service.start(true),true);
  assert.equal(service.start(true),false);
  reject(Error('build failed'));await tick();
  assert.equal(service.snapshot().phase,'failed');assert.equal(activations,0);
  assert.equal(service.start(true),true);release({status:'current',sha:'a'.repeat(40)});await tick();
  assert.equal(service.snapshot().phase,'current');assert.equal(activations,0);
  service.dispose();
});
test('ready release activates once, while cancellation prevents activation',async()=>{
  let release,activated=[];
  const service=createUpdateService({prepare:signal=>new Promise(resolve=>{release=()=>resolve({status:'ready',sha:'b'.repeat(40)});signal.addEventListener('abort',release);}),activate:async sha=>activated.push(sha)});
  assert.equal(service.start(true),true);assert.equal(service.cancel(),true);await tick();
  assert.equal(service.snapshot().phase,'cancelled');assert.deepEqual(activated,[]);
  assert.equal(service.start(true),true);release();await tick();
  assert.deepEqual(activated,['b'.repeat(40)]);assert.equal(service.snapshot().phase,'restarting');
  service.dispose();
});
test('restored old release reports a failed update until the next explicit check',()=>{
 const service=createUpdateService({prepare:async()=>({status:'current',sha:'a'.repeat(40)}),activate:async()=>{},initialPhase:'failed'});
 assert.equal(service.snapshot().phase,'failed');service.dispose();
});
