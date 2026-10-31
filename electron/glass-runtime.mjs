import {createBluetoothRuntime} from './bluetooth-runtime.mjs';
import {createSecondaryWindows} from './secondary-windows.mjs';
import {observeWindowConfig} from './window-config.mjs';
import {watchParentLifeline} from './parent-lifeline.mjs';
import {CoreTransport} from '../src/transport.mjs';
import {HeadunitController} from '../src/controller.mjs';
import {FilePreferences} from '../src/preferences.mjs';
import {attachHeadunitHost} from './host.mjs';
import {createSystemMetrics} from './system-metrics.mjs';
import {createLogindDesktopHandoff} from './logind-desktop.mjs';
import {createWeatherService} from './weather-service.mjs';
import {fetchWeatherJSON,weatherCache} from './weather-host.mjs';
import {createTimeService} from './time-service.mjs';
import path from 'node:path';

/** Attach the glass shell to a host-owned window. Only start() opens core.sock. */
export function createGlassRuntime({ipcMain,trustedWindow,trustedUrl,socketPath,preferencePath,connectSocket,lifeline,secondary,desktopHandoff,weather,timeService,updateService,bluetoothOptions,onRendererReady,localServices=false,openWeatherAttribution,openLocationAttribution}) {
  const transport = new CoreTransport(socketPath,connectSocket);
  const preferences = new FilePreferences(preferencePath);
  const controller = new HeadunitController(transport,preferences);
  const handoff=desktopHandoff??createLogindDesktopHandoff();
  const cache=localServices?weatherCache(path.join(path.dirname(preferencePath),'headunit-weather.json')):null;
  const weatherSource=weather??(localServices?createWeatherService({fetchJSON:fetchWeatherJSON,readCache:cache.read,writeCache:cache.write}):null);
  const clockSource=timeService??(localServices?createTimeService():null);
  let bluetooth;
  let detach;
  try {
    bluetooth=createBluetoothRuntime({preferencePath:path.join(path.dirname(preferencePath),'headunit-bluetooth.json'),...bluetoothOptions,controller});
    detach = attachHeadunitHost({ipcMain,trustedWindow,trustedUrl,controller,systemMetrics:createSystemMetrics(),desktopHandoff:handoff,weather:weatherSource,timeService:clockSource,updateService,bluetooth,onRendererReady,openWeatherAttribution,openLocationAttribution});
  } catch (error) {
    handoff?.dispose?.();
    weatherSource?.dispose?.();
    void bluetooth?.dispose?.().catch(()=>{});
    controller.dispose();
    transport.stop();
    throw error;
  }
  const windowConfig=observeWindowConfig(transport);
  let disposed = false;
  let started = false;
  let detachLifeline = () => {};
  let secondaryWindows;
  const contents = trustedWindow.webContents;
  function dispose() {
    if (disposed) return;
    disposed = true;
    detachLifeline();
    secondaryWindows?.dispose();
    windowConfig.dispose();
    contents.removeListener('destroyed',dispose);
    contents.removeListener('render-process-gone',dispose);
    detach();
    handoff?.dispose?.();
    weatherSource?.dispose?.();
    void bluetooth?.dispose?.().catch(()=>{});
    controller.dispose();
    transport.stop();
  }
  contents.on('destroyed',dispose);
  contents.on('render-process-gone',dispose);
  try {if(secondary)secondaryWindows=createSecondaryWindows({...secondary,ipcMain,transport,config:windowConfig});}
  catch(error){dispose();throw error;}
  return {
    subscribeWindowConfig:windowConfig.subscribe,
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
        weatherSource?.start?.();
        bluetooth?.start();
        transport.start();
      } catch(error) {dispose();throw error;}
    },
    dispose,
  };
}
