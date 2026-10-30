import {createRequire} from 'node:module';
const require=createRequire(new URL('./bluetooth-deps/package.json',import.meta.url));
const DAEMON='org.freedesktop.DBus',ROOT='/org/freedesktop/DBus',OM='org.freedesktop.DBus.ObjectManager',PROPS='org.freedesktop.DBus.Properties';
const AGENT='/dev/headunit/bluetooth_agent',SOURCE='0000110a-0000-1000-8000-00805f9b34fb';
const agentSignatures={Release:'',Cancel:'',RequestConfirmation:'ou',RequestPinCode:'o',DisplayPinCode:'os',RequestPasskey:'o',DisplayPasskey:'ouq',RequestAuthorization:'o',AuthorizeService:'os'};
const unavailable=()=>new Error('Bluetooth bus unavailable');
function unwrap(value,depth=0){
 if(depth>16)throw unavailable();
 if(value&&typeof value==='object'&&typeof value.signature==='string'&&Object.hasOwn(value,'value'))return unwrap(value.value,depth+1);
 if(Array.isArray(value)){if(value.length>4096)throw unavailable();return value.map(v=>unwrap(v,depth+1));}
 if(value&&typeof value==='object'){const out=Object.create(null),entries=Object.entries(value);if(entries.length>4096)throw unavailable();for(const [k,v] of entries)out[k]=unwrap(v,depth+1);return out;}
 return ['string','boolean','number'].includes(typeof value)||value===null?value:null;
}
/** Owns one persistent bus connection. start/watch is explicit; never requests a service name. */
export function createBluezBus({dbus,connect,timeoutMs=10000,pairTimeoutMs=65000}={}){
 if(!Number.isFinite(pairTimeoutMs)||pairTimeoutMs<1000||pairTimeoutMs>120000)throw TypeError('Bounded pairing deadline required');
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>60000)throw TypeError('Bounded bus deadline required');
 let bus,owner=null,objects={},disposed=false,starting,version=0,loading=false,queued=[],agentMethods=null;
 const listeners=new Set(),pending=new Map();
 const publish=()=>{const snapshot={owner,objects:structuredClone(objects)};for(const fn of listeners)fn(snapshot);};
 const failPending=target=>{for(const [id,p] of pending)if(!target||p.target===target){clearTimeout(p.timer);pending.delete(id);p.reject(unavailable());}};
 function raw(target,path,iface,member,signature='',body=[]){
  if(disposed||!bus)return Promise.reject(unavailable());
  const msg=new dbus.Message({destination:target,path,interface:iface,member,signature,body});msg.serial=bus.newSerial();
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(msg.serial);reject(unavailable());lost();},member==='Pair'?pairTimeoutMs:timeoutMs);pending.set(msg.serial,{target,resolve,reject,timer});try{bus.send(msg);}catch{clearTimeout(timer);pending.delete(msg.serial);reject(unavailable());}});
 }
 function apply(msg){
  const body=unwrap(msg.body);
  if(msg.interface===OM&&msg.member==='InterfacesAdded')objects[body[0]]={...objects[body[0]],...body[1]};
  else if(msg.interface===OM&&msg.member==='InterfacesRemoved'){for(const iface of body[1])delete objects[body[0]]?.[iface];if(objects[body[0]]&&!Object.keys(objects[body[0]]).length)delete objects[body[0]];}
  else if(msg.interface===PROPS&&msg.member==='PropertiesChanged'){
   if(!objects[msg.path]?.[body[0]])return;
   Object.assign(objects[msg.path][body[0]],body[1]);for(const key of body[2])delete objects[msg.path][body[0]][key];
  }
  if(Object.keys(objects).length>4096)throw unavailable();
 }
 async function refresh(target,epoch){
  loading=true;queued=[];
  try{const reply=await raw(target,'/',OM,'GetManagedObjects');if(disposed||owner!==target||version!==epoch)return;
   objects=unwrap(reply.body[0]);for(const msg of queued)apply(msg);loading=false;queued=[];publish();
  }catch{if(!disposed&&version===epoch){owner=null;objects={};loading=false;queued=[];failPending(target);publish();}}
 }
 function changeOwner(next){const previous=owner;version++;owner=/^:\d+\.\d+$/.test(next||'')?next:null;objects={};loading=false;queued=[];failPending(previous);publish();if(owner)void refresh(owner,version);}
 function message(msg){
  if(disposed)return;
  const p=pending.get(msg.replySerial);
  if(p&&[2,3].includes(msg.type)&&(msg.sender===p.target||(p.target===DAEMON&&msg.sender===DAEMON))){
   clearTimeout(p.timer);pending.delete(msg.replySerial);if(msg.type===3)p.reject(Object.assign(unavailable(),{name:msg.errorName}));else p.resolve(msg);return;
  }
  if(msg.type!==4)return;
  if(msg.sender===DAEMON&&msg.interface===DAEMON&&msg.path===ROOT&&msg.member==='NameOwnerChanged'&&msg.body?.[0]==='org.bluez'){changeOwner(msg.body[2]);return;}
  if(msg.sender!==owner)return;
  if((msg.interface===OM&&['InterfacesAdded','InterfacesRemoved'].includes(msg.member))||(msg.interface===PROPS&&msg.member==='PropertiesChanged')){
   try{if(loading){if(queued.length>=1024)throw unavailable();queued.push(msg);}else{apply(msg);publish();if(msg.interface===PROPS&&msg.body[2]?.length)void refresh(owner,version);}}catch{void api.dispose();}
  }
 }
 function method(msg){
  if(msg.path!==AGENT||msg.interface!=='org.bluez.Agent1')return false;
  const captured=owner,methods=agentMethods;
  const reject=name=>{if(!disposed)bus.send(dbus.Message.newError(msg,name,'Bluetooth request unavailable'));};
  if(disposed||msg.sender!==captured||!methods){reject('org.bluez.Error.Rejected');return true;}
  if(!Object.hasOwn(agentSignatures,msg.member)||msg.signature!==agentSignatures[msg.member]){reject('org.bluez.Error.Rejected');return true;}
  Promise.resolve().then(()=>methods[msg.member](...msg.body)).then(()=>{if(!disposed&&owner===captured&&agentMethods===methods)bus.send(dbus.Message.newMethodReturn(msg,'',[]));else reject('org.bluez.Error.Canceled');},()=>reject('org.bluez.Error.Rejected'));
  return true;
 }
 async function start(){
  if(starting)return starting;if(disposed)throw unavailable();
  starting=(async()=>{
   dbus??=require('dbus-next');bus=connect?connect(dbus):dbus.systemBus({negotiateUnixFd:false});
   bus.on('message',message);bus.on('error',lost);bus.on('disconnect',lost);bus.addMethodHandler(method);
   for(const rule of ["type='signal',sender='org.freedesktop.DBus',interface='org.freedesktop.DBus',member='NameOwnerChanged',arg0='org.bluez'","type='signal',sender='org.bluez',interface='org.freedesktop.DBus.ObjectManager'","type='signal',sender='org.bluez',interface='org.freedesktop.DBus.Properties'"]){await raw(DAEMON,ROOT,DAEMON,'AddMatch','s',[rule]);}
   const epoch=version;
   try{const result=await raw(DAEMON,ROOT,DAEMON,'GetNameOwner','s',['org.bluez']);if(version===epoch&&!disposed)changeOwner(result.body[0]);}catch{if(version===epoch&&!disposed){objects={};owner=null;publish();}}
  })().catch(()=>{lost();});return starting;
 }
 function lost(){if(disposed)return;owner=null;objects={};version++;failPending();publish();void api.dispose();}
 const api={
  watch(fn){if(disposed)throw unavailable();listeners.add(fn);fn({owner,objects:structuredClone(objects)});if(!disposed)void start();return()=>listeners.delete(fn);},
  async call(r){
   if(!owner||r.destination!==owner)throw unavailable();const args=r.args??[],signature=r.signature??'';let valid=false;
   if(r.interface==='org.bluez.Adapter1'&&/^\/org\/bluez\/hci\d+$/.test(r.path))valid=['StartDiscovery','StopDiscovery'].includes(r.member)&&signature===''&&args.length===0;
   if(r.interface==='org.bluez.AgentManager1'&&r.path==='/org/bluez')valid=(r.member==='RegisterAgent'&&signature==='os'&&args.length===2&&args[0]===AGENT&&args[1]==='DisplayYesNo')||(r.member==='UnregisterAgent'&&signature==='o'&&args.length===1&&args[0]===AGENT);
   if(r.interface==='org.bluez.Device1'&&objects[r.path]?.['org.bluez.Device1'])valid=(['Pair','CancelPairing'].includes(r.member)&&signature===''&&args.length===0)||(['ConnectProfile','DisconnectProfile'].includes(r.member)&&signature==='s'&&args.length===1&&args[0]===SOURCE);
   if(!valid)throw unavailable();await raw(owner,r.path,r.interface,r.member,signature,args);
  },
  exportAgent(path,methods){if(path!==AGENT||agentMethods)throw unavailable();agentMethods=methods;return()=>{if(agentMethods===methods)agentMethods=null;};},
  async dispose(){if(disposed)return;disposed=true;owner=null;objects={};agentMethods=null;version++;failPending();publish();listeners.clear();if(bus){bus.removeListener('message',message);bus.removeMethodHandler(method);bus.removeListener('disconnect',lost);bus.disconnect();/* Keep error drain until socket teardown. */}}
 };
 return api;
}
