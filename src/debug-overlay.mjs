/** UI animation-frame cadence and fixed host counters; never projection-video FPS. */
export function startDebugOverlay(api,getNode,clock={}){
  const now=clock.now||(()=>performance.now());
  const requestFrame=clock.requestFrame||globalThis.requestAnimationFrame?.bind(globalThis);
  const cancelFrame=clock.cancelFrame||globalThis.cancelAnimationFrame?.bind(globalThis);
  const setEvery=clock.setInterval||setInterval;
  const clearEvery=clock.clearInterval||clearInterval;
  let stopped=false,frameId,frames=0,last=now(),cpu=null,gpu=null,ramUsed=null,ramTotal=null,down=null,up=null,ping=null,busy=false;
  const percent=value=>Number.isFinite(value)&&value>=0&&value<=100?`${value.toFixed(1)}%`:'unavailable';
  const gib=value=>Number.isFinite(value)&&value>=0?`${(value/1073741824).toFixed(1)} GiB`:'unavailable';
  const speed=value=>Number.isFinite(value)&&value>=0?value>=1048576?`${(value/1048576).toFixed(1)} MiB/s`:`${(value/1024).toFixed(1)} KiB/s`:'unavailable';
  function draw(fps=null){
    const node=getNode();
    if(node)node.textContent=`UI FPS ${fps===null?'unavailable':fps.toFixed(1)} · CPU ${percent(cpu)} · GPU use ${percent(gpu)} · RAM ${gib(ramUsed)}/${gib(ramTotal)} · NET ↓ ${speed(down)} ↑ ${speed(up)} · Google TCP latency ${Number.isFinite(ping)&&ping>=0?`${Math.round(ping)} ms`:'unavailable'}`;
  }
  function onFrame(){if(stopped)return;frames++;frameId=requestFrame(onFrame);}
  if(requestFrame)frameId=requestFrame(onFrame);
  draw();
  async function tick(){
    if(stopped)return;
    const time=now(),elapsed=time-last;
    const fps=requestFrame&&elapsed>0?frames*1000/elapsed:null;
    frames=0;last=time;
    if(!busy&&typeof api?.getMetrics==='function'){
      busy=true;
      try{const sample=await api.getMetrics();if(stopped)return;cpu=sample?.cpuPercent;gpu=sample?.gpuPercent;ramUsed=sample?.ramUsedBytes;ramTotal=sample?.ramTotalBytes;down=sample?.networkDownBytesPerSec;up=sample?.networkUpBytesPerSec;ping=sample?.pingMs;}
      catch{cpu=null;gpu=null;ramUsed=null;ramTotal=null;down=null;up=null;ping=null;}
      finally{busy=false;}
    }
    if(!stopped)draw(fps);
  }
  const timer=setEvery(tick,2000);timer?.unref?.();
  return ()=>{if(stopped)return;stopped=true;clearEvery(timer);if(requestFrame&&cancelFrame)cancelFrame(frameId);try{Promise.resolve(api?.stopMetrics?.()).catch(()=>{});}catch{}};
}
