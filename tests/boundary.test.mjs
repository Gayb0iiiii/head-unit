import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import vm from 'node:vm';

const preloadPath = new URL('../electron/preload.cjs', import.meta.url);
const boundaryPath = new URL('../electron/main-boundary.mjs', import.meta.url);
const hostPath = new URL('../electron/host.mjs', import.meta.url);
const runtimePath = new URL('../electron/glass-runtime.mjs', import.meta.url);
const channels = {
  view: 'headunit:view', getView: 'headunit:get-view', navigate: 'headunit:navigate',
  selectPhone: 'headunit:select-phone', setVolume: 'headunit:set-volume',
  touch: 'headunit:touch', cancelTouch: 'headunit:cancel-touch', media: 'headunit:media',
};
const expectedView = {connected:true, front:'livi', phones:[{id:'phone-1', name:'Phone', status:'available'}], volume:0.6, route:'home', preferredRoute:'home', notice:null};
const copy = value => JSON.parse(JSON.stringify(value));
async function moduleAt(path) {
  assert.ok(existsSync(path), `${path.pathname.split('/').at(-1)} must implement the isolated boundary`);
  return import(path.href);
}
async function preload(invoke = async () => expectedView) {
  assert.ok(existsSync(preloadPath), 'preload.cjs must implement the isolated bridge');
  const ipc = new EventEmitter();
  ipc.invoke = invoke;
  const exposed = new Map();
  const lifecycle = new EventEmitter();
  const context = vm.createContext({
    require(name) { assert.equal(name, 'electron'); return {ipcRenderer:ipc, contextBridge:{exposeInMainWorld:(key, api) => exposed.set(key, api)}}; },
    window: {addEventListener:(name, listener) => lifecycle.on(name, listener)},
  });
  vm.runInContext(await readFile(preloadPath, 'utf8'), context, {filename:'preload.cjs'});
  return {api:exposed.get('headunit'), exposed, ipc, lifecycle};
}
function fixture(url = 'file:///opt/headunit/index.html') {
  const handlers = new Map();
  const ipcMain = {handle:(channel, fn) => {assert.ok(!handlers.has(channel)); handlers.set(channel, fn);}, removeHandler:channel => handlers.delete(channel)};
  const wc = new EventEmitter();
  Object.assign(wc, {mainFrame:{url}, currentUrl:url, dead:false, sent:[], getURL(){return this.currentUrl;}, isDestroyed(){return this.dead;}, send(...args){this.sent.push(args);}, setWindowOpenHandler(fn){this.openHandler=fn;}, getLastWebPreferences(){return {preload:preloadPath.pathname, contextIsolation:true, nodeIntegration:false, sandbox:true, webSecurity:true, webviewTag:false};}});
  const window = {webContents:wc};
  const controller = {
    calls:[], listeners:new Set(),
    state:{...copy(expectedView), credentials:'secret', transport:{native:true}},
    view(){this.calls.push(['view']); return this.state;},
    subscribe(fn){this.calls.push(['subscribe']); this.listeners.add(fn); fn(this.state); return () => {this.calls.push(['unsubscribe']); this.listeners.delete(fn);};},
    intent(intent){this.calls.push(['intent', intent]); return {requestId:4, credentials:'must not cross'};},
    emit(){for (const listener of this.listeners) listener(this.state);},
  };
  const event = {sender:wc, senderFrame:wc.mainFrame};
  const call = (channel, args = [], sender = event) => handlers.get(channel)(sender, ...args);
  return {ipcMain, handlers, wc, window, controller, event, call, url};
}

test('actual sandbox preload exposes only narrow methods and fixed IPC channels', async () => {
  const calls=[];
  const {api, exposed} = await preload(async (...args) => {calls.push(copy(args)); return copy(expectedView);});
  assert.deepEqual([...exposed.keys()], ['headunit']);
  assert.deepEqual(Object.keys(api).sort(), ['cancelTouch','getView','media','navigate','onView','selectPhone','setVolume','touch']);
  assert.equal(Object.isFrozen(api), true);
  assert.deepEqual(await api.getView(), expectedView);
  await api.navigate('settings'); await api.selectPhone('phone-1'); await api.setVolume(0.4);
  await api.touch([{id:0,x:0.2,y:0.8,phase:'down'}]); await api.cancelTouch(); await api.media('pause');
  assert.deepEqual(calls, [[channels.getView],[channels.navigate,'settings'],[channels.selectPhone,'phone-1'],[channels.setVolume,0.4],[channels.touch,[{id:0,x:0.2,y:0.8,phase:'down'}]],[channels.cancelTouch],[channels.media,'pause']]);
  for (const key of ['invoke','send','ipcRenderer','session','transport','core','intent']) assert.equal(api[key], undefined);
});

test('preload strips privileged events and removes exactly its listener on unsubscribe', async () => {
  const {api, ipc, lifecycle} = await preload();
  const received=[];
  const other=[];
  const stop=api.onView((...args) => received.push(args));
  const stopOther=api.onView(view => other.push(view));
  const privileged={sender:{send(){throw Error('Must not leak');}}};
  ipc.emit(channels.view, privileged, expectedView, 'extra');
  assert.deepEqual(received, [[expectedView]]);
  assert.equal(ipc.listenerCount(channels.view),2);
  stop(); stop();
  ipc.emit(channels.view, privileged, expectedView);
  assert.equal(received.length,1); assert.equal(other.length,2);
  assert.equal(ipc.listenerCount(channels.view),1);
  lifecycle.emit('unload');
  assert.equal(ipc.listenerCount(channels.view),0);
  stopOther();
  assert.throws(() => api.onView('not a callback'), /callback/i);
});

test('main bridge converts fixed calls to validated intents and exposes only sanitized views', async () => {
  const {attachHeadunitBoundary} = await moduleAt(boundaryPath);
  const f=fixture(); const dispose=attachHeadunitBoundary({...f, trustedWindow:f.window, trustedUrl:f.url});
  assert.deepEqual([...f.handlers.keys()].sort(), Object.values(channels).filter(c=>c!==channels.view).sort());
  assert.deepEqual(await f.call(channels.getView), expectedView);
  const values=[[channels.navigate,['settings'],{type:'navigate',route:'settings'}],[channels.selectPhone,['phone-1'],{type:'selectPhone',id:'phone-1'}],[channels.setVolume,[0.4],{type:'volume',value:0.4}],[channels.touch,[[{id:0,x:0.2,y:0.8,phase:'down'}]],{type:'touch',points:[{id:0,x:0.2,y:0.8,phase:'down'}]}],[channels.cancelTouch,[],{type:'cancelTouch'}],[channels.media,['play'],{type:'media',control:'play'}],[channels.navigate,['dashboard'],{type:'navigate',route:'dashboard'}]];
  for (const [channel,args,intent] of values) {assert.deepEqual(await f.call(channel,args), {accepted:true}); assert.deepEqual(f.controller.calls.at(-1), ['intent',intent]);}
  assert.deepEqual(f.wc.sent.at(-1), [channels.view,expectedView]);
  f.controller.state.phones[0].name='Changed';
  assert.equal(f.wc.sent[0][1].phones[0].name,'Phone');
  f.controller.emit(); assert.equal(f.wc.sent.at(-1)[1].phones[0].name,'Changed');
  dispose(); dispose();
  assert.equal(f.handlers.size,0); assert.equal(f.controller.listeners.size,0);
  assert.equal(f.controller.calls.filter(c=>c[0]==='unsubscribe').length,1);
});

test('all IPC handlers reject other windows, subframes, changed URLs and missing frames before controller calls', async () => {
  const {attachHeadunitBoundary} = await moduleAt(boundaryPath);
  const f=fixture(); const dispose=attachHeadunitBoundary({...f, trustedWindow:f.window, trustedUrl:f.url});
  const badEvents=[{sender:{...f.wc}, senderFrame:f.wc.mainFrame},{sender:f.wc,senderFrame:{url:f.url}}, {sender:f.wc,senderFrame:null}, null];
  for (const event of badEvents) for (const handler of f.handlers.values()) {
    const count=f.controller.calls.length;
    await assert.rejects(async () => handler(event), /untrusted/i);
    assert.equal(f.controller.calls.length,count);
  }
  for (const url of ['file:///opt/headunit/other.html',`${f.url}#hash`,`${f.url}?query=1`,'https://evil.test/', 'about:blank']) {
    f.wc.currentUrl=url; f.wc.mainFrame.url=url;
    for (const handler of f.handlers.values()) {const count=f.controller.calls.length; await assert.rejects(async () => handler(f.event), /untrusted/i); assert.equal(f.controller.calls.length,count);}
    const count=f.wc.sent.length; f.controller.emit(); assert.equal(f.wc.sent.length,count);
  }
  f.wc.currentUrl=f.url; f.wc.mainFrame.url='https://evil.test/';
  await assert.rejects(async () => f.call(channels.getView), /untrusted/i);
  dispose();
});

test('main rejects malformed payloads and extra arguments before dispatching controller intents', async () => {
  const {attachHeadunitBoundary} = await moduleAt(boundaryPath);
  const f=fixture(); const dispose=attachHeadunitBoundary({...f,trustedWindow:f.window,trustedUrl:f.url});
  const badCalls=[[channels.media,['next']],[channels.media,[{control:'play'}]],[channels.getView,[1]],[channels.cancelTouch,[{}]],[channels.navigate,['camera']],[channels.navigate,['home',{type:'restart'}]],[channels.selectPhone,[{}]],[channels.selectPhone,['']],[channels.selectPhone,['x'.repeat(257)]],[channels.setVolume,[NaN]],[channels.setVolume,[Infinity]],[channels.setVolume,[-0.1]],[channels.setVolume,[1.1]],[channels.setVolume,['0.5']],[channels.touch,[[]]],[channels.touch,[[{id:0,x:0,y:1,phase:'down',native:true}]]],[channels.touch,[[{id:0,x:0,y:1,phase:'down'},{id:0,x:1,y:0,phase:'down'}]]],[channels.touch,[[{id:10,x:0,y:1,phase:'down'}]]],[channels.touch,[[{id:0,x:2,y:1,phase:'down'}]]],[channels.touch,[[{id:0,x:0,y:1,phase:'tap'}]]]];
  for (const [channel,args] of badCalls) {const count=f.controller.calls.length; await assert.rejects(async () => f.call(channel,args), /invalid/i); assert.equal(f.controller.calls.length,count);}
  dispose();
});

test('bridge accepts configured app URLs but refuses remote and ambiguous trust roots', async () => {
  const {attachHeadunitBoundary} = await moduleAt(boundaryPath);
  for (const url of ['https://headunit.test/index.html','http://localhost:8095/','file://server/share/index.html','app://user:pass@headunit/index.html','app://headunit/index.html?mode=1','app://headunit/index.html#fragment','file:relative.html','data:text/html,headunit']) {
    const f=fixture(url);
    assert.throws(() => attachHeadunitBoundary({...f,trustedWindow:f.window,trustedUrl:url}), /trusted url/i);
    assert.equal(f.handlers.size,0); assert.equal(f.controller.calls.length,0);
  }
  const f=fixture('app://headunit/index.html');
  const dispose=attachHeadunitBoundary({...f,trustedWindow:f.window,trustedUrl:f.url});
  assert.deepEqual(await f.call(channels.getView),expectedView); dispose();
});

test('window options enforce context isolation, sandbox and local preload', async () => {
  const {headunitWindowOptions} = await moduleAt(hostPath);
  const options=headunitWindowOptions();
  assert.equal(options.webPreferences.contextIsolation,true);
  assert.equal(options.webPreferences.nodeIntegration,false);
  assert.equal(options.webPreferences.nodeIntegrationInSubFrames,false);
  assert.equal(options.webPreferences.sandbox,true);
  assert.equal(options.webPreferences.webSecurity,true);
  assert.equal(options.webPreferences.webviewTag,false);
  assert.equal(options.webPreferences.preload,preloadPath.pathname);
  assert.equal(options.transparent,true,'native projection needs a transparent window');
});

test('host blocks navigation and popups; in-flight navigation revokes the bridge before controller calls', async () => {
  const {attachHeadunitHost} = await moduleAt(hostPath);
  const f=fixture(); const dispose=attachHeadunitHost({...f,trustedWindow:f.window,trustedUrl:f.url});
  assert.deepEqual(f.wc.openHandler({url:'https://evil.test/'}), {action:'deny'});
  for (const name of ['will-navigate','will-frame-navigate','will-redirect','will-attach-webview']) {
    let blocked=false; f.wc.emit(name,{preventDefault(){blocked=true;},url:'https://evil.test/',isMainFrame:true}); assert.equal(blocked,true,name);
  }
  f.wc.emit('did-start-navigation',{url:'https://evil.test/',isMainFrame:true});
  const count=f.controller.calls.length;
  await assert.rejects(async () => f.call(channels.getView), /untrusted/i);
  assert.equal(f.controller.calls.length,count);
  const sent=f.wc.sent.length; f.controller.emit(); assert.equal(f.wc.sent.length,sent);
  f.wc.currentUrl='https://evil.test/'; f.wc.mainFrame.url=f.wc.currentUrl;
  f.wc.emit('did-navigate',{},f.wc.currentUrl);
  await assert.rejects(async () => f.call(channels.getView), /untrusted/i);
  f.wc.currentUrl=f.url; f.wc.mainFrame.url=f.url; f.wc.emit('did-navigate',{},f.url);
  assert.deepEqual(await f.call(channels.getView),expectedView);
  f.wc.dead=true; f.wc.emit('destroyed');
  assert.equal(f.controller.listeners.size,0); assert.equal(f.handlers.size,0);
  dispose();
});

test('host rejects unsafe existing windows before registering IPC or subscribing', async () => {
  const {attachHeadunitHost} = await moduleAt(hostPath);
  for (const unsafe of [{contextIsolation:false},{nodeIntegration:true},{sandbox:false},{webSecurity:false},{webviewTag:true},{preload:'/tmp/untrusted.cjs'}]) {
    const f=fixture(); const safe=f.wc.getLastWebPreferences(); f.wc.getLastWebPreferences=()=>({...safe,...unsafe});
    assert.throws(() => attachHeadunitHost({...f,trustedWindow:f.window,trustedUrl:f.url}), /preferences/i);
    assert.equal(f.handlers.size,0); assert.equal(f.controller.calls.length,0);
  }
});

test('renderer send failure cannot escape into native controller publication', async () => {
  const {attachHeadunitBoundary}=await moduleAt(boundaryPath);
  const f=fixture(); const dispose=attachHeadunitBoundary({...f,trustedWindow:f.window,trustedUrl:f.url});
  f.wc.send=()=>{throw new Error('Frame detached between validation and send');};
  assert.doesNotThrow(()=>f.controller.emit());
  dispose();
});

test('controller exception details never cross the renderer boundary', async () => {
  const {attachHeadunitBoundary}=await moduleAt(boundaryPath);
  const f=fixture(); const dispose=attachHeadunitBoundary({...f,trustedWindow:f.window,trustedUrl:f.url});
  f.controller.intent=()=>{throw Error('private transport credentials');};
  await assert.rejects(()=>f.call(channels.setVolume,[0.5]),{message:'Headunit operation unavailable'});
  f.controller.view=()=>{throw Error('private native path');};
  await assert.rejects(()=>f.call(channels.getView),{message:'Headunit operation unavailable'});
  dispose();
});

test('preload to main bridge drives the real controller without exposing its core state', async () => {
  const {attachHeadunitHost}=await moduleAt(hostPath);
  const {HeadunitController}=await import('../src/controller.mjs');
  const f=fixture();
  const sent=[];
  const session={ready:true,state:{front:{main:'livi'},sessions:{active:'cp'},devices:[{id:'phone-1',name:'Phone',status:'active'}],config:{huVolume:0.6,password:'private'},nowPlaying:{playing:true}},action:action=>{sent.push(action);return sent.length;},pointer:points=>sent.push({points}),path:path=>sent.push({path})};
  const transport={session,subscribe(listener){this.listener=listener;listener();return ()=>{};}};
  const controller=new HeadunitController(transport);
  const dispose=attachHeadunitHost({...f,trustedWindow:f.window,trustedUrl:f.url,controller});
  const {api,ipc}=await preload((channel,...args)=>f.call(channel,args));
  f.wc.send=(channel,...args)=>ipc.emit(channel,{sender:f.wc},...args);
  const received=[]; const stop=api.onView(view=>received.push(view));
  assert.equal((await api.getView()).volume,0.6);
  await api.navigate('dashboard');
  assert.deepEqual(sent.at(-1),{path:'/dashboard'});
  assert.equal(received.at(-1).route,'dashboard');
  await api.media('pause'); assert.deepEqual(sent.at(-1),{kind:'media',control:'pause'});
  await api.setVolume(0.3); assert.deepEqual(sent.at(-1),{kind:'setConfig',patch:{huVolume:0.3}});
  await api.selectPhone('phone-1'); assert.deepEqual(sent.at(-1),{kind:'selectDevice',id:'phone-1'});
  session.state.front.main='projection'; transport.listener();
  await api.touch([{id:0,x:0.2,y:0.8,phase:'down'}]); await api.cancelTouch();
  assert.equal(sent.at(-1).points[0].phase,'cancel');
  assert.equal(JSON.stringify(received).includes('private'),false);
  assert.equal(received.at(-1).route,'projection');
  stop(); dispose(); controller.dispose();
});

test('trusted host lifecycle cancels held native touches on navigation, crash, destruction and detach', async () => {
  const {attachHeadunitBoundary}=await moduleAt(boundaryPath);
  const {HeadunitController}=await import('../src/controller.mjs');
  for (const reason of ['did-start-navigation','render-process-gone','destroyed','detach']) {
    const f=fixture(); const pointers=[];
    const session={ready:true,state:{front:{main:'projection'},sessions:{active:'cp'},devices:[],config:{}},pointer:points=>pointers.push(points),action:()=>1,path:()=>{}};
    const transport={session,subscribe(listener){listener();return ()=>{};}};
    const controller=new HeadunitController(transport);
    const dispose=attachHeadunitBoundary({...f,trustedWindow:f.window,trustedUrl:f.url,controller});
    await f.call(channels.touch,[[{id:0,x:0.2,y:0.8,phase:'down'}]]);
    f.wc.emit('did-start-navigation',{url:'https://other.test/',isMainFrame:false});
    assert.equal(controller.contacts.size,1,'subframe navigation must not cancel the main UI contact');
    if (reason==='detach') dispose();
    else if (reason==='did-start-navigation') f.wc.emit(reason,{url:'https://other.test/',isMainFrame:true});
    else f.wc.emit(reason,{});
    assert.equal(controller.contacts.size,0,reason);
    assert.deepEqual(pointers.at(-1),[{id:0,x:0.2,y:0.8,phase:'cancel'}],reason);
    dispose(); controller.dispose();
  }
});

test('only the fixed reconnect notice crosses the renderer boundary',async()=>{
 const {attachHeadunitBoundary}=await moduleAt(boundaryPath);const f=fixture();
 const dispose=attachHeadunitBoundary({...f,trustedWindow:f.window,trustedUrl:f.url});
 f.controller.state.notice='projection-reconnecting';assert.equal((await f.call(channels.getView)).notice,'projection-reconnecting');
 f.controller.state.notice='private native error';assert.equal((await f.call(channels.getView)).notice,null);dispose();
});

test('glass runtime attaches before an explicit local socket start and disposes its owner', async () => {
  const {createGlassRuntime} = await moduleAt(runtimePath);
  const {encode,Decoder} = await import('../src/protocol.mjs');
  const f = fixture();
  let created = 0;
  const socket = new EventEmitter();
  socket.writes = [];
  socket.write = data => { socket.writes.push(...new Decoder().push(data)); return true; };
  socket.destroy = () => {};
  const runtime = createGlassRuntime({ipcMain:f.ipcMain,trustedWindow:f.window,trustedUrl:f.url,
    socketPath:'/tmp/headunit-contract/core.sock',preferencePath:'/tmp/headunit-contract/preferences.json',
    connectSocket:() => { created++; return socket; }});
  assert.equal(created,0);
  assert.equal((await f.call(channels.getView)).connected,false);
  runtime.start();
  assert.equal(created,1);
  socket.emit('connect');
  socket.emit('data',encode({type:'welcome',protocol:8,rev:0,state:{front:{main:'livi'},sessions:{active:'cp'},devices:[{id:'one',name:'Driver',status:'active'},{id:'two',name:'Passenger',status:'available'}],config:{huVolume:0.5}}}));
  assert.deepEqual((await f.call(channels.getView)).phones.map(p=>p.id),['one','two']);
  await f.call(channels.selectPhone,['two']);
  assert.deepEqual(socket.writes.at(-1).action,{kind:'selectDevice',id:'two'});
  runtime.dispose();
  assert.equal(f.handlers.size,0);
});

test('glass runtime stops owning its socket after the host window is lost', async () => {
  const {createGlassRuntime} = await moduleAt(runtimePath);
  const f = fixture();
  const runtime = createGlassRuntime({ipcMain:f.ipcMain,trustedWindow:f.window,trustedUrl:f.url,
    socketPath:'/tmp/headunit-contract/core.sock',preferencePath:'/tmp/headunit-contract/preferences.json',
    connectSocket:() => { throw Error('must not connect'); }});
  f.wc.emit('destroyed');
  assert.equal(f.handlers.size,0);
  assert.throws(() => runtime.start(),/disposed/i);
});
