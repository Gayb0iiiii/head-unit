// Explicit optional integration test: private temporary session bus, never system bus.
import {spawn} from 'node:child_process';import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {once} from 'node:events';
import {createBluezBus} from '../electron/bluez-bus.mjs';import {createBluetoothMusicHost} from '../electron/bluetooth-music-host.mjs';
const require=createRequire(new URL('../electron/bluetooth-deps/package.json',import.meta.url));const dbus=require('dbus-next');
const daemon=spawn('dbus-daemon',['--session','--nofork','--print-address=1','--address=unix:tmpdir=/tmp'],{stdio:['ignore','pipe','pipe']});
let server,attacker,binding,host;const timeout=setTimeout(()=>daemon.kill('SIGKILL'),15000);
const waitFor=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}throw Error('Private bus test timed out');};
try{
 const [chunk]=await once(daemon.stdout,'data');const address=String(chunk).trim().split('\n')[0];assert.match(address,/^unix:/);
 server=dbus.sessionBus({busAddress:address,negotiateUnixFd:false});server.on('error',()=>{});await server.requestName('org.bluez',0);
 attacker=dbus.sessionBus({busAddress:address,negotiateUnixFd:false});attacker.on('error',()=>{});
 const adapter='/org/bluez/hci0',device=adapter+'/dev_11_22_33_44_55_66';let registered,client,scans=0;const player=device+'/player0';
 const variant=(s,v)=>new dbus.Variant(s,v);
 const objects={[adapter]:{'org.bluez.Adapter1':{Powered:variant('b',true)}},[device]:{'org.bluez.Device1':{Adapter:variant('o',adapter),Alias:variant('s','Private fixture phone'),Paired:variant('b',false),Connected:variant('b',false),UUIDs:variant('as',['0000110a-0000-1000-8000-00805f9b34fb'])}}};
 const properties=(path,iface,values)=>{Object.assign(objects[path][iface],values);server.send(dbus.Message.newSignal(path,'org.freedesktop.DBus.Properties','PropertiesChanged','sa{sv}as',[iface,values,[]]));};
 server.addMethodHandler(msg=>{
  const reply=()=>server.send(dbus.Message.newMethodReturn(msg,'',[]));
  if(msg.member==='GetManagedObjects'){server.send(dbus.Message.newMethodReturn(msg,'a{oa{sa{sv}}}',[objects]));return true;}
  if(msg.member==='RegisterAgent'){registered=msg.body[0];client=msg.sender;reply();return true;}
  if(['UnregisterAgent','CancelPairing','StopDiscovery'].includes(msg.member)){reply();return true;}
  if(msg.member==='StartDiscovery'){scans++;reply();return true;}
  if(msg.member==='ConnectProfile'){
   assert.equal(msg.body[0],'0000110a-0000-1000-8000-00805f9b34fb');properties(device,'org.bluez.Device1',{Connected:variant('b',true)});
   objects[device]['org.bluez.MediaControl1']={Connected:variant('b',true),Player:variant('o',player)};
   objects[player]={'org.bluez.MediaPlayer1':{Device:variant('o',device),Status:variant('s','paused'),Position:variant('u',2500),Track:variant('a{sv}',{Title:variant('s','Private-bus track'),Artist:variant('s','Fixture artist'),Duration:variant('u',10000)})}};
   server.send(dbus.Message.newSignal('/','org.freedesktop.DBus.ObjectManager','InterfacesAdded','oa{sa{sv}}',[device,{'org.bluez.MediaControl1':objects[device]['org.bluez.MediaControl1']}]));
   server.send(dbus.Message.newSignal('/','org.freedesktop.DBus.ObjectManager','InterfacesAdded','oa{sa{sv}}',[player,objects[player]]));reply();return true;
  }
  if(['Play','Pause'].includes(msg.member)){assert.equal(msg.path,player);properties(player,'org.bluez.MediaPlayer1',{Status:variant('s',msg.member==='Play'?'playing':'paused')});reply();return true;}
  if(msg.member==='Next'){server.send(dbus.Message.newError(msg,'org.bluez.Error.NotSupported','Fixture unsupported'));return true;}
  if(msg.member==='DisconnectProfile'){properties(device,'org.bluez.Device1',{Connected:variant('b',false)});reply();return true;}
  if(msg.member==='RemoveDevice'){assert.equal(msg.path,adapter);assert.deepEqual(msg.body,[device]);delete objects[device];delete objects[player];server.send(dbus.Message.newSignal('/','org.freedesktop.DBus.ObjectManager','InterfacesRemoved','oas',[device,['org.bluez.Device1','org.bluez.MediaControl1']]));reply();return true;}
  if(msg.member==='Pair'){
   void server.call(new dbus.Message({destination:client,path:registered,interface:'org.bluez.Agent1',member:'RequestConfirmation',signature:'ou',body:[device,42]})).then(()=>{properties(device,'org.bluez.Device1',{Paired:variant('b',true)});reply();},()=>server.send(dbus.Message.newError(msg,'org.bluez.Error.AuthenticationRejected','Fixture rejected')));return true;
  }return false;
 });
 binding=createBluezBus({dbus,connect:()=>dbus.sessionBus({busAddress:address,negotiateUnixFd:false})});host=createBluetoothMusicHost({bluez:binding,adapterPath:adapter,isParked:()=>true,canForget:()=>true,audio:{sinkReady:()=>true,acquire:async()=>({valid:()=>true,onLost:()=>()=>{},release:()=>{}})}});host.start();await waitFor(()=>host.view().devices.length===1);
 await host.discover();assert.equal(scans,1);await host.stopDiscovery();const pairing=host.pair(host.view().devices[0].id);await waitFor(()=>host.view().confirmation);
 assert.equal(host.view().confirmation.passkey,'000042');
 await assert.rejects(attacker.call(new dbus.Message({destination:client,path:registered,interface:'org.bluez.Agent1',member:'RequestConfirmation',signature:'ou',body:[device,999999]})));
 host.confirm(host.view().confirmation.token,true);await pairing;await waitFor(()=>host.view().devices[0].paired);
 const id=host.view().devices[0].id;await host.connectMusic(id);await waitFor(()=>host.view().media);
 assert.equal(host.view().media.title,'Private-bus track');assert.equal(host.view().media.positionMs,2500);
 await host.media(host.view().media.token,'play');await waitFor(()=>host.view().media.status==='playing');await host.media(host.view().media.token,'pause');await waitFor(()=>host.view().media.status==='paused');
 await assert.rejects(host.media(host.view().media.token,'next'));assert.equal(host.view().media.controls.includes('next'),false);
 await host.releaseMusic();await waitFor(()=>host.view().devices[0].connected===false);host.requestForget(id);const forget=host.view().forget.token;await assert.rejects(host.confirmForget('wrong',true));await host.confirmForget(forget,true);await waitFor(()=>host.view().devices.length===0);
 await server.releaseName('org.bluez');await waitFor(()=>host.view().availability==='unavailable');assert.equal(host.view().devices.length,0);
 console.log('PASS: private D-Bus serialization, ObjectManager variants, discovery, Agent1 numeric confirmation, spoofed sender rejection, AVRCP metadata/play/pause/unsupported response, confirmed forget and owner loss; no system bus or devices used.');
}finally{await host?.dispose();await binding?.dispose();server?.disconnect();attacker?.disconnect();clearTimeout(timeout);daemon.kill('SIGTERM');}
