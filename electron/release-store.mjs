import {execFile as callback} from 'node:child_process';
import {promisify} from 'node:util';
import {lstat,mkdir,open,readFile,realpath,rename,rm} from 'node:fs/promises';
import path from 'node:path';

const execFile=promisify(callback);
const shaPattern=/^[0-9a-f]{40}$/;
const validSha=value=>typeof value==='string'&&shaPattern.test(value);
async function gitHead(root){
  const {stdout}=await execFile('git',['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-C',root,'rev-parse','HEAD'],{timeout:10000,maxBuffer:4096});
  return stdout.trim();
}

/** Persistent, user-owned release record. An interrupted activation always boots the previous release. */
export async function createReleaseStore({sourceRoot,stateRoot,readHead=gitHead}){
  if(![sourceRoot,stateRoot].every(value=>typeof value==='string'&&path.isAbsolute(value))||typeof readHead!=='function')throw TypeError('Invalid release store');
  const sourcePath=await realpath(sourceRoot);
  const sourceStat=await lstat(sourceRoot);
  if(sourceStat.isSymbolicLink())throw Error('Source path must not be a symlink');
  await mkdir(stateRoot,{recursive:true,mode:0o700});
  if((await lstat(stateRoot)).isSymbolicLink())throw Error('State path must not be a symlink');
  const statePath=await realpath(stateRoot);
  if(statePath===sourcePath||statePath.startsWith(`${sourcePath}${path.sep}`))throw Error('Release state must be outside the checkout');
  const releasesRoot=path.join(statePath,'releases');
  await mkdir(releasesRoot,{recursive:true,mode:0o700});
  if((await lstat(releasesRoot)).isSymbolicLink())throw Error('Releases path must not be a symlink');
  const manifestPath=path.join(statePath,'release.json');
  async function verifyRelease(sha){
    if(!validSha(sha))return null;
    const releasePath=path.join(releasesRoot,sha);
    try{
      const stat=await lstat(releasePath);
      if(!stat.isDirectory()||stat.isSymbolicLink())return null;
      const build=await lstat(path.join(releasePath,'dist','production.html'));
      if(!build.isFile()||build.isSymbolicLink()||await readHead(releasePath)!==sha)return null;
      return {sha,path:releasePath};
    }catch{return null;}
  }
  async function sourceRelease(){
    const sha=await readHead(sourcePath);
    if(!validSha(sha))throw Error('Invalid source commit');
    const build=await lstat(path.join(sourcePath,'dist','production.html'));
    if(!build.isFile()||build.isSymbolicLink())throw Error('Source build unavailable');
    return {sha,path:sourcePath};
  }
  async function resolve(sha){
    const staged=await verifyRelease(sha);if(staged)return staged;
    try{const source=await sourceRelease();return sha===source.sha?source:null;}
    // This catch covers source verification only. A damaged checkout or invalid
    // source build cannot prevent checking the manifest's verified previous SHA.
    // Manifest validation and recovery-state writes remain outside this catch.
    catch{return null;}
  }
  async function saveState({active,pending=null,previous=null}){
    if(!validSha(active)||pending!==null&&!validSha(pending)||previous!==null&&!validSha(previous))throw TypeError('Invalid release manifest');
    const value=JSON.stringify({version:1,active,pending,previous});
    const temporary=path.join(statePath,`release-${process.pid}-${Math.random().toString(16).slice(2)}.tmp`);
    try{
      const file=await open(temporary,'wx',0o600);
      try{await file.writeFile(value);await file.sync();}finally{await file.close();}
      await rename(temporary,manifestPath);
      const directory=await open(statePath,'r');
      try{await directory.sync();}finally{await directory.close();}
    }
    finally{await rm(temporary,{force:true});}
  }
  let initial,recovered=false,manifestExists=false;
  try{
    const stat=await lstat(manifestPath);manifestExists=true;
    if(!stat.isFile()||stat.isSymbolicLink())throw Error('Invalid release manifest');
    const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
    if(manifest.version!==1||!validSha(manifest.active)||manifest.pending!==null&&!validSha(manifest.pending)||manifest.previous!==null&&!validSha(manifest.previous)||Object.keys(manifest).sort().join(',')!=='active,pending,previous,version')throw Error('Invalid release manifest');
    initial=await resolve(manifest.active);
    if(!initial&&manifest.previous!==null&&manifest.previous!==manifest.active){
      initial=await resolve(manifest.previous);
      if(initial){recovered=true;await saveState({active:initial.sha,pending:null,previous:null});}
    }
    if(!initial)throw Error('Recorded release and verified fallback unavailable');
    if(!recovered&&manifest.pending!==null){recovered=true;await saveState({active:initial.sha,pending:null,previous:manifest.previous});}
  }catch(error){
    if(manifestExists||error?.code!=='ENOENT')throw error;
    initial=await sourceRelease();
    await saveState({active:initial.sha});
  }
  return {initial,recovered,releasesRoot,sourceRoot:sourcePath,verifyRelease,saveState};
}
