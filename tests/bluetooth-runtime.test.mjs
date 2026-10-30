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
