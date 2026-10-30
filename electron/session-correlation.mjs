import {execFile as callback} from 'node:child_process';
import {promisify} from 'node:util';
import {parseLoginctlSession} from './logind-desktop.mjs';
import {readProcessInstance} from './process-instance.mjs';
const execFile=promisify(callback);
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,32}$/.test(value);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const positive=value=>Number.isSafeInteger(value)&&value>0;
const properties=['Id','User','Seat','VTNr','Remote','State','Class','Type','Active','Leader'];
export function parseSessionIdentity(output){
 if(typeof output!=='string'||output.length>16384)return null;
 const fields=new Map();for(const line of output.trim().split('\n')){const split=line.indexOf('=');if(split<1)return null;const key=line.slice(0,split);if(!properties.includes(key)||fields.has(key))return null;fields.set(key,line.slice(split+1));}
 const parsed=parseLoginctlSession(output),leader=fields.get('Leader');
 if(!parsed||!/^\d+$/.test(leader??'')||!positive(Number(leader)))return null;
 return {...parsed,leader:Number(leader)};
}
async function readSession(sessionId,signal){
 if(!id(sessionId))return null;
 const {stdout}=await execFile('loginctl',['show-session',sessionId,'--no-pager',...properties.flatMap(key=>['-p',key])],{timeout:2000,maxBuffer:16384,signal});
 return parseSessionIdentity(stdout);
}
/** Read-only correlation, not sender authentication or readiness. Caller supplies an authenticated process proof. */
export function correlateProcessSession({pid,uid,processInstance,readIdentity=readProcessInstance,readSession:sessionReader=readSession,timeoutMs=2000,signal}={}){
 if(!positive(pid)||!positive(uid)||!digest(processInstance)||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>5000||![readIdentity,sessionReader].every(f=>typeof f==='function')||signal?.aborted)return Promise.resolve(null);
 return new Promise(resolve=>{
  const controller=new AbortController();let done=false;
  const finish=value=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);resolve(value);};
  const abort=()=>{controller.abort();finish(null);};const timer=setTimeout(abort,timeoutMs);signal?.addEventListener('abort',abort,{once:true});
  const sameProcess=(a,b)=>a&&b&&a.pid===b.pid&&a.ppid===b.ppid&&a.uid===b.uid&&a.sessionId===b.sessionId&&a.instance===b.instance;
  const owned=(p,wanted)=>p?.pid===wanted&&p.uid===uid&&id(p.sessionId)&&digest(p.instance);
  void (async()=>{
   try{
    const process=await readIdentity(pid,uid);if(done||!owned(process,pid)||process.instance!==processInstance){finish(null);return;}
    const session=await sessionReader(process.sessionId,controller.signal);
    if(done||session?.id!==process.sessionId||session.uid!==uid||session.remote!==false||session.seat!=='seat0'||session.sessionClass!=='user'||!['active','online'].includes(session.state)||!positive(session.vt)||!positive(session.leader)||typeof session.active!=='boolean'){finish(null);return;}
    const leader=await readIdentity(session.leader,uid);if(done||!owned(leader,session.leader)||leader.sessionId!==session.id){finish(null);return;}
    const finalProcess=await readIdentity(pid,uid);if(done||!sameProcess(process,finalProcess)){finish(null);return;}
    const finalLeader=await readIdentity(session.leader,uid);if(done||!sameProcess(leader,finalLeader)){finish(null);return;}
    const finalSession=await sessionReader(session.id,controller.signal);
    if(done||!finalSession||['id','uid','seat','vt','remote','sessionClass','state','leader','active'].some(key=>session[key]!==finalSession[key])){finish(null);return;}
    finish({sessionId:session.id,instance:leader.instance,processInstance:process.instance,pid,uid,seat:session.seat,vt:session.vt,active:session.active});
   }catch{finish(null);}
  })();
 });
}
