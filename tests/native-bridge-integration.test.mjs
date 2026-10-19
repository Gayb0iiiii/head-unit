import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {CoreTransport} from '../src/transport.mjs';
import {encode,Decoder} from '../src/protocol.mjs';
import {HeadunitController} from '../src/controller.mjs';
import {NativeHeadunit} from '../src/native-model.mjs';
import {attachHeadunitBoundary} from '../electron/main-boundary.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(t) {
 const socket=new EventEmitter(), messages=[];
 socket.write=frame=>{messages.push(...new Decoder().push(frame));return true;};
 socket.destroy=()=>socket.emit('close');
 const transport=new CoreTransport('/tmp/test/core.sock',()=>socket);
 const controller=new HeadunitController(transport,{load:()=>({route:'phones'})});
 transport.connect();socket.emit('connect');
 const state={front:{main:'livi'},devices:[{id:'a',status:'active'},{id:'b',status:'available'}],sessions:{active:null}};
 socket.emit('data',encode({type:'welcome',protocol:8,rev:0,state}));
 let rev=0;
 const patch=ops=>socket.emit('data',encode({type:'patch',rev:++rev,ops}));
 const handlers=new Map(), ipc=new EventEmitter(), contents=new EventEmitter();
 const url='file:///headunit/index.html';
 Object.assign(contents,{mainFrame:{url},getURL:()=>url,isDestroyed:()=>false,send:(channel,view)=>ipc.emit(channel,{},view)});
 const event={sender:contents,senderFrame:contents.mainFrame};
 const detach=attachHeadunitBoundary({ipcMain:{handle:(c,f)=>handlers.set(c,f),removeHandler:c=>handlers.delete(c)},trustedWindow:{webContents:contents},trustedUrl:url,controller});
 const results=[];
 ipc.invoke=async(channel,...args)=>{try {const value=await handlers.get(channel)(event,...args);results.push(value);return value;}catch(error){results.push(error.message);throw error;}};
 let api;
 vm.runInNewContext(await readFile(new URL('../electron/preload.cjs',import.meta.url),'utf8'),{require:()=>({ipcRenderer:ipc,contextBridge:{exposeInMainWorld:(_name,value)=>{api=value;}}}),window:{addEventListener(){}}});
 const model=new NativeHeadunit(undefined,api);
 await model.start();
 t.after(()=>{model.stop();detach();controller.dispose();transport.stop();});
 const actions=()=>messages.filter(m=>m.type==='action');
 const reply=(id,error)=>socket.emit('data',encode({type:'reply',id,...(error?{error}: {})}));
 const activate=()=>patch([{op:'set',path:['devices'],value:[{id:'a',status:'available'},{id:'b',status:'active'}]}]);
 const ready=()=>patch([{op:'set',path:['sessions','active'],value:{id:'session'}}]);
 return {model,controller,transport,actions,reply,patch,activate,ready,results};
}
test('native reply failure crosses real session/controller/IPC/preload without leaking errors or stale selection',async t=>{
 const f=await fixture(t); f.model.connect('b'); const id=f.actions().at(-1).id;
 f.reply(id+999,'unrelated');await flush();assert.equal(f.model.pendingPhone,'b');
 f.reply(id,'secret native failure');await flush();
 assert.equal(f.model.pendingPhone,null);assert.equal(f.model.state.commandError,true);
 assert.equal(f.controller.pendingChoice,null);
 assert.ok(f.results.includes('Headunit operation unavailable'));
 assert.ok(!JSON.stringify(f.results).includes('secret native'));
 f.activate();f.ready();await flush();
 assert.equal(f.actions().filter(m=>m.action.kind==='show').length,0);
});
for(const order of ['active-first','ready-first','reply-last'])test(`selection waits for reply, active device and session readiness: ${order}`,async t=>{
 const f=await fixture(t);f.model.connect('b');const id=f.actions().at(-1).id;
 if(order!=='reply-last'){f.reply(id);await flush();}
 if(order==='ready-first'){f.ready();f.activate();}else{f.activate();assert.equal(f.actions().filter(m=>m.action.kind==='show').length,0);f.ready();}
 if(order==='reply-last'){assert.equal(f.actions().filter(m=>m.action.kind==='show').length,0);f.reply(id);}
 await flush();assert.equal(f.actions().filter(m=>m.action.kind==='show'&&m.action.front==='projection').length,1);
 f.ready();await flush();assert.equal(f.actions().filter(m=>m.action.kind==='show').length,1);
});
for(const interruption of ['home','camera','cluster','disconnect'])test(`interrupted selection cannot navigate later: ${interruption}`,async t=>{
 const f=await fixture(t);f.model.connect('b');const id=f.actions().at(-1).id;
 if(interruption==='home')f.model.home();
 else if(interruption==='disconnect')f.transport.stop();
 else f.patch([{op:'set',path:['front','main'],value:interruption}]);
 f.reply(id,'late failure');await flush();assert.equal(f.model.pendingPhone,null);
 assert.equal(f.model.state.commandError,false);
 if(interruption!=='disconnect'){f.activate();f.ready();}
 await flush();assert.equal(f.actions().filter(m=>m.action.kind==='show').length,0);
});

test('older selection reply cannot clear or fail the newer selection',async t=>{
 const f=await fixture(t);f.model.connect('b');const old=f.actions().at(-1).id;
 f.model.connect('b');const current=f.actions().at(-1).id;
 f.reply(old,'older rejected');await flush();
 assert.equal(f.model.pendingPhone,'b');assert.equal(f.model.state.commandError,false);
 assert.equal(f.controller.pendingChoice,'b');
 f.reply(current);await flush();f.activate();f.ready();await flush();
 assert.equal(f.actions().filter(m=>m.action.kind==='show').length,1);
 assert.equal(f.transport.session.completions.size,0);
});

test('resync settles selection as unavailable and ignores a late reply',async t=>{
 const f=await fixture(t);f.model.connect('b');const id=f.actions().at(-1).id;
 f.transport.session.receive({type:'patch',rev:999,ops:[]});
 await flush();assert.equal(f.model.pendingPhone,null);assert.equal(f.model.state.commandError,true);
 assert.equal(f.transport.session.completions.size,0);
 f.reply(id);await flush();assert.equal(f.model.pendingPhone,null);
});
