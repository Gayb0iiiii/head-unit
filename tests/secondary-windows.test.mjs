import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createSecondaryWindows} from '../electron/secondary-windows.mjs';
import {CoreTransport} from '../src/transport.mjs';
import {observeWindowConfig} from '../electron/window-config.mjs';
import {encode,Decoder} from '../src/protocol.mjs';
const pageURL='file:///opt/headunit/electron/secondary.html';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(t) {
 const windows=[],handlers=new Map(),sockets=[];
 const ipcMain={handle:(key,fn)=>{assert.ok(!handlers.has(key));handlers.set(key,fn);},removeHandler:key=>handlers.delete(key)};
 class Window extends EventEmitter {
  constructor(options){super();this.options=options;this.dead=false;this.shows=0;this.url='';this.full=false;this.sizes=[];
   this.webContents=Object.assign(new EventEmitter(),{mainFrame:{url:''},getURL:()=>this.url,isDestroyed:()=>this.dead,send:(...args)=>this.sent.push(args),setWindowOpenHandler:fn=>this.popup=fn,session:{setPermissionCheckHandler:fn=>this.permissionCheck=fn,setPermissionRequestHandler:fn=>this.permissionRequest=fn},setZoomFactor:()=>{}});this.sent=[];windows.push(this);
  }
  loadURL(url){this.url=url;this.webContents.mainFrame.url=url;return new Promise((resolve,reject)=>{this.loaded=resolve;this.failed=reject;});}
  isDestroyed(){return this.dead;}destroy(){this.dead=true;this.emit('closed');}
  showInactive(){this.shows++;}show(){throw Error('must not activate');}focus(){throw Error('must not focus');}
  isFullScreen(){return this.full;}setFullScreen(value){this.full=value;this.emit(value?'enter-full-screen':'leave-full-screen');}
  getContentSize(){return [800,480];}getBounds(){return {x:0,y:0,width:800,height:480};}setContentSize(...args){this.sizes.push(args);}
 }
 const transport=new CoreTransport('/tmp/secondary/core.sock',()=>{const socket=new EventEmitter();socket.sent=[];socket.write=data=>{socket.sent.push(...new Decoder().push(data));return true;};socket.destroy=()=>{};sockets.push(socket);return socket;});
 const config=observeWindowConfig(transport);
 const owner=createSecondaryWindows({BrowserWindow:Window,ipcMain,transport,config,screen:{getDisplayMatching:()=>({size:{width:800,height:480}})},pageURL});
 const connect=()=>{transport.connect();sockets.at(-1).emit('connect');};
 let rev=0,state;
 const welcome=(active=true,front='livi')=>{rev=0;state={front:{main:'livi',cluster:front,aux:'livi'},devices:[{name:'private'}],config:{clusterScreenActive:active,auxScreenActive:false,clusterScreenWidth:800,clusterScreenHeight:480,kiosk:{cluster:false,aux:false},uiZoomPercent:100,wifiPassword:'secret'}};sockets.at(-1).emit('data',encode({type:'welcome',protocol:8,rev:0,state}));};
 const patch=(path,value)=>sockets.at(-1).emit('data',encode({type:'patch',rev:++rev,ops:[{op:'set',path,value}]}));
 const call=(win,channel,args=[],event={sender:win.webContents,senderFrame:win.webContents.mainFrame})=>handlers.get(channel)(event,...args);
 const cleanup=()=>{owner.dispose();config.dispose();transport.stop();};t.after(cleanup);
 return {windows,handlers,ipcMain,transport,config,owner,sockets,connect,welcome,patch,call,cleanup};
}
test('only synchronized explicitly active native roles create isolated windows without fixed geometry',async t=>{
 const f=fixture(t);assert.equal(f.windows.length,0);f.connect();f.welcome(false);assert.equal(f.windows.length,0);
 f.patch(['config','clusterScreenActive'],true);assert.equal(f.windows.length,1);const w=f.windows[0];
 assert.equal(w.options.title,'livi:cluster');assert.equal(w.options.width,undefined);assert.equal(w.options.height,undefined);assert.equal(w.options.show,false);assert.equal(w.options.webPreferences.sandbox,true);assert.equal(w.options.webPreferences.nodeIntegration,false);assert.match(w.options.webPreferences.preload,/secondary-preload.cjs$/);
 assert.equal(w.permissionCheck(),false);let permission;w.permissionRequest({},'media',value=>permission=value);assert.equal(permission,false);assert.deepEqual(w.popup(),{action:'deny'});
 w.loaded();await flush();assert.equal(w.shows,1);assert.equal(w.sizes.length,0);
 const view=await f.call(w,'headunit-secondary:get-view');assert.deepEqual(view,{role:'cluster',connected:true,front:'livi',presented:true});assert.doesNotMatch(JSON.stringify(w.sent),/secret|private|wifiPassword/);
 f.patch(['config','auxScreenActive'],true);assert.equal(f.windows[1].options.title,'livi:aux');assert.notEqual(f.windows[1].options.webPreferences.partition,w.options.webPreferences.partition);
});
test('secondary authentication rejects foreign frames, main/role spoofing and navigation',async t=>{
 const f=fixture(t);f.connect();f.welcome();const w=f.windows[0];w.loaded();await flush();
 for(const event of [{sender:{},senderFrame:w.webContents.mainFrame},{sender:w.webContents,senderFrame:{url:pageURL}}])await assert.rejects(f.call(w,'headunit-secondary:get-view',[],event));
 await assert.rejects(f.call(w,'headunit-secondary:shown',['main','projection']));
 let prevented=0;w.webContents.emit('will-navigate',{preventDefault:()=>prevented++});w.webContents.emit('will-attach-webview',{preventDefault:()=>prevented++});assert.equal(prevented,2);
 w.url='https://example.test/';await assert.rejects(f.call(w,'headunit-secondary:get-view'));
});
test('shown report uses host role and only livi, waits for reply, and is bounded per window',async t=>{
 const f=fixture(t);f.connect();f.welcome();const w=f.windows[0];
 await assert.rejects(f.call(w,'headunit-secondary:shown'));w.loaded();await flush();const promise=f.call(w,'headunit-secondary:shown');const action=f.sockets[0].sent.at(-1);
 assert.deepEqual(action.action,{kind:'show',screen:'cluster',front:'livi'});await assert.rejects(f.call(w,'headunit-secondary:shown'));
 f.sockets[0].emit('data',encode({type:'reply',id:action.id}));assert.deepEqual(await promise,{accepted:true});const count=f.sockets[0].sent.length;await assert.rejects(f.call(w,'headunit-secondary:shown'));assert.equal(f.sockets[0].sent.length,count);
});
for(const front of ['camera','cluster','projection',null])test(`secondary cannot report over native ${front} ownership`,async t=>{
 const f=fixture(t);f.connect();f.welcome(true,front);const w=f.windows[0];w.loaded();await flush();await assert.rejects(f.call(w,'headunit-secondary:shown'));assert.ok(!f.sockets[0].sent.some(message=>message.action));
});
test('deactivation replaces the lease and late load/close callbacks cannot show or remove a replacement',async t=>{
 const f=fixture(t);f.connect();f.welcome();const old=f.windows[0];f.patch(['config','clusterScreenActive'],false);assert.equal(old.dead,true);
 f.patch(['config','clusterScreenActive'],true);const next=f.windows[1];old.loaded();old.emit('closed');await flush();assert.equal(old.shows,0);next.loaded();await flush();assert.equal(next.shows,1);
 await assert.rejects(f.call(old,'headunit-secondary:get-view'));assert.equal((await f.call(next,'headunit-secondary:get-view')).role,'cluster');
});
for(const cause of ['closed','failed','crash'])test(`${cause} does not reopen until role reactivation or a fresh connection`,async t=>{
 const f=fixture(t);f.connect();f.welcome();const w=f.windows[0];
 if(cause==='closed')w.destroy();if(cause==='failed')w.failed(Error('private failure'));if(cause==='crash')w.webContents.emit('render-process-gone');await flush();
 f.patch(['config','uiZoomPercent'],120);assert.equal(f.windows.length,1);
 f.patch(['config','clusterScreenActive'],false);f.patch(['config','clusterScreenActive'],true);assert.equal(f.windows.length,2);
});
test('disconnect, invalid active config and shutdown revoke leases without stale work',async t=>{
 const f=fixture(t);f.connect();f.welcome();const old=f.windows[0];f.sockets[0].emit('close');assert.equal(old.dead,true);old.loaded();await flush();assert.equal(old.shows,0);
 f.connect();f.welcome();const next=f.windows[1];f.patch(['config','clusterScreenActive'],'true');assert.equal(next.dead,true);
 f.patch(['config','clusterScreenActive'],true);const last=f.windows[2];f.owner.dispose();f.owner.dispose();last.loaded();await flush();assert.equal(last.dead,true);assert.equal(last.shows,0);assert.equal(f.handlers.size,0);
});
test('late successful report reply from a revoked lease cannot acknowledge a replacement',async t=>{
 const f=fixture(t);f.connect();f.welcome();const old=f.windows[0];old.loaded();await flush();const pending=f.call(old,'headunit-secondary:shown');const checked=assert.rejects(pending);const action=f.sockets[0].sent.at(-1);
 f.patch(['config','clusterScreenActive'],false);f.patch(['config','clusterScreenActive'],true);f.sockets[0].emit('data',encode({type:'reply',id:action.id}));await checked;assert.equal(f.windows[1].shows,0);
});
test('session allows only secondary livi reports, never arbitrary secondary controls',async()=>{
 const {CoreSession}=await import('../src/session.mjs');const sent=[],session=new CoreSession(message=>sent.push(message));session.ready=true;
 for(const role of ['cluster','aux'])session.action({kind:'show',screen:role,front:'livi'});
 for(const role of ['cluster','aux','camera','other'])for(const front of ['projection','camera','cluster'])assert.throws(()=>session.action({kind:'show',screen:role,front}));
 assert.equal(sent.length,2);
});
test('secondary and main IPC identities cannot cross their control boundaries',async t=>{
 const {attachHeadunitBoundary}=await import('../electron/main-boundary.mjs');const f=fixture(t);
 const wc=Object.assign(new EventEmitter(),{mainFrame:{url:'file:///opt/headunit/index.html'},getURL:()=> 'file:///opt/headunit/index.html',isDestroyed:()=>false,send:()=>{}});
 const main=Object.assign(new EventEmitter(),{webContents:wc,isFocused:()=>true}),controller={view:()=>({}),subscribe:()=>()=>{},intent:()=>{throw Error('must not reach main controls');}};
 const detach=attachHeadunitBoundary({ipcMain:f.ipcMain,trustedWindow:main,trustedUrl:'file:///opt/headunit/index.html',controller});t.after(detach);
 f.connect();f.welcome();const secondary=f.windows[0];secondary.loaded();await flush();
 for(const [channel,args] of [['headunit:get-view',[]],['headunit:navigate',['projection']],['headunit:touch',[[{id:0,x:.1,y:.2,phase:'down'}]]]])await assert.rejects(f.call(secondary,channel,args),/Untrusted/);
 await assert.rejects(f.call(secondary,'headunit-secondary:get-view',[],{sender:wc,senderFrame:wc.mainFrame}),/Untrusted/);
});
test('revision-gap resync revokes secondary identity before accepting a fresh snapshot',async t=>{
 const f=fixture(t);f.connect();f.welcome();const old=f.windows[0];old.loaded();await flush();
 f.sockets[0].emit('data',encode({type:'patch',rev:99,ops:[]}));assert.equal(old.dead,true);await assert.rejects(f.call(old,'headunit-secondary:get-view'));
 f.welcome();const next=f.windows[1];assert.notEqual(next,old);next.loaded();await flush();assert.equal(next.shows,1);
});
test('native rejection does not retry a secondary shown report',async t=>{
 const f=fixture(t);f.connect();f.welcome();const w=f.windows[0];w.loaded();await flush();const pending=f.call(w,'headunit-secondary:shown'),checked=assert.rejects(pending);const action=f.sockets[0].sent.at(-1);
 f.sockets[0].emit('data',encode({type:'reply',id:action.id,error:'private native error'}));await checked;const count=f.sockets[0].sent.length;await assert.rejects(f.call(w,'headunit-secondary:shown'));assert.equal(f.sockets[0].sent.length,count);
});
test('manual close suppression survives same-connection resync and malformed active values',async t=>{
 const f=fixture(t);f.connect();f.welcome();f.windows[0].destroy();
 f.sockets[0].emit('data',encode({type:'patch',rev:99,ops:[]}));f.welcome();assert.equal(f.windows.length,1);
 f.patch(['config','clusterScreenActive'],null);f.patch(['config','clusterScreenActive'],true);assert.equal(f.windows.length,1);
 f.patch(['config'],{});f.welcome();assert.equal(f.windows.length,1);
 f.connect();f.welcome();assert.equal(f.windows.length,2);
});
