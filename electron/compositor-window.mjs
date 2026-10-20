/** Local counterpart of pinned LIVI's delayed fullscreen and resize reflow. */
export function attachCompositorWindow({window:win,screen,kiosk=false}) {
  let disposed=false,fullscreenTimer,resizeTimer,restoreTimer,expected,pendingOriginal,restoring=false;
  const live=()=>!disposed&&!win.isDestroyed();
  const same=(a,b)=>a&&b&&a[0]===b[0]&&a[1]===b[1];
  const valid=size=>size.every(n=>Number.isSafeInteger(n)&&n>0&&n<2147483647);
  function cancelReflow() {
    clearTimeout(resizeTimer);clearTimeout(restoreTimer);
    resizeTimer=restoreTimer=undefined;expected=pendingOriginal=undefined;restoring=false;
  }
  function transition() {
    clearTimeout(fullscreenTimer);fullscreenTimer=undefined;
    cancelReflow();
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
    if(!live()||win.isFullScreen())return;
    if(same(expected,win.getContentSize())){restoring=false;observed();return;}
    // A rejected nudge or competing resize is authoritative, never a retry trigger.
    if(pendingOriginal||restoreTimer||restoring){cancelReflow();return;}
    cancelReflow();
    resizeTimer=setTimeout(()=>{
      resizeTimer=undefined;
      if(!live()||win.isFullScreen())return;
      const original=win.getContentSize();
      if(!valid(original))return;
      expected=[original[0],original[1]+1];
      pendingOriginal=original;
      win.setContentSize(...expected);
      observed();
    },200);
  }
  function ready() {
    if(!kiosk||!live())return;
    fullscreenTimer=setTimeout(()=>{
      fullscreenTimer=undefined;
      if(!live()||win.isFullScreen())return;
      const {width,height}=screen.getDisplayMatching(win.getBounds()).size;
      if(!valid([width,height]))return;
      cancelReflow();expected=[width,height];
      win.setContentSize(width,height);
      win.setFullScreen(true);
    },400);
  }
  function dispose() {
    if(disposed)return;
    disposed=true;transition();
    for(const [event,fn] of listeners)win.removeListener(event,fn);
  }
  const listeners=[['resize',resize],['enter-full-screen',transition],['leave-full-screen',transition],['closed',dispose],['ready-to-show',ready]];
  for(const [event,fn] of listeners)event==='ready-to-show'?win.once(event,fn):win.on(event,fn);
  return dispose;
}
