import {spawn} from 'node:child_process';
import {lstat,mkdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const origin='https://github.com/Gayb0iiiii/head-unit.git';
const defaultBranch='feat/orangepi-system-ui';
const validBranch=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_/-]{0,119}$/.test(value)&&!value.includes('//')&&!value.endsWith('/')&&value!=='HEAD';
const shaPattern=/^[0-9a-f]{40}$/;

/** Isolate each unprivileged Git/build command so cancellation stops its descendants too. */
export function runUpdateCommand(file,args,{cwd,timeoutMs=120000,signal}={}){
  signal?.throwIfAborted?.();
  return new Promise((resolve,reject)=>{
    let child,done=false,reason=null,stdout='',bytes=0;
    try{child=spawn(file,args,{cwd,detached:true,stdio:['ignore','pipe','pipe'],
      env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_ASKPASS:'/bin/false'}});}
    catch(error){reject(error);return;}
    const stop=()=>{if(child.pid)try{process.kill(-child.pid,'SIGKILL');}catch(error){if(error?.code!=='ESRCH')reason??=error;}};
    const abort=()=>{reason??=signal.reason instanceof Error?signal.reason:Error('Update cancelled');stop();};
    const timer=setTimeout(()=>{reason??=Error('Update command timed out');stop();},timeoutMs);
    const collect=(chunk,keep)=>{bytes+=chunk.length;if(bytes>512*1024){reason??=Error('Update command output exceeded limit');stop();}else if(keep)stdout+=chunk.toString();};
    child.stdout?.on('data',chunk=>collect(chunk,true));
    child.stderr?.on('data',chunk=>collect(chunk,false));
    child.on('error',error=>{reason??=error;});
    child.on('close',code=>{
      if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener?.('abort',abort);
      if(reason)reject(reason);else if(code===0)resolve({stdout});else reject(Error(`Update command failed: ${file}`));
    });
    signal?.addEventListener?.('abort',abort,{once:true});
    if(signal?.aborted)abort();
  });
}

/** Prepare a reviewable release. This never activates it or restarts the UI. */
export async function prepareHeadunitUpdate({sourceRoot,releasesRoot,activeSha,activeRoot=sourceRoot,run=runUpdateCommand,signal,branch=defaultBranch}){
  if(!validBranch(branch))throw TypeError('Invalid update branch');
  if(![sourceRoot,releasesRoot,activeRoot].every(value=>typeof value==='string'&&path.isAbsolute(value))||!shaPattern.test(activeSha)||typeof run!=='function')throw TypeError('Invalid update configuration');
  const [sourcePath,releasesPath,activePath]=await Promise.all([realpath(sourceRoot),realpath(releasesRoot),realpath(activeRoot)]);
  if((await lstat(releasesRoot)).isSymbolicLink()||sourcePath===releasesPath||activePath!==sourcePath&&!activePath.startsWith(`${releasesPath}${path.sep}`))throw Error('Update paths unavailable');
  const check=()=>signal?.throwIfAborted?.();
  const git=(...args)=>{check();return run('git',['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-C',sourcePath,...args],{timeoutMs:120000,signal});};
  const first=(await git('rev-parse','--show-toplevel')).stdout.trim();
  if(first!==sourcePath)throw Error('Source checkout unavailable');
  if((await git('config','--get','remote.origin.url')).stdout.trim()!==origin)throw Error('Unexpected update origin');
  // remote.get-url expands url.*.insteadOf, which can redirect an otherwise literal origin.
  if((await git('remote','get-url','origin')).stdout.trim()!==origin)throw Error('Unexpected effective update origin');
  if((await git('symbolic-ref','--short','HEAD')).stdout.trim()!==branch)throw Error('Unexpected update branch');
  if((await git('status','--porcelain=v1','--untracked-files=all')).stdout.trim())throw Error('Source checkout has local changes');
  const activeHead=(await run('git',['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-C',activePath,'rev-parse','HEAD'],{timeoutMs:10000})).stdout.trim();
  if(activeHead!==activeSha)throw Error('Active release does not match its recorded commit');
  if(activePath!==sourcePath){
    const activeStatus=await run('git',['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-C',activePath,'status','--porcelain=v1','--untracked-files=all'],{timeoutMs:10000});
    if(activeStatus.stdout.trim())throw Error('Active release has local changes');
  }
  await git('fetch','--no-tags','--no-recurse-submodules','origin',`refs/heads/${branch}`);
  const target=(await git('rev-parse','FETCH_HEAD')).stdout.trim();
  if(!shaPattern.test(target))throw Error('Invalid update commit');
  if(target===activeSha)return {status:'current',sha:target};
  try{await git('merge-base','--is-ancestor',activeSha,target);}catch{throw Error('Update is not a fast-forward');}
  const releasePath=path.join(releasesPath,target);
  let existing=false;
  try{const stat=await lstat(releasePath);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Invalid existing release');existing=true;}catch(error){if(error?.code!=='ENOENT')throw error;}
  await mkdir(releasesPath,{recursive:true,mode:0o700});
  if(existing){
    const existingGit=(...args)=>run('git',['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-C',releasePath,...args],{timeoutMs:10000,signal});
    if((await existingGit('rev-parse','HEAD')).stdout.trim()!==target||(await existingGit('status','--porcelain=v1','--untracked-files=all')).stdout.trim())throw Error('Existing release is not the clean target commit');
    check();await run('npm',['test'],{cwd:releasePath,timeoutMs:120000,signal});
    check();await run('npm',['run','build'],{cwd:releasePath,timeoutMs:120000,signal});
    check();return {status:'ready',sha:target,path:releasePath};
  }
  const stagingPath=path.join(releasesPath,`.pending-${target}-${randomUUID()}`);
  let staging=false;
  try{
    staging=true;
    await git('worktree','add','--detach',stagingPath,target);
    check();await run('npm',['test'],{cwd:stagingPath,timeoutMs:120000,signal});
    check();await run('npm',['run','build'],{cwd:stagingPath,timeoutMs:120000,signal});
    check();
    await git('worktree','move',stagingPath,releasePath);
    staging=false;
    return {status:'ready',sha:target,path:releasePath};
  }catch(error){
    if(staging)try{await run('git',['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-C',sourcePath,'worktree','remove','--force',stagingPath],{timeoutMs:120000});}catch{}
    throw error;
  }
}
