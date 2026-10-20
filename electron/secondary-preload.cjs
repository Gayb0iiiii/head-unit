'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const listeners=new Set();
const api=Object.freeze({
  getView:()=>ipcRenderer.invoke('headunit-secondary:get-view'),
  shown:()=>ipcRenderer.invoke('headunit-secondary:shown'),
  onView(callback) {
    if(typeof callback!=='function')throw new TypeError('View callback required');
    const listener=(_event,view)=>callback(view);
    ipcRenderer.on('headunit-secondary:view',listener);listeners.add(listener);
    return()=>{ipcRenderer.removeListener('headunit-secondary:view',listener);listeners.delete(listener);};
  },
});
window.addEventListener('unload',()=>{for(const listener of listeners)ipcRenderer.removeListener('headunit-secondary:view',listener);listeners.clear();});
contextBridge.exposeInMainWorld('headunitSecondary',api);
