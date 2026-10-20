import path from 'node:path';
import {headunitWindowOptions} from './host.mjs';
import {createGlassRuntime} from './glass-runtime.mjs';

/** Main-process owner. Does not spawn LIVI, alter services, or expose process controls to IPC. */
export function startHeadunitApplication({app,BrowserWindow,ipcMain,signals=process,env=process.env,
  pageURL=new URL('../dist/index.html',import.meta.url).href,createRuntime=createGlassRuntime}) {
  const socketPath=env.LIVI_CORE_SOCKET;
  if(typeof socketPath!=='string'||!path.isAbsolute(socketPath)||path.basename(socketPath)!=='core.sock'||socketPath.includes('\0'))throw Error('Explicit LIVI_CORE_SOCKET required');
  const url=new URL(pageURL);
  if(url.protocol!=='file:'||url.hostname||url.search||url.hash||url.href!==pageURL)throw Error('Trusted local shell page required');
  for(const flag of ['no-sandbox','disable-setuid-sandbox','disable-web-security','allow-running-insecure-content']) {
    if(app.commandLine.hasSwitch?.(flag))throw Error('Unsafe Electron launch flags');
  }
  // A zero exit from a supervised duplicate means "stop core" at the pinned supervisor.
  if(!app.requestSingleInstanceLock()) {
    app.exit(env.LIVI_LIFELINE==='1'?1:0);
    return {ready:Promise.resolve(),shutdown:()=>{}};
  }
  let stopping=false,runtime,window;
  const listeners=[];
  const on=(target,event,fn)=>{target.on(event,fn);listeners.push([target,event,fn]);};
  function cleanup() {
    for(const [target,event,fn] of listeners.splice(0))target.removeListener(event,fn);
    runtime?.dispose();
  }
  function shutdown(code=0) {
    if(stopping)return;
    stopping=true;
    cleanup();
    if(code)app.exit(code);else app.quit();
  }
  // Deliberately no show/focus/restore or commands: another launch cannot steal input ownership.
  on(app,'second-instance',()=>{});
  on(app,'before-quit',()=>{if(!stopping){stopping=true;cleanup();}});
  on(signals,'SIGTERM',()=>shutdown());
  on(signals,'SIGINT',()=>shutdown());
  const compositor=env.LIVI_COMPOSITOR==='1';
  if(compositor)app.commandLine.appendSwitch('ozone-platform','wayland');
  const ready=app.whenReady().then(async()=>{
    if(stopping)return;
    window=new BrowserWindow({...headunitWindowOptions({compositor}),show:false});
    on(window,'closed',()=>shutdown());
    on(window.webContents,'render-process-gone',()=>shutdown(1));
    runtime=createRuntime({ipcMain,trustedWindow:window,trustedUrl:pageURL,socketPath,
      preferencePath:path.join(app.getPath('userData'),'headunit-preferences.json'),
      lifeline:{env,onLost:()=>shutdown()}});
    runtime.start();
    if(stopping)return;
    await window.loadURL(pageURL);
    if(!stopping)window.show();
  }).catch(()=>shutdown(1));
  return {ready,shutdown};
}
