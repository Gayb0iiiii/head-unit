import {execFile as execFileCallback} from 'node:child_process';
import {promisify} from 'node:util';
import {lstat,mkdir,realpath} from 'node:fs/promises';
import path from 'node:path';

const execFile=promisify(execFileCallback);
const origin='https://github.com/Gayb0iiiii/head-unit.git';
const branch='feat/orangepi-system-ui';
const shaPattern=/^[0-9a-f]{40}$/;

async function defaultRun(file,args,{cwd,timeoutMs=120000}={}){
  const {stdout}=await execFile(file,args,{cwd,timeout:timeoutMs,maxBuffer:512*1024});
  return {stdout};
}

/** Prepare a reviewable release. This never activates it or restarts the UI. */
export async function prepareHeadunitUpdate({sourceRoot,releasesRoot,activeSha,activeRoot=sourceRoot,run=defaultRun}){
  if(![sourceRoot,releasesRoot,activeRoot].every(value=>typeof value==='string'&&path.isAbsolute(value))||!shaPattern.test(activeSha)||typeof run!=='function')throw TypeError('Invalid update configuration');
  const [sourcePath,releasesPath,activePath]=await Promise.all([realpath(sourceRoot),realpath(releasesRoot),realpath(activeRoot)]);
  if((await lstat(releasesRoot)).isSymbolicLink()||sourcePath===releasesPath||activePath!==sourcePath&&!activePath.startsWith(`${releasesPath}${path.sep}`))throw Error('Update paths unavailable');
  const git=(...args)=>run('git',['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-C',sourcePath,...args],{timeoutMs:120000});
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
  try{await lstat(releasePath);throw Error('Release path already exists');}catch(error){if(error?.code!=='ENOENT')throw error;}
  await mkdir(releasesPath,{recursive:true,mode:0o700});
  let staging=false;
  try{
    staging=true;
    await git('worktree','add','--detach',releasePath,target);
    await run('npm',['test'],{cwd:releasePath,timeoutMs:120000});
    await run('npm',['run','build'],{cwd:releasePath,timeoutMs:120000});
    return {status:'ready',sha:target,path:releasePath};
  }catch(error){
    if(staging)try{await git('worktree','remove','--force',releasePath);}catch{}
    throw error;
  }
}
