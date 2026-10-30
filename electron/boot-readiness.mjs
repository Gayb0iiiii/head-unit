import {randomBytes} from 'node:crypto';
import {readProcessInstance} from './process-instance.mjs';
const nonceValid=n=>typeof n==='string'&&/^[a-f0-9]{48}$/.test(n);
const exact=(m,keys)=>m&&typeof m==='object'&&!Array.isArray(m)&&Object.keys(m).sort().join(',')===keys;
const deadline=(fn,ms)=>new Promise(resolve=>{let done=false;const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value);};const timer=setTimeout(()=>finish(null),ms);try{Promise.resolve(fn()).then(finish,()=>finish(null));}catch{finish(null);}});
/** Parent-owned inherited IPC only. No public endpoint, persistent secret or service mutation. */
export async function createOwnedReadiness({child,uid,parentPid=process.pid,readIdentity=readProcessInstance,timeoutMs=1000,now=()=>performance.now()}={}){
 if(!Number.isSafeInteger(uid)||uid<0||!Number.isSafeInteger(parentPid)||parentPid<1||!Number.isSafeInteger(child?.pid)||child.pid<1||!['on','removeListener','send'].every(key=>typeof child[key]==='function')||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>5000)return null;
 const initial=await deadline(()=>readIdentity(child.pid,uid),timeoutMs);
 const owned=value=>value?.pid===child.pid&&value.uid===uid&&value.ppid===parentPid&&typeof value.instance==='string'&&/^[a-f0-9]{64}$/.test(value.instance);
 if(!owned(initial)||child.connected!==true)return null;
 let disposed=false,pending=null,cancel=null;
 function probe({signal}={}){
  if(disposed||signal?.aborted||child.connected!==true)return Promise.resolve(null);
  if(pending)return pending;
  pending=new Promise(resolve=>{
   const nonce=randomBytes(24).toString('hex'),observedAt=now();let finished=false,checking=false;
   const finish=value=>{if(finished)return;finished=true;clearTimeout(timer);child.removeListener('message',message);child.removeListener('disconnect',lost);child.removeListener('exit',lost);child.removeListener('error',lost);signal?.removeEventListener('abort',lost);cancel=null;resolve(value);};
   const lost=()=>finish(null);cancel=lost;
   const timer=setTimeout(lost,timeoutMs);
   const message=async value=>{
    if(finished||checking||!exact(value,'kind,nonce,ready')||value.kind!=='boot-readiness'||value.nonce!==nonce||typeof value.ready!=='boolean')return;
    checking=true;
    const identity=await deadline(()=>readIdentity(child.pid,uid),timeoutMs);
    if(finished)return;
    if(disposed||child.connected!==true||!owned(identity)||identity.instance!==initial.instance||identity.sessionId!==initial.sessionId){finish(null);return;}
    const checkedAt=now(),age=checkedAt-observedAt;
    finish(Number.isFinite(observedAt)&&Number.isFinite(checkedAt)&&age>=0&&age<=2000?{pid:identity.pid,sessionId:identity.sessionId,instance:identity.instance,ready:value.ready,observedAt}:null);
   };
   child.on('message',message);for(const event of ['disconnect','exit','error'])child.on(event,lost);signal?.addEventListener('abort',lost,{once:true});
   try{child.send({kind:'boot-readiness-probe',nonce},error=>{if(error)lost();});}catch{lost();}
  }).finally(()=>{pending=null;});
  return pending;
 }
 return {probe,dispose(){disposed=true;cancel?.();}};
}
/** Attach only in a known child main process. isReady must reflect trusted current lifecycle state. */
export function attachReadinessResponder({channel=process,isReady,timeoutMs=1000}={}){
 if(typeof isReady!=='function'||!['on','removeListener','send'].every(key=>typeof channel?.[key]==='function')||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>5000)throw TypeError('Readiness channel required');
 let disposed=false,busy=false;
 const listener=async message=>{
  if(disposed||busy||channel.connected!==true||!exact(message,'kind,nonce')||message.kind!=='boot-readiness-probe'||!nonceValid(message.nonce))return;
  busy=true;const ready=await deadline(isReady,timeoutMs);busy=false;
  if(disposed||channel.connected!==true)return;
  try{channel.send({kind:'boot-readiness',nonce:message.nonce,ready:ready===true},()=>{});}catch{}
 };
 const dispose=()=>{disposed=true;channel.removeListener('message',listener);channel.removeListener('disconnect',dispose);};
 channel.on('message',listener);channel.on('disconnect',dispose);return dispose;
}
