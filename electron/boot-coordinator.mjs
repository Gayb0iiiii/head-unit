// Inactive host component. No process launch, service control or renderer API.
// Providers must attest current session/process instances and honor AbortSignal.
const sessionId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,32}$/.test(value);
const instanceId=value=>typeof value==='string'&&value.length>0&&value.length<=128;
function candidate(snapshot,role,uid,now){
 if(snapshot?.displayConnected!==true||!Array.isArray(snapshot.sessions)||!Array.isArray(snapshot.processes)||snapshot.sessions.length>16||snapshot.processes.length>2048)return null;
 const candidates=snapshot.sessions.filter(s=>sessionId(s?.id)&&s.uid===uid&&s.seat==='seat0'&&s.remote===false&&s.sessionClass==='user'&&['online','active'].includes(s.state)&&Number.isInteger(s.vt)&&s.vt>0&&instanceId(s.instance)).filter(s=>{
  const p=snapshot.processes.filter(p=>p?.sessionId===s.id&&p.instance===s.instance);
  return role==='headunit'?p.some(p=>p.name==='cage'&&p.headunit===true):p.some(p=>p.name==='kwin_wayland')&&p.some(p=>p.name==='plasmashell'&&p.wayland===true);
 });
 if(candidates.length!==1)return null;
 const target=candidates[0],proof=snapshot.readiness?.[role];
 const age=Number.isFinite(proof?.observedAt)&&Number.isFinite(now)?now-proof.observedAt:NaN;
 if(proof?.ready!==true||proof.sessionId!==target.id||proof.instance!==target.instance||!Number.isFinite(proof.observedAt)||!Number.isFinite(age)||age<0||age>2000)return null;
 return target;
}
const same=(a,b)=>a&&b&&a.id===b.id&&a.instance===b.instance&&a.vt===b.vt;
const result=(status,reason)=>({status,reason});
export function createBootCoordinator({uid,discover,activate,now=()=>performance.now(),attempts=40,pollMs=250,callMs=2000}={}){
 if(!Number.isInteger(uid)||uid<1||![discover,activate,now].every(fn=>typeof fn==='function')||!Number.isInteger(attempts)||attempts<1||attempts>120||![pollMs,callMs].every(n=>Number.isInteger(n)&&n>=1&&n<=5000))throw TypeError('Bounded boot providers required');
 let disposed=false,running=null;const stop=new AbortController();
 function bounded(fn){return new Promise((resolve,reject)=>{
  if(disposed){reject(Error('cancelled'));return;}
  const controller=new AbortController();let settled=false;
  const finish=(ok,value)=>{if(settled)return;settled=true;clearTimeout(timer);stop.signal.removeEventListener('abort',cancel);ok?resolve(value):reject(value);};
  const cancel=()=>{controller.abort();finish(false,Error('cancelled'));};
  const timer=setTimeout(()=>{controller.abort();finish(false,Error('timeout'));},callMs);
  stop.signal.addEventListener('abort',cancel,{once:true});
  try{Promise.resolve(fn(controller.signal)).then(v=>finish(true,v),e=>finish(false,e));}catch(error){finish(false,error);}
 });}
 const read=async()=>{try{return await bounded(signal=>discover(signal));}catch{return null;}};
 const pause=()=>new Promise(resolve=>{if(disposed){resolve();return;}const done=()=>{clearTimeout(timer);stop.signal.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,pollMs);stop.signal.addEventListener('abort',done,{once:true});});
 async function choose(role,target){
  const fresh=await read();if(disposed)return result('cancelled','disposed');
  if(!same(target,candidate(fresh,role,uid,now())))return null;
  if(role==='headunit'){
   const desktop=candidate(fresh,'desktop',uid,now());if(!desktop||desktop.vt===target.vt||desktop.id===target.id)return null;
  }
  const exclusive=s=>s.sessions.filter(s=>s?.seat==='seat0'&&s.active===true).length===1&&s.sessions.find(s=>s?.id===target.id)?.active===true;
  if(exclusive(fresh))return result(role,'already-active');
  let ack;try{ack=await bounded(signal=>activate(target.id,{instance:target.instance,signal}));}
  catch{return result(disposed?'cancelled':'recovery-required',disposed?'disposed':'activation-uncertain');}
  if(disposed)return result('cancelled','disposed');
  if(ack?.accepted===false)return null;
  if(ack?.accepted!==true)return result('recovery-required','activation-uncertain');
  for(let i=0;i<3&&!disposed;i++){
   const observed=await read();if(disposed)break;
   if(!same(target,candidate(observed,role,uid,now())))return result('recovery-required','target-lost');
   if(exclusive(observed))return result(role,'activation-observed');
   if(i<2)await pause();
  }
  return result(disposed?'cancelled':'recovery-required',disposed?'disposed':'activation-unobserved');
 }
 async function perform(){
  for(let i=0;i<attempts&&!disposed;i++){
   const snapshot=await read();if(disposed)break;
   if(snapshot?.displayConnected===false)return result('recovery-required','display-missing');
   const ui=candidate(snapshot,'headunit',uid,now()),desktop=candidate(snapshot,'desktop',uid,now());
   if(ui&&desktop&&ui.vt!==desktop.vt&&ui.id!==desktop.id){const chosen=await choose('headunit',ui);if(chosen)return chosen;break;}
   if(i<attempts-1)await pause();
  }
  if(disposed)return result('cancelled','disposed');
  const snapshot=await read();if(disposed)return result('cancelled','disposed');
  const desktop=candidate(snapshot,'desktop',uid,now());
  if(desktop){const fallback=await choose('desktop',desktop);if(fallback)return fallback;}
  return result(disposed?'cancelled':'recovery-required',disposed?'disposed':'no-verified-session');
 }
 return {run(){return running??=perform();},dispose(){if(disposed)return;disposed=true;stop.abort();}};
}
