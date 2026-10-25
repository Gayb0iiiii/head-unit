const shaPattern=/^[0-9a-f]{40}$/;

/** Keep Cage's supervised child alive while Electron restarts or rolls back. */
export function createReleaseSupervisor({initial,recovered=false,launch,verifyRelease,saveState,setTimer=setTimeout,clearTimer=clearTimeout,onFatal=()=>{},readinessMs=30000,healthMs=10000}){
  if(!shaPattern.test(initial?.sha)||typeof initial?.path!=='string'||![launch,verifyRelease,saveState,setTimer,clearTimer,onFatal].every(fn=>typeof fn==='function'))throw TypeError('Invalid release supervisor');
  let active=initial,current=null,pending=null,failures=0,disposed=false,timer=null,stopTimer=null,queue=Promise.resolve();
  const enqueue=fn=>{queue=queue.then(fn).catch(error=>{if(!disposed)onFatal(error);});return queue;};
  const clearWatch=()=>{if(timer!==null)clearTimer(timer);timer=null;};
  const clearStop=()=>{if(stopTimer!==null)clearTimer(stopTimer);stopTimer=null;};
  const armStop=instance=>{clearStop();stopTimer=setTimer(()=>{if(current===instance&&instance.child.kill('SIGKILL')===false)onFatal(Error('Electron could not stop'));},10000);stopTimer?.unref?.();};
  const acknowledge=(child,id,accepted)=>{try{child.send?.({kind:'update-ack',id,accepted});}catch{}};
  async function launchRelease(release,mode){
    if(disposed)return;
    const child=await launch(release,mode);
    const instance={child,release,mode,ready:false};current=instance;
    child.on('message',message=>{void enqueue(()=>receive(instance,message));});
    child.on('exit',code=>{void enqueue(()=>exited(instance,code));});
    child.on('error',()=>{void enqueue(()=>exited(instance,1));});
    timer=setTimer(()=>{if(current===instance&&!instance.ready){if(child.kill('SIGTERM')===false)onFatal(Error('Electron readiness timeout could not stop the child'));else armStop(instance);}},readinessMs);
    timer?.unref?.();
  }
  async function commitCandidate(instance){
    if(disposed||instance!==current||!instance.ready||!pending||instance.mode!=='candidate')return;
    try{await saveState({active:instance.release.sha,pending:null,previous:active.sha});}
    catch{if(instance.child.kill('SIGTERM')===false)onFatal(Error('Failed release could not stop'));else armStop(instance);return;}
    active=instance.release;pending=null;failures=0;clearWatch();
  }
  async function receive(instance,message){
    if(disposed||instance!==current||!message||typeof message!=='object')return;
    if(message.kind==='ready'){
      if(message.sha!==instance.release.sha||instance.ready)return;
      clearWatch();
      if(instance.mode==='candidate'){
        instance.ready=true;
        timer=setTimer(()=>{void enqueue(()=>commitCandidate(instance));},healthMs);
        timer?.unref?.();
        return;
      }
      failures=0;
      instance.ready=true;
      return;
    }
    if(message.kind!=='activate'||!Number.isSafeInteger(message.id)||message.id<1||message.id>1e9)return;
    const reject=()=>acknowledge(instance.child,message.id,false);
    if(!instance.ready||pending||instance.mode==='candidate'||!shaPattern.test(message.sha)||message.sha===active.sha){reject();return;}
    let candidate;
    try{candidate=await verifyRelease(message.sha);}catch{reject();return;}
    if(candidate?.sha!==message.sha||typeof candidate.path!=='string'){reject();return;}
    try{await saveState({active:active.sha,pending:candidate.sha,previous:null});}
    catch{reject();return;}
    pending={candidate,previous:active};
    if(instance.child.kill('SIGTERM')===false){
      pending=null;
      await saveState({active:active.sha,pending:null,previous:null});
      reject();return;
    }
    armStop(instance);
    acknowledge(instance.child,message.id,true);
  }
  async function exited(instance){
    if(disposed||instance!==current)return;
    clearWatch();clearStop();current=null;
    if(pending&&instance.mode!=='candidate'){
      await launchRelease(pending.candidate,'candidate');return;
    }
    if(pending&&instance.mode==='candidate'){
      await saveState({active:pending.previous.sha,pending:null,previous:null});
      active=pending.previous;pending=null;failures=0;
      await launchRelease(active,'rollback');return;
    }
    if(++failures>=3){onFatal(Error('Electron release repeatedly exited'));return;}
    await launchRelease(active,'active');
  }
  return {
    start:()=>enqueue(()=>launchRelease(active,recovered?'rollback':'active')),
    idle:()=>queue,
    dispose(){disposed=true;clearWatch();clearStop();current?.child.kill?.('SIGTERM');current=null;},
  };
}
