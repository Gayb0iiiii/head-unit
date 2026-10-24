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
