'use strict';
// Sandboxed preload: require only Electron's provided module, never Node or core.
const {contextBridge, ipcRenderer} = require('electron');
const listeners = new Set();
const api = Object.freeze({
  getBluetooth:()=>ipcRenderer.invoke('headunit:get-bluetooth'),
  discoverBluetooth:()=>ipcRenderer.invoke('headunit:discover-bluetooth'),
  stopBluetoothDiscovery:()=>ipcRenderer.invoke('headunit:stop-bluetooth-discovery'),
  pairBluetooth:id=>ipcRenderer.invoke('headunit:pair-bluetooth',id),
  cancelBluetoothPairing:()=>ipcRenderer.invoke('headunit:cancel-bluetooth-pairing'),
  confirmBluetooth:(token,value)=>ipcRenderer.invoke('headunit:confirm-bluetooth',token,value),
  connectBluetoothMusic:id=>ipcRenderer.invoke('headunit:connect-bluetooth-music',id),
  releaseBluetoothMusic:()=>ipcRenderer.invoke('headunit:release-bluetooth-music'),
  acknowledgeBluetoothPause:(token,value)=>ipcRenderer.invoke('headunit:acknowledge-bluetooth-pause',token,value),
  onBluetooth(callback){
    if(typeof callback!=='function')throw new TypeError('Bluetooth callback required');
    const listener=(_event,value)=>callback(value),entry={channel:'headunit:bluetooth',listener};listeners.add(entry);ipcRenderer.on(entry.channel,listener);
    return()=>{ipcRenderer.removeListener(entry.channel,listener);listeners.delete(entry);};
  },
  getView: () => ipcRenderer.invoke('headunit:get-view'),
  signalReady: () => ipcRenderer.invoke('headunit:renderer-ready'),
  getUpdateStatus: () => ipcRenderer.invoke('headunit:get-update-status'),
  requestUpdate: parkedConfirmed => ipcRenderer.invoke('headunit:request-update', parkedConfirmed),
  cancelUpdate: () => ipcRenderer.invoke('headunit:cancel-update'),
  getMetrics: () => ipcRenderer.invoke('headunit:get-metrics'),
  getWeather: () => ipcRenderer.invoke('headunit:get-weather'),
  openWeatherAttribution: () => ipcRenderer.invoke('headunit:open-weather-source'),
  openLocationAttribution: () => ipcRenderer.invoke('headunit:open-location-source'),
  searchWeather: query => ipcRenderer.invoke('headunit:search-weather', query),
  selectWeather: id => ipcRenderer.invoke('headunit:select-weather', id),
  getTimeStatus: () => ipcRenderer.invoke('headunit:get-time-status'),
  setNtp: value => ipcRenderer.invoke('headunit:set-ntp', value),
  setTimezone: value => ipcRenderer.invoke('headunit:set-timezone', value),
  setManualTime: value => ipcRenderer.invoke('headunit:set-manual-time', value),
  stopMetrics: () => ipcRenderer.invoke('headunit:stop-metrics'),
  exitToDesktop: () => ipcRenderer.invoke('headunit:exit-to-desktop'),
  onView(callback) {
    if (typeof callback !== 'function') throw new TypeError('A view callback is required');
    // The privileged IpcRendererEvent must never reach the page's callback.
    const listener = (_event, view) => callback(view);
    ipcRenderer.on('headunit:view', listener);
    const entry={channel:'headunit:view',listener};listeners.add(entry);
    return () => {
      ipcRenderer.removeListener('headunit:view', listener);
      listeners.delete(entry);
    };
  },
  onWeather(callback) {
    if (typeof callback !== 'function') throw new TypeError('A weather callback is required');
    const listener = (_event, view) => callback(view);
    ipcRenderer.on('headunit:weather', listener);
    const entry={channel:'headunit:weather',listener};listeners.add(entry);
    return () => {
      ipcRenderer.removeListener('headunit:weather', listener);
      listeners.delete(entry);
    };
  },
  onUpdateStatus(callback) {
    if (typeof callback !== 'function') throw new TypeError('An update callback is required');
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('headunit:update-status', listener);
    const entry={channel:'headunit:update-status',listener};listeners.add(entry);
    return () => {ipcRenderer.removeListener('headunit:update-status',listener);listeners.delete(entry);};
  },
  navigate: route => ipcRenderer.invoke('headunit:navigate', route),
  selectPhone: id => ipcRenderer.invoke('headunit:select-phone', id),
  setVolume: value => ipcRenderer.invoke('headunit:set-volume', value),
  touch: points => ipcRenderer.invoke('headunit:touch', points),
  cancelTouch: () => ipcRenderer.invoke('headunit:cancel-touch'),
  media: (control,phoneId) => ipcRenderer.invoke('headunit:media', control,phoneId),
});
window.addEventListener('unload', () => {
  for(const {channel,listener} of listeners)ipcRenderer.removeListener(channel,listener);
  listeners.clear();
});
contextBridge.exposeInMainWorld('headunit', api);
