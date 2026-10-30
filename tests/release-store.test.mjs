import test from 'node:test';
import {execFile as callback} from 'node:child_process';
import {promisify} from 'node:util';
const execFile=promisify(callback);
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createReleaseStore} from '../electron/release-store.mjs';

const old='a'.repeat(40),next='b'.repeat(40);
async function fixture(){
  const root=await mkdtemp(path.join(tmpdir(),'headunit-release-store-'));
  const sourceRoot=path.join(root,'source'),stateRoot=path.join(root,'state');
  await mkdir(path.join(sourceRoot,'dist'),{recursive:true});await writeFile(path.join(sourceRoot,'dist','production.html'),'ready');
  return {root,sourceRoot,stateRoot,close:()=>rm(root,{recursive:true,force:true})};
}
test('clean first boot uses source build; pending activation reboots into known working release',async()=>{
 const f=await fixture();try{
   let store=await createReleaseStore({sourceRoot:f.sourceRoot,stateRoot:f.stateRoot,readHead:async()=>old});
   assert.deepEqual(store.initial,{sha:old,path:f.sourceRoot});
   await store.saveState({active:old,pending:next,previous:null});
   store=await createReleaseStore({sourceRoot:f.sourceRoot,stateRoot:f.stateRoot,readHead:async()=>old});
   assert.deepEqual(store.initial,{sha:old,path:f.sourceRoot});
   assert.equal(store.recovered,true);
   assert.equal(JSON.parse(await readFile(path.join(f.stateRoot,'release.json'),'utf8')).pending,null);
 }finally{await f.close();}
});
test('candidate needs a real same-hash worktree and built production file',async()=>{
 const f=await fixture();try{
   const store=await createReleaseStore({sourceRoot:f.sourceRoot,stateRoot:f.stateRoot,readHead:async release=>release===f.sourceRoot?old:next});
   assert.equal(await store.verifyRelease(next),null);
   const release=path.join(store.releasesRoot,next);await mkdir(path.join(release,'dist'),{recursive:true});
   assert.equal(await store.verifyRelease(next),null);
   await writeFile(path.join(release,'dist','production.html'),'ready');
   assert.deepEqual(await store.verifyRelease(next),{sha:next,path:release});
 }finally{await f.close();}
});
test('release symlink and malformed manifest fail closed',async()=>{
 const f=await fixture();try{
   const store=await createReleaseStore({sourceRoot:f.sourceRoot,stateRoot:f.stateRoot,readHead:async()=>old});
   await symlink(f.sourceRoot,path.join(store.releasesRoot,next));
   assert.equal(await store.verifyRelease(next),null);
   await writeFile(path.join(f.stateRoot,'release.json'),'not json');
   await assert.rejects(()=>createReleaseStore({sourceRoot:f.sourceRoot,stateRoot:f.stateRoot,readHead:async()=>old}));
 }finally{await f.close();}
});
test('valid staged active release boots even when source build is absent',async()=>{
 const f=await fixture();try{
  const readHead=async root=>root===f.sourceRoot?old:next;
  const store=await createReleaseStore({...f,readHead});const release=path.join(store.releasesRoot,next);
  await mkdir(path.join(release,'dist'),{recursive:true});await writeFile(path.join(release,'dist','production.html'),'ready');
  await store.saveState({active:next,previous:old});await rm(path.join(f.sourceRoot,'dist'),{recursive:true});
  const restarted=await createReleaseStore({...f,readHead});assert.deepEqual(restarted.initial,{sha:next,path:release});
 }finally{await f.close();}
});
test('missing recorded release does not silently reset an existing manifest',async()=>{
 const f=await fixture();try{
  const store=await createReleaseStore({...f,readHead:async()=>old});await store.saveState({active:next,previous:old});
  const manifest=path.join(f.stateRoot,'release.json'),before=await readFile(manifest,'utf8');
  await rm(path.join(f.sourceRoot,'dist'),{recursive:true});
  await assert.rejects(()=>createReleaseStore({...f,readHead:async()=>old}));assert.equal(await readFile(manifest,'utf8'),before);
 }finally{await f.close();}
});
test('unavailable active release recovers only to the recorded verified previous commit',async()=>{
 const f=await fixture();try{
  const readHead=async()=>old;const store=await createReleaseStore({...f,readHead});await store.saveState({active:next,previous:old});
  const recovered=await createReleaseStore({...f,readHead});assert.equal(recovered.initial.sha,old);assert.equal(recovered.recovered,true);
  assert.deepEqual(JSON.parse(await readFile(path.join(f.stateRoot,'release.json'),'utf8')),{version:1,active:old,pending:null,previous:null});
 }finally{await f.close();}
});
test('a wrong-hash previous release cannot be promoted by recovery',async()=>{
 const f=await fixture();try{
  const store=await createReleaseStore({...f,readHead:async()=>old});await store.saveState({active:next,previous:'c'.repeat(40)});
  await assert.rejects(()=>createReleaseStore({...f,readHead:async()=>old}));
  assert.equal(JSON.parse(await readFile(path.join(f.stateRoot,'release.json'),'utf8')).active,next);
 }finally{await f.close();}
});

for(const failure of ['git-error','invalid-sha','directory-build','symlink-build'])test(`verified staged previous release survives source ${failure}`,async()=>{
 const f=await fixture();try{
  const store=await createReleaseStore({...f,readHead:async()=>old});await store.saveState({active:next,previous:old});
  const previous=path.join(store.releasesRoot,old);await mkdir(path.join(previous,'dist'),{recursive:true});await writeFile(path.join(previous,'dist','production.html'),'verified previous');
  const build=path.join(f.sourceRoot,'dist','production.html');
  if(failure==='directory-build'){await rm(build);await mkdir(build);}
  if(failure==='symlink-build'){await rm(build);await symlink(path.join(previous,'dist','production.html'),build);}
  const readHead=async root=>{if(root===f.sourceRoot){if(failure==='git-error')throw Error('damaged .git');if(failure==='invalid-sha')return 'not a SHA';return next;}return old;};
  const recovered=await createReleaseStore({...f,readHead});assert.deepEqual(recovered.initial,{sha:old,path:previous});assert.equal(recovered.recovered,true);
  assert.deepEqual(JSON.parse(await readFile(path.join(f.stateRoot,'release.json'),'utf8')),{version:1,active:old,pending:null,previous:null});
 }finally{await f.close();}
});
test('source failure never hides invalid previous build or rewrites its manifest',async()=>{
 const f=await fixture();try{
  const store=await createReleaseStore({...f,readHead:async()=>old});await store.saveState({active:next,previous:old});
  await symlink(f.sourceRoot,path.join(store.releasesRoot,old));
  const manifest=path.join(f.stateRoot,'release.json'),before=await readFile(manifest,'utf8');
  await assert.rejects(createReleaseStore({...f,readHead:async()=>{throw Error('broken git');}}),/verified fallback unavailable/);
  assert.equal(await readFile(manifest,'utf8'),before);
 }finally{await f.close();}
});
test('fallback state persistence failure is propagated instead of returning recovered success',async t=>{
 if(process.getuid?.()===0){t.skip('requires unprivileged filesystem permissions');return;}
 const f=await fixture();try{
  const store=await createReleaseStore({...f,readHead:async()=>old});await store.saveState({active:next,previous:old});
  const previous=path.join(store.releasesRoot,old);await mkdir(path.join(previous,'dist'),{recursive:true});await writeFile(path.join(previous,'dist','production.html'),'ready');
  const manifest=path.join(f.stateRoot,'release.json'),before=await readFile(manifest,'utf8');await chmod(f.stateRoot,0o500);
  await assert.rejects(createReleaseStore({...f,readHead:async root=>{if(root===f.sourceRoot)throw Error('broken git');return old;}}),error=>error.code==='EACCES');
  assert.equal(await readFile(manifest,'utf8'),before);
 }finally{await chmod(f.stateRoot,0o700);await f.close();}
});

test('real git verification recovers a staged previous commit when source is not a repository',async()=>{
 const f=await fixture();try{
  const stage=path.join(f.root,'staged');await mkdir(path.join(stage,'dist'),{recursive:true});await writeFile(path.join(stage,'dist','production.html'),'previous');
  const git=(...args)=>execFile('git',['-c','core.hooksPath=/dev/null','-c','commit.gpgSign=false','-C',stage,...args]);
  await git('init','--quiet');await git('add','dist/production.html');await git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','local recovery fixture');
  const previous=(await git('rev-parse','HEAD')).stdout.trim();
  const store=await createReleaseStore({...f,readHead:async()=>old});
  const {rename}=await import('node:fs/promises');await rename(stage,path.join(store.releasesRoot,previous));await store.saveState({active:next,previous});
  const recovered=await createReleaseStore(f);assert.equal(recovered.initial.sha,previous);assert.equal(recovered.recovered,true);
 }finally{await f.close();}
});
test('untrusted manifest and first-boot source failures remain fatal without inventing state',async()=>{
 const f=await fixture();try{
  await assert.rejects(createReleaseStore({...f,readHead:async()=>{throw Error('source verification failed');}}),/source verification failed/);
  await assert.rejects(readFile(path.join(f.stateRoot,'release.json')),error=>error.code==='ENOENT');
  await writeFile(path.join(f.stateRoot,'release.json'),'not-json');let reads=0;
  await assert.rejects(createReleaseStore({...f,readHead:async()=>{reads++;return old;}}));assert.equal(reads,0);assert.equal(await readFile(path.join(f.stateRoot,'release.json'),'utf8'),'not-json');
 }finally{await f.close();}
});
