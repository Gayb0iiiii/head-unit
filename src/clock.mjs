/** Update only the clock node; align to wall-clock minutes and allow deterministic tests. */
export function startClock(update,clock={now:()=>Date.now(),setTimeout,clearTimeout}) {
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
