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
 const adapter='/org/bluez/hci0',device=adapter+'/dev_11_22_33_44_55_66';let registered,client,scans=0;
 const variant=(s,v)=>new dbus.Variant(s,v);
 const objects={[adapter]:{'org.bluez.Adapter1':{Powered:variant('b',true)}},[device]:{'org.bluez.Device1':{Adapter:variant('o',adapter),Alias:variant('s','Private fixture phone'),Paired:variant('b',false),UUIDs:variant('as',['0000110a-0000-1000-8000-00805f9b34fb'])}}};
 server.addMethodHandler(msg=>{
  const reply=()=>server.send(dbus.Message.newMethodReturn(msg,'',[]));
  if(msg.member==='GetManagedObjects'){server.send(dbus.Message.newMethodReturn(msg,'a{oa{sa{sv}}}',[objects]));return true;}
  if(msg.member==='RegisterAgent'){registered=msg.body[0];client=msg.sender;reply();return true;}
  if(['UnregisterAgent','CancelPairing','StopDiscovery'].includes(msg.member)){reply();return true;}
  if(msg.member==='StartDiscovery'){scans++;reply();return true;}
  if(msg.member==='Pair'){
   void server.call(new dbus.Message({destination:client,path:registered,interface:'org.bluez.Agent1',member:'RequestConfirmation',signature:'ou',body:[device,42]})).then(reply,()=>server.send(dbus.Message.newError(msg,'org.bluez.Error.AuthenticationRejected','Fixture rejected')));return true;
  }return false;
 });
 binding=createBluezBus({dbus,connect:()=>dbus.sessionBus({busAddress:address,negotiateUnixFd:false})});host=createBluetoothMusicHost({bluez:binding,adapterPath:adapter,isParked:()=>true});host.start();await waitFor(()=>host.view().devices.length===1);
 await host.discover();assert.equal(scans,1);await host.stopDiscovery();const pairing=host.pair(host.view().devices[0].id);await waitFor(()=>host.view().confirmation);
 assert.equal(host.view().confirmation.passkey,'000042');
 await assert.rejects(attacker.call(new dbus.Message({destination:client,path:registered,interface:'org.bluez.Agent1',member:'RequestConfirmation',signature:'ou',body:[device,999999]})));
 host.confirm(host.view().confirmation.token,true);await pairing;
 await server.releaseName('org.bluez');await waitFor(()=>host.view().availability==='unavailable');assert.equal(host.view().devices.length,0);
 console.log('PASS: private D-Bus serialization, ObjectManager variants, discovery, Agent1 numeric confirmation, spoofed sender rejection and owner loss; no system bus or devices used.');
}finally{await host?.dispose();await binding?.dispose();server?.disconnect();attacker?.disconnect();clearTimeout(timeout);daemon.kill('SIGTERM');}
