import test from 'node:test';import assert from 'node:assert/strict';
import {readProcessInstance} from '../electron/process-instance.mjs';
const boot='12345678-1234-1234-1234-123456789abc';
function reader({uid=1000,start='12345',group='0::/user.slice/session-c2.scope',changed=false}={}){
 let stats=0;return async path=>{
  if(path.endsWith('boot_id'))return boot+'\n';
  if(path.endsWith('/stat')){const fields=Array(22).fill('0');fields[0]='S';fields[1]='22';fields[19]=changed&&stats++?'999':start;return '55 (name with ) brackets) '+fields.join(' ');}
  if(path.endsWith('/status'))return `Uid:\t${uid}\t${uid}\t${uid}\t${uid}\n`;
  if(path.endsWith('/cgroup'))return group;throw Error('Unexpected read');
 };
}
test('process identity binds boot, PID, start ticks, owner and real cgroup session',async()=>{
 const a=await readProcessInstance(55,1000,{read:reader()});assert.equal(a.pid,55);assert.equal(a.ppid,22);assert.equal(a.sessionId,'c2');assert.match(a.instance,/^[a-f0-9]{64}$/);
 const b=await readProcessInstance(55,1000,{read:reader({start:'12346'})});assert.notEqual(a.instance,b.instance);
});
test('PID reuse, changed UID, invalid pid and ambiguous sessions fail closed',async()=>{
 for(const args of [{changed:true},{uid:0},{group:'0::/session-c2.scope\n1::/session-c3.scope'}])assert.equal(await readProcessInstance(55,1000,{read:reader(args)}),null);
 assert.equal(await readProcessInstance('../self',1000,{read:()=>{throw Error('must not read');}}),null);
});
test('actual Linux current-process identity is read without inventing a login session',async()=>{
 const value=await readProcessInstance(process.pid,process.getuid());assert.equal(value.pid,process.pid);assert.equal(value.ppid,process.ppid);assert.equal(value.uid,process.getuid());assert.match(value.instance,/^[a-f0-9]{64}$/);
});
