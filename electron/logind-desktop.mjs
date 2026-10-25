import {execFile as execFileCallback} from 'node:child_process';
import {promisify} from 'node:util';
import {readdir,readFile,lstat,stat} from 'node:fs/promises';
import {createDesktopHandoff} from './desktop-handoff.mjs';

const execFile=promisify(execFileCallback);
const sessionId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,32}$/.test(value);
const positive=value=>/^[0-9]+$/.test(value||'')&&Number.isSafeInteger(Number(value));

export function parseLoginctlSession(output){
  if(typeof output!=='string')return null;
  const fields=Object.fromEntries(output.trim().split('\n').map(line=>line.split(/=(.*)/s).slice(0,2)));
  if(!sessionId(fields.Id)||!positive(fields.User)||!positive(fields.VTNr)||Number(fields.VTNr)<1||!['yes','no'].includes(fields.Remote)||!['yes','no'].includes(fields.Active))return null;
  return {id:fields.Id,uid:Number(fields.User),seat:fields.Seat,vt:Number(fields.VTNr),remote:fields.Remote==='yes',state:fields.State,sessionClass:fields.Class,type:fields.Type,active:fields.Active==='yes'};
}

export function processEvidence({name,uid,environ,cgroup,socket},expectedUid){
  if(uid!==expectedUid||!['cage','kwin_wayland','plasmashell'].includes(name)||!Buffer.isBuffer(environ)||typeof cgroup!=='string')return null;
  const vars=Object.fromEntries(environ.toString('utf8').split('\0').filter(Boolean).map(item=>item.split(/=(.*)/s).slice(0,2)));
  const byEnv=vars.XDG_SESSION_ID;
  const byGroup=cgroup.match(/(?:^|\/)session-([A-Za-z0-9_-]{1,32})\.scope(?:\/|$)/m)?.[1];
  if(byEnv&&!sessionId(byEnv))return null;
  if(byEnv&&byGroup&&byEnv!==byGroup)return null;
  const id=byEnv||byGroup;
  if(!sessionId(id))return null;
  return {name,sessionId:id,wayland:socket===true&&/^wayland-[0-9]{1,3}$/.test(vars.WAYLAND_DISPLAY||''),headunit:name==='cage'&&vars.HEADUNIT_SESSION==='1'};
}

async function loginctl(args){
  const {stdout}=await execFile('loginctl',args,{timeout:2000,maxBuffer:64*1024});
  return stdout;
}

async function liveProcesses(uid){
  const entries=(await readdir('/proc')).filter(name=>/^[0-9]+$/.test(name));
  if(entries.length>2048)throw Error('Process census too large');
  const found=[];
  for(const pid of entries){
    try{
      const root=`/proc/${pid}`;
      const info=await stat(root);
      if(info.uid!==uid)continue;
      const name=(await readFile(`${root}/comm`,'utf8')).trim();
      if(!['cage','kwin_wayland','plasmashell'].includes(name))continue;
      const [environ,cgroup]=await Promise.all([readFile(`${root}/environ`),readFile(`${root}/cgroup`,'utf8')]);
      const display=environ.toString('utf8').split('\0').find(item=>item.startsWith('WAYLAND_DISPLAY='))?.slice(16);
      let socket=false;
      if(name!=='cage'&&display&&/^wayland-[0-9]{1,3}$/.test(display)){
        const details=await lstat(`/run/user/${uid}/${display}`);
        socket=details.uid===uid&&details.isSocket();
      }
      const evidence=processEvidence({name,uid,environ,cgroup,socket},uid);
      if(evidence)found.push(evidence);
    }catch{/* A process may exit during the census; fail closed for that process. */}
  }
  return found;
}

async function discover(uid){
  const listing=await loginctl(['list-sessions','--no-legend','--no-pager']);
  const ids=listing.trim().split('\n').map(line=>line.trim().split(/\s+/)[0]).filter(sessionId);
  if(ids.length>16)throw Error('Too many sessions');
  const sessions=(await Promise.all(ids.map(async id=>{
    try{
      const output=await loginctl(['show-session',id,'--no-pager','-p','Id','-p','User','-p','Seat','-p','VTNr','-p','Remote','-p','State','-p','Class','-p','Type','-p','Active']);
      const session=parseLoginctlSession(output);
      return session?.id===id?session:null;
    }catch{return null;/* Session may have ended during inspection. */}
  }))).filter(Boolean);
  return {sessions,processes:await liveProcesses(uid)};
}

/** No renderer-chosen command, target or session ID. Invalid discovery leaves the UI disabled. */
export function createLogindDesktopHandoff({target='desktop',env=process.env,uid=process.getuid?.(),pollMs=10000}={}){
  if(process.platform!=='linux'||!sessionId(env.XDG_SESSION_ID)||!Number.isInteger(uid)||uid<1||target==='desktop'&&env.HEADUNIT_SESSION!=='1')return null;
  const handoff=createDesktopHandoff({target,currentId:env.XDG_SESSION_ID,uid,discover:()=>discover(uid),activate:async id=>{await loginctl(['activate',id]);}});
  const timer=setInterval(()=>{void handoff.refresh();},pollMs);
  timer.unref?.();
  void handoff.refresh();
  return {get available(){return handoff.available;},refresh:handoff.refresh,request:handoff.request,subscribe:handoff.subscribe,
    dispose(){clearInterval(timer);handoff.dispose();}};
}
