/** UI animation-frame cadence and fixed host counters; never projection-video FPS. */
export function startDebugOverlay(api,getNode,clock={}){
  const now=clock.now||(()=>performance.now());
  const requestFrame=clock.requestFrame||globalThis.requestAnimationFrame?.bind(globalThis);
  const cancelFrame=clock.cancelFrame||globalThis.cancelAnimationFrame?.bind(globalThis);
  const setEvery=clock.setInterval||setInterval;
  const clearEvery=clock.clearInterval||clearInterval;
  let stopped=false,frameId,frames=0,last=now(),lastFps=null,cpu=null,gpu=null,ramUsed=null,ramTotal=null,down=null,up=null,ping=null,busy=false;
  let cpuStatus='pending',gpuStatus='unsupported',ramStatus='pending',networkStatus='pending',pingStatus='pending';
  const lastGood={cpu:-Infinity,ram:-Infinity,network:-Infinity,ping:-Infinity};
  const percent=value=>Number.isFinite(value)&&value>=0&&value<=100?`${value.toFixed(1)}%`:'unavailable';
  const gib=value=>Number.isFinite(value)&&value>=0?`${(value/1073741824).toFixed(1)} GiB`:'unavailable';
  const speed=value=>Number.isFinite(value)&&value>=0?value>=1048576?`${(value/1048576).toFixed(1)} MiB/s`:`${(value/1024).toFixed(1)} KiB/s`:'unavailable';
  const status=(value,state)=>state==='pending'?'measuring':state==='unsupported'?'unsupported':state==='stale'&&value!=='unavailable'?`${value} (stale)`:state==='current'?value:'unavailable';
  function draw(){
    const node=getNode();
    if(node)node.textContent=`UI FPS ${lastFps===null?'measuring':lastFps.toFixed(1)} · CPU ${status(percent(cpu),cpuStatus)} · GPU use ${status(percent(gpu),gpuStatus)} · RAM ${status(ramUsed!==null&&ramTotal!==null?`${gib(ramUsed)}/${gib(ramTotal)}`:'unavailable',ramStatus)} · NET ${status(down!==null&&up!==null?`↓ ${speed(down)} ↑ ${speed(up)}`:'unavailable',networkStatus)} · Google TCP latency ${status(Number.isFinite(ping)&&ping>=0?`${Math.round(ping)} ms`:'unavailable',pingStatus)}`;
  }
  function onFrame(){if(stopped)return;frames++;frameId=requestFrame(onFrame);}
  if(requestFrame)frameId=requestFrame(onFrame);
  draw();
  async function tick(){
    if(stopped)return;
    const time=now(),elapsed=time-last;
    lastFps=requestFrame&&elapsed>0?frames*1000/elapsed:null;
    frames=0;last=time;
    if(!busy&&typeof api?.getMetrics==='function'){
      busy=true;
      try{
        const sample=await api.getMetrics();if(stopped)return;if(!sample||typeof sample!=='object')throw Error('Missing metric snapshot');
        cpu=sample.cpuPercent;gpu=sample.gpuPercent;ramUsed=sample.ramUsedBytes;ramTotal=sample.ramTotalBytes;down=sample.networkDownBytesPerSec;up=sample.networkUpBytesPerSec;ping=sample.pingMs;
        for(const [kind,value] of [['cpu',cpu],['ram',ramUsed!==null&&ramTotal!==null?ramUsed:null],['network',down!==null&&up!==null?down:null],['ping',ping]]){
          const key=`${kind}Status`,provided=sample[key];
          const state=['pending','current','stale','unavailable','unsupported'].includes(provided)?provided:Number.isFinite(value)?'current':'unavailable';
          if(kind==='cpu')cpuStatus=state;
          else if(kind==='ram')ramStatus=state;
          else if(kind==='network')networkStatus=state;
          else pingStatus=state;
          if(state==='current')lastGood[kind]=time;
        }
        gpuStatus=sample.gpuStatus==='current'&&Number.isFinite(gpu)?'current':'unsupported';
      }
      catch{
        for(const [kind,limit] of [['cpu',10000],['ram',10000],['network',10000],['ping',30000]]){
          const state=time-lastGood[kind]<=limit?'stale':'unavailable';
          if(kind==='cpu'){cpuStatus=state;if(state==='unavailable')cpu=null;}
          else if(kind==='ram'){ramStatus=state;if(state==='unavailable')ramUsed=ramTotal=null;}
          else if(kind==='network'){networkStatus=state;if(state==='unavailable')down=up=null;}
          else{pingStatus=state;if(state==='unavailable')ping=null;}
        }
      }
      finally{busy=false;}
    }
    if(!stopped)draw();
  }
  const timer=setEvery(tick,2000);timer?.unref?.();
  const stop=()=>{if(stopped)return;stopped=true;clearEvery(timer);if(requestFrame&&cancelFrame)cancelFrame(frameId);try{Promise.resolve(api?.stopMetrics?.()).catch(()=>{});}catch{}};
  stop.repaint=()=>{if(!stopped)draw();};
  return stop;
}
