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
async function fixture(t,saved={route:'phones'}) {
 const socket=new EventEmitter(), messages=[];
 socket.write=frame=>{messages.push(...new Decoder().push(frame));return true;};
 socket.destroy=()=>socket.emit('close');
 const transport=new CoreTransport('/tmp/test/core.sock',()=>socket);
 const preferences=[];
 const controller=new HeadunitController(transport,{load:()=>saved,save:value=>preferences.push(structuredClone(value))});
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
 return {model,controller,transport,actions,reply,patch,activate,ready,results,api,preferences};
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

test('Home metadata and explicit pause cross real bridge; native rejection is sanitized',async t=>{
 const f=await fixture(t);
 f.patch([{op:'set',path:['sessions','active'],value:'carplay'},{op:'set',path:['nowPlaying'],value:{title:'<script>Track</script>',artist:'Artist',playing:true,artwork:'private-art'}},{op:'set',path:['devices'],value:[{id:'a',status:'active',batteryLevel:50,carrierName:'private-carrier'}]}]);
 assert.equal(f.model.state.homeStatus.media.title,'<script>Track</script>');
 assert.equal(f.model.state.homeStatus.phone.batteryPercent,50);
 assert.doesNotMatch(JSON.stringify(f.model.state),/private-art|private-carrier/);
 f.model.media('pause');const request=f.actions().at(-1);
 assert.deepEqual(request.action,{kind:'media',control:'pause'});
 assert.equal(f.controller.resume,false);assert.equal(f.model.state.homeStatus.media.playing,true,'not optimistic');
 f.reply(request.id,'secret media failure');await flush();assert.equal(f.model.state.commandError,true);
 assert.equal(f.model.state.screen,'phones');assert.equal(f.controller.resume,false);
 f.transport.stop();assert.equal(f.model.state.homeStatus.media.status,'disconnected');
});
test('a stale renderer owner cannot control a different active phone',async t=>{
 const f=await fixture(t);
 f.patch([{op:'set',path:['sessions','active'],value:'carplay'},{op:'set',path:['nowPlaying'],value:{title:'Old owner',playing:true}}]);
 f.activate();
 await assert.rejects(()=>f.api.media('pause','a'),/unavailable/);
 assert.equal(f.actions().filter(m=>m.action.kind==='media').length,0);
});

test('explicit pause wins over an earlier play failure and never changes navigation',async t=>{
 const f=await fixture(t);
 f.patch([{op:'set',path:['sessions','active'],value:'carplay'},{op:'set',path:['nowPlaying'],value:{title:'Track',playing:false}}]);
 f.model.media('play');const play=f.actions().at(-1).id;
 f.model.media('pause');const pause=f.actions().at(-1).id;
 f.reply(play,'old failure');await flush();assert.equal(f.model.state.commandError,false);assert.equal(f.model.state.mediaPending,true);
 f.reply(pause);await flush();assert.equal(f.model.state.mediaPending,false);assert.equal(f.controller.resume,false);
 assert.equal(f.model.state.screen,'phones');assert.deepEqual(f.actions().filter(m=>m.action.kind==='media').map(m=>m.action.control),['play','pause']);
 f.patch([{op:'set',path:['nowPlaying','playing'],value:false}]);
 assert.equal(f.actions().filter(m=>m.action.kind==='media').length,2,'no auto-resume after deliberate pause');
});
test('host rejects expired media and old completion cannot alter a later manual route',async t=>{
 const f=await fixture(t);let now=0;f.transport.session.now=()=>now;
 f.patch([{op:'set',path:['sessions','active'],value:'carplay'},{op:'set',path:['nowPlaying'],value:{title:'Track',playing:true}}]);
 f.model.media('pause');const request=f.actions().at(-1).id;f.model.home();
 f.reply(request,'late failure');await flush();assert.equal(f.model.state.commandError,false);assert.equal(f.model.state.screen,'home');
 now=30001;await assert.rejects(()=>f.api.media('play','a'),/unavailable/);
 assert.equal(f.actions().filter(m=>m.action.kind==='media').length,1);
});

test('malformed native snapshots clear Home data instead of retaining a previous track',async t=>{
 const f=await fixture(t);
 f.patch([{op:'set',path:['sessions','active'],value:'carplay'},{op:'set',path:['nowPlaying'],value:{title:'Previous track',playing:true}}]);
 assert.equal(f.model.state.homeStatus.media.title,'Previous track');
 f.patch([{op:'set',path:['devices'],value:[null,{}, {id:'a',status:'active',batteryLevel:'secret'}]},{op:'set',path:['nowPlaying'],value:{title:{private:'secret'},playing:'yes'}}]);
 assert.equal(f.model.state.homeStatus.media.title,null);
 assert.equal(f.model.state.homeStatus.media.status,'unavailable');
 assert.equal(f.model.state.homeStatus.phone.batteryPercent,null);
});

for(const order of ['state-before-failure','failure-before-state','success-before-state'])test(`explicit pause keeps recovery disarmed despite delayed Play state: ${order}`,async t=>{
 const f=await fixture(t,{route:'phones',lastPhone:'a',resume:false});
 f.patch([{op:'set',path:['sessions','active'],value:'carplay'},{op:'set',path:['nowPlaying'],value:{title:'Track',playing:false}}]);
 f.model.media('play');const play=f.actions().at(-1).id;
 f.model.media('pause');const pause=f.actions().at(-1).id;
 const delayed=()=>f.patch([{op:'set',path:['nowPlaying','playing'],value:true}]);
 if(order==='state-before-failure')delayed();
 f.reply(pause,order==='success-before-state'?undefined:'pause rejected');await flush();
 if(order!=='state-before-failure')delayed();
 f.reply(play);await flush();
 assert.equal(f.controller.resume,false,'delayed Play state must not rearm recovery');
 assert.equal(f.preferences.at(-1).resume,false,'persist explicit pause intent');
 assert.equal(f.model.state.homeStatus.media.playing,true,'show observed playback honestly');
 assert.equal(f.model.state.commandError,order!=='success-before-state');
 assert.equal(f.model.state.screen,'phones');
 // Even a later paused snapshot cannot correlate state to the pause command.
 f.patch([{op:'set',path:['nowPlaying','playing'],value:false}]);delayed();
 assert.equal(f.controller.resume,false);
 f.patch([{op:'set',path:['devices'],value:[{id:'a',status:'offline'}]}]);
 f.patch([{op:'set',path:['devices'],value:[{id:'a',status:'active'}]},{op:'set',path:['nowPlaying','playing'],value:false}]);
 assert.deepEqual(f.actions().filter(m=>m.action.kind==='media').map(m=>m.action.control),['play','pause'],'return must not auto-resume');
 f.model.media('play');const newest=f.actions().at(-1).id;f.reply(newest);delayed();await flush();
 assert.equal(f.controller.resume,true,'a newer explicit Play supersedes pause intent');
 assert.equal(f.preferences.at(-1).resume,true);
});

test('actual transport phases cross both filters and preload without raw errors or stale phones',async t=>{
 const f=await fixture(t);
 assert.equal(f.model.state.connectionPhase,'ready');
 f.transport.start();assert.equal(f.model.state.connectionPhase,'connecting');
 f.transport.socket.emit('connect');assert.equal(f.model.state.connectionPhase,'handshaking');
 f.transport.socket.emit('error',new Error('secret path and credentials'));
 assert.equal(f.model.state.connectionPhase,'backoff');
 assert.equal(f.model.state.connected,false);assert.deepEqual(f.model.state.phones,[]);
 assert.doesNotMatch(JSON.stringify(await f.api.getView()),/secret|credentials/);
 f.transport.stop();assert.equal(f.model.state.connectionPhase,'stopped');
 f.transport.connect();f.transport.socket.emit('connect');
 f.transport.socket.emit('data',encode({type:'refused',reason:'secret refusal'}));
 assert.equal(f.model.state.connectionPhase,'refused');
 assert.doesNotMatch(JSON.stringify(await f.api.getView()),/secret/);
 f.transport.connect();f.transport.socket.emit('connect');
 f.transport.socket.emit('data',encode({type:'welcome',protocol:8,rev:0,state:{front:{main:'livi'},devices:[],sessions:{active:null}}}));
 assert.equal(f.model.state.connectionPhase,'ready');assert.equal(f.model.state.screen,'phones');
 assert.equal(f.model.state.connected,true);
});
