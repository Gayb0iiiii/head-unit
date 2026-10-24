import {resolveAppearance} from './appearance.mjs';
import {validateWallpaperDataUrl} from './wallpaper-image.mjs';
/** UI simulation only. Never sends projection, audio, or vehicle commands. */
const restorableScreens = new Set(['home', 'phones', 'projection', 'settings', 'diagnostics', 'vehicle', 'audio']);
const homeModes = new Set(['apps', 'dashboard']);
const wallpapers = new Set(['coast', 'dusk', 'graphite']);
const defaultOrders = Object.freeze({
  apps: Object.freeze(['projection', 'phones', 'vehicle', 'audio', 'settings']),
  dashboard: Object.freeze(['music', 'temperature'])
});
const nativeAppOrder=Object.freeze(['radio','bluetooth','projection','settings']);
const orderKey = kind => kind === 'apps' ? 'appOrder' : 'dashboardOrder';
const sanitizeOrder = (value, defaults) => [...new Set([
  ...(Array.isArray(value) ? value.filter(id => defaults.includes(id)) : []), ...defaults
])];
const validGlassStrength = value => Number.isInteger(value) && value >= 0 && value <= 100;
const validUiScale = value => Number.isInteger(value) && value >= 90 && value <= 115 && value % 5 === 0;

export class Headunit {
  constructor(storage, {simulation = true} = {}) {
    this.storage = storage;
    this.orders={apps:simulation?defaultOrders.apps:nativeAppOrder,dashboard:defaultOrders.dashboard};
    this.lastPhone = null;
    this.state = {
      screen: 'home', homeMode: 'apps', activePhone: null,
      appearancePreference: 'auto', appearance: resolveAppearance(),
      vehicleStatus: 'independent', wallpaper: 'coast', dockSide: 'left', demoPlaying: false,
      glassStrength: 55, uiScale:100, customWallpaper:null, debugOverlay:false, appOrder: [...this.orders.apps], dashboardOrder: [...defaultOrders.dashboard],
      editingLayout: false, motionState: 'unknown', persistenceError: false,
      phones: simulation ? [
        { id: 'phone-a', name: 'Driver’s iPhone', active: false },
        { id: 'phone-b', name: 'Passenger’s iPhone', active: false }
      ] : []
    };
    try {
      const saved = JSON.parse(storage?.getItem('headunit.appearance') || '{}');
      if (['auto','day','night'].includes(saved?.appearancePreference)) this.state.appearancePreference = saved.appearancePreference;
      this.state.appearance = resolveAppearance(this.state.appearancePreference, undefined, saved?.lastAppearance);
      if (['left','right'].includes(saved?.dockSide)) this.state.dockSide = saved.dockSide;
      if (wallpapers.has(saved?.wallpaper)) this.state.wallpaper = saved.wallpaper;
      if(saved?.wallpaper==='custom'){
        try{this.state.customWallpaper=validateWallpaperDataUrl(storage?.getItem('headunit.wallpaper.image'));this.state.wallpaper='custom';}catch{}
      }
      if (validGlassStrength(saved?.glassStrength)) this.state.glassStrength = saved.glassStrength;
      if (validUiScale(saved?.uiScale)) this.state.uiScale=saved.uiScale;
      if (typeof saved?.debugOverlay==='boolean') this.state.debugOverlay=saved.debugOverlay;
    } catch {}
    try {
      const saved = JSON.parse(storage?.getItem('headunit.navigation') || '{}');
      if (restorableScreens.has(saved?.screen)) this.state.screen = saved.screen;
      if (homeModes.has(saved?.homeMode)) this.state.homeMode = saved.homeMode;
    } catch {}
    try {
      const saved = JSON.parse(storage?.getItem('headunit.layout') || '{}');
      this.state.appOrder = sanitizeOrder(saved?.appOrder, this.orders.apps);
      this.state.dashboardOrder = sanitizeOrder(saved?.dashboardOrder, defaultOrders.dashboard);
    } catch {}
    this.preferredScreen = this.state.screen;
  }

  // Only explicit, allowlisted navigation writes startup preferences. Native
  // overlays, connection state, selected phones, and playback are never restored.
  navigate(screen) {
    if (!restorableScreens.has(screen)) throw Error('Unknown screen');
    this.state.screen = screen;
    this.endLayoutEdit();
    this.preferredScreen = screen;
    try {
      this.storage?.setItem('headunit.navigation', JSON.stringify({
        screen, homeMode: this.state.homeMode
      }));
    } catch {}
  }

  setHomeMode(mode) {
    if (!homeModes.has(mode)) throw Error('Unknown Home layout');
    this.state.homeMode = mode;
    this.endLayoutEdit();
    this.home();
  }

  connect(id) {
    if (!this.state.phones.some(p => p.id === id)) throw Error('Unknown phone');
    this.lastPhone = id;
    this.state.activePhone = id;
    this.state.phones.forEach(p => { p.active = p.id === id; });
    this.navigate('projection');
  }

  home() { this.navigate('home'); }

  disconnect() {
    this.state.activePhone = null;
    this.state.phones.forEach(p => { p.active = false; });
    this.state.screen = 'home';
  }

  reconnect() {
    if (!this.lastPhone) return;
    this.state.activePhone = this.lastPhone;
    this.state.phones.forEach(p => { p.active = p.id === this.lastPhone; });
    this.state.screen = this.preferredScreen;
  }

  toggleDemoPlayback() { this.state.demoPlaying = !this.state.demoPlaying; }

  wallpaper(value) {
    if (!wallpapers.has(value) && !(value==='custom'&&this.state.customWallpaper)) throw Error('Unknown wallpaper');
    if (this.state.motionState === 'moving') return false;
    this.state.wallpaper = value;
    this.saveAppearance();
  }

  setCustomWallpaper(dataUrl){
    const image=validateWallpaperDataUrl(dataUrl);
    if(this.state.motionState==='moving')return false;
    this.state.customWallpaper=image;this.state.wallpaper='custom';
    let saved=true;
    try{this.storage?.setItem('headunit.wallpaper.image',image);if(!this.storage?.setItem)saved=false;}catch{saved=false;}
    this.saveAppearance();if(!saved)this.state.persistenceError=true;
    return true;
  }

  resetCustomWallpaper(){
    if(this.state.motionState==='moving')return false;
    this.state.customWallpaper=null;this.state.wallpaper='coast';
    let removed=true;
    try{this.storage?.removeItem('headunit.wallpaper.image');if(!this.storage?.removeItem)removed=false;}catch{removed=false;}
    this.saveAppearance();if(!removed)this.state.persistenceError=true;
    return true;
  }

  setUiScale(value){
    if(!validUiScale(value))throw Error('UI scale must be 90% to 115% in 5% steps');
    if(this.state.motionState==='moving')return false;
    this.state.uiScale=value;this.saveAppearance();return true;
  }

  savePreference(key, value) {
    try {
      if (!this.storage?.setItem) throw Error('Preference storage unavailable');
      this.storage.setItem(key, JSON.stringify(value));
      this.state.persistenceError = false;
    } catch { this.state.persistenceError = true; }
  }

  saveAppearance() {
    this.savePreference('headunit.appearance', {
      appearancePreference: this.state.appearancePreference, lastAppearance: this.state.appearance.mode,
      wallpaper: this.state.wallpaper, glassStrength: this.state.glassStrength, uiScale:this.state.uiScale, dockSide: this.state.dockSide,
      debugOverlay:this.state.debugOverlay
    });
  }

  setDebugOverlay(value){
    if(typeof value!=='boolean')throw Error('Debug overlay setting must be boolean');
    this.state.debugOverlay=value;
    this.saveAppearance();
  }

  setAppearancePreference(value) {
    if (!['auto','day','night'].includes(value)) throw Error('Unknown appearance preference');
    if (this.state.motionState === 'moving') return false;
    this.state.appearancePreference = value;
    this.state.appearance = resolveAppearance(value, this.headlights, this.state.appearance.mode);
    this.saveAppearance();
    return true;
  }

  // Future verified provider seam only; neither preview nor native bridge supplies it yet.
  updateHeadlights(value) {
    if (value !== null && typeof value !== 'boolean') throw Error('Invalid headlight signal');
    this.headlights = value;
    const previous = this.state.appearance.mode;
    this.state.appearance = resolveAppearance(this.state.appearancePreference, value, previous);
    if (previous !== this.state.appearance.mode) this.saveAppearance();
  }

  setDockSide(value) {
    if (!['left','right'].includes(value)) throw Error('Unknown dock side');
    if (this.state.motionState === 'moving') return false;
    this.state.dockSide = value;
    this.saveAppearance();
    return true;
  }

  setGlassStrength(value) {
    if (!validGlassStrength(value)) throw Error('Glass strength must be an integer from 0 to 100');
    if (this.state.motionState === 'moving') return false;
    this.state.glassStrength = value;
    this.saveAppearance();
  }

  // Motion is an ephemeral host signal. Never infer parked from missing data,
  // persist a safe-looking state, or synthesize telemetry for this preview.
  setMotionState(value) {
    if (!['unknown', 'stationary', 'moving'].includes(value)) throw Error('Unknown motion state');
    this.state.motionState = value;
    if (value === 'moving') this.endLayoutEdit();
  }

  beginLayoutEdit() {
    if (this.state.motionState === 'moving') return false;
    this.state.editingLayout = true;
    return true;
  }

  endLayoutEdit() { this.state.editingLayout = false; }

  moveLayoutItem(kind, id, direction) {
    if (!Object.hasOwn(this.orders, kind)) throw Error('Unknown layout');
    if (!this.orders[kind].includes(id) || ![-1, 1].includes(direction)) throw Error('Invalid layout move');
    if (!this.state.editingLayout || this.state.motionState === 'moving') return false;
    const order = this.state[orderKey(kind)];
    const current = order.indexOf(id), next = current + direction;
    if (next < 0 || next >= order.length) return false;
    [order[current], order[next]] = [order[next], order[current]];
    this.saveLayout();
    return true;
  }

  resetLayout(kind) {
    if (!Object.hasOwn(this.orders, kind)) throw Error('Unknown layout');
    if (!this.state.editingLayout || this.state.motionState === 'moving') return false;
    this.state[orderKey(kind)] = [...this.orders[kind]];
    this.saveLayout();
    return true;
  }

  saveLayout() {
    this.savePreference('headunit.layout', {
      appOrder: this.state.appOrder, dashboardOrder: this.state.dashboardOrder
    });
  }
}
