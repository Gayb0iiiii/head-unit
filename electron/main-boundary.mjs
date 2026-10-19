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
function rendererView(value) {
  const source = plain(value) ? value : {};
  const active=(Array.isArray(source.phones)?source.phones:[]).filter(phone=>plain(phone)&&phone.status==='active'&&text(phone.id,256));
  return {
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
export function attachHeadunitBoundary({ipcMain, trustedWindow, trustedUrl, controller}) {
  const url = trustedURL(trustedUrl);
  const contents = trustedWindow?.webContents;
  if (!contents || !controller || !['view','subscribe','intent'].every(key => typeof controller[key] === 'function')) throw new TypeError('Trusted window and controller required');
  let disposed = false;
  let navigating = false;
  let unsubscribe;
  const registered = [];
  const lifecycle = [];
  function on(name, listener) { contents.on(name,listener); lifecycle.push([name,listener]); }
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
    for (const channel of registered) ipcMain.removeHandler(channel);
    for (const [name,listener] of lifecycle) contents.removeListener(name,listener);
    unsubscribe?.();
  }
  try {
    register('headunit:get-view',0,() => true,() => rendererView(controller.view()));
    action('headunit:navigate',route => routes.has(route),route => ({type:'navigate',route}));
    action('headunit:select-phone',id => text(id,256),id => ({type:'selectPhone',id}));
    action('headunit:set-volume',bounded,value => ({type:'volume',value}));
    action('headunit:touch',pointsValid,points => ({type:'touch',points:points.map(({id,x,y,phase}) => ({id,x,y,phase}))}));
    action('headunit:cancel-touch',() => true,() => ({type:'cancelTouch'}),0);
    action('headunit:media',(control,phoneId) => (control === 'play' || control === 'pause') && text(phoneId,256),(control,phoneId) => ({type:'media',control,phoneId}),2);
    // Account for both current Event details and Electron's older positional API.
    on('did-start-navigation',(details,_url,_sameDocument,isMainFrame) => {
      if (details?.isMainFrame ?? isMainFrame) { navigating = true; cancelContacts(); }
    });
    on('did-navigate',() => { navigating = false; });
    on('did-navigate-in-page',(_event,_url,isMainFrame) => { if (isMainFrame) navigating = false; });
    on('destroyed',dispose);
    on('render-process-gone',dispose);
    unsubscribe = controller.subscribe(view => {
      if (pageTrusted()) {
        // A frame can disappear between the trust check and the send.
        try { contents.send('headunit:view',rendererView(view)); } catch {}
      }
    });
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}
