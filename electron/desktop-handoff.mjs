/** Session choice is intentionally strict. A renderer never supplies a destination. */
export function selectTargetSession({sessions,processes,currentId,uid,target}) {
  if(!Array.isArray(sessions)||!Array.isArray(processes)||!['desktop','headunit'].includes(target))return null;
  const current=sessions.find(s=>s.id===currentId);
  if(!current||current.uid!==uid||current.remote||current.sessionClass!=='user'||current.seat!=='seat0'||!Number.isInteger(current.vt)||current.vt<1||!['online','active'].includes(current.state))return null;
  const local=processes.filter(p=>p.sessionId===currentId);
  if(target==='desktop'&&!local.some(p=>p.name==='cage'&&p.headunit===true))return null;
  // Native KWin starts before creating its own Wayland socket. Its inherited
  // /proc environment therefore need not contain WAYLAND_DISPLAY; require a
  // live same-session KWin plus a Plasma client with a verified socket instead.
  if(target==='headunit'&&!(local.some(p=>p.name==='kwin_wayland')&&local.some(p=>p.name==='plasmashell'&&p.wayland)))return null;
  const matches=sessions.filter(s=>s.id!==currentId&&s.uid===uid&&s.seat===current.seat&&!s.remote&&s.sessionClass==='user'&&Number.isInteger(s.vt)&&s.vt>=1&&s.vt!==current.vt&&['online','active'].includes(s.state)).filter(s=>{
    const linked=processes.filter(p=>p.sessionId===s.id);
    return target==='desktop'
      ?linked.some(p=>p.name==='kwin_wayland')&&linked.some(p=>p.name==='plasmashell'&&p.wayland)
      :linked.some(p=>p.name==='cage'&&p.headunit===true);
  });
  return matches.length===1?matches[0].id:null;
}

export function createDesktopHandoff({target,currentId,uid,discover,activate,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  if(!['desktop','headunit'].includes(target)||typeof currentId!=='string'||!Number.isInteger(uid)||typeof discover!=='function'||typeof activate!=='function')throw TypeError('Desktop handoff dependencies required');
  let available=false,disposed=false,inFlight=null,refreshPending=null;
  const listeners=new Set();
  const choose=async()=>selectTargetSession({...await discover(),currentId,uid,target});
  async function refreshNow(){
    if(disposed)return false;
    let candidate=null;
    try{candidate=await choose();}catch{}
    if(disposed)return false;
    const next=Boolean(candidate);
    if(available!==next){available=next;for(const listener of listeners){try{listener(next);}catch{}}}
    return next;
  }
  const refresh=()=>{
    if(disposed)return Promise.resolve(false);
    if(!refreshPending)refreshPending=refreshNow().finally(()=>{refreshPending=null;});
    return refreshPending;
  };
  async function perform(){
    if(disposed)return false;
    let candidate;
    try{candidate=await choose();}catch{return false;}
    if(!candidate||disposed)return false;
    try{await activate(candidate);}catch{return false;}
    for(let attempt=0;attempt<5&&!disposed;attempt++){
      let observed;
      try{observed=await discover();}catch{return false;}
      if(disposed)return false;
      if(selectTargetSession({...observed,currentId,uid,target})!==candidate)return false;
      if(observed.sessions.find(s=>s.id===candidate)?.active===true&&observed.sessions.find(s=>s.id===currentId)?.active===false)return true;
      if(attempt<4)await wait(250);
    }
    return false;
  }
  return {
    get available(){return !disposed&&available;},
    refresh,
    request(){if(inFlight)return inFlight;inFlight=perform().finally(()=>{inFlight=null;});return inFlight;},
    subscribe(listener){if(typeof listener!=='function')throw TypeError('Listener required');listeners.add(listener);return()=>listeners.delete(listener);},
    dispose(){disposed=true;available=false;listeners.clear();},
  };
}
