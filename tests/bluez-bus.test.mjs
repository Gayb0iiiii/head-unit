import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {createBluezBus} from '../electron/bluez-bus.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
const daemon='org.freedesktop.DBus',adapter='/org/bluez/hci0',device=adapter+'/dev_11_22_33_44_55_66';
class Message{constructor(v){Object.assign(this,v);}static newError(m,errorName){return {type:3,replySerial:m.serial,errorName};}static newMethodReturn(m,signature,body){return {type:2,replySerial:m.serial,signature,body};}}
function fixture(options={}){
 const bus=new EventEmitter();let serial=0,handler,snapshotReply;bus.sent=[];bus.newSerial=()=>++serial;bus.addMethodHandler=fn=>handler=fn;bus.removeMethodHandler=()=>{handler=null;};bus.disconnect=()=>{bus.closed=true;};
 const objects={[adapter]:{'org.bluez.Adapter1':{Powered:{signature:'b',value:true}}},[device]:{'org.bluez.Device1':{Adapter:{signature:'o',value:adapter},Alias:{signature:'s',value:'Phone'}}}};
 bus.send=msg=>{bus.sent.push(msg);if(msg.type===2||msg.type===3)return;queueMicrotask(()=>{
  const body=msg.member==='GetNameOwner'?[':1.20']:msg.member==='GetManagedObjects'?[objects]:[];
  const reply=()=>bus.emit('message',{type:2,sender:msg.destination,replySerial:msg.serial,body});if(msg.member==='GetManagedObjects'&&snapshotReply)snapshotReply(reply);else reply();
 });};
 const binding=createBluezBus({dbus:{Message},connect:()=>bus,...options});const views=[];binding.watch(v=>views.push(v));
 return {binding,bus,views,objects,agent:msg=>handler(msg),holdSnapshot:fn=>{snapshotReply=fn;},signal:(member,body,sender=':1.20',iface='org.freedesktop.DBus.ObjectManager',path='/')=>bus.emit('message',{type:4,sender,interface:iface,path,member,body})};
}
test('persistent binding subscribes before snapshot and unwraps variants',async()=>{const f=fixture();await tick();assert.equal(f.views.at(-1).objects[adapter]['org.bluez.Adapter1'].Powered,true);assert.equal(f.bus.sent.filter(m=>m.member==='AddMatch').length,3);assert.equal(f.bus.sent.at(-1).member,'GetManagedObjects');await f.binding.dispose();assert.equal(f.bus.closed,true);});
test('snapshot reconciliation preserves signals received during read and rejects spoofed signals',async()=>{
 const f=fixture();let reply;f.holdSnapshot(fn=>{reply=fn;});await tick();f.signal('InterfacesAdded',['/org/bluez/hci1',{'org.bluez.Adapter1':{Powered:true}}]);f.signal('InterfacesRemoved',[adapter,['org.bluez.Adapter1']],':1.99');reply();await tick();assert.ok(f.views.at(-1).objects['/org/bluez/hci1']);assert.ok(f.views.at(-1).objects[adapter]);await f.binding.dispose();
});
test('owner loss clears objects and retired owner signals cannot restore them',async()=>{const f=fixture();await tick();f.signal('NameOwnerChanged',['org.bluez',':1.20',''],daemon,daemon,'/org/freedesktop/DBus');assert.equal(f.views.at(-1).owner,null);f.signal('InterfacesAdded',[adapter,{'org.bluez.Adapter1':{Powered:true}}]);assert.deepEqual(f.views.at(-1).objects,{});await f.binding.dispose();});
test('binding rejects arbitrary methods, paths and profile UUIDs',async()=>{const f=fixture();await tick();for(const r of [{path:device,interface:'org.bluez.Device1',member:'Connect'},{path:device,interface:'org.bluez.Device1',member:'ConnectProfile',signature:'s',args:['evil']},{path:adapter,interface:'org.freedesktop.DBus.Properties',member:'Set'}])await assert.rejects(f.binding.call({destination:':1.20',...r}));await f.binding.dispose();});
test('agent validates sender and signature before invoking private methods',async()=>{const f=fixture();await tick();let n=0;f.binding.exportAgent('/dev/headunit/bluetooth_agent',{RequestConfirmation:async()=>{n++;}});const base={path:'/dev/headunit/bluetooth_agent',interface:'org.bluez.Agent1',member:'RequestConfirmation',signature:'ou',body:[device,123],serial:88};f.agent({...base,sender:':1.99'});f.agent({...base,sender:':1.20',signature:'ss'});await tick();assert.equal(n,0);f.agent({...base,sender:':1.20'});await tick();assert.equal(n,1);assert.equal(f.bus.sent.at(-1).type,2);await f.binding.dispose();});

test('ambiguous method timeout closes the owned bus so discovery cannot leak',async()=>{const f=fixture({timeoutMs:5});await tick();const send=f.bus.send;f.bus.send=msg=>{if(msg.member!=='StartDiscovery')send(msg);};await assert.rejects(f.binding.call({destination:':1.20',path:adapter,interface:'org.bluez.Adapter1',member:'StartDiscovery',signature:'',args:[]}));assert.equal(f.bus.closed,true);assert.equal(f.views.at(-1).owner,null);});

test('owner arriving during subscriptions does not cancel daemon setup calls',async()=>{const f=fixture();f.signal('NameOwnerChanged',['org.bluez','',':1.20'],daemon,daemon,'/org/freedesktop/DBus');await tick();assert.equal(f.bus.closed,undefined);assert.equal(f.views.at(-1).owner,':1.20');assert.ok(f.views.at(-1).objects[device]);await f.binding.dispose();});
test('failed agent reply send closes the binding without an unhandled rejection',async()=>{const f=fixture();await tick();f.binding.exportAgent('/dev/headunit/bluetooth_agent',{Cancel:async()=>{}});const send=f.bus.send;f.bus.send=msg=>{if(msg.type===2)throw Error('closed socket');send(msg);};f.agent({path:'/dev/headunit/bluetooth_agent',interface:'org.bluez.Agent1',member:'Cancel',signature:'',body:[],sender:':1.20',serial:9});await tick();assert.equal(f.bus.closed,true);});
