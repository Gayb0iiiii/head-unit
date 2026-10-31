import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CoreTransport} from '../../src/transport.mjs';
import {HeadunitController} from '../../src/controller.mjs';
import {createFakeCore} from './fake-core.mjs';

const waitFor=async predicate=>{
 const deadline=Date.now()+3000;
 while(!predicate()){if(Date.now()>deadline)throw Error('Timed out waiting for fake core');await new Promise(r=>setTimeout(r,10));}
};
test('fake Unix peer drives real transport/controller: state, native rejection and disconnect',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'headunit-fixture-'));
 const core=await createFakeCore(dir);
 const transport=new CoreTransport(core.socketPath);
 const controller=new HeadunitController(transport);
 t.after(async()=>{controller.dispose();transport.stop();await core.close();await rm(dir,{recursive:true,force:true});});
 assert.equal((await stat(dir)).mode&0o777,0o700);
 transport.connect();
 await waitFor(()=>controller.view().connected);
 assert.deepEqual(controller.view().phones.map(p=>p.id),['driver','passenger']);
 assert.equal(controller.view().homeStatus.media.title,'Fixture track');
 assert.equal(controller.view().homeStatus.phone.batteryPercent,73);
 const stamp=Date.now();
 core.patch([{op:'set',path:['telemetry'],value:{gnss:{connected:true,fixQuality:'gps',fixMode:'3d',updatedAt:stamp},gps:{lat:0,lng:0,fixTs:stamp}}}]);
 await waitFor(()=>controller.view().location.status==='current');
 assert.equal(controller.view().location.latitude,0);
 core.patch([{op:'set',path:['telemetry','gnss'],value:{connected:true,fixQuality:'none',fixMode:'none',updatedAt:stamp}}]);
 await waitFor(()=>controller.view().location.status==='no-fix');
 assert.equal(controller.view().location.latitude,null);
 const pause=controller.intent({type:'media',control:'pause',phoneId:'driver'});
 assert.equal(await pause.completion,true);assert.equal(controller.resume,false);
 core.patch([{op:'set',path:['front','main'],value:'camera'}]);
 await waitFor(()=>controller.view().route==='camera');
 core.patch([{op:'set',path:['front','main'],value:'livi'}]);
 await waitFor(()=>controller.view().route==='home');
 const result=controller.intent({type:'selectPhone',id:'passenger'});
 assert.equal(await result.completion,false);
 assert.equal(controller.pendingChoice,null);
 assert.equal(transport.session.lastError,'fake-selection-rejected-private-detail');
 core.disconnect();
 await waitFor(()=>controller.view().connected===false);
 assert.equal(controller.view().route,'disconnected');
 assert.equal(core.actions.filter(a=>a.action.kind==='show').length,0);
});
