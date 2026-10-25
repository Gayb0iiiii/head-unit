import {readFile} from 'node:fs/promises';
import {createConnection} from 'node:net';

// Linux aggregate CPU busy time from /proc/stat. A missing/unsupported GPU
// counter is deliberately unavailable, never inferred from clock frequency.
function cpuTicks(raw){
  const line=typeof raw==='string'?raw.split('\n')[0]:'';
  const fields=line.trim().split(/\s+/);
  if(fields[0]!=='cpu'||fields.length<5)return null;
  const ticks=fields.slice(1).map(Number);
  if(ticks.some(value=>!Number.isSafeInteger(value)||value<0))return null;
  // guest and guest_nice are already included in user/nice in procfs.
  return {total:ticks.slice(0,8).reduce((sum,value)=>sum+value,0),idle:ticks[3]+(ticks[4]||0)};
}
const count=value=>/^\d+$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):null;
function memory(raw){
  if(typeof raw!=='string')return null;
  const total=count(/^MemTotal:\s+(\d+) kB$/m.exec(raw)?.[1]);
  const available=count(/^MemAvailable:\s+(\d+) kB$/m.exec(raw)?.[1]);
  return total!==null&&available!==null&&total>0&&available<=total?{ramUsedBytes:(total-available)*1024,ramTotalBytes:total*1024}:null;
}
function defaultInterface(raw){
  if(typeof raw!=='string')return null;
  return raw.split('\n').slice(1).map(line=>line.trim().split(/\s+/)).filter(fields=>fields.length>=8&&fields[1]==='00000000'&&fields[0]!=='lo'&&(parseInt(fields[3],16)&3)===3&&count(fields[6])!==null).sort((a,b)=>Number(a[6])-Number(b[6]))[0]?.[0]||null;
}
function network(raw,iface){
  if(typeof raw!=='string'||!iface)return null;
  const line=raw.split('\n').find(line=>line.trimStart().startsWith(`${iface}:`));
  if(!line)return null;
  const fields=line.split(':')[1]?.trim().split(/\s+/);
  if(!fields||fields.length<16)return null;
  const rx=count(fields[0]),tx=count(fields[8]);
  return rx===null||tx===null?null:{iface,rx,tx};
}
function pingGoogle(signal){
  return new Promise(resolve=>{
    const start=performance.now();let settled=false;
    let socket;try{socket=createConnection({host:'google.com',port:443,signal});}catch{resolve(null);return;}
    const done=value=>{if(settled)return;settled=true;clearTimeout(deadline);socket.destroy();resolve(value);};
    const deadline=setTimeout(()=>done(null),1500);deadline.unref?.();
    socket.once('connect',()=>done(Math.round(performance.now()-start)));
    socket.once('error',()=>done(null));
    signal.addEventListener('abort',()=>done(null),{once:true});
  });
}
export function createSystemMetrics({read=readFile,now=()=>Date.now(),ping=pingGoogle}={}) {
  const empty=()=>({cpuPercent:null,cpuStatus:'pending',gpuPercent:null,gpuStatus:'unsupported',ramUsedBytes:null,ramTotalBytes:null,ramStatus:'pending',networkDownBytesPerSec:null,networkUpBytesPerSec:null,networkStatus:'pending',pingMs:null,pingStatus:'pending'});
  let previous=null,previousNetwork=null,lastTime=-Infinity,lastPingTime=-Infinity,pingController=null,generation=0,pending=null;
  let last=empty();const successAt={cpu:-Infinity,ram:-Infinity,network:-Infinity,ping:-Infinity};
  function retain(kind,fields,time,maximumAge){
    if(time-successAt[kind]<=maximumAge&&fields.every(field=>last[field]!==null)){last[`${kind}Status`]='stale';return;}
    for(const field of fields)last[field]=null;
    last[`${kind}Status`]='unavailable';
  }
  async function collect(time,elapsed,epoch){
    const [statRaw,memRaw,routeRaw,devRaw]=await Promise.allSettled(['/proc/stat','/proc/meminfo','/proc/net/route','/proc/net/dev'].map(path=>read(path,'utf8')));
    if(epoch!==generation)return {...last};
    const value=result=>result.status==='fulfilled'?result.value:null;
    const current=cpuTicks(value(statRaw));
    const total=current?.total-previous?.total,idle=current?.idle-previous?.idle;
    if(previous&&current&&total>0&&idle>=0&&idle<=total){last.cpuPercent=Math.round((total-idle)*1000/total)/10;last.cpuStatus='current';successAt.cpu=time;}
    else if(current&&successAt.cpu===-Infinity)last.cpuStatus='pending';
    else retain('cpu',['cpuPercent'],time,10000);
    previous=current;
    const ram=memory(value(memRaw));
    if(ram){Object.assign(last,ram);last.ramStatus='current';successAt.ram=time;}
    else retain('ram',['ramUsedBytes','ramTotalBytes'],time,10000);
    const iface=defaultInterface(value(routeRaw));
    const net=network(value(devRaw),iface);
    if(net){
      const validDelta=previousNetwork&&previousNetwork.iface===net.iface&&net.rx>=previousNetwork.rx&&net.tx>=previousNetwork.tx&&elapsed>=1000;
      if(validDelta){last.networkDownBytesPerSec=Math.round((net.rx-previousNetwork.rx)*1000/elapsed);last.networkUpBytesPerSec=Math.round((net.tx-previousNetwork.tx)*1000/elapsed);last.networkStatus='current';successAt.network=time;}
      else{last.networkDownBytesPerSec=null;last.networkUpBytesPerSec=null;last.networkStatus='pending';}
      previousNetwork=net;
    }else if(value(routeRaw)!==null&&!iface){previousNetwork=null;retain('network',['networkDownBytesPerSec','networkUpBytesPerSec'],time,-1);}
    else if(iface&&previousNetwork&&iface!==previousNetwork.iface){previousNetwork=null;last.networkDownBytesPerSec=last.networkUpBytesPerSec=null;last.networkStatus='pending';}
    else retain('network',['networkDownBytesPerSec','networkUpBytesPerSec'],time,10000);
    if(time-lastPingTime>=10000){
      lastPingTime=time;pingController=new AbortController();
      let ms=null;try{ms=await ping(pingController.signal);}catch{}
      if(epoch!==generation)return {...last};
      pingController=null;
      if(Number.isFinite(ms)&&ms>=0&&ms<=5000){last.pingMs=Math.round(ms);last.pingStatus='current';successAt.ping=time;}
      else retain('ping',['pingMs'],time,30000);
    }
    return {...last};
  }
  return {sample(){
    if(pending)return pending;
    const time=now();if(time-lastTime<1000)return Promise.resolve({...last});
    const elapsed=time-lastTime;lastTime=time;const epoch=generation;
    const task=collect(time,elapsed,epoch).finally(()=>{if(pending===task)pending=null;});
    pending=task;return task;
  },stop(){generation++;pingController?.abort();pingController=null;pending=null;previous=null;previousNetwork=null;lastTime=-Infinity;lastPingTime=-Infinity;last=empty();for(const key of Object.keys(successAt))successAt[key]=-Infinity;}};
}
