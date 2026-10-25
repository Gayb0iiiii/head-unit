const shaPattern=/^[0-9a-f]{40}$/;
/** One user-requested update at a time. No source, branch, path or command comes from the renderer. */
export function createUpdateService({prepare,activate,initialPhase='idle'}){
  if(typeof prepare!=='function'||typeof activate!=='function')throw TypeError('Invalid update service');
  if(!['idle','failed'].includes(initialPhase))throw TypeError('Invalid initial update status');
  let state={phase:initialPhase,sha:null},controller=null,disposed=false;
  const listeners=new Set();
  const emit=(phase,sha=null)=>{state={phase,sha};for(const listener of listeners)try{listener({...state});}catch{}};
  function start(parkedConfirmed){
    if(disposed||parkedConfirmed!==true||controller)return false;
    const operation=new AbortController();controller=operation;emit('checking');
    void (async()=>{
      try{
        const result=await prepare(operation.signal);
        if(operation.signal.aborted){emit('cancelled');return;}
        if(result?.status==='current'&&shaPattern.test(result.sha)){emit('current',result.sha);return;}
        if(result?.status!=='ready'||!shaPattern.test(result.sha))throw Error('Invalid prepared release');
        emit('activating',result.sha);
        await activate(result.sha);
        if(!operation.signal.aborted)emit('restarting',result.sha);
      }catch{emit(operation.signal.aborted?'cancelled':'failed');}
      finally{if(controller===operation)controller=null;}
    })();
    return true;
  }
  return {
    start,
    cancel(){if(!controller||['activating','restarting'].includes(state.phase))return false;controller.abort();return true;},
    snapshot:()=>({...state}),
    subscribe(listener){if(typeof listener!=='function')throw TypeError('Listener required');listeners.add(listener);return()=>listeners.delete(listener);},
    dispose(){disposed=true;controller?.abort();listeners.clear();},
  };
}
