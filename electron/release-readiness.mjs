import {createOwnedReadiness} from './boot-readiness.mjs';
import {correlateProcessSession} from './session-correlation.mjs';
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const session=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,32}$/.test(value);
/** Explicit read-only query. Never caches readiness, activates sessions or affects release decisions. */
export function queryReleaseReadiness({child,isCurrent,signal,uid=process.getuid?.(),now=()=>performance.now(),createProbe=createOwnedReadiness,correlate=correlateProcessSession,timeoutMs=4000}={}){
 if(!Number.isSafeInteger(uid)||uid<1||![isCurrent,now,createProbe,correlate].every(fn=>typeof fn==='function')||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>5000||signal?.aborted||child?.connected!==true)return Promise.resolve(null);
 return new Promise(resolve=>{
  let finished=false,probe=null;const stop=new AbortController();
  const finish=value=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);for(const event of ['exit','error','disconnect'])child.removeListener(event,cancel);stop.abort();probe?.dispose();resolve(value);};
  const cancel=()=>finish(null);const timer=setTimeout(cancel,timeoutMs);
  signal?.addEventListener('abort',cancel,{once:true});for(const event of ['exit','error','disconnect'])child.on(event,cancel);
  const valid=()=>!finished&&!signal?.aborted&&child.connected===true&&isCurrent();
  void (async()=>{
   try{
    if(!valid()){finish(null);return;}
    probe=await createProbe({child,uid,now,timeoutMs:Math.min(1000,timeoutMs)});
    if(!valid()||!probe){probe?.dispose();finish(null);return;}
    const proof=await probe.probe({signal:stop.signal});
    if(!valid()||proof?.ready!==true||proof.pid!==child.pid||!session(proof.sessionId)||!digest(proof.instance)||!Number.isFinite(proof.observedAt)){finish(null);return;}
    const linked=await correlate({pid:proof.pid,uid,processInstance:proof.instance,signal:stop.signal,timeoutMs:Math.min(2000,timeoutMs)});
    const checkedAt=now(),age=Number.isFinite(checkedAt)?checkedAt-proof.observedAt:NaN;
    if(!valid()||!linked||linked.pid!==proof.pid||linked.uid!==uid||linked.processInstance!==proof.instance||linked.sessionId!==proof.sessionId||!digest(linked.instance)||linked.seat!=='seat0'||!Number.isSafeInteger(linked.vt)||linked.vt<1||typeof linked.active!=='boolean'||!Number.isFinite(age)||age<0||age>2000){finish(null);return;}
    finish({sessionId:linked.sessionId,instance:linked.instance,ready:true,observedAt:proof.observedAt});
   }catch{finish(null);}
  })();
 });
}
