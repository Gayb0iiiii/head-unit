import {filterPicture} from './picture.mjs';
import {filterConnectionPhase} from './connection-status.mjs';
import {emptyHomeStatus,filterHomeStatus} from './home-status.mjs';
import {Headunit} from './model.mjs';

const visibleRoutes = new Set(['home','dashboard','phones','settings','audio','vehicle','projection','camera','cluster','disconnected']);
const navigableRoutes = new Set(['home','dashboard','phones','settings','audio','vehicle','projection','radio','bluetooth','apps']);
const localRoutes = new Set(['radio','bluetooth','apps']);

/** Browser-side projection of the privileged, authoritative host view. */
export class NativeHeadunit extends Headunit {
  constructor(storage, bridge, onChange = () => {}, clock = {now:()=>performance.now(),setTimeout:(fn,delay)=>globalThis.setTimeout(fn,delay),clearTimeout:id=>globalThis.clearTimeout(id)}) {
    super(storage,{simulation:false});
    this.clock = clock;
    this.mediaGeneration = 0;
    this.state.homeStatus = emptyHomeStatus('disconnected');
    this.state.mediaPending = false;
    this.bridge = bridge;
    this.onChange = onChange;
    this.state.screen = 'home';
    this.state.phones = [];
    this.state.activePhone = null;
    this.state.connected = false;
    this.state.connectionPhase = 'unavailable';
    this.state.front = 'livi';
    this.state.picture=null;
    this.state.notice = null;
    this.state.commandError = false;
    this.state.desktopAvailable=false;
    this.everConnected = false;
    this.localRoute = null;
    this.pendingPhone = null;
    this.selectionAccepted = false;
    this.choiceGeneration = 0;
    this.revision = 0;
  }

  async start() {
    this.unsubscribe = this.bridge.onView(view => this.applyView(view));
    const before = this.revision;
    try {
      const initial = await this.bridge.getView();
      if (this.revision === before) this.applyView(initial);
    } catch {
      this.onChange();
    }
  }

  stop() { this.unsubscribe?.(); this.unsubscribe = null; this.cancelSelection(); this.clock.clearTimeout(this.expiryTimer); }

  cancelSelection() { this.pendingPhone = null; this.selectionAccepted = false; this.choiceGeneration++; this.mediaGeneration++; this.state.mediaPending=false; }

  applyView(view) {
    this.revision++;
    const connected = view?.connected === true;
    if(connected)this.everConnected=true;
    if(connected&&view.front!=='livi')this.localRoute=null;
    if ((connected && view.front !== 'livi') || (!this.localRoute && (!connected || this.state.screen !== view.route))) this.endLayoutEdit();
    const phones = connected && Array.isArray(view.phones) ? view.phones.filter(p =>
      p && typeof p.id === 'string' && p.id.length > 0 && p.id.length <= 256
    ).map(p => ({id:p.id, name:typeof p.name === 'string' ? p.name : 'Phone',
      status:['active','available','offline'].includes(p.status) ? p.status : 'offline', active:p.status === 'active'})) : [];
    if (!connected || ['camera','cluster'].includes(view.front) || (this.state.connected && this.state.screen !== view.route)) this.cancelSelection();
    this.state.projectionReady = connected && view.projectionReady === true;
    this.state.picture=filterPicture(view?.picture,this.state.projectionReady,view?.front);
    this.state.connected = connected;
    this.state.desktopAvailable=view?.desktopAvailable===true&&typeof this.bridge.exitToDesktop==='function';
    if(!connected)this.state.commandError=false;
    this.state.connectionPhase = filterConnectionPhase(view?.connectionPhase,connected);
    this.state.phones = phones;
    const active=phones.filter(p=>p.active);
    const activePhone=active.length===1?active[0].id:null;
    if(this.state.activePhone!==activePhone){this.mediaGeneration++;this.state.mediaPending=false;}
    this.state.activePhone = activePhone;
    this.state.homeStatus=filterHomeStatus(view?.homeStatus,connected,activePhone);
    this.scheduleExpiry();
    this.state.front = connected && ['livi','projection','camera','cluster'].includes(view.front) ? view.front : 'livi';
    this.state.screen = this.localRoute || (connected && visibleRoutes.has(view.route) ? view.route : ['settings','projection'].includes(this.state.screen)?this.state.screen:'home');
    if (view.route === 'dashboard') this.state.homeMode = 'dashboard';
    else if (view.route === 'home') this.state.homeMode = 'apps';
    this.state.notice = connected && view.notice === 'projection-reconnecting' ? view.notice : null;
    this.advanceSelection();
    this.onChange();
  }

  advanceSelection() {
    if (this.pendingPhone && this.selectionAccepted && this.state.projectionReady && this.state.activePhone === this.pendingPhone) {
      this.pendingPhone = null;
      this.command('navigate','projection');
    }
  }

  command(method, value, onSuccess = () => {}, onFailure = () => {}, current = () => true) {
    const generation = this.choiceGeneration;
    const fail = () => {
      if (generation !== this.choiceGeneration || !current()) return;
      onFailure();
      this.state.commandError = true;
      this.onChange();
    };
    try {
      Promise.resolve(method==='media'?this.bridge.media(value.control,value.phoneId):this.bridge[method](value)).then(() => {
        if (generation !== this.choiceGeneration || !current()) return;
        onSuccess();
        this.onChange();
      }, fail);
    } catch { fail(); }
  }

  scheduleExpiry() {
    this.clock.clearTimeout(this.expiryTimer);
    this.expiries=Object.fromEntries(['phone','media'].map(key=>[key,this.clock.now()+this.state.homeStatus[key].freshForMs]));
    this.expireStatus();
  }

  expireStatus() {
    const delays=[];
    for(const key of ['phone','media']) {
      const value=this.state.homeStatus[key];
      if(value.status!=='available')continue;
      const remaining=this.expiries[key]-this.clock.now();
      if(remaining<=0)this.state.homeStatus[key]={...emptyHomeStatus('stale')[key],phoneId:value.phoneId};
      else delays.push(remaining);
    }
    if(delays.length){this.expiryTimer=this.clock.setTimeout(()=>{this.expireStatus();this.onChange();},Math.min(...delays));this.expiryTimer?.unref?.();}
  }

  media(control) {
    if(!['play','pause'].includes(control))throw Error('Unsupported media control');
    const media=this.state.homeStatus.media;
    if(this.pendingPhone||media.status!=='available'||media.playing===null||media.phoneId!==this.state.activePhone)throw Error('Media unavailable');
    const generation=++this.mediaGeneration;
    this.state.commandError=false;this.state.mediaPending=true;
    const settled=()=>{this.state.mediaPending=false;};
    this.command('media',{control,phoneId:media.phoneId},settled,settled,()=>generation===this.mediaGeneration);
  }

  exitToDesktop(){
    if(!this.state.desktopAvailable||this.state.motionState==='moving')throw Error('Desktop session unavailable');
    this.command('exitToDesktop',undefined);
  }

  navigate(route) {
    if (!navigableRoutes.has(route)) throw Error('Unknown route');
    this.endLayoutEdit();
    this.cancelSelection();
    this.state.commandError = false;
    this.localRoute=localRoutes.has(route)?route:null;
    if(this.localRoute){this.state.screen=this.localRoute;this.onChange();return;}
    if(!this.state.connected){
      this.state.screen=['settings','projection'].includes(route)?route:'home';
      this.onChange();
      return;
    }
    this.command('navigate',route);
  }

  home() { this.navigate('home'); }

  setHomeMode(mode) {
    if (!['apps','dashboard'].includes(mode)) throw Error('Unknown Home layout');
    this.navigate(mode === 'apps' ? 'home' : 'dashboard');
  }

  connect(id) {
    if (!this.state.connected || !this.state.phones.some(p => p.id === id)) throw Error('Unknown phone');
    this.cancelSelection();
    this.pendingPhone = id;
    this.state.commandError = false;
    if (this.state.activePhone === id) {
      this.selectionAccepted = true;
      this.advanceSelection();
      return;
    }
    this.command('selectPhone',id,() => {
      this.selectionAccepted = true;
      this.advanceSelection();
    },() => { this.pendingPhone = null; });
  }
}
