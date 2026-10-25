import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createHostUpdateService} from '../electron/update-host.mjs';

const old='a'.repeat(40),next='b'.repeat(40);
const env={HEADUNIT_SUPERVISED:'1',HEADUNIT_SOURCE_ROOT:'/source',HEADUNIT_RELEASES_ROOT:'/state/releases',HEADUNIT_ACTIVE_ROOT:'/source',HEADUNIT_ACTIVE_SHA:old};
const tick=()=>new Promise(setImmediate);
test('host updater sends only fixed staged SHA to supervisor and waits for its acknowledgement',async()=>{
 const channel=new EventEmitter(),sent=[];channel.send=(message,callback)=>{sent.push(message);queueMicrotask(()=>{callback?.();channel.emit('message',{kind:'update-ack',id:message.id,accepted:true});});};
 let parameters;
 const service=createHostUpdateService({env,channel,prepare:async value=>{parameters=value;return {status:'ready',sha:next,path:'/state/releases/'+next};}});
 assert.equal(service.start(true),true);await tick();
 assert.equal(parameters.sourceRoot,'/source');assert.equal(parameters.activeSha,old);
 assert.equal(sent.length,1);assert.deepEqual(Object.keys(sent[0]).sort(),['id','kind','sha']);assert.equal(sent[0].sha,next);
 assert.equal(service.snapshot().phase,'restarting');service.dispose();
});
test('denied supervisor activation reports failure and unsupported direct launch exposes no updater',async()=>{
 const channel=new EventEmitter();channel.send=message=>queueMicrotask(()=>channel.emit('message',{kind:'update-ack',id:message.id,accepted:false}));
 const service=createHostUpdateService({env,channel,prepare:async()=>({status:'ready',sha:next})});
 service.start(true);await tick();assert.equal(service.snapshot().phase,'failed');service.dispose();
 assert.equal(createHostUpdateService({env:{...env,HEADUNIT_SUPERVISED:'0'},channel}),null);
 assert.equal(createHostUpdateService({env,channel:new EventEmitter()}),null);
});
