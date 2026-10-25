import {filterPicture} from '../src/picture.mjs';
import {filterConnectionPhase} from '../src/connection-status.mjs';
import {filterHomeStatus} from '../src/home-status.mjs';
/** Dependency-injected main-process boundary. No Electron import, launch or socket connection. */
const routes = new Set(['home','phones','settings','audio','vehicle','projection','dashboard']);
const displayedRoutes = new Set([...routes,'camera','cluster','disconnected']);
const phases = new Set(['down','move','up','cancel']);
const bounded = value => Number.isFinite(value) && value >= 0 && value <= 1;
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => plain(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');

function trustedURL(value) {
  try {
    const url = new URL(value);
    if (typeof value !== 'string' || url.href !== value || url.username || url.password || url.search || url.hash) throw Error();
    if (url.protocol === 'file:' && !url.hostname && value.startsWith('file:///')) return value;
    if (url.protocol === 'app:' && url.hostname && !url.port && url.pathname.startsWith('/')) return value;
  } catch {}
  throw new TypeError('Trusted URL must be an exact canonical local file: or app: document URL');
}

// Defense in depth if a future controller accidentally returns native state.
function rendererView(value,desktopAvailable=false) {
  const source = plain(value) ? value : {};
  const active=(Array.isArray(source.phones)?source.phones:[]).filter(phone=>plain(phone)&&phone.status==='active'&&text(phone.id,256));
  const picture=filterPicture(source.picture,source.connected===true&&source.projectionReady===true,source.front);
  return {
    ...(picture?{picture}:{}),
    connectionPhase:filterConnectionPhase(source.connectionPhase,source.connected),
    homeStatus:filterHomeStatus(source.homeStatus,source.connected===true,active.length===1?active[0].id:null),
    connected: source.connected === true,
    projectionReady: source.connected === true && source.projectionReady === true,
    front: ['livi','projection','camera','cluster'].includes(source.front) ? source.front : 'livi',
    phones: (Array.isArray(source.phones) ? source.phones : []).slice(0,128)
      .filter(phone => plain(phone) && text(phone.id,256))
      .map(phone => ({id:phone.id, name:text(phone.name,256) ? phone.name : 'Phone', status:['active','available','offline'].includes(phone.status) ? phone.status : 'offline'})),
    volume: bounded(source.volume) ? source.volume : null,
    route: displayedRoutes.has(source.route) ? source.route : 'disconnected',
    preferredRoute: routes.has(source.preferredRoute) ? source.preferredRoute : 'home',
    notice: source.notice === 'projection-reconnecting' ? 'projection-reconnecting' : null,
    desktopAvailable:desktopAvailable===true,
  };
}

function pointsValid(points) {
  if (!Array.isArray(points) || points.length < 1 || points.length > 10) return false;
  const ids = new Set();
  for (const point of points) {
    if (!exact(point,['id','x','y','phase']) || !Number.isInteger(point.id) || point.id < 0 || point.id > 9 || ids.has(point.id) || !bounded(point.x) || !bounded(point.y) || !phases.has(point.phase)) return false;
    ids.add(point.id);
  }
  return true;
}

/** One host window owns these channels. Call the returned function when detaching. */
export function attachHeadunitBoundary({ipcMain, trustedWindow, trustedUrl, controller, systemMetrics, desktopHandoff}) {
  const url = trustedURL(trustedUrl);
  const contents = trustedWindow?.webContents;
  if (!contents || !controller || !['view','subscribe','intent'].every(key => typeof controller[key] === 'function')) throw new TypeError('Trusted window and controller required');
  let disposed = false;
  let navigating = false;
  let focused = trustedWindow.isFocused?.() === true;
  let responsive = true;
  const windowLifecycle = [];
  let unsubscribe;
  const registered = [];
  const lifecycle = [];
  function on(name, listener) { contents.on(name,listener); lifecycle.push([name,listener]); }
  function onWindow(name,listener) {
    if(typeof trustedWindow.on!=='function'||typeof trustedWindow.removeListener!=='function')return;
    trustedWindow.on(name,listener);windowLifecycle.push([name,listener]);
  }
  function pageTrusted() {
    try { return !disposed && !navigating && !contents.isDestroyed() && contents.getURL() === url && contents.mainFrame?.url === url; }
    catch { return false; }
  }
  function authenticate(event) {
    if (!pageTrusted() || event?.sender !== contents || !event.senderFrame || event.senderFrame !== contents.mainFrame || event.senderFrame.url !== url) throw new Error('Untrusted headunit sender');
  }
  function register(channel, count, validate, operation) {
    ipcMain.handle(channel, async (event,...args) => {
      authenticate(event);
      if (args.length !== count || !validate(...args)) throw new TypeError('Invalid headunit arguments');
      try { return await operation(...args); }
      catch { throw new Error('Headunit operation unavailable'); }
    });
    registered.push(channel);
  }
  function action(channel, validate, makeIntent, count = 1) {
    register(channel,count,validate,async (...args) => {
      const result=controller.intent(makeIntent(...args));
      if(result?.completion && await result.completion !== true) throw new Error('Command failed');
      // Do not return arbitrary core replies, state, errors or request metadata.
      return {accepted:true};
    });
  }
  function cancelContacts() {
    // This is a trusted host lifecycle action, never an unauthenticated IPC request.
    try { controller.intent({type:'cancelTouch'}); } catch {}
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelContacts();
    try{systemMetrics?.stop?.();}catch{}
    for (const channel of registered) ipcMain.removeHandler(channel);
    for (const [name,listener] of lifecycle) contents.removeListener(name,listener);
    for (const [name,listener] of windowLifecycle) trustedWindow.removeListener(name,listener);
    unsubscribe?.();
  }
  try {
    register('headunit:get-view',0,() => true,() => rendererView(controller.view(),desktopHandoff?.available));
    register('headunit:exit-to-desktop',0,() => true,async()=>{
      if(desktopHandoff?.available!==true||typeof desktopHandoff.request!=='function')throw Error('Desktop session unavailable');
      if(await desktopHandoff.request()!==true)throw Error('Desktop session unavailable');
      return {accepted:true};
    });
    register('headunit:get-metrics',0,() => true,async()=>{
      const sample=await systemMetrics?.sample?.();
      const percent=value=>Number.isFinite(value)&&value>=0&&value<=100?value:null;
      const bytes=value=>Number.isSafeInteger(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER?value:null;
      const rate=value=>Number.isSafeInteger(value)&&value>=0&&value<=1e9?value:null;
      const ping=value=>Number.isInteger(value)&&value>=0&&value<=5000?value:null;
      const ramTotalBytes=bytes(sample?.ramTotalBytes),ramUsedBytes=bytes(sample?.ramUsedBytes);
      const result={cpuPercent:percent(sample?.cpuPercent),gpuPercent:percent(sample?.gpuPercent),
        ramUsedBytes:ramTotalBytes!==null&&ramUsedBytes!==null&&ramUsedBytes<=ramTotalBytes?ramUsedBytes:null,ramTotalBytes,
        networkDownBytesPerSec:rate(sample?.networkDownBytesPerSec),networkUpBytesPerSec:rate(sample?.networkUpBytesPerSec),pingMs:ping(sample?.pingMs)};
      const status=(raw,valid)=>['pending','current','stale','unavailable','unsupported'].includes(raw)&&(valid||!['current','stale'].includes(raw))?raw:valid?'current':'unavailable';
      return {...result,cpuStatus:status(sample?.cpuStatus,result.cpuPercent!==null),
        gpuStatus:status(sample?.gpuStatus??'unsupported',result.gpuPercent!==null),
        ramStatus:status(sample?.ramStatus,result.ramUsedBytes!==null&&result.ramTotalBytes!==null),
        networkStatus:status(sample?.networkStatus,result.networkDownBytesPerSec!==null&&result.networkUpBytesPerSec!==null),
        pingStatus:status(sample?.pingStatus,result.pingMs!==null)};
    });
    register('headunit:stop-metrics',0,()=>true,()=>{systemMetrics?.stop?.();return {stopped:true};});
    action('headunit:navigate',route => routes.has(route),route => ({type:'navigate',route}));
    action('headunit:select-phone',id => text(id,256),id => ({type:'selectPhone',id}));
    action('headunit:set-volume',bounded,value => ({type:'volume',value}));
    action('headunit:touch',pointsValid,points => {
      if(!focused||!responsive)throw Error('Input owner unavailable');
      return {type:'touch',points:points.map(({id,x,y,phase}) => ({id,x,y,phase}))};
    });
    action('headunit:cancel-touch',() => true,() => ({type:'cancelTouch'}),0);
    action('headunit:media',(control,phoneId) => (control === 'play' || control === 'pause') && text(phoneId,256),(control,phoneId) => ({type:'media',control,phoneId}),2);
    // Account for both current Event details and Electron's older positional API.
    on('did-start-navigation',(details,_url,_sameDocument,isMainFrame) => {
      if (details?.isMainFrame ?? isMainFrame) { navigating = true; cancelContacts(); }
    });
    on('did-navigate',() => { navigating = false; });
    on('did-navigate-in-page',(_event,_url,isMainFrame) => { if (isMainFrame) navigating = false; });
    onWindow('blur',()=>{focused=false;cancelContacts();});
    onWindow('focus',()=>{focused=true;});
    onWindow('unresponsive',()=>{responsive=false;cancelContacts();});
    onWindow('responsive',()=>{responsive=true;});
    on('destroyed',dispose);
    on('render-process-gone',dispose);
    unsubscribe = controller.subscribe(view => {
      if (pageTrusted()) {
        // A frame can disappear between the trust check and the send.
        try { contents.send('headunit:view',rendererView(view,desktopHandoff?.available)); } catch {}
      }
    });
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}
