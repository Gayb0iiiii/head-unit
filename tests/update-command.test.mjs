import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {runUpdateCommand} from '../electron/update-source.mjs';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('cancelling a staged command stops its child process group before reporting cancellation',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'headunit-update-cancel-'));
  const heartbeat=path.join(root,'heartbeat');
  const controller=new AbortController();
  const grandchild=`const fs=require('node:fs');setInterval(()=>fs.appendFileSync(${JSON.stringify(heartbeat)},'x'),20);`;
  const parent=`const {spawn}=require('node:child_process');spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'inherit'});setInterval(()=>{},1000);`;
  try{
    const running=runUpdateCommand(process.execPath,['-e',parent],{signal:controller.signal,timeoutMs:5000});
    let observed=false;
    for(let i=0;i<100;i++){try{observed=(await readFile(heartbeat)).length>1;if(observed)break;}catch{}await pause(20);}
    assert.equal(observed,true,'fixture descendant must be running before cancellation');
    controller.abort();await assert.rejects(running);
    const stoppedLength=(await readFile(heartbeat)).length;
    await pause(150);
    assert.equal((await readFile(heartbeat)).length,stoppedLength,'descendant must stop writing before cancellation resolves');
  }finally{await rm(root,{recursive:true,force:true});}
});
