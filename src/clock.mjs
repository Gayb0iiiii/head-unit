/** Update only the clock node; align to wall-clock minutes and allow deterministic tests. */
export function formatClock(date,timezone){
  const options=typeof timezone==='string'?{timeZone:timezone}:{};
  try{return {time:date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false,...options}),date:date.toLocaleDateString([],{weekday:'long',day:'numeric',month:'long',...options}),timezone:timezone||null};}
  catch{return {time:date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false}),date:date.toLocaleDateString([],{weekday:'long',day:'numeric',month:'long'}),timezone:null};}
}
export function startClock(update,clock={now:()=>Date.now(),setTimeout:(fn,delay)=>globalThis.setTimeout(fn,delay),clearTimeout:id=>globalThis.clearTimeout(id)}) {
  let timer,stopped=false;
  function tick(){
    if(stopped)return;
    const now=clock.now();update(new Date(now));
    timer=clock.setTimeout(tick,60000-((now%60000+60000)%60000));
    timer?.unref?.();
  }
  tick();
  return ()=>{stopped=true;clock.clearTimeout(timer);};
}
