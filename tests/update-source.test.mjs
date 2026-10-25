import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {prepareHeadunitUpdate} from '../electron/update-source.mjs';

const old='a'.repeat(40),next='b'.repeat(40);
async function fixture({origin='https://github.com/Gayb0iiiii/head-unit.git',branch='feat/orangepi-system-ui',dirty='',activeHead=old,target=next,diverged=false,buildFails=false}={}){
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
      if(command.includes('symbolic-ref --short HEAD'))return {stdout:`${branch}\n`};
      if(command.includes('status --porcelain=v1 --untracked-files=all'))return {stdout:dirty};
      if(command.includes('rev-parse HEAD'))return {stdout:`${activeHead}\n`};
      if(command.includes('rev-parse FETCH_HEAD'))return {stdout:`${target}\n`};
      if(command.includes('merge-base --is-ancestor')){if(diverged)throw Error('not ancestor');return {stdout:''};}
      if(command.includes('worktree add --detach')){await mkdir(args.at(-2));return {stdout:''};}
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
  for(const options of [{origin:'https://evil.example/head-unit.git'},{branch:'main'},{dirty:' M src/app.mjs\n'},{activeHead:'c'.repeat(40)},{diverged:true}]){
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
    assert.equal(f.calls.some(c=>c.args.includes('worktree')&&c.args.includes('remove')&&c.args.at(-1)===path.join(f.releasesRoot,next)),true);
  }finally{await f.close();}
});

test('up-to-date branch avoids a worktree and build',async()=>{
  const f=await fixture({target:old});try{
    assert.deepEqual(await prepareHeadunitUpdate({sourceRoot:f.sourceRoot,releasesRoot:f.releasesRoot,activeSha:old,run:f.run}),{status:'current',sha:old});
    assert.equal(f.calls.some(c=>c.file==='npm'||c.args.includes('worktree')),false);
  }finally{await f.close();}
});
