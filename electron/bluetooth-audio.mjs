import {execFile as execFileCallback} from 'node:child_process';import {promisify} from 'node:util';import {randomUUID} from 'node:crypto';
const execFile=promisify(execFileCallback);
export function inspectPipeWire(graph,outputName){
 const objects=Array.isArray(graph)&&graph.length<=8192?graph:[];
 const role=objects.some(o=>{const r=o?.info?.props?.['bluez5.roles'];return Array.isArray(r)?r.includes('a2dp_sink'):typeof r==='string'&&/^\[?[\w\s,]+\]?$/.test(r)&&r.split(/[\s,\[\]]+/).includes('a2dp_sink');});
 const output=objects.some(o=>o?.type==='PipeWire:Interface:Node'&&o.info?.props?.['media.class']==='Audio/Sink'&&o.info.props['node.name']===outputName&&['running','idle','suspended'].includes(o.info.state));
 return {sinkReady:role&&output,outputAvailable:output,roleObserved:role,audible:null};
}
/** Reads an existing PipeWire graph. Does not create links, choose defaults or change roles. */
export function createPipeWireMonitor({outputName,run=execFile,now=Date.now}={}){
 if(typeof outputName!=='string'||!outputName||outputName.length>256)throw TypeError('Reviewed output name required');
 let state=inspectPipeWire(null,outputName),at=0,disposed=false,pending,timer;const listeners=new Set();
 const publish=()=>{for(const fn of listeners)fn();};
 const api={sinkReady:()=>!disposed&&now()-at<10000&&state.sinkReady,snapshot:()=>({...state,sinkReady:api.sinkReady()}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
 refresh(){if(disposed)return Promise.resolve();if(pending)return pending;pending=(async()=>{let next;try{const r=await run('pw-dump',[],{encoding:'utf8',timeout:3000,maxBuffer:2*1024*1024});next=inspectPipeWire(JSON.parse(r.stdout),outputName);}catch{next=inspectPipeWire(null,outputName);}if(!disposed){state=next;at=now();publish();}})().finally(()=>{pending=null;});return pending;},
 start(){if(timer||disposed)return;void api.refresh();timer=setInterval(()=>{void api.refresh();},5000);timer.unref?.();},dispose(){disposed=true;clearInterval(timer);listeners.clear();state=inspectPipeWire(null,outputName);}};return api;
}
/** Conservative focus gate: unknown native ownership never grants a Bluetooth lease. */
export function createBluetoothFocus({controller,pipewire,onChange=()=>{},pauseMs=3000}={}){
 if(!Number.isFinite(pauseMs)||pauseMs<=0||pauseMs>10000)throw TypeError('Bounded pause deadline required');
 let disposed=false,pending=null,lease=null;
 const allowed=()=>!disposed&&controller.view().connected===true&&controller.view().front==='livi'&&controller.view().projectionReady!==true&&controller.view().homeStatus?.media?.playing!==true&&pipewire.sinkReady();
 const changed=()=>{if(!allowed()){if(pending){clearTimeout(pending.timer);pending.resolve(null);pending=null;}if(lease){lease.revoked=true;for(const fn of lease.listeners)void Promise.resolve().then(fn).catch(()=>{});}}onChange();};
 const stopController=controller.subscribe(changed),stopPipe=pipewire.subscribe?.(changed);
 const api={sinkReady:()=>pipewire.sinkReady(),snapshot:()=>({pauseRequest:pending?.token??null,owned:!!lease,audioUncertain:lease?.uncertain===true}),
 async acquire(){if(!allowed()||pending||lease)return null;return new Promise(resolve=>{const token=randomUUID();pending={token,resolve,timer:setTimeout(()=>{if(pending?.token===token){pending=null;resolve(null);onChange();}},pauseMs)};onChange();});},
 acknowledgePause(token,paused){if(!pending||token!==pending.token||typeof paused!=='boolean')throw Error('Bluetooth pause unavailable');const request=pending;pending=null;clearTimeout(request.timer);if(!paused||!allowed()){request.resolve(null);onChange();return;}
  const current={revoked:false,listeners:new Set()};lease=current;const result={onUncertain:()=>{current.uncertain=true;current.revoked=true;onChange();},valid:()=>lease===current&&!current.revoked&&allowed(),onLost:fn=>{current.listeners.add(fn);if(current.revoked)void Promise.resolve().then(fn).catch(()=>{});return()=>current.listeners.delete(fn);},release:()=>{if(lease===current){lease=null;onChange();}}};request.resolve(result);onChange();
 },dispose(){if(disposed)return;disposed=true;changed();stopController?.();stopPipe?.();}};return api;
}
