import {execFile as execFileCallback} from 'node:child_process';
import {promisify} from 'node:util';

const execFile=promisify(execFileCallback);
const destination='org.freedesktop.timedate1';
const object='/org/freedesktop/timedate1';
const tzPattern=/^[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)*$/;
const showArgs=['show','--no-pager','-p','Timezone','-p','CanNTP','-p','NTP','-p','NTPSynchronized'];

export function parseTimeStatus(output){
  if(typeof output!=='string')return null;
  const fields=Object.fromEntries(output.trim().split('\n').map(line=>line.split(/=(.*)/s).slice(0,2)));
  if(!tzPattern.test(fields.Timezone||'')||!['yes','no'].includes(fields.CanNTP)||!['yes','no'].includes(fields.NTP)||!['yes','no'].includes(fields.NTPSynchronized))return null;
  return {timezone:fields.Timezone,canNtp:fields.CanNTP==='yes',ntpEnabled:fields.NTP==='yes',synchronized:fields.NTPSynchronized==='yes'};
}

function localComponents(value){
  if(typeof value!=='string'||!/^(20[2-9][0-9]|2100)-\d\d-\d\dT\d\d:\d\d$/.test(value))throw TypeError('Invalid local time');
  const fields={year:Number(value.slice(0,4)),month:Number(value.slice(5,7)),day:Number(value.slice(8,10)),hour:Number(value.slice(11,13)),minute:Number(value.slice(14,16))};
  const date=new Date(Date.UTC(fields.year,fields.month-1,fields.day,fields.hour,fields.minute));
  if(date.getUTCFullYear()!==fields.year||date.getUTCMonth()+1!==fields.month||date.getUTCDate()!==fields.day||date.getUTCHours()!==fields.hour||date.getUTCMinutes()!==fields.minute)throw TypeError('Invalid local time');
  return fields;
}

/** Interpret a datetime-local control in the currently reported system zone. */
export function parseLocalTime(value,timezone){
  const desired=localComponents(value);
  if(typeof timezone!=='string'||!tzPattern.test(timezone))throw TypeError('Invalid timezone');
  let formatter;
  try{formatter=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});}catch{throw TypeError('Invalid timezone');}
  const nominal=Date.UTC(desired.year,desired.month-1,desired.day,desired.hour,desired.minute);
  const parts=instant=>{
    const p=Object.fromEntries(formatter.formatToParts(new Date(instant)).map(item=>[item.type,Number(item.value)]));
    return {year:p.year,month:p.month,day:p.day,hour:p.hour,minute:p.minute};
  };
  let epoch=nominal;
  for(let i=0;i<3;i++){
    const p=parts(epoch);
    epoch+=nominal-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);
  }
  const observed=parts(epoch);
  if(Object.keys(desired).some(key=>desired[key]!==observed[key]))throw TypeError('Invalid local time');
  return epoch;
}

async function defaultRun(command,args){
  const {stdout}=await execFile(command,args,{timeout:5000,maxBuffer:8192});
  return stdout;
}

/** Fixed timedated methods with normal interactive OS authorization; no sudo or polkit bypass. */
export function createTimeService({run=defaultRun,now=Date.now}={}){
  const status=async()=>{try{return parseTimeStatus(await run('timedatectl',showArgs));}catch{return null;}};
  const call=(method,signature,...args)=>run('busctl',['call',destination,object,destination,method,signature,...args]);
  async function setNtp(enabled){
    if(typeof enabled!=='boolean')throw TypeError('Invalid automatic time setting');
    const before=await status();if(!before?.canNtp)throw Error('Automatic time unavailable');
    if(before.ntpEnabled!==enabled)await call('SetNTP','bb',String(enabled),'true');
    const after=await status();
    return {changed:after?after.ntpEnabled===enabled:null,status:after};
  }
  async function setTimezone(zone){
    if(!['Australia/Perth','Etc/UTC'].includes(zone))throw TypeError('Invalid timezone');
    const before=await status();if(!before)throw Error('Clock status unavailable');
    if(before.timezone!==zone)await call('SetTimezone','sb',zone,'true');
    const after=await status();
    return {changed:after?after.timezone===zone:null,status:after};
  }
  async function setManualTime(value){
    localComponents(value);
    const before=await status();if(!before)throw Error('Clock status unavailable');
    const target=parseLocalTime(value,before.timezone);
    const clockBefore=now();
    let phase='disable';
    try{
      if(before.ntpEnabled)await call('SetNTP','bb','false','true');
      phase='set';
      await call('SetTime','xbb',String(target*1000),'false','true');
      const after=await status();
      return {changed:after?after.ntpEnabled===false&&Math.abs(now()-target)<=120000:null,status:after};
    }catch{
      let after=await status();
      // A timed-out SetTime may have applied. A confirmed manual clock and disabled
      // NTP are the intended final state, so leave them intact.
      if(phase==='set'&&after?.ntpEnabled===false&&Math.abs(clockBefore-target)>120000&&Math.abs(now()-target)<=120000)return {changed:true,status:after};
      // Likewise, SetNTP(false) may have applied before throwing. Restore the
      // initial automatic setting unless readback proves it is already restored.
      if(before.ntpEnabled&&after?.ntpEnabled!==true){
        try{await call('SetNTP','bb','true','true');}catch{}
        after=await status();
      }
      return {changed:phase==='disable'?false:null,...(before.ntpEnabled?{ntpRestored:after?.ntpEnabled===true}:{}),status:after};
    }
  }
  return {status,setNtp,setTimezone,setManualTime};
}
