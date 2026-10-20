import {watchParentLifeline} from './parent-lifeline.mjs';
import {CoreTransport} from '../src/transport.mjs';
import {HeadunitController} from '../src/controller.mjs';
import {FilePreferences} from '../src/preferences.mjs';
import {attachHeadunitHost} from './host.mjs';

/** Attach the glass shell to a host-owned window. Only start() opens core.sock. */
export function createGlassRuntime({ipcMain,trustedWindow,trustedUrl,socketPath,preferencePath,connectSocket,lifeline}) {
  const transport = new CoreTransport(socketPath,connectSocket);
  const preferences = new FilePreferences(preferencePath);
  const controller = new HeadunitController(transport,preferences);
  let detach;
  try {
    detach = attachHeadunitHost({ipcMain,trustedWindow,trustedUrl,controller});
  } catch (error) {
    controller.dispose();
    transport.stop();
    throw error;
  }
  let disposed = false;
  let started = false;
  let detachLifeline = () => {};
  const contents = trustedWindow.webContents;
  function dispose() {
    if (disposed) return;
    disposed = true;
    detachLifeline();
    contents.removeListener('destroyed',dispose);
    contents.removeListener('render-process-gone',dispose);
    detach();
    controller.dispose();
    transport.stop();
  }
  contents.on('destroyed',dispose);
  contents.on('render-process-gone',dispose);
  return {
    start() {
      if (disposed) throw Error('Glass runtime disposed');
      if(started)return;
      started=true;
      try {
        if(lifeline) {
          const onLost=lifeline.onLost;
          if(typeof onLost!=='function')throw new TypeError('Parent loss callback required');
          detachLifeline=watchParentLifeline({...lifeline,onLost:()=>{dispose();onLost();}});
        }
        if(disposed){detachLifeline();return;}
        transport.start();
      } catch(error) {dispose();throw error;}
    },
    dispose,
  };
}
