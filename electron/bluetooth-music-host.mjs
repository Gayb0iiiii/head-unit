import {bluetoothMetadata} from './bluetooth-media.mjs';
import {randomUUID} from 'node:crypto';
const ADAPTER='org.bluez.Adapter1',DEVICE='org.bluez.Device1',TRANSPORT='org.bluez.MediaTransport1';
const SOURCE='0000110a-0000-1000-8000-00805f9b34fb',SINK='0000110b-0000-1000-8000-00805f9b34fb';
const AGENT='/dev/headunit/bluetooth_agent';
const failure=code=>Object.assign(new Error('Bluetooth operation unavailable'),{code});
const agentFailure=()=>Object.assign(new Error('Pairing rejected'),{name:'org.bluez.Error.Rejected',code:'rejected'});
const classify=e=>e?.code||({'org.bluez.Error.NotAuthorized':'not-authorized','org.bluez.Error.AuthenticationRejected':'rejected','org.bluez.Error.Rejected':'rejected','org.bluez.Error.AuthenticationCanceled':'canceled','org.bluez.Error.NotReady':'not-ready','org.bluez.Error.NotSupported':'unsupported','org.bluez.Error.InProgress':'busy'}[e?.name])||'failed';
const errors=new Set(['not-authorized','rejected','canceled','not-ready','unsupported','busy','timeout','unavailable','failed']);

/** Inert until start(). The injected private bus must use one application connection,
 * authenticate BlueZ's unique owner, unwrap variants, and export Agent1 errors.
 * No D-Bus client, system configuration, renderer channel or native engine is created here. */
export function createBluetoothMusicHost({bluez,adapterPath,isParked=()=>false,audio=null,canForget=()=>false,onForget=async()=>{},onMediaIntent=async()=>{},onChange=()=>{},clock=globalThis,operationMs=15000,pairMs=60000,discoveryMs=30000}={}){
 if(![operationMs,pairMs,discoveryMs].every(ms=>Number.isFinite(ms)&&ms>0&&ms<=120000))throw TypeError('Bounded Bluetooth deadlines required');
 if(!/^\/org\/bluez\/hci\d+$/.test(adapterPath||''))throw TypeError('Host-selected adapter required');
 let owner=null,objects={},ids=new Map(),started=false,disposed=false,stopWatch,generation=0,error=null,busy=null,discovery=false,discoveryTimer,discoveryEpoch=0,discoveryWork=null,musicEpoch=0,acquirePending=null,confirmation=null,pairPath=null,pairRequested=false,agentRegistered=false,unexport,lease=null,musicPath=null,musicRequested=false,connectionPending=null,releaseFlight=null,unwatchLease,playerKey=null,playerToken=null,unsupported=new Set(),forget=null,forgetTimer;
 const addressedPlayer=()=>{
  const device=objects[musicPath],control=device?.['org.bluez.MediaControl1'];
  const path=control?.Player,player=typeof path==='string'?objects[path]?.['org.bluez.MediaPlayer1']:null;
  return lease?.valid()&&device?.[DEVICE]?.Connected===true&&control?.Connected===true&&player?.Device===musicPath?{path,player}:null;
 };
 const mediaView=()=>{
  const addressed=addressedPlayer(),key=addressed?owner+'/'+musicPath+'/'+addressed.path:null;
  if(key!==playerKey){playerKey=key;playerToken=key?randomUUID():null;unsupported=new Set();}
  if(!addressed)return null;const metadata=bluetoothMetadata(addressed.player);
  const controls=['play','pause','next','previous'].filter(c=>!unsupported.has(c)&&['playing','paused','stopped','forward-seek','reverse-seek'].includes(metadata.status)&&(!(c==='play')||['paused','stopped'].includes(metadata.status))&&(!(c==='pause')||['playing','forward-seek','reverse-seek'].includes(metadata.status)));
  return {token:playerToken,deviceId:ids.get(musicPath),...metadata,controls};
 };
 const clearForget=()=>{clock.clearTimeout(forgetTimer);forget=null;};
 const forgetAllowed=path=>canForget()===true&&!lease&&!busy&&objects[path]?.[DEVICE]?.Paired===true&&objects[path][DEVICE].Connected===false;
 const view=()=>({availability:disposed||!owner?'unavailable':!objects[adapterPath]?.[ADAPTER]?'adapter-absent':objects[adapterPath][ADAPTER].Powered===true?'available':'powered-off',discovering:discovery,error,busy:busy?.kind||null,confirmation:confirmation?{token:confirmation.token,deviceId:ids.get(confirmation.path),passkey:confirmation.passkey}:null,audible:null,media:mediaView(),forget:forget?{token:forget.token,deviceId:ids.get(forget.path)}:null,devices:!owner||disposed?[]:Object.entries(objects).filter(([,o])=>o[DEVICE]?.Adapter===adapterPath).slice(0,256).map(([path,o])=>{if(!ids.has(path))ids.set(path,randomUUID());const p=o[DEVICE],states=Object.values(objects).map(o=>o[TRANSPORT]).filter(t=>t?.Device===path&&typeof t.UUID==='string'&&[SOURCE,SINK].includes(t.UUID.toLowerCase())).map(t=>t.State);return {id:ids.get(path),name:typeof p.Alias==='string'?p.Alias.slice(0,128):'Bluetooth device',paired:p.Paired===true,connected:p.Connected===true,musicSupported:Array.isArray(p.UUIDs)&&p.UUIDs.some(u=>typeof u==='string'&&u.toLowerCase()===SOURCE),canForget:forgetAllowed(path),transport:states.includes('active')?'active':states.includes('pending')?'pending':states.includes('idle')?'idle':'unavailable'};})});
 const publish=()=>{onChange(view());};
 const request=(path,iface,member,args=[],signature='',target=owner)=>bluez.call({destination:target,path,interface:iface,member,args,signature});
 const bounded=(promise,ms)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=clock.setTimeout(()=>reject(failure('timeout')),ms);})]).finally(()=>clock.clearTimeout(timer));};
 const rejectPrompt=()=>{if(confirmation){const old=confirmation;confirmation=null;old.reject(agentFailure());}};
 const clearLease=(uncertain=false)=>{unwatchLease?.();unwatchLease=null;if(uncertain&&lease?.onUncertain)lease.onUncertain();else lease?.release();lease=null;musicPath=null;musicRequested=false;};
 const safeCall=async promise=>{try{return await bounded(promise,operationMs);}catch(e){const code=classify(e);error=errors.has(code)?code:'failed';publish();throw failure(error);}};
 const available=()=>{if(view().availability!=='available')throw failure('unavailable');};
 const parked=()=>{available();if(isParked()!==true)throw failure('not-ready');};
 const pathFor=id=>{const path=[...ids].find(([,value])=>value===id)?.[0];if(!path||objects[path]?.[DEVICE]?.Adapter!==adapterPath)throw failure('unavailable');return path;};
 async function run(kind,action,ms=operationMs){
  if(disposed||busy)throw failure(disposed?'unavailable':'busy');const epoch=generation;let cancel,settled=false;
  const token={kind,canceled:false,cancel:()=>{token.canceled=true;cancel(failure('unavailable'));}};busy=token;error=null;publish();
  const work=Promise.resolve().then(()=>{const current=()=>!disposed&&!token.canceled&&epoch===generation&&busy===token;if(!current())throw failure('unavailable');return action(current);}).finally(()=>{settled=true;if(token.canceled&&busy===token){busy=null;publish();}});
  try{const result=await bounded(Promise.race([work,new Promise((_,reject)=>{cancel=reject;})]),ms);if(disposed||epoch!==generation)throw failure('unavailable');return result;}
  catch(e){token.canceled=true;if(epoch===generation&&!disposed){const code=classify(e);error=errors.has(code)?code:'failed';}throw failure(errors.has(classify(e))?classify(e):'failed');}
  finally{if(busy===token){if(settled)busy=null;else token.kind='canceling';}publish();}
 }
 const agent={
  async RequestConfirmation(path,passkey){
   if(disposed||path!==pairPath||!objects[path]?.[DEVICE]||isParked()!==true||confirmation||!Number.isInteger(passkey)||passkey<0||passkey>999999)throw agentFailure();
   await new Promise((resolve,reject)=>{confirmation={token:randomUUID(),path,passkey:String(passkey).padStart(6,'0'),resolve,reject};publish();});
  },
  async Cancel(){rejectPrompt();publish();},
  async Release(){agentRegistered=false;rejectPrompt();busy?.cancel();publish();},
 };
 for(const method of ['RequestPinCode','DisplayPinCode','RequestPasskey','DisplayPasskey','RequestAuthorization','AuthorizeService'])agent[method]=async()=>{throw agentFailure();};
 async function ensureAgent(current){
  if(agentRegistered)return;unexport??=bluez.exportAgent(AGENT,agent);
  const epoch=generation,target=owner;await request('/org/bluez','org.bluez.AgentManager1','RegisterAgent',[AGENT,'DisplayYesNo'],'os');
  if(!current()||epoch!==generation){if(target===owner)await bounded(request('/org/bluez','org.bluez.AgentManager1','UnregisterAgent',[AGENT],'o',target),operationMs).catch(()=>{});throw failure('unavailable');}agentRegistered=true;
 }
 const api={view,
  start(){if(started||disposed)return;started=true;stopWatch=bluez.watch(snapshot=>{
   if(disposed)return;
   if(owner!==snapshot.owner){generation++;busy?.cancel();rejectPrompt();clearForget();clearLease(true);clock.clearTimeout(discoveryTimer);discovery=false;agentRegistered=false;ids=new Map();}
   owner=typeof snapshot.owner==='string'&&/^:\d+\.\d+$/.test(snapshot.owner)?snapshot.owner:null;objects=owner&&snapshot.objects&&typeof snapshot.objects==='object'?snapshot.objects:{};
   if(pairPath&&(!objects[pairPath]?.[DEVICE]||objects[adapterPath]?.[ADAPTER]?.Powered!==true)){rejectPrompt();busy?.cancel();}
   if(musicPath&&!objects[musicPath]?.[DEVICE])clearLease();if(forget&&!objects[forget.path]?.[DEVICE])clearForget();publish();
  });},
  async discover(){parked();if(discovery)return;const target=owner,attempt=++discoveryEpoch;await run('discovery',async current=>{
   const work=(async()=>{await request(adapterPath,ADAPTER,'StartDiscovery',[],'',target);if(target===owner)discovery=true;
    if(!current()||target!==owner||attempt!==discoveryEpoch){if(target===owner){await request(adapterPath,ADAPTER,'StopDiscovery',[],'',target);discovery=false;}throw failure('unavailable');}
    discovery=true;discoveryTimer=clock.setTimeout(()=>{void api.stopDiscovery().catch(()=>{});},discoveryMs);
   })();discoveryWork=work;try{await work;}finally{if(discoveryWork===work)discoveryWork=null;}
  });},
  async stopDiscovery(){discoveryEpoch++;clock.clearTimeout(discoveryTimer);if(busy?.kind==='discovery')busy.cancel();const work=discoveryWork;if(work)await safeCall(work.catch(()=>{}));if(!discovery)return;await safeCall(request(adapterPath,ADAPTER,'StopDiscovery'));discovery=false;publish();},
  async pair(id){parked();const path=pathFor(id),target=owner;if(objects[path][DEVICE].Paired===true)return;
   await run('pairing',async current=>{pairPath=path;try{await ensureAgent(current);if(!current()||pairPath!==path)throw failure('unavailable');pairRequested=true;await request(path,DEVICE,'Pair');}finally{rejectPrompt();pairPath=null;pairRequested=false;}},pairMs).catch(async e=>{rejectPrompt();pairPath=null;const requested=pairRequested;pairRequested=false;if(requested&&owner===target&&!disposed)await bounded(request(path,DEVICE,'CancelPairing',[],'',target),operationMs).catch(()=>{});throw e;});
  },
  confirm(token,accepted){if(!confirmation||token!==confirmation.token||typeof accepted!=='boolean')throw failure('unavailable');const prompt=confirmation;confirmation=null;if(accepted&&isParked()===true)prompt.resolve();else prompt.reject(agentFailure());publish();},
  async cancelPairing(){rejectPrompt();const path=pairRequested?pairPath:null;pairPath=null;pairRequested=false;busy?.kind==='pairing'&&busy.cancel();if(path&&owner)await safeCall(request(path,DEVICE,'CancelPairing'));},
  async connectMusic(id,{automatic=false}={}){parked();const path=pathFor(id),device=view().devices.find(d=>d.id===id);
   if(!device.paired||!device.musicSupported||device.transport!=='unavailable'||audio?.sinkReady()!==true||lease)throw failure('not-ready');
   const target=owner,attempt=++musicEpoch;await run('connecting',async current=>{
    const acquireRequest=audio.acquire(id,{automatic:automatic===true});acquirePending=acquireRequest;let acquired;try{acquired=await acquireRequest;}finally{if(acquirePending===acquireRequest)acquirePending=null;}if(!acquired||typeof acquired.valid!=='function'||typeof acquired.onLost!=='function'||typeof acquired.release!=='function'){acquired?.release?.();throw failure('not-ready');}
    if(!current()||attempt!==musicEpoch||target!==owner||!acquired.valid()){acquired.release();throw failure('unavailable');}
    lease=acquired;musicPath=path;unwatchLease=acquired.onLost(()=>api.releaseMusic());
    try{if(!current()||attempt!==musicEpoch||lease!==acquired||!acquired.valid())throw failure('unavailable');musicRequested=true;const pending=request(path,DEVICE,'ConnectProfile',[SOURCE],'s',target);connectionPending=pending;try{await pending;}finally{if(connectionPending===pending)connectionPending=null;}
     if(!current()||attempt!==musicEpoch||target!==owner||lease!==acquired||!acquired.valid()||releaseFlight){
      if(target===owner&&lease===acquired)await api.releaseMusic();throw failure('unavailable');
     }
    }catch(e){if(lease===acquired&&!releaseFlight&&!musicRequested)clearLease();throw e;}
   }).catch(async e=>{await api.releaseMusic().catch(()=>{});throw e;});
  },
  deviceKey(id){return pathFor(id);},
  deviceForKey(path){view();return objects[path]?.[DEVICE]?.Adapter===adapterPath&&objects[path][DEVICE].Paired===true?ids.get(path)??null:null;},
  requestForget(id){parked();const path=pathFor(id);if(!forgetAllowed(path))throw failure('not-ready');clearForget();forget={path,token:randomUUID(),generation};forgetTimer=clock.setTimeout(()=>{forget=null;publish();},30000);publish();},
  async confirmForget(token,accepted){
   if(!forget||token!==forget.token||typeof accepted!=='boolean')throw failure('unavailable');const requestToForget=forget;clearForget();publish();if(!accepted)return;
   parked();const path=requestToForget.path;if(requestToForget.generation!==generation||!forgetAllowed(path))throw failure('not-ready');
   await run('forgetting',async current=>{await onForget(path);if(!current()||canForget()!==true||objects[path]?.[DEVICE]?.Connected!==false||objects[path]?.[DEVICE]?.Paired!==true)throw failure('unavailable');await request(adapterPath,ADAPTER,'RemoveDevice',[path],'o');});
  },
  async media(token,control){
   const members={play:'Play',pause:'Pause',next:'Next',previous:'Previous'},observed=mediaView(),addressed=addressedPlayer();
   if(!observed||observed.token!==token||!Object.hasOwn(members,control)||!observed.controls.includes(control)||!addressed)throw failure('unavailable');
   await run('media',async current=>{
    let preferenceFailure;if(control==='pause')try{await onMediaIntent('pause');}catch(e){preferenceFailure=e;}
    if(!current()||mediaView()?.token!==token||!lease?.valid())throw failure('unavailable');
    try{await request(addressed.path,'org.bluez.MediaPlayer1',members[control]);}catch(e){if(e?.name==='org.bluez.Error.NotSupported'&&mediaView()?.token===token)unsupported.add(control);throw e;}
    if(!current()||mediaView()?.token!==token)throw failure('unavailable');if(control==='play')await onMediaIntent('play');if(preferenceFailure)throw preferenceFailure;
   });
  },
  releaseMusic(){
   musicEpoch++;if(busy?.kind==='connecting')busy.cancel();if(releaseFlight)return releaseFlight;const acquisition=acquirePending;
   releaseFlight=Promise.resolve().then(async()=>{
    if(acquisition)await safeCall(Promise.resolve(acquisition).catch(()=>{}));
    const path=musicRequested?musicPath:null,target=owner,acquired=lease,pending=connectionPending;
    if(!path){clearLease();publish();return;}
    if(pending)await safeCall(Promise.resolve(pending).catch(()=>{}));if(target===owner)await safeCall(request(path,DEVICE,'DisconnectProfile',[SOURCE],'s',target));if(lease===acquired)clearLease();publish();
   }).finally(()=>{releaseFlight=null;});return releaseFlight;
  },
  async dispose(){if(disposed)return;disposed=true;generation++;busy?.cancel();rejectPrompt();clearForget();stopWatch?.();clock.clearTimeout(discoveryTimer);
   const tasks=[];if(discovery)tasks.push(api.stopDiscovery());if(pairRequested&&pairPath&&owner)tasks.push(request(pairPath,DEVICE,'CancelPairing'));if(musicPath)tasks.push(api.releaseMusic());if(agentRegistered&&owner)tasks.push(request('/org/bluez','org.bluez.AgentManager1','UnregisterAgent',[AGENT],'o'));
   pairPath=null;agentRegistered=false;await bounded(Promise.allSettled(tasks),operationMs).catch(()=>{});unexport?.();unexport=null;publish();
  }
 };
 return api;
}
