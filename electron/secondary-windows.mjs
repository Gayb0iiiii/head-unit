import {fileURLToPath} from 'node:url';
import {headunitWindowOptions} from './host.mjs';
import {attachCompositorWindow} from './compositor-window.mjs';
const roles=['cluster','aux'];
const preload=fileURLToPath(new URL('./secondary-preload.cjs',import.meta.url));
const channels=['headunit-secondary:get-view','headunit-secondary:shown'];

/** Opt-in compositor role windows; no main controls, telemetry or native process ownership. */
export function createSecondaryWindows({BrowserWindow,ipcMain,transport,config,screen,
  pageURL=new URL('./secondary.html',import.meta.url).href}) {
  const url=new URL(pageURL);
  if(url.protocol!=='file:'||url.hostname||url.search||url.hash||url.href!==pageURL)throw Error('Local secondary document required');
  const byRole=new Map(),byContents=new Map(),blocked=new Set(),registered=[];
  let seenGeneration=transport.generation;
  let disposed=false,currentConfig=null,detachConfig=()=>{},detachTransport=()=>{};
  const current=entry=>!disposed&&entry.live&&byRole.get(entry.role)===entry&&!entry.window.isDestroyed();
  function trusted(entry,event) {
    const wc=entry?.window.webContents;
    if(!entry||!current(entry)||entry.navigating||wc.isDestroyed()||wc.getURL()!==pageURL||wc.mainFrame?.url!==pageURL||event.sender!==wc||event.senderFrame!==wc.mainFrame)throw Error('Untrusted secondary sender');
  }
  function view(entry) {
    const connected=current(entry)&&currentConfig?.available===true&&currentConfig[entry.role]?.active===true&&transport.status==='ready'&&transport.session.ready===true;
    const nativeFront=connected?transport.session.state?.front?.[entry.role]:null;
    return {role:entry.role,connected,front:['livi','cluster','camera','projection'].includes(nativeFront)?nativeFront:null,presented:current(entry)&&entry.presented};
  }
  function publish(entry) {
    const wc=entry.window.webContents;
    try {trusted(entry,{sender:wc,senderFrame:wc.mainFrame});wc.send('headunit-secondary:view',view(entry));}catch{/* A lease/frame may already be gone. */}
  }
  function retire(entry,{destroy=true,block=false}={}) {
    if(!entry.live)return;
    entry.live=false;
    if(byRole.get(entry.role)===entry)byRole.delete(entry.role);
    byContents.delete(entry.window.webContents);
    if(block)blocked.add(entry.role);
    entry.detachPresentation?.();
    for(const [target,event,listener] of entry.listeners)target.removeListener(event,listener);
    entry.listeners.length=0;
    if(destroy&&!entry.window.isDestroyed())entry.window.destroy();
  }
  function spawn(role) {
    let entry;
    try {
      const base=headunitWindowOptions({compositor:true});
      const window=new BrowserWindow({...base,title:`livi:${role}`,show:false,
        webPreferences:{...base.webPreferences,preload,partition:`headunit-secondary-${role}`}});
      entry={role,window,live:true,presented:false,navigating:false,reported:false,listeners:[]};
      byRole.set(role,entry);byContents.set(window.webContents,entry);
      const on=(target,event,listener)=>{target.on(event,listener);entry.listeners.push([target,event,listener]);};
      const wc=window.webContents,prevent=event=>event.preventDefault();
      wc.setWindowOpenHandler(()=>({action:'deny'}));
      wc.session.setPermissionCheckHandler(()=>false);
      wc.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
      for(const name of ['will-navigate','will-frame-navigate','will-redirect','will-attach-webview','page-title-updated'])on(wc,name,prevent);
      on(wc,'did-start-navigation',(details,_url,_same,isMainFrame)=>{if(details?.isMainFrame??isMainFrame)entry.navigating=true;});
      on(wc,'did-navigate',()=>{if(current(entry)&&wc.getURL()===pageURL)entry.navigating=false;});
      on(wc,'render-process-gone',()=>retire(entry,{block:true}));
      on(wc,'destroyed',()=>retire(entry,{block:true}));
      on(window,'closed',()=>retire(entry,{destroy:false,block:true}));
      entry.detachPresentation=attachCompositorWindow({window,screen,subscribeConfig:listener=>config.subscribe(value=>listener({...value,main:value[role]}))});
      Promise.resolve(window.loadURL(pageURL)).then(()=>{
        if(!current(entry))return;
        if(wc.getURL()!==pageURL||wc.mainFrame?.url!==pageURL){retire(entry,{block:true});return;}
        entry.navigating=false;entry.presented=true;
        window.showInactive();publish(entry);
      }).catch(()=>{if(current(entry))retire(entry,{block:true});});
    }catch{
      blocked.add(role);if(entry)retire(entry);
    }
  }
  function sync(value) {
    if(disposed)return;
    currentConfig=value;
    if(value.available!==true){for(const entry of [...byRole.values()])retire(entry);return;}
    if(transport.generation!==seenGeneration){blocked.clear();seenGeneration=transport.generation;}
    for(const role of roles) {
      if(value[role]?.active!==true){if(value[role]?.active===false)blocked.delete(role);const entry=byRole.get(role);if(entry)retire(entry);}
      else if(!byRole.has(role)&&!blocked.has(role))spawn(role);
    }
  }
  function register(channel,operation) {
    ipcMain.handle(channel,async(event,...args)=>{
      const entry=byContents.get(event?.sender);
      trusted(entry,event);
      if(args.length)throw Error('Invalid secondary arguments');
      try{return await operation(entry,event);}catch{throw Error('Secondary operation unavailable');}
    });registered.push(channel);
  }
  function dispose() {
    if(disposed)return;
    disposed=true;detachConfig();detachTransport();
    for(const entry of [...byRole.values()])retire(entry);
    for(const channel of registered)ipcMain.removeHandler(channel);
  }
  try {
    register(channels[0],entry=>view(entry));
    register(channels[1],async(entry,event)=>{
      const state=view(entry);
      if(!state.connected||!state.presented||state.front!=='livi'||entry.reported)throw Error('Cannot report this shell');
      entry.reported=true;
      const ok=await new Promise((resolve,reject)=>{
        try{transport.session.action({kind:'show',screen:entry.role,front:'livi'},resolve);}catch(error){reject(error);}
      });
      trusted(entry,event);
      if(!ok||!view(entry).connected)throw Error('Report not confirmed');
      return {accepted:true};
    });
    detachConfig=config.subscribe(sync);
    detachTransport=transport.subscribe(()=>{if(!disposed)for(const entry of byRole.values())publish(entry);});
  }catch(error){dispose();throw error;}
  return {dispose};
}
