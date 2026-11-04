import test from 'node:test';
import assert from 'node:assert/strict';
import {CoreSession} from '../src/session.mjs';
import {CoreTransport} from '../src/transport.mjs';
import {HeadunitController} from '../src/controller.mjs';
import {EventEmitter} from 'node:events';
import {Decoder,encode} from '../src/protocol.mjs';

// Wire fields checked against f-io/LIVI 0430a439 protocol 11 state/message/input.rs.
const state=()=>({front:{main:'livi',cluster:'livi',aux:'livi'},sessions:{active:'carplay',position:1,total:2},devices:[{id:'a',name:'First',status:'active',protocol:'carplay',lastTransport:'wireless',session:1},{id:'b',name:'Second',status:'available',protocol:'carplay',lastTransport:'wired',session:2}],nowPlaying:{playing:false},config:{},cameras:[],mfi:{certificate:true,identity:true},videoPlayback:null});
test('explicit protocol 11 session advertises 11 and accepts its pinned state shape',()=>{
 const sent=[];const s=new CoreSession(m=>sent.push(m),undefined,undefined,{protocol:11});s.open();
 assert.equal(sent[0].protocol,11);
 s.receive({type:'welcome',protocol:11,version:'10.0.0',rev:0,state:state()});
 assert.equal(s.ready,true);assert.equal(s.state.devices.length,2);
});
test('protocol 8 remains default and versions cannot silently negotiate or downgrade',()=>{
 const sent=[];const old=new CoreSession(m=>sent.push(m));old.open();assert.equal(sent[0].protocol,8);
 for(const protocol of [8,11]){const s=new CoreSession(()=>{},undefined,undefined,{protocol});assert.throws(()=>s.receive({type:'welcome',protocol:protocol===8?11:8,rev:0,state:state()}),/Incompatible/);assert.equal(s.ready,false);}
 for(const protocol of [0,9,10,12,'11',null,NaN])assert.throws(()=>new CoreSession(()=>{},undefined,undefined,{protocol}),/protocol/i);
});
class Socket extends EventEmitter{writes=[];write(b){this.writes.push(b);return true;}destroy(){this.emit('close');}}
const messages=s=>new Decoder().push(Buffer.concat(s.writes));
test('protocol 11 transport and controller switch only after authoritative device state',()=>{
 const socket=new Socket();const t=new CoreTransport('/tmp/livi-version/core.sock',()=>socket,{protocol:11});
 const c=new HeadunitController(t,{load:()=>({route:'home'}),save:()=>{}});
 try{
 t.connect();socket.emit('connect');assert.equal(messages(socket)[0].protocol,11);
 socket.emit('data',encode({type:'welcome',protocol:11,rev:0,state:state()}));assert.equal(t.session.ready,true);
 c.intent({type:'selectPhone',id:'b'});const action=messages(socket).filter(m=>m.type==='action').at(-1);assert.deepEqual(action.action,{kind:'selectDevice',id:'b'});
 socket.emit('data',encode({type:'reply',id:action.id}));assert.equal(c.view().phones.find(p=>p.id==='b').status,'available');
 const devices=state().devices.map(p=>({...p,status:p.id==='b'?'active':'available'}));
 socket.emit('data',encode({type:'patch',rev:1,ops:[{op:'set',path:['devices'],value:devices},{op:'set',path:['sessions','position'],value:2}]}));assert.equal(c.view().phones.find(p=>p.id==='b').status,'active');
 socket.emit('data',encode({type:'patch',rev:3,ops:[]}));assert.equal(t.session.ready,false);assert.equal(messages(socket).at(-1).type,'resync');
 }finally{c.dispose();t.stop();}
});
test('version 11 retains restricted commands and drops pending actions on disconnect',()=>{
 const sent=[],s=new CoreSession(m=>sent.push(m),undefined,undefined,{protocol:11});
 s.receive({type:'welcome',protocol:11,rev:0,state:state()});let result;
 s.action({kind:'connectDevice',id:'remembered'},ok=>{result=ok;});
 for(const action of [{kind:'restart'},{kind:'forgetDevice',id:'a'},{kind:'setConfig',patch:{wirelessCpEnabled:true}}])assert.throws(()=>s.action(action),/not allowed/);
 s.close();assert.equal(result,false);s.open();assert.deepEqual(sent.at(-1),{type:'hello',protocol:11,client:'headunit-prototype'});assert.equal(s.pending.size,0);
});

