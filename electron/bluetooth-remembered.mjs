import {openSync,closeSync,fstatSync,readFileSync,writeFileSync,fsyncSync,renameSync,mkdirSync,unlinkSync,constants} from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
const validKey=value=>typeof value==='string'&&/^\/org\/bluez\/hci\d+\/dev_(?:[A-Fa-f0-9]{2}_){5}[A-Fa-f0-9]{2}$/.test(value);
const clean=value=>({version:1,devicePath:validKey(value?.devicePath)?value.devicePath:null,reconnect:validKey(value?.devicePath)&&value?.reconnect===true,paused:value?.paused!==false});
/** Private preference only; never stores BlueZ pairing keys or receives renderer paths. */
export function createBluetoothPreferences(file){
 if(typeof file!=='string'||!path.isAbsolute(file))throw TypeError('Absolute host preference path required');
 return {load(){let fd;try{fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);if(!fstatSync(fd).isFile()||fstatSync(fd).size>2048)throw Error('Invalid preferences');const value=JSON.parse(readFileSync(fd,'utf8'));if(value?.version!==1)throw Error('Invalid preferences');return clean(value);}catch(e){if(e.code==='ENOENT')return clean(null);throw Error('Bluetooth preferences unavailable');}finally{if(fd!==undefined)closeSync(fd);}},
 save(value){mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const temp=file+'.'+randomUUID()+'.tmp';let fd;try{fd=openSync(temp,'wx',0o600);writeFileSync(fd,JSON.stringify(clean(value)));fsyncSync(fd);closeSync(fd);fd=undefined;renameSync(temp,file);const directory=openSync(path.dirname(file),'r');try{fsyncSync(directory);}finally{closeSync(directory);}}catch(e){if(fd!==undefined)closeSync(fd);try{unlinkSync(temp);}catch{}throw Error('Bluetooth preferences unavailable');}}};
}
export function createRememberedBluetooth({host,store,isParked=()=>false,canReconnect=()=>false,onChange=()=>{},now=Date.now}={}){
 let preference=clean(null),started=false,disposed=false,attempted=false,startAt=0,status='idle',persistenceError=false;
 const save=value=>{try{if(!store)throw Error();store.save(value);preference=clean(value);persistenceError=false;}catch{persistenceError=true;onChange();throw Error('Bluetooth preferences unavailable');}onChange();};
 const api={snapshot:()=>({deviceId:preference.devicePath?host.deviceForKey(preference.devicePath):null,enabled:preference.reconnect,paused:preference.paused,status,persistenceError,available:!!store}),
 start(){if(started||disposed)return;started=true;startAt=now();try{preference=clean(store?.load());}catch{persistenceError=true;}onChange();},
 set(id,enabled){if(disposed||isParked()!==true||typeof enabled!=='boolean')throw Error('Remembered Bluetooth unavailable');const key=host.deviceKey(id);if(!validKey(key)||host.deviceForKey(key)!==id)throw Error('Device unavailable');attempted=true;save({devicePath:key,reconnect:enabled,paused:host.view().media?.deviceId!==id||host.view().media?.status!=='playing'});},
 intent(control){if(!preference.devicePath)return;const media=host.view().media;if(media?.deviceId!==host.deviceForKey(preference.devicePath))return;if(control==='pause'||control==='play')save({...preference,paused:control==='pause'});},
 cancelAttempt(){attempted=true;},
 suppress(){attempted=true;if(preference.devicePath&&!preference.paused)save({...preference,paused:true});},
 forget(key){if(preference.devicePath===key){attempted=true;save(clean(null));}},
 async tick(){
  if(!started||disposed||attempted||persistenceError||!preference.reconnect||preference.paused||now()-startAt>60000||isParked()!==true||canReconnect()!==true)return;
  const id=host.deviceForKey(preference.devicePath),state=host.view(),device=state.devices.find(d=>d.id===id);
  if(!id||state.availability!=='available'||state.busy||!device?.paired||device.connected||device.transport!=='unavailable')return;
  attempted=true;status='connecting';onChange();try{await host.connectMusic(id,{automatic:true});if(!disposed)status='requested';}catch{if(!disposed)status='failed';}if(!disposed)onChange();
 },dispose(){disposed=true;attempted=true;}};return api;
}
