import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {prepareHeadunitUpdate,runUpdateCommand} from '../electron/update-source.mjs';

const old='a'.repeat(40),next='b'.repeat(40);
async function fixture({origin='https://github.com/Gayb0iiiii/head-unit.git',effectiveOrigin=origin,branch='feat/orangepi-system-ui',dirty='',activeHead=old,target=next,diverged=false,buildFails=false}={}){
  const base=await mkdtemp(path.join(tmpdir(),'headunit-update-test-'));
  const sourceRoot=path.join(base,'source'),releasesRoot=path.join(base,'releases');
  await mkdir(sourceRoot);await mkdir(releasesRoot);
  const calls=[];
  const run=async(file,args,{cwd}={})=>{
    calls.push({file,args,cwd});
    const command=args.join(' ');
    if(file==='git'){
      if(command.includes('rev-parse --show-toplevel'))return {stdout:`${sourceRoot}\n`};
      if(command.includes('config --get remote.origin.url'))return {stdout:`${origin}\n`};
      if(command.includes('remote get-url origin'))return {stdout:`${effectiveOrigin}\n`};
      if(command.includes('symbolic-ref --short HEAD'))return {stdout:`${branch}\n`};
      if(command.includes('status --porcelain=v1 --untracked-files=all'))return {stdout:dirty};
      if(command.includes('rev-parse HEAD'))return {stdout:`${args.includes(path.join(releasesRoot,next))?target:activeHead}\n`};
      if(command.includes('rev-parse FETCH_HEAD'))return {stdout:`${target}\n`};
      if(command.includes('merge-base --is-ancestor')){if(diverged)throw Error('not ancestor');return {stdout:''};}
      if(command.includes('worktree add --detach')){await mkdir(args.at(-2));return {stdout:''};}
      if(command.includes('worktree move')){await rename(args.at(-2),args.at(-1));return {stdout:''};}
      if(command.includes('worktree remove --force')){await rm(args.at(-1),{recursive:true,force:true});return {stdout:''};}
      return {stdout:''};
    }
    if(file==='npm'&&buildFails&&args[1]==='build')throw Error('build failed');
    return {stdout:''};
  };
  return {sourceRoot,releasesRoot,calls,run,close:()=>rm(base,{recursive:true,force:true})};
}

test('stages only the fixed branch after clean origin and ancestry checks, then tests and builds',async()=>{
  const f=await fixture();try{
    const result=await prepareHeadunitUpdate({sourceRoot:f.sourceRoot,releasesRoot:f.releasesRoot,activeSha:old,run:f.run});
    assert.equal(result.status,'ready');assert.equal(result.sha,next);
    assert.equal(result.path,path.join(f.releasesRoot,next));
    assert.equal(f.calls.some(c=>c.file==='git'&&c.args.includes('fetch')&&c.args.includes('refs/heads/feat/orangepi-system-ui')),true);
    assert.deepEqual(f.calls.filter(c=>c.file==='npm').map(c=>c.args),[['test'],['run','build']]);
    assert.equal(f.calls.some(c=>c.file==='npm'&&c.args.includes('ci')),false);
  }finally{await f.close();}
});

test('wrong origin, branch, dirty checkout, and divergence never stage',async()=>{
  for(const options of [{origin:'https://evil.example/head-unit.git'},{effectiveOrigin:'https://evil.example/rewrite.git'},{branch:'main'},{dirty:' M src/app.mjs\n'},{activeHead:'c'.repeat(40)},{diverged:true}]){
    const f=await fixture(options);try{
      await assert.rejects(()=>prepareHeadunitUpdate({sourceRoot:f.sourceRoot,releasesRoot:f.releasesRoot,activeSha:old,run:f.run}));
      assert.equal(f.calls.some(c=>c.args.includes('worktree')&&c.args.includes('add')),false);
      assert.equal(f.calls.some(c=>c.file==='npm'),false);
    }finally{await f.close();}
  }
});

test('failed staged build removes only its disposable worktree',async()=>{
  const f=await fixture({buildFails:true});try{
    await assert.rejects(()=>prepareHeadunitUpdate({sourceRoot:f.sourceRoot,releasesRoot:f.releasesRoot,activeSha:old,run:f.run}),/build failed/);
    assert.equal(f.calls.some(c=>c.args.includes('worktree')&&c.args.includes('remove')&&c.args.at(-1).startsWith(path.join(f.releasesRoot,'.pending-'))),true);
  }finally{await f.close();}
});
test('completed staged release can be retested after interruption without mutating the active app',async()=>{
 const f=await fixture();try{
   await prepareHeadunitUpdate({sourceRoot:f.sourceRoot,releasesRoot:f.releasesRoot,activeSha:old,run:f.run});
   const callsBefore=f.calls.length;
   const result=await prepareHeadunitUpdate({sourceRoot:f.sourceRoot,releasesRoot:f.releasesRoot,activeSha:old,run:f.run});
   assert.equal(result.status,'ready');
   assert.equal(f.calls.slice(callsBefore).some(c=>c.args.includes('worktree')&&c.args.includes('add')),false);
   assert.equal(f.calls.slice(callsBefore).filter(c=>c.file==='npm').length,2);
 }finally{await f.close();}
});
test('cancelled staging never activates or builds and removes only the disposable worktree',async()=>{
 const f=await fixture(),controller=new AbortController();try{
   const run=async(file,args,options)=>{const result=await f.run(file,args,options);if(file==='npm'&&args[0]==='test')controller.abort();return result;};
   await assert.rejects(()=>prepareHeadunitUpdate({sourceRoot:f.sourceRoot,releasesRoot:f.releasesRoot,activeSha:old,run,signal:controller.signal}));
   assert.equal(f.calls.some(c=>c.file==='npm'&&c.args[1]==='build'),false);
   assert.equal(f.calls.some(c=>c.args.includes('worktree')&&c.args.includes('remove')),true);
   assert.equal(f.calls.some(c=>c.args.includes('worktree')&&c.args.includes('move')),false);
 }finally{await f.close();}
});

test('up-to-date branch avoids a worktree and build',async()=>{
  const f=await fixture({target:old});try{
    assert.deepEqual(await prepareHeadunitUpdate({sourceRoot:f.sourceRoot,releasesRoot:f.releasesRoot,activeSha:old,run:f.run}),{status:'current',sha:old});
    assert.equal(f.calls.some(c=>c.file==='npm'||c.args.includes('worktree')),false);
  }finally{await f.close();}
});
test('Git expands insteadOf when reading the effective origin endpoint',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'headunit-url-rewrite-'));try{
   await runUpdateCommand('git',['init','-q',root]);
   await runUpdateCommand('git',['-C',root,'remote','add','origin','https://github.com/Gayb0iiiii/head-unit.git']);
   await runUpdateCommand('git',['-C',root,'config','url.https://example.invalid/.insteadOf','https://github.com/']);
   const literal=await runUpdateCommand('git',['-C',root,'config','--get','remote.origin.url']);
   const effective=await runUpdateCommand('git',['-C',root,'remote','get-url','origin']);
   assert.equal(literal.stdout.trim(),'https://github.com/Gayb0iiiii/head-unit.git');
   assert.equal(effective.stdout.trim(),'https://example.invalid/Gayb0iiiii/head-unit.git');
 }finally{await rm(root,{recursive:true,force:true});}
});
