import path from 'node:path';
import {attachCompositorWindow} from './compositor-window.mjs';
import {headunitWindowOptions} from './host.mjs';
import {createGlassRuntime} from './glass-runtime.mjs';

/** Main-process owner. Does not spawn LIVI, alter services, or expose process controls to IPC. */
export function startHeadunitApplication({app,BrowserWindow,Menu,shell,ipcMain,signals=process,env=process.env,screen,platform=process.platform,
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
    console.error('Headunit startup rejected: another instance holds the profile lock.');
    app.exit(env.LIVI_LIFELINE==='1'?1:0);
    return {ready:Promise.resolve(),shutdown:()=>{}};
  }
  if(platform==='linux')app.setDesktopName('dev.f-io.livi.desktop');
  let stopping=false,runtime,window,detachWindow;
  const listeners=[];
  const on=(target,event,fn)=>{target.on(event,fn);listeners.push([target,event,fn]);};
  function cleanup() {
    for(const [target,event,fn] of listeners.splice(0))target.removeListener(event,fn);
    detachWindow?.();
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
    if(env.HEADUNIT_DEBUG==='1')console.error('Headunit: Electron ready; creating window');
    Menu?.setApplicationMenu(null);
    window=new BrowserWindow({...headunitWindowOptions({compositor}),show:false});
    on(window,'closed',()=>{if(env.HEADUNIT_DEBUG==='1')console.error('Headunit: window closed');shutdown();});
    on(window.webContents,'render-process-gone',(_event,details)=>{console.error('Headunit renderer exited:',details);shutdown(1);});
    runtime=createRuntime({ipcMain,trustedWindow:window,trustedUrl:pageURL,socketPath,
      ...(compositor&&env.HEADUNIT_SECONDARY_WINDOWS==='1'?{secondary:{BrowserWindow,screen}}:{}),
      preferencePath:path.join(app.getPath('userData'),'headunit-preferences.json'),
      localServices:env.HEADUNIT_SESSION==='1',
      openWeatherAttribution:shell?()=>shell.openExternal('https://open-meteo.com/'):undefined,
      openLocationAttribution:shell?()=>shell.openExternal('https://www.geonames.org/'):undefined,
      lifeline:{env,onLost:()=>shutdown()}});
    if(compositor)detachWindow=attachCompositorWindow({window,screen,kiosk:env.LIVI_KIOSK==='1',subscribeConfig:runtime.subscribeWindowConfig});
    runtime.start();
    if(stopping)return;
    if(env.HEADUNIT_DEBUG==='1')console.error('Headunit: loading trusted local page');
    await window.loadURL(pageURL);
    if(env.HEADUNIT_DEBUG==='1')console.error('Headunit: page loaded');
    if(!stopping)window.show();
  }).catch(error=>{console.error('Headunit window startup failed:',error);shutdown(1);});
  return {ready,shutdown};
}
