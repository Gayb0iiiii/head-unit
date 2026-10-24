/** UI animation-frame cadence and fixed host counters; never projection-video FPS. */
export function startDebugOverlay(api,getNode,clock={}){
  const now=clock.now||(()=>performance.now());
  const requestFrame=clock.requestFrame||globalThis.requestAnimationFrame?.bind(globalThis);
  const cancelFrame=clock.cancelFrame||globalThis.cancelAnimationFrame?.bind(globalThis);
  const setEvery=clock.setInterval||setInterval;
  const clearEvery=clock.clearInterval||clearInterval;
  let stopped=false,frameId,frames=0,last=now(),cpu=null,gpu=null,busy=false;
  const percent=value=>Number.isFinite(value)&&value>=0&&value<=100?`${value.toFixed(1)}%`:'unavailable';
  function draw(fps=null){
    const node=getNode();
    if(node)node.textContent=`UI FPS ${fps===null?'unavailable':fps.toFixed(1)} · CPU ${percent(cpu)} · GPU ${percent(gpu)}`;
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
      try{const sample=await api.getMetrics();if(stopped)return;cpu=sample?.cpuPercent;gpu=sample?.gpuPercent;}
      catch{cpu=null;gpu=null;}
      finally{busy=false;}
    }
    if(!stopped)draw(fps);
  }
  const timer=setEvery(tick,2000);timer?.unref?.();
  return ()=>{if(stopped)return;stopped=true;clearEvery(timer);if(requestFrame&&cancelFrame)cancelFrame(frameId);};
}
