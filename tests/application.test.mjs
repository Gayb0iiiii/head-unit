import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {startHeadunitApplication} from '../electron/application.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function fixture(options={}) {
 const events=[],ready=deferred(),load=deferred();const app=new EventEmitter(),signals=new EventEmitter();
 Object.assign(app,{requestSingleInstanceLock:()=>options.lock!==false,whenReady:()=>ready.promise,getPath:()=>'/tmp/headunit-app',quit:()=>events.push('quit'),exit:code=>events.push(['exit',code]),setDesktopName:name=>events.push(['desktop',name]),commandLine:{appendSwitch:(...args)=>events.push(['switch',...args])}});
 const windows=[];let runtimeConfig;
 class Window extends EventEmitter {
  constructor(config){super();this.config=config;this.webContents=new EventEmitter();windows.push(this);events.push('window');}
  loadURL(url){this.url=url;events.push('load');return load.promise;}
  isDestroyed(){return false;}
  show(){events.push('show');}focus(){events.push('focus');}restore(){events.push('restore');}
 }
 const start=()=>startHeadunitApplication({app,BrowserWindow:Window,ipcMain:{},signals,env:{LIVI_CORE_SOCKET:'/tmp/native/core.sock',LIVI_LIFELINE:'1',LIVI_COMPOSITOR:'1',...options.env},platform:'linux',screen:options.screen,pageURL:'file:///tmp/headunit/index.html',createRuntime:config=>{runtimeConfig=config;return {subscribeWindowConfig:options.subscribeWindowConfig,start:()=>events.push('start'),dispose:()=>events.push('dispose')};}});
 return {events,app,signals,ready,load,windows,start,get runtimeConfig(){return runtimeConfig;}};
}
test('entrypoint waits for Electron, attaches before load, and never activates on second launch',async()=>{
 const f=fixture(),owner=f.start();assert.equal(f.windows.length,0);
 f.ready.resolve();await Promise.resolve();assert.equal(f.windows.length,1);
 assert.deepEqual(f.events.slice(-3),['window','start','load']);
 assert.equal(f.windows[0].config.webPreferences.sandbox,true);assert.equal(f.windows[0].config.show,false);
 assert.equal(f.runtimeConfig.socketPath,'/tmp/native/core.sock');assert.equal(f.runtimeConfig.lifeline.env.LIVI_LIFELINE,'1');
 f.load.resolve();await owner.ready;assert.equal(f.events.at(-1),'show');
 const before=f.events.length;f.app.emit('second-instance',{},['touch','projection']);assert.equal(f.events.length,before);
 owner.shutdown();assert.deepEqual(f.events.slice(-2),['dispose','quit']);
});
test('duplicate supervised UI fails without socket, window or foreground action',async()=>{
 const f=fixture({lock:false}),owner=f.start();f.ready.resolve();await owner.ready;
 assert.deepEqual(f.events,[['exit',1]]);assert.equal(f.windows.length,0);assert.equal(f.signals.listenerCount('SIGTERM'),0);
});
test('SIGTERM before readiness cannot create an orphan window later',async()=>{
 const f=fixture(),owner=f.start();f.signals.emit('SIGTERM');f.ready.resolve();await owner.ready;
 assert.equal(f.windows.length,0);assert.equal(f.events.filter(e=>e==='quit').length,1);
 owner.shutdown();assert.equal(f.signals.listenerCount('SIGTERM'),0);
});
for(const reason of ['SIGTERM','parent','before-quit','crash'])test(`${reason} during page load disposes once and prevents a late window show`,async()=>{
 const f=fixture(),owner=f.start();f.ready.resolve();await Promise.resolve();
 if(reason==='SIGTERM')f.signals.emit('SIGTERM');
 if(reason==='parent')f.runtimeConfig.lifeline.onLost();
 if(reason==='before-quit')f.app.emit('before-quit');
 if(reason==='crash')f.windows[0].webContents.emit('render-process-gone');
 f.load.resolve();await owner.ready;owner.shutdown();
 assert.equal(f.events.filter(e=>e==='dispose').length,1);assert.ok(!f.events.includes('show'));
 assert.equal(f.signals.listenerCount('SIGTERM'),0);assert.equal(f.app.listenerCount('second-instance'),0);
 if(reason==='crash')assert.deepEqual(f.events.at(-1),['exit',1]);
});
test('page load failure cleans up and reports unsuccessful startup',async()=>{
 const f=fixture(),owner=f.start();f.ready.resolve();await Promise.resolve();f.load.reject(Error('failed'));
 await owner.ready;assert.deepEqual(f.events.slice(-2),['dispose',['exit',1]]);assert.ok(!f.events.includes('show'));
});

test('unsafe launch flags and untrusted connection/page configuration fail before window ownership',()=>{
 for(const overrides of [{env:{}},{env:{LIVI_CORE_SOCKET:'tcp://host/core.sock'}},{pageURL:'https://example.test/'},{pageURL:'file:///tmp/page.html?remote=true'}]){
  const f=fixture();assert.throws(()=>startHeadunitApplication({app:f.app,BrowserWindow:class{},ipcMain:{},signals:f.signals,env:{LIVI_CORE_SOCKET:'/tmp/core.sock'},...overrides}));assert.equal(f.events.length,0);
 }
 const f=fixture();f.app.commandLine.hasSwitch=flag=>flag==='no-sandbox';
 assert.throws(()=>startHeadunitApplication({app:f.app,BrowserWindow:class{},ipcMain:{},env:{LIVI_CORE_SOCKET:'/tmp/core.sock'}}),/Unsafe/);
 assert.equal(f.events.length,0);
});
test('real runtime is disposed before application quit without a native engine launch',async()=>{
 const {createGlassRuntime}=await import('../electron/glass-runtime.mjs');
 const {headunitWindowOptions}=await import('../electron/host.mjs');
 const f=fixture(),handlers=new Map();let socketDestroyed=0,created=0;
 const socket=new EventEmitter();socket.write=()=>true;socket.destroy=()=>socketDestroyed++;
 class Window extends EventEmitter {
  constructor(){super();this.webContents=Object.assign(new EventEmitter(),{mainFrame:{url:'file:///tmp/headunit/index.html'},getURL:()=> 'file:///tmp/headunit/index.html',getLastWebPreferences:()=>headunitWindowOptions().webPreferences,isDestroyed:()=>false,setWindowOpenHandler:()=>{},send:()=>{}});}
  isFocused(){return true;}loadURL(){return Promise.resolve();}show(){}
 }
 f.app.quit=()=>{assert.equal(handlers.size,0);assert.equal(socketDestroyed,1);f.events.push('quit');};
 const owner=startHeadunitApplication({app:f.app,BrowserWindow:Window,ipcMain:{handle:(name,fn)=>handlers.set(name,fn),removeHandler:name=>handlers.delete(name)},signals:f.signals,env:{LIVI_CORE_SOCKET:'/tmp/headunit-app/core.sock'},pageURL:'file:///tmp/headunit/index.html',createRuntime:config=>createGlassRuntime({...config,connectSocket:()=>{created++;return socket;}})});
 f.ready.resolve();await owner.ready;assert.equal(created,1);assert.ok(handlers.size>0);
 f.signals.emit('SIGTERM');owner.shutdown();assert.equal(socketDestroyed,1);assert.equal(f.events.filter(e=>e==='quit').length,1);
});

test('Linux identity is explicit before readiness and compositor dimensions remain unspecified',async()=>{
 const f=fixture(),owner=f.start();assert.ok(f.events.some(e=>Array.isArray(e)&&e[0]==='desktop'&&e[1]==='dev.f-io.livi.desktop'));
 f.ready.resolve();await Promise.resolve();assert.equal(f.windows[0].config.width,undefined);assert.equal(f.windows[0].config.height,undefined);
 f.load.resolve();await owner.ready;owner.shutdown();
});
test('application owns compositor timers and cancels fullscreen when shutdown interrupts load',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const f=fixture({env:{LIVI_KIOSK:'1'},screen:{getDisplayMatching:()=>({size:{width:1024,height:600}})}}),owner=f.start();
 f.ready.resolve();await Promise.resolve();const win=f.windows[0];let fullscreen=0;
 Object.assign(win,{isDestroyed:()=>false,isFullScreen:()=>false,getBounds:()=>({}),getContentSize:()=>[800,480],setContentSize:()=>{},setFullScreen:()=>fullscreen++});
 win.emit('ready-to-show');assert.equal(win.listenerCount('resize'),1);f.signals.emit('SIGTERM');f.load.resolve();await owner.ready;t.mock.timers.tick(1000);
 assert.equal(fullscreen,0);assert.equal(win.listenerCount('resize'),0);assert.ok(!f.events.includes('show'));
});

test('application attaches the privileged config consumer before runtime start and disposes it before quit',async()=>{
 let subscribed=0,detached=0;
 const f=fixture({subscribeWindowConfig:fn=>{subscribed++;f.events.push('config-subscribe');return()=>{detached++;f.events.push('config-detach');};}}),owner=f.start();
 f.ready.resolve();await Promise.resolve();assert.equal(subscribed,1);assert.ok(f.events.indexOf('config-subscribe')<f.events.indexOf('start'));
 f.signals.emit('SIGTERM');f.load.resolve();await owner.ready;assert.equal(detached,1);assert.ok(f.events.indexOf('config-detach')<f.events.indexOf('dispose'));
});
test('secondary ownership is passed to runtime only with explicit opt-in and compositor mode',async()=>{
 for(const [env,enabled] of [[{},false],[{HEADUNIT_SECONDARY_WINDOWS:'1'},true],[{HEADUNIT_SECONDARY_WINDOWS:'true'},false],[{HEADUNIT_SECONDARY_WINDOWS:'1',LIVI_COMPOSITOR:'0'},false]]){
  const f=fixture({env}),owner=f.start();f.ready.resolve();await Promise.resolve();assert.equal(Boolean(f.runtimeConfig.secondary),enabled);
  if(enabled)assert.equal(typeof f.runtimeConfig.secondary.BrowserWindow,'function');f.load.resolve();await owner.ready;owner.shutdown();
 }
});
