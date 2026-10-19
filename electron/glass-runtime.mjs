import {CoreTransport} from '../src/transport.mjs';
import {HeadunitController} from '../src/controller.mjs';
import {FilePreferences} from '../src/preferences.mjs';
import {attachHeadunitHost} from './host.mjs';

/** Attach the glass shell to a host-owned window. Only start() opens core.sock. */
export function createGlassRuntime({ipcMain,trustedWindow,trustedUrl,socketPath,preferencePath,connectSocket}) {
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
  const contents = trustedWindow.webContents;
  function dispose() {
    if (disposed) return;
    disposed = true;
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
      transport.start();
    },
    dispose,
  };
}
