import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('display selection uses connected connectors and rejects ambiguity',()=>{
 const root=mkdtempSync(join(tmpdir(),'headunit-drm-'));
 try {
  const sys=join(root,'sys'),dev=join(root,'dev');mkdirSync(sys);mkdirSync(dev);
  for(const card of ['card0','card1'])writeFileSync(join(dev,card),'');
  const connector=(name,state)=>{const dir=join(sys,name);mkdirSync(dir);writeFileSync(join(dir,'status'),state+'\n');};
  connector('card0-HDMI-A-1','disconnected');connector('card1-HDMI-A-1','connected');
  const run=env=>spawnSync('sh',['deployment/select-drm-card.sh',sys,dev],{encoding:'utf8',env:{...process.env,HEADUNIT_DRM_CARD:'',...env}});
  assert.equal(run().stdout.trim(),join(dev,'card1'));
  connector('card0-DP-1','connected');
  assert.match(run().stderr,/Multiple DRM cards/);
  assert.equal(run({HEADUNIT_DRM_CARD:'/dev/dri/card1'}).stdout.trim(),'/dev/dri/card1');
  assert.notEqual(run({HEADUNIT_DRM_CARD:'/dev/dri/card2'}).status,0);
 } finally {rmSync(root,{recursive:true,force:true});}
});

test('headless UI launch exits with non-restarting display status before starting Cage',()=>{
 const root=mkdtempSync(join(tmpdir(),'headunit-headless-'));
 try{
  const bin=join(root,'bin');mkdirSync(bin);mkdirSync(join(root,'dist'));mkdirSync(join(root,'electron/kiosk'),{recursive:true});mkdirSync(join(root,'deployment'));
  writeFileSync(join(root,'dist/production.html'),'fixture');writeFileSync(join(root,'electron/kiosk/package.json'),'{}');
  for(const [name,body] of [['id','echo cruiser'],['uname','echo aarch64'],['cage','echo UNEXPECTED_CAGE; exit 99']])writeFileSync(join(bin,name),'#!/bin/sh\n'+body+'\n',{mode:0o755});
  const selector=join(root,'deployment/select-drm-card.sh');
  for(const body of ['echo "No DRM card has a connected output" >&2; exit 1','echo /dev/dri/nonexistent-headunit-fixture']){
   writeFileSync(selector,'#!/bin/sh\n'+body+'\n',{mode:0o755});
   const result=spawnSync('sh',['deployment/orangepi-ui-launch.sh'],{encoding:'utf8',env:{...process.env,PATH:bin+':'+process.env.PATH,HEADUNIT_ROOT:root,HEADUNIT_ELECTRON:process.execPath,HEADUNIT_NODE:process.execPath}});
   assert.equal(result.status,78);assert.doesNotMatch(result.stdout,/UNEXPECTED_CAGE/);
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('disconnected, unknown and writeback-only outputs never select a DRM device',()=>{
 const root=mkdtempSync(join(tmpdir(),'headunit-no-output-'));
 try{
  const sys=join(root,'sys'),dev=join(root,'dev');mkdirSync(sys);mkdirSync(dev);writeFileSync(join(dev,'card0'),'');
  for(const [name,state] of [['card0-HDMI-A-1','disconnected'],['card0-DP-1','unknown'],['card0-Writeback-1','connected']]){mkdirSync(join(sys,name));writeFileSync(join(sys,name,'status'),state);}
  const result=spawnSync('sh',['deployment/select-drm-card.sh',sys,dev],{encoding:'utf8',env:{...process.env,HEADUNIT_DRM_CARD:''}});
  assert.notEqual(result.status,0);assert.equal(result.stdout,'');assert.match(result.stderr,/No DRM card/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
