import {fstatSync} from 'node:fs';

/** Explicit host attachment only; importing this module never reads stdin. */
export function watchParentLifeline({onLost,env=process.env,input=process.stdin,stat=()=>fstatSync(0)}={}) {
  if(env.LIVI_LIFELINE!=='1')return ()=>{};
  let pipe=false;
  try {const info=stat();pipe=info.isFIFO()||info.isSocket();}catch{return ()=>{};}
  if(!pipe)return ()=>{};
  if(typeof onLost!=='function')throw new TypeError('Parent loss callback required');
  if(!input||!['on','removeListener','resume','pause'].every(key=>typeof input[key]==='function'))throw new TypeError('Readable lifeline required');
  let active=true;
  const ownedFlow=input.readableFlowing!==true;
  function detach(){
    if(!active)return;
    active=false;
    for(const event of ['end','close','error'])input.removeListener(event,lost);
    // destroy(error) queues error before close. Detaching during that gap must not
    // turn a handled parent loss into an uncaught exception after the quit callback.
    if(input.destroyed&&input.errored) {
      const drain=()=>closed();
      let cleanup;
      const closed=()=>{clearImmediate(cleanup);input.removeListener('error',drain);input.removeListener('close',closed);};
      input.on('error',drain);input.on('close',closed);
      // closed means _destroy has finished, but its error/close may still be queued.
      // An async _destroy must retain the drain until its actual terminal event.
      if(input.closed){cleanup=setImmediate(closed);cleanup.unref?.();}
    }
    if(ownedFlow)input.pause();
  }
  function lost(){if(!active)return;detach();onLost();}
  for(const event of ['end','close','error'])input.on(event,lost);
  // A parent may have gone away before this owner attaches. Never open core.sock then.
  if(input.readableEnded||input.destroyed)lost();
  else {try{input.resume();}catch(error){detach();throw error;}}
  return detach;
}
