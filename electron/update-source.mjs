import {execFile as execFileCallback} from 'node:child_process';
import {promisify} from 'node:util';
import {lstat,mkdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const execFile=promisify(execFileCallback);
const origin='https://github.com/Gayb0iiiii/head-unit.git';
const branch='feat/orangepi-system-ui';
const shaPattern=/^[0-9a-f]{40}$/;

async function defaultRun(file,args,{cwd,timeoutMs=120000,signal}={}){
  const {stdout}=await execFile(file,args,{cwd,timeout:timeoutMs,maxBuffer:512*1024,signal,
    env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_ASKPASS:'/bin/false'}});
  return {stdout};
}

/** Prepare a reviewable release. This never activates it or restarts the UI. */
export async function prepareHeadunitUpdate({sourceRoot,releasesRoot,activeSha,activeRoot=sourceRoot,run=defaultRun,signal}){
  if(![sourceRoot,releasesRoot,activeRoot].every(value=>typeof value==='string'&&path.isAbsolute(value))||!shaPattern.test(activeSha)||typeof run!=='function')throw TypeError('Invalid update configuration');
  const [sourcePath,releasesPath,activePath]=await Promise.all([realpath(sourceRoot),realpath(releasesRoot),realpath(activeRoot)]);
  if((await lstat(releasesRoot)).isSymbolicLink()||sourcePath===releasesPath||activePath!==sourcePath&&!activePath.startsWith(`${releasesPath}${path.sep}`))throw Error('Update paths unavailable');
  const check=()=>signal?.throwIfAborted?.();
  const git=(...args)=>{check();return run('git',['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-C',sourcePath,...args],{timeoutMs:120000,signal});};
  const first=(await git('rev-parse','--show-toplevel')).stdout.trim();
  if(first!==sourcePath)throw Error('Source checkout unavailable');
  if((await git('config','--get','remote.origin.url')).stdout.trim()!==origin)throw Error('Unexpected update origin');
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
