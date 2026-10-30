import {createBluetoothPreferences,createRememberedBluetooth} from './bluetooth-remembered.mjs';
import {createBluezBus} from './bluez-bus.mjs';
import {createBluetoothMusicHost} from './bluetooth-music-host.mjs';
import {createPipeWireMonitor,createBluetoothFocus} from './bluetooth-audio.mjs';
/** Explicit host opt-in only. No environment flag silently enables pairing or changes configuration. */
export function createBluetoothRuntime({enabled=false,adapterPath,outputName,isParked=()=>false,controller,bluez,pipewire,preferencePath,preferenceStore}={}){
 if(enabled!==true)return null;
 if(!/^\/org\/bluez\/hci\d+$/.test(adapterPath||'')||typeof isParked!=='function')throw TypeError('Reviewed Bluetooth host configuration required');
 const bus=bluez??createBluezBus(),monitor=pipewire??createPipeWireMonitor({outputName});
 const listeners=new Set();let host,focus,remembered,disposed=false,started=false;
 const snapshot=()=>({...host?.view(),...focus?.snapshot(),remembered:remembered?.snapshot(),audioOwned:focus?.snapshot().owned===true,sinkReady:monitor.sinkReady(),musicReady:focus?.canAcquire()===true,parked:isParked()===true});
 const publish=()=>{if(!disposed){for(const fn of listeners)fn(snapshot());void remembered?.tick();}};
 focus=createBluetoothFocus({controller,pipewire:monitor,onChange:publish});
 host=createBluetoothMusicHost({bluez:bus,adapterPath,isParked,audio:focus,canForget:()=>focus.nativeIdle(),onForget:key=>remembered.forget(key),onMediaIntent:control=>remembered.intent(control),onChange:publish});
 remembered=createRememberedBluetooth({host,store:preferenceStore??(preferencePath?createBluetoothPreferences(preferencePath):null),isParked,canReconnect:()=>focus.canAcquire(),onChange:publish});
 const stopMonitor=monitor.subscribe?.(publish);
 const api={snapshot,subscribe(fn){listeners.add(fn);fn(snapshot());return()=>listeners.delete(fn);},
  start(){if(started||disposed)return;started=true;remembered.start();monitor.start?.();host.start();},
  discover:()=>host.discover(),stopDiscovery:()=>host.stopDiscovery(),pair:id=>host.pair(id),confirm:(token,value)=>host.confirm(token,value),cancelPairing:()=>host.cancelPairing(),connectMusic:id=>{remembered.cancelAttempt();return host.connectMusic(id);},releaseMusic:async()=>{let error;try{remembered.suppress();}catch(e){error=e;}await host.releaseMusic();if(error)throw error;},media:(token,control)=>host.media(token,control),remember:(id,enabled)=>remembered.set(id,enabled),requestForget:id=>host.requestForget(id),confirmForget:(token,value)=>host.confirmForget(token,value),acknowledgePause:(token,value)=>focus.acknowledgePause(token,value),
  async suspend(){remembered.cancelAttempt();await Promise.allSettled([host.stopDiscovery(),host.cancelPairing()]);await host.releaseMusic();},
  async dispose(){if(disposed)return;disposed=true;remembered.dispose();listeners.clear();stopMonitor?.();focus.dispose();await host.dispose();monitor.dispose();await bus.dispose();}
 };return api;
}
