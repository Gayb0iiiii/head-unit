import {readFile} from 'node:fs/promises';

// Linux aggregate CPU busy time from /proc/stat. A missing/unsupported GPU
// counter is deliberately unavailable, never inferred from clock frequency.
function cpuTicks(raw){
  const line=typeof raw==='string'?raw.split('\n')[0]:'';
  const fields=line.trim().split(/\s+/);
  if(fields[0]!=='cpu'||fields.length<5)return null;
  const ticks=fields.slice(1).map(Number);
  if(ticks.some(value=>!Number.isSafeInteger(value)||value<0))return null;
  return {total:ticks.reduce((sum,value)=>sum+value,0),idle:ticks[3]+(ticks[4]||0)};
}
export function createSystemMetrics({read=readFile,now=()=>Date.now()}={}) {
  let previous=null,lastTime=-Infinity,last={cpuPercent:null,gpuPercent:null};
  return {async sample(){
    const time=now();
    if(time-lastTime<1000)return {...last};
    lastTime=time;
    try{
      const current=cpuTicks(await read('/proc/stat','utf8'));
      const total=current?.total-previous?.total;
      const idle=current?.idle-previous?.idle;
      const cpuPercent=previous&&current&&total>0&&idle>=0&&idle<=total?Math.round((total-idle)*1000/total)/10:null;
      previous=current;
      last={cpuPercent,gpuPercent:null};
    }catch{previous=null;last={cpuPercent:null,gpuPercent:null};}
    return {...last};
  }};
}
