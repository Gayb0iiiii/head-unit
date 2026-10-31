import test from 'node:test';import assert from 'node:assert/strict';import {createBluetoothRuntime} from '../electron/bluetooth-runtime.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
test('Bluetooth runtime stays completely inactive without explicit host opt-in',()=>{assert.equal(createBluetoothRuntime(),null);});
test('composed host waits for local pause before profile connect and releases before disposal',async()=>{
 const path='/org/bluez/hci0/dev_11_22_33_44_55_66',calls=[];let stopped=0;
 const bluez={watch:fn=>{fn({owner:':1.20',objects:{'/org/bluez/hci0':{'org.bluez.Adapter1':{Powered:true}},[path]:{'org.bluez.Device1':{Adapter:'/org/bluez/hci0',Paired:true,UUIDs:['0000110a-0000-1000-8000-00805f9b34fb']}}}});return()=>{};},call:async r=>calls.push(r),dispose:async()=>{stopped++;}};
 const controller={view:()=>({connected:true,front:'livi',projectionReady:false,homeStatus:{media:{status:'available',playing:false}}}),subscribe:()=>()=>{}};
 const pipewire={sinkReady:()=>true,subscribe:()=>()=>{},start:()=>{},dispose:()=>{stopped++;}};
 const service=createBluetoothRuntime({enabled:true,adapterPath:'/org/bluez/hci0',isParked:()=>true,controller,bluez,pipewire});service.start();
 const pending=service.connectMusic(service.snapshot().devices[0].id);await tick();assert.equal(calls.length,0);service.acknowledgePause(service.snapshot().pauseRequest,true);await pending;assert.equal(calls[0].member,'ConnectProfile');assert.equal(service.snapshot().audioOwned,true);await service.dispose();assert.equal(calls.at(-1).member,'DisconnectProfile');assert.equal(stopped,2);
});
test('runtime release-before-projection cancels a pending pause handshake durably',async()=>{
 const device='/org/bluez/hci0/dev_11_22_33_44_55_66',calls=[];
 const bluez={watch:fn=>{fn({owner:':1.20',objects:{'/org/bluez/hci0':{'org.bluez.Adapter1':{Powered:true}},[device]:{'org.bluez.Device1':{Adapter:'/org/bluez/hci0',Paired:true,UUIDs:['0000110a-0000-1000-8000-00805f9b34fb']}}}});return()=>{};},call:async r=>calls.push(r),dispose:async()=>{}};
 const controller={view:()=>({connected:true,front:'livi',projectionReady:false,homeStatus:{media:{status:'available',playing:false}}}),subscribe:()=>()=>{}};
 const pipewire={sinkReady:()=>true,subscribe:()=>()=>{},dispose:()=>{}};
 const service=createBluetoothRuntime({enabled:true,adapterPath:'/org/bluez/hci0',isParked:()=>true,controller,bluez,pipewire});service.start();const pending=service.connectMusic(service.snapshot().devices[0].id);const failed=assert.rejects(pending);await tick();let released=false;const release=service.releaseMusic().then(()=>{released=true;});await tick();assert.equal(released,false);service.acknowledgePause(service.snapshot().pauseRequest,true);await release;await failed;assert.equal(calls.length,0);await service.dispose();
});
function continuityRig(store){
 const device='/org/bluez/hci0/dev_11_22_33_44_55_66',calls=[];let changed=()=>{},state={connected:true,front:'livi',projectionReady:false,homeStatus:{media:{status:'available',playing:false}}};
 const bluez={watch:fn=>{fn({owner:':1.20',objects:{'/org/bluez/hci0':{'org.bluez.Adapter1':{Powered:true}},[device]:{'org.bluez.Device1':{Adapter:'/org/bluez/hci0',Paired:true,Connected:false,UUIDs:['0000110a-0000-1000-8000-00805f9b34fb']}}}});return()=>{};},call:async r=>calls.push(r),dispose:async()=>{}};
 const controller={view:()=>state,subscribe:fn=>{changed=fn;return()=>{};}};
 const pipewire={sinkReady:()=>true,subscribe:()=>()=>{},dispose:()=>{}};
 const service=createBluetoothRuntime({enabled:true,adapterPath:'/org/bluez/hci0',isParked:()=>true,controller,bluez,pipewire,preferenceStore:store});
 return {service,calls,takeover(){state={...state,projectionReady:true};changed();}};
}
test('native takeover persists pause intent and next startup does not reconnect',async()=>{
 let saved={version:1,devicePath:'/org/bluez/hci0/dev_11_22_33_44_55_66',reconnect:true,paused:false};const store={load:()=>saved,save:v=>{saved=v;}};
 const first=continuityRig(store);first.service.start();await tick();first.service.acknowledgePause(first.service.snapshot().pauseRequest,true);await tick();assert.equal(first.calls[0].member,'ConnectProfile');
 first.takeover();await tick();await tick();assert.equal(first.calls.at(-1).member,'DisconnectProfile');assert.equal(saved.paused,true);await first.service.dispose();
 const second=continuityRig(store);second.service.start();await tick();assert.equal(second.service.snapshot().pauseRequest,null);assert.deepEqual(second.calls,[]);await second.service.dispose();
});
test('orderly shutdown preserves an explicitly enabled unpaused reconnect preference',async()=>{
 let saved={version:1,devicePath:'/org/bluez/hci0/dev_11_22_33_44_55_66',reconnect:true,paused:false};const store={load:()=>saved,save:v=>{saved=v;}};
 const first=continuityRig(store);first.service.start();await tick();first.service.acknowledgePause(first.service.snapshot().pauseRequest,true);await tick();await first.service.dispose();assert.equal(saved.paused,false);assert.equal(first.calls.at(-1).member,'DisconnectProfile');
});
test('native takeover cancels a pending startup focus request and persists pause',async()=>{
 let saved={version:1,devicePath:'/org/bluez/hci0/dev_11_22_33_44_55_66',reconnect:true,paused:false};const first=continuityRig({load:()=>saved,save:v=>{saved=v;}});
 first.service.start();await tick();assert.ok(first.service.snapshot().pauseRequest);first.takeover();await tick();assert.equal(saved.paused,true);assert.equal(first.service.snapshot().pauseRequest,null);assert.deepEqual(first.calls,[]);await first.service.dispose();
});
test('takeover still disconnects and reports preference failure when saving is unavailable',async()=>{
 const first=continuityRig({load:()=>({version:1,devicePath:'/org/bluez/hci0/dev_11_22_33_44_55_66',reconnect:true,paused:false}),save:()=>{throw Error('read-only');}});
 first.service.start();await tick();first.service.acknowledgePause(first.service.snapshot().pauseRequest,true);await tick();first.takeover();await tick();await tick();assert.equal(first.calls.at(-1).member,'DisconnectProfile');assert.equal(first.service.snapshot().remembered.persistenceError,true);assert.equal(first.service.snapshot().audioOwned,false);await first.service.dispose();
});
