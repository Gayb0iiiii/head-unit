import {fileURLToPath} from 'node:url';
import {attachHeadunitBoundary} from './main-boundary.mjs';

const preload = fileURLToPath(new URL('./preload.cjs',import.meta.url));
/** Supply to a BrowserWindow created by the privileged host, before loading its UI. */
export function headunitWindowOptions({compositor=false} = {}) {
  if(typeof compositor!=='boolean')throw new TypeError('Compositor mode must be boolean');
  return {
    ...(compositor ? {} : {width:1280,height:720}), transparent:true, backgroundColor:'#00000000',
    ...(compositor ? {title:'livi:main',frame:false,useContentSize:true,kiosk:false,fullscreenable:true,autoHideMenuBar:true} : {}),
    webPreferences:{backgroundThrottling:false,preload, contextIsolation:true, nodeIntegration:false, nodeIntegrationInSubFrames:false, sandbox:true, webSecurity:true, webviewTag:false},
  };
}

/** Attach after construction and before loadURL. Does not create or load a window. */
export function attachHeadunitHost(options) {
  const contents = options.trustedWindow?.webContents;
  const preferences = contents?.getLastWebPreferences?.();
  if (!preferences || preferences.preload !== preload || preferences.contextIsolation !== true || preferences.nodeIntegration !== false || preferences.nodeIntegrationInSubFrames === true || preferences.sandbox !== true || preferences.webSecurity !== true || preferences.webviewTag === true) throw new Error('Unsafe headunit window preferences');
  const detachBoundary = attachHeadunitBoundary(options);
  const prevent = event => event.preventDefault();
  const navigationEvents = ['will-navigate','will-frame-navigate','will-redirect','will-attach-webview','page-title-updated'];
  contents.setWindowOpenHandler(() => ({action:'deny'}));
  for (const name of navigationEvents) contents.on(name,prevent);
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    detachBoundary();
    for (const name of navigationEvents) contents.removeListener(name,prevent);
    contents.removeListener('destroyed',dispose);
    contents.removeListener('render-process-gone',dispose);
    // Keep deny-new-windows installed for the remainder of the window's lifetime.
  }
  contents.on('destroyed',dispose);
  contents.on('render-process-gone',dispose);
  return dispose;
}
