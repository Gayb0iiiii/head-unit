import {open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
async function readBounded(path){
 const file=await open(path,'r');try{const bytes=Buffer.alloc(65537);const {bytesRead}=await file.read(bytes,0,bytes.length,0);if(bytesRead>65536)throw Error('Process evidence too large');return bytes.subarray(0,bytesRead).toString('utf8');}finally{await file.close();}
}
function stat(value,pid){
 if(typeof value!=='string'||!value.startsWith(`${pid} (`))return null;
 const end=value.lastIndexOf(') ');if(end<0)return null;
 const fields=value.slice(end+2).trim().split(/\s+/);
 if(!/^\d+$/.test(fields[1]??'')||!/^\d+$/.test(fields[19]??''))return null;
 const ppid=Number(fields[1]);if(!Number.isSafeInteger(ppid)||ppid<1)return null;
 return {ppid,startTime:fields[19]};
}
function owner(value,uid){const row=typeof value==='string'&&value.match(/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/m);return !!row&&row.slice(1).every(n=>Number(n)===uid);}
/** Host-only Linux evidence; never opens a caller-supplied path. No session is inferred from environment. */
export async function readProcessInstance(pid,uid,{read=readBounded}={}){
 if(!Number.isSafeInteger(pid)||pid<1||!Number.isSafeInteger(uid)||uid<0)return null;
 try{
  const root=`/proc/${pid}`;
  const first=stat(await read(`${root}/stat`),pid);if(!first||!owner(await read(`${root}/status`),uid))return null;
  const boot=(await read('/proc/sys/kernel/random/boot_id')).trim();if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(boot))return null;
  const group=await read(`${root}/cgroup`);if(typeof group!=='string'||group.length>65536)return null;
  const sessions=[...new Set([...group.matchAll(/(?:^|\/)session-([A-Za-z0-9_-]{1,32})\.scope(?:\/|$)/gm)].map(m=>m[1]))];if(sessions.length>1)return null;
  const last=stat(await read(`${root}/stat`),pid);if(!last||last.ppid!==first.ppid||last.startTime!==first.startTime||!owner(await read(`${root}/status`),uid)||await read(`${root}/cgroup`)!==group)return null;
  return {pid,ppid:first.ppid,uid,sessionId:sessions[0]??null,instance:createHash('sha256').update(JSON.stringify([boot,pid,first.startTime,uid,group])).digest('hex')};
 }catch{return null;}
}
