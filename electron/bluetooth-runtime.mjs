import {createBluezBus} from './bluez-bus.mjs';
import {createBluetoothMusicHost} from './bluetooth-music-host.mjs';
import {createPipeWireMonitor,createBluetoothFocus} from './bluetooth-audio.mjs';
/** Explicit host opt-in only. No environment flag silently enables pairing or changes configuration. */
export function createBluetoothRuntime({enabled=false,adapterPath,outputName,isParked=()=>false,controller,bluez,pipewire}={}){
 if(enabled!==true)return null;
 if(!/^\/org\/bluez\/hci\d+$/.test(adapterPath||'')||typeof isParked!=='function')throw TypeError('Reviewed Bluetooth host configuration required');
 const bus=bluez??createBluezBus(),monitor=pipewire??createPipeWireMonitor({outputName});
 const listeners=new Set();let host,focus,disposed=false,started=false;
 const snapshot=()=>({...host?.view(),...focus?.snapshot(),audioOwned:focus?.snapshot().owned===true,sinkReady:monitor.sinkReady(),parked:isParked()===true});
 const publish=()=>{if(!disposed)for(const fn of listeners)fn(snapshot());};
 focus=createBluetoothFocus({controller,pipewire:monitor,onChange:publish});
 host=createBluetoothMusicHost({bluez:bus,adapterPath,isParked,audio:focus,onChange:publish});
 const stopMonitor=monitor.subscribe?.(publish);
 const api={snapshot,subscribe(fn){listeners.add(fn);fn(snapshot());return()=>listeners.delete(fn);},
  start(){if(started||disposed)return;started=true;monitor.start?.();host.start();},
  discover:()=>host.discover(),stopDiscovery:()=>host.stopDiscovery(),pair:id=>host.pair(id),confirm:(token,value)=>host.confirm(token,value),cancelPairing:()=>host.cancelPairing(),connectMusic:id=>host.connectMusic(id),releaseMusic:()=>host.releaseMusic(),acknowledgePause:(token,value)=>focus.acknowledgePause(token,value),
  async suspend(){await Promise.allSettled([host.stopDiscovery(),host.cancelPairing()]);await host.releaseMusic();},
  async dispose(){if(disposed)return;disposed=true;listeners.clear();stopMonitor?.();focus.dispose();await host.dispose();monitor.dispose();await bus.dispose();}
 };return api;
}
