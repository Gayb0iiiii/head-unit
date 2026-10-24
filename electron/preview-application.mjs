/** UI-only boot path. This page has no preload, core socket, or live device data. */
export function startPreviewApplication({app,BrowserWindow,signals=process,platform=process.platform,
  pageURL=new URL('../dist/index.html',import.meta.url).href}) {
  const url=new URL(pageURL);
  if(url.protocol!=='file:'||url.hostname||url.search||url.hash||url.href!==pageURL)throw Error('Trusted local preview page required');
  for(const flag of ['no-sandbox','disable-setuid-sandbox','disable-web-security','allow-running-insecure-content'])
    if(app.commandLine.hasSwitch?.(flag))throw Error('Unsafe Electron launch flags');
  if(!app.requestSingleInstanceLock()){app.exit(0);return {ready:Promise.resolve(),shutdown:()=>{}};}
  if(platform==='linux'){
    app.setDesktopName('dev.f-io.livi-preview.desktop');
    app.commandLine.appendSwitch('ozone-platform','wayland');
  }
  let stopping=false,window;
  const listeners=[];
  const on=(target,event,fn)=>{target.on(event,fn);listeners.push([target,event,fn]);};
  const cleanup=()=>{for(const [target,event,fn] of listeners.splice(0))target.removeListener(event,fn);};
  function shutdown(code=0){if(stopping)return;stopping=true;cleanup();if(code)app.exit(code);else app.quit();}
  on(app,'second-instance',()=>{});
  on(app,'before-quit',()=>{stopping=true;cleanup();});
  on(signals,'SIGTERM',()=>shutdown());on(signals,'SIGINT',()=>shutdown());
  const ready=app.whenReady().then(async()=>{
    if(stopping)return;
    window=new BrowserWindow({show:false,fullscreen:true,frame:false,autoHideMenuBar:true,backgroundColor:'#172739',
      webPreferences:{contextIsolation:true,nodeIntegration:false,nodeIntegrationInSubFrames:false,sandbox:true,webSecurity:true,webviewTag:false}});
    const contents=window.webContents;
    const prevent=event=>event.preventDefault();
    contents.setWindowOpenHandler(()=>({action:'deny'}));
    for(const event of ['will-navigate','will-frame-navigate','will-redirect','will-attach-webview'])on(contents,event,prevent);
    on(contents,'render-process-gone',()=>shutdown(1));
    on(window,'closed',()=>shutdown());
    await window.loadURL(pageURL);
    if(!stopping)window.show();
  }).catch(()=>shutdown(1));
  return {ready,shutdown,get window(){return window;}};
}
