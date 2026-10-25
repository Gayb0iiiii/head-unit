import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,chmod,rm} from 'node:fs/promises';
import {spawn,execFile as callback} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import path from 'node:path';

const execFile=promisify(callback);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('persistent supervisor launches a real child with IPC and keeps its Wayland session owner alive',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'headunit-supervisor-process-'));
 const source=path.join(root,'source'),state=path.join(root,'state'),fake=path.join(root,'fake-electron'),evidence=path.join(root,'child.json');
 let owner;
 try{
  await mkdir(path.join(source,'dist'),{recursive:true});
  await mkdir(path.join(source,'electron','kiosk'),{recursive:true});
  await writeFile(path.join(source,'dist','production.html'),'built');
  await execFile('git',['init','-q',source]);
  await execFile('git',['-C',source,'add','.']);
  await execFile('git',['-C',source,'-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','-qm','fixture']);
  const {stdout}=await execFile('git',['-C',source,'rev-parse','HEAD']);const sha=stdout.trim();
  await writeFile(fake,`#!/usr/bin/env node\nconst fs=require('node:fs');fs.writeFileSync(process.env.HEADUNIT_TEST_EVIDENCE,JSON.stringify({sha:process.env.HEADUNIT_ACTIVE_SHA,display:process.env.WAYLAND_DISPLAY,entry:process.argv[2]}));process.send({kind:'ready',sha:process.env.HEADUNIT_ACTIVE_SHA});process.on('SIGTERM',()=>process.exit(0));\n`);
  await chmod(fake,0o755);
  owner=spawn(process.execPath,[new URL('../deployment/electron-supervisor.mjs',import.meta.url).pathname],{
    env:{...process.env,HEADUNIT_ROOT:source,HEADUNIT_ELECTRON:fake,HEADUNIT_SESSION:'1',XDG_STATE_HOME:state,WAYLAND_DISPLAY:'wayland-fixture',HEADUNIT_TEST_EVIDENCE:evidence},stdio:['ignore','pipe','pipe']});
  let observed;
  for(let i=0;i<150;i++){
    try{observed=JSON.parse(await readFile(evidence,'utf8'));break;}catch{await pause(20);}
  }
  assert.deepEqual(observed,{sha,display:'wayland-fixture',entry:path.join(source,'electron','kiosk')});
  assert.equal(owner.exitCode,null,'Cage child must still be alive after Electron readiness');
  const manifest=JSON.parse(await readFile(path.join(state,'headunit','release.json'),'utf8'));
  assert.equal(manifest.active,sha);
 }finally{
  if(owner&&owner.exitCode===null){owner.kill('SIGTERM');await new Promise(resolve=>owner.once('exit',resolve));}
  await rm(root,{recursive:true,force:true});
 }
});
test('interrupted release switch returns to the old build on the next supervisor launch',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'headunit-switch-process-'));
 const source=path.join(root,'source'),state=path.join(root,'state'),releases=path.join(state,'headunit','releases'),fake=path.join(root,'fake-electron'),evidence=path.join(root,'children.log');
 let owner,diagnostic='';
 const start=()=>spawn(process.execPath,[new URL('../deployment/electron-supervisor.mjs',import.meta.url).pathname],{
   env:{...process.env,HEADUNIT_ROOT:source,HEADUNIT_ELECTRON:fake,HEADUNIT_SESSION:'1',XDG_STATE_HOME:state,WAYLAND_DISPLAY:'wayland-fixture',HEADUNIT_TEST_EVIDENCE:evidence,HEADUNIT_TEST_SOURCE:source,HEADUNIT_TEST_TARGET:next},stdio:['ignore','pipe','pipe']});
 async function lines(count){for(let i=0;i<150;i++){try{const value=(await readFile(evidence,'utf8')).trim().split('\n').map(JSON.parse);if(value.length>=count)return value;}catch{}await pause(20);}throw Error('Child startup timed out');}
 let next;
 try{
  await mkdir(path.join(source,'dist'),{recursive:true});await mkdir(path.join(source,'electron','kiosk'),{recursive:true});
  await writeFile(path.join(source,'dist','production.html'),'old');
  await execFile('git',['init','-q',source]);await execFile('git',['-C',source,'add','.']);
  await execFile('git',['-C',source,'-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','-qm','old']);
  const old=(await execFile('git',['-C',source,'rev-parse','HEAD'])).stdout.trim();
  await writeFile(path.join(source,'dist','production.html'),'new');await execFile('git',['-C',source,'add','.']);
  await execFile('git',['-C',source,'-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','-qm','new']);
  next=(await execFile('git',['-C',source,'rev-parse','HEAD'])).stdout.trim();
  await execFile('git',['-C',source,'reset','--hard',old]);
  await mkdir(releases,{recursive:true});await execFile('git',['-C',source,'worktree','add','--detach',path.join(releases,next),next]);
  await writeFile(fake,`#!/usr/bin/env node\nconst fs=require('node:fs');const p=process.env;fs.appendFileSync(p.HEADUNIT_TEST_EVIDENCE,JSON.stringify({sha:p.HEADUNIT_ACTIVE_SHA,display:p.WAYLAND_DISPLAY,recovered:p.HEADUNIT_UPDATE_RECOVERED})+'\\n');process.send({kind:'ready',sha:p.HEADUNIT_ACTIVE_SHA});if(p.HEADUNIT_ACTIVE_ROOT===p.HEADUNIT_TEST_SOURCE&&!fs.existsSync(p.HEADUNIT_TEST_EVIDENCE+'.once')){fs.writeFileSync(p.HEADUNIT_TEST_EVIDENCE+'.once','1');setTimeout(()=>process.send({kind:'activate',id:1,sha:p.HEADUNIT_TEST_TARGET}),50);}setInterval(()=>{},1000);process.on('SIGTERM',()=>process.exit(0));\n`);
  await chmod(fake,0o755);
  owner=start();owner.stderr.on('data',chunk=>{diagnostic+=chunk.toString();});const first=await lines(2);
  assert.deepEqual(first.map(value=>value.sha),[old,next],`${diagnostic} manifest=${await readFile(path.join(state,'headunit','release.json'),'utf8')}`);
  assert.ok(first.every(value=>value.display==='wayland-fixture'));
  assert.equal(owner.exitCode,null);
  assert.equal(JSON.parse(await readFile(path.join(state,'headunit','release.json'),'utf8')).pending,next);
  owner.kill('SIGTERM');await new Promise(resolve=>owner.once('exit',resolve));owner=null;
  assert.equal(JSON.parse(await readFile(path.join(state,'headunit','release.json'),'utf8')).pending,next,'Interrupted candidate must remain pending until reboot reconciliation');
  owner=start();const after=await lines(3);
  assert.equal(after[2].sha,old);assert.equal(after[2].recovered,'1',JSON.stringify(after));
  assert.equal(JSON.parse(await readFile(path.join(state,'headunit','release.json'),'utf8')).pending,null);
  assert.equal(owner.exitCode,null);
 }finally{
  if(owner&&owner.exitCode===null){owner.kill('SIGTERM');await new Promise(resolve=>owner.once('exit',resolve));}
  await rm(root,{recursive:true,force:true});
 }
});
