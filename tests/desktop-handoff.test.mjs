import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTargetSession, createDesktopHandoff} from '../electron/desktop-handoff.mjs';
import {parseLoginctlSession, processEvidence} from '../electron/logind-desktop.mjs';
import {returnToHeadunit} from '../deployment/return-to-headunit.mjs';

const headunit={id:'3',uid:1000,seat:'seat0',vt:1,remote:false,state:'online',sessionClass:'user'};
const plasma={id:'8',uid:1000,seat:'seat0',vt:2,remote:false,state:'online',sessionClass:'user',type:'tty'};
const processes=[
  {name:'cage',sessionId:'3',headunit:true},
  {name:'kwin_wayland',sessionId:'8',wayland:false},
  {name:'plasmashell',sessionId:'8',wayland:true},
];

test('Plasma started from a tty is eligible only with matching live session processes',()=>{
  assert.equal(selectTargetSession({sessions:[headunit,plasma],processes,currentId:'3',uid:1000,target:'desktop'}),'8');
  assert.equal(selectTargetSession({sessions:[headunit,plasma],processes:processes.filter(p=>p.name!=='plasmashell'),currentId:'3',uid:1000,target:'desktop'}),null);
  assert.equal(selectTargetSession({sessions:[headunit,plasma],processes,currentId:'8',uid:1000,target:'headunit'}),'3');
});

test('handoff rejects remote, other-user, same-VT, dead, and ambiguous sessions',()=>{
  for(const change of [{uid:0},{seat:'seat1'},{remote:true},{vt:1},{state:'closing'},{sessionClass:'manager'}]){
    assert.equal(selectTargetSession({sessions:[headunit,{...plasma,...change}],processes,currentId:'3',uid:1000,target:'desktop'}),null);
  }
  const another={...plasma,id:'9',vt:3};
  assert.equal(selectTargetSession({sessions:[headunit,plasma,another],processes:[...processes,{name:'kwin_wayland',sessionId:'9',wayland:true},{name:'plasmashell',sessionId:'9',wayland:true}],currentId:'3',uid:1000,target:'desktop'}),null);
  assert.equal(selectTargetSession({sessions:[headunit,plasma],processes:processes.filter(p=>p.name!=='cage'),currentId:'3',uid:1000,target:'desktop'}),null);
  assert.equal(selectTargetSession({sessions:[headunit,plasma],processes:processes.filter(p=>p.name!=='kwin_wayland'),currentId:'8',uid:1000,target:'headunit'}),null);
  assert.equal(selectTargetSession({sessions:[{...headunit,sessionClass:'manager'},plasma],processes,currentId:'3',uid:1000,target:'desktop'}),null);
});

test('request re-discovers a single target, activates it, and confirms logind Active before success',async()=>{
  let active=false;const calls=[];
  const handoff=createDesktopHandoff({target:'desktop',currentId:'3',uid:1000,
    discover:async()=>({sessions:[{...headunit,active:!active},{...plasma,active}],processes}),
    activate:async id=>{calls.push(id);active=true;},wait:async()=>{}});
  await handoff.refresh();assert.equal(handoff.available,true);
  assert.equal(await handoff.request(),true);assert.deepEqual(calls,['8']);handoff.dispose();
});

test('failed or unobserved activation cannot report success or switch a stale target',async()=>{
  let sessions=[headunit,plasma];let count=0;
  const handoff=createDesktopHandoff({target:'desktop',currentId:'3',uid:1000,
    discover:async()=>({sessions,processes}),activate:async()=>{count++;},wait:async()=>{}});
  await handoff.refresh();sessions=[headunit];
  assert.equal(await handoff.request(),false);assert.equal(count,0);
  sessions=[headunit,plasma];await handoff.refresh();
  assert.equal(await handoff.request(),false);assert.equal(count,1);handoff.dispose();
});

test('activation is not confirmed while the head-unit session still owns the seat',async()=>{
  const handoff=createDesktopHandoff({target:'desktop',currentId:'3',uid:1000,
    discover:async()=>({sessions:[{...headunit,active:true},{...plasma,active:true}],processes}),
    activate:async()=>{},wait:async()=>{}});
  assert.equal(await handoff.request(),false);handoff.dispose();
});

test('logind properties accept a tty-class Plasma session without trusting its display label',()=>{
  const parsed=parseLoginctlSession('Id=8\nUser=1000\nSeat=seat0\nVTNr=2\nRemote=no\nState=online\nClass=user\nType=tty\nActive=no\n');
  assert.deepEqual(parsed,{id:'8',uid:1000,seat:'seat0',vt:2,remote:false,state:'online',sessionClass:'user',type:'tty',active:false});
  assert.equal(parseLoginctlSession('Id=8\nUser=1000\nSeat=seat0\nVTNr=0\nRemote=no\nState=online\nClass=user\nType=tty\nActive=no\n'),null);
});

test('process evidence requires same-owner session and a real Wayland socket for Plasma',()=>{
  const env=Buffer.from('XDG_SESSION_ID=8\0WAYLAND_DISPLAY=wayland-1\0');
  const input={name:'kwin_wayland',uid:1000,environ:env,cgroup:'0::/user.slice/user-1000.slice/session-8.scope',socket:true};
  assert.deepEqual(processEvidence(input,1000),{name:'kwin_wayland',sessionId:'8',wayland:true,headunit:false});
  const nativeKwin={...input,environ:Buffer.from('XDG_SESSION_ID=8\0'),socket:false};
  assert.deepEqual(processEvidence(nativeKwin,1000),{name:'kwin_wayland',sessionId:'8',wayland:false,headunit:false});
  assert.equal(selectTargetSession({sessions:[headunit,plasma],processes,currentId:'3',uid:1000,target:'desktop'}),'8');
  assert.equal(processEvidence({...input,uid:0},1000),null);
  assert.equal(processEvidence({...input,socket:false},1000).wayland,false);
  assert.equal(processEvidence({...input,environ:Buffer.from('XDG_SESSION_ID=9\0WAYLAND_DISPLAY=wayland-1\0')},1000),null);
  assert.equal(processEvidence({name:'cage',uid:1000,environ:Buffer.from('XDG_SESSION_ID=3\0HEADUNIT_SESSION=1\0'),cgroup:'0::/user.slice/user-1000.slice/session-3.scope',socket:false},1000).headunit,true);
});

test('desktop return reports success only after provider confirms activation',async()=>{
  let closed=0;
  assert.equal(await returnToHeadunit({refresh:async()=>true,available:true,request:async()=>true,dispose:()=>closed++}),true);
  assert.equal(closed,1);
  assert.equal(await returnToHeadunit({refresh:async()=>false,available:false,request:async()=>{throw Error('must not activate');},dispose:()=>closed++}),false);
  assert.equal(closed,2);
});
test('availability refreshes share one discovery instead of racing stale results',async()=>{
 let finish,calls=0;const handoff=createDesktopHandoff({target:'desktop',currentId:'3',uid:1000,discover:()=>{calls++;return new Promise(resolve=>{finish=resolve;});},activate:async()=>{}});
 const first=handoff.refresh(),second=handoff.refresh();assert.equal(calls,1);finish({sessions:[headunit,plasma],processes});assert.equal(await first,true);assert.equal(await second,true);handoff.dispose();
});
test('disposal while activation verification waits cannot report success',async()=>{
 let calls=0,finish;const handoff=createDesktopHandoff({target:'desktop',currentId:'3',uid:1000,discover:async()=>{if(++calls===1)return {sessions:[headunit,plasma],processes};return new Promise(resolve=>{finish=resolve;});},activate:async()=>{}});
 const request=handoff.request();await new Promise(setImmediate);handoff.dispose();finish({sessions:[{...headunit,active:false},{...plasma,active:true}],processes});assert.equal(await request,false);
});
