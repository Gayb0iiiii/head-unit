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
  let previous=null,previousNetwork=null,lastTime=-Infinity,lastPingTime=-Infinity,pingController=null,generation=0;
  let last={cpuPercent:null,gpuPercent:null,ramUsedBytes:null,ramTotalBytes:null,networkDownBytesPerSec:null,networkUpBytesPerSec:null,pingMs:null};
  return {async sample(){
    const time=now();
    if(time-lastTime<1000)return {...last};
    const elapsed=time-lastTime;
    lastTime=time;
    const sampleGeneration=generation;
    const [statRaw,memRaw,routeRaw,devRaw]=await Promise.allSettled(['/proc/stat','/proc/meminfo','/proc/net/route','/proc/net/dev'].map(path=>read(path,'utf8')));
    if(sampleGeneration!==generation)return {...last};
    const value=result=>result.status==='fulfilled'?result.value:null;
    try{
      const current=cpuTicks(value(statRaw));
      const total=current?.total-previous?.total;
      const idle=current?.idle-previous?.idle;
      const cpuPercent=previous&&current&&total>0&&idle>=0&&idle<=total?Math.round((total-idle)*1000/total)/10:null;
      previous=current;
      const ram=memory(value(memRaw));
      const net=network(value(devRaw),defaultInterface(value(routeRaw)));
      const validDelta=previousNetwork&&net&&previousNetwork.iface===net.iface&&net.rx>=previousNetwork.rx&&net.tx>=previousNetwork.tx&&elapsed>=1000;
      last={...last,cpuPercent,gpuPercent:null,ramUsedBytes:ram?.ramUsedBytes??null,ramTotalBytes:ram?.ramTotalBytes??null,
        networkDownBytesPerSec:validDelta?Math.round((net.rx-previousNetwork.rx)*1000/elapsed):null,
        networkUpBytesPerSec:validDelta?Math.round((net.tx-previousNetwork.tx)*1000/elapsed):null};
      previousNetwork=net;
    }catch{previous=null;previousNetwork=null;last={...last,cpuPercent:null,gpuPercent:null,ramUsedBytes:null,ramTotalBytes:null,networkDownBytesPerSec:null,networkUpBytesPerSec:null};}
    if(time-lastPingTime>=10000){
      lastPingTime=time;pingController?.abort();pingController=new AbortController();const currentGeneration=++generation;
      try{const ms=await ping(pingController.signal);if(currentGeneration===generation)last.pingMs=Number.isFinite(ms)&&ms>=0&&ms<=5000?Math.round(ms):null;}
      catch{if(currentGeneration===generation)last.pingMs=null;}
    }
    return {...last};
  },stop(){generation++;pingController?.abort();pingController=null;previous=null;previousNetwork=null;lastTime=-Infinity;lastPingTime=-Infinity;last={cpuPercent:null,gpuPercent:null,ramUsedBytes:null,ramTotalBytes:null,networkDownBytesPerSec:null,networkUpBytesPerSec:null,pingMs:null};}};
}
