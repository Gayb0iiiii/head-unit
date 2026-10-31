/** Local counterpart of pinned LIVI's delayed fullscreen and resize reflow. */
export function attachCompositorWindow({window:win,screen,kiosk=false,subscribeConfig}) {
  let disposed=false,fullscreenTimer,resizeTimer,restoreTimer,expected,pendingOriginal,restoring=false;
  let shown=false,settled=false,configKiosk=null,zoomPercent=null,lastZoom=null,unsubscribe=()=>{};
  let pendingFullscreen=null,queuedFullscreen=null;
  const live=()=>!disposed&&!win.isDestroyed();
  const same=(a,b)=>a&&b&&a[0]===b[0]&&a[1]===b[1];
  const valid=size=>size.every(n=>Number.isSafeInteger(n)&&n>0&&n<2147483647);
  function cancelReflow() {
    clearTimeout(resizeTimer);clearTimeout(restoreTimer);
    resizeTimer=restoreTimer=undefined;expected=pendingOriginal=undefined;restoring=false;
  }
  function applyZoom() {
    if(!shown||!live()||zoomPercent===null)return;
    const height=win.getContentSize()[1];
    if(!Number.isSafeInteger(height)||height<=0)return;
    const factor=(zoomPercent/100)*Math.min(1,height/292);
    if(lastZoom===factor)return;
    lastZoom=factor;win.webContents.setZoomFactor(factor);
  }
  function requestFullscreen(value) {
    if(!live()||win.isFullScreen()===value)return;
    cancelReflow();pendingFullscreen=queuedFullscreen=value;
    win.setFullScreen(value);
  }
  function configChanged(config) {
    if(!live())return;
    const prior=configKiosk;
    configKiosk=config?.available===true&&typeof config.main?.kiosk==='boolean'?config.main.kiosk:null;
    zoomPercent=config?.available===true&&Number.isInteger(config.zoomPercent)&&config.zoomPercent>=50&&config.zoomPercent<=200?config.zoomPercent:null;
    if(zoomPercent===null)lastZoom=null;
    applyZoom();
    if(pendingFullscreen!==null){
      if(prior!==configKiosk||configKiosk===null)queuedFullscreen=configKiosk;
    }else if(settled&&configKiosk!==null&&prior!==configKiosk)requestFullscreen(configKiosk);
  }
  function transition() {
    clearTimeout(fullscreenTimer);fullscreenTimer=undefined;
    if(shown)settled=true;
    cancelReflow();
    const requested=pendingFullscreen,next=queuedFullscreen;
    pendingFullscreen=queuedFullscreen=null;
    // Reconcile only a newer choice, never retry a host-rejected transition.
    if(requested!==null&&next!==null&&next!==requested)requestFullscreen(next);
  }
  function observed() {
    if(!pendingOriginal||!same(expected,win.getContentSize()))return;
    const original=pendingOriginal;
    pendingOriginal=undefined;
    restoreTimer=setTimeout(()=>{
      restoreTimer=undefined;
      if(!live()||win.isFullScreen()||!same(expected,win.getContentSize()))return;
      expected=original;restoring=true;
      win.setContentSize(...original);
    },60);
  }
  function resize() {
    applyZoom();
    if(!live()||win.isFullScreen()||pendingFullscreen!==null)return;
    if(same(expected,win.getContentSize())){restoring=false;observed();return;}
    // A rejected nudge or competing resize is authoritative, never a retry trigger.
    if(pendingOriginal||restoreTimer||restoring){cancelReflow();return;}
    cancelReflow();
    resizeTimer=setTimeout(()=>{
      resizeTimer=undefined;
      if(!live()||win.isFullScreen()||pendingFullscreen!==null)return;
      const original=win.getContentSize();
      if(!valid(original))return;
      expected=[original[0],original[1]+1];
      pendingOriginal=original;
      win.setContentSize(...expected);
      observed();
    },200);
  }
  function ready() {
    if(!live())return;
    shown=true;applyZoom();
    fullscreenTimer=setTimeout(()=>{
      fullscreenTimer=undefined;
      settled=true;
      if(!live()||(!kiosk&&configKiosk!==true)||win.isFullScreen())return;
      const {width,height}=screen.getDisplayMatching(win.getBounds()).size;
      if(!valid([width,height]))return;
      cancelReflow();expected=[width,height];
      win.setContentSize(width,height);
      requestFullscreen(true);
    },400);
  }
  function dispose() {
    if(disposed)return;
    disposed=true;transition();unsubscribe();
    for(const [event,fn] of listeners)win.removeListener(event,fn);
  }
  const listeners=[['resize',resize],['enter-full-screen',transition],['leave-full-screen',transition],['closed',dispose],['ready-to-show',ready]];
  for(const [event,fn] of listeners)event==='ready-to-show'?win.once(event,fn):win.on(event,fn);
  if(subscribeConfig){unsubscribe=subscribeConfig(configChanged);if(disposed)unsubscribe();}
  return dispose;
}
