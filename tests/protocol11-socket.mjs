import test from 'node:test';
import assert from 'node:assert/strict';
import {CoreTransport} from '../src/transport.mjs';
import {Decoder,encode} from '../src/protocol.mjs';
const state=()=>({front:{main:'livi',cluster:'livi',aux:'livi'},sessions:{active:'carplay',position:1,total:2},devices:[{id:'a',name:'First',status:'active',protocol:'carplay',lastTransport:'wireless',session:1},{id:'b',name:'Second',status:'available',protocol:'carplay',lastTransport:'wired',session:2}],nowPlaying:{playing:false},config:{},cameras:[],mfi:{certificate:true,identity:true},videoPlayback:null});
test('protocol 11 exchanges framed welcome and selection over a real private Unix socket',async()=>{
 const net=await import('node:net');const fs=await import('node:fs/promises');const os=await import('node:os');const path=await import('node:path');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'headunit-p11-'));const socketPath=path.join(dir,'core.sock');const received=[],clients=new Set();
 const server=net.createServer(socket=>{clients.add(socket);socket.on('close',()=>clients.delete(socket));const decoder=new Decoder();socket.on('data',chunk=>{for(const message of decoder.push(chunk)){
 received.push(message);
 if(message.type==='hello'){const frame=encode({type:'welcome',protocol:11,rev:0,state:state()});socket.write(frame.subarray(0,3));socket.write(frame.subarray(3));}
 if(message.type==='action')socket.write(encode({type:'reply',id:message.id}));
 }});});
 const t=new CoreTransport(socketPath,undefined,{protocol:11});
 try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,resolve);});
 const ready=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Local fixture handshake timed out')),2000);const off=t.subscribe(view=>{if(view.ready){clearTimeout(timeout);off();resolve();}});});
 t.connect();await ready;assert.equal(received[0].protocol,11);
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Local fixture reply timed out')),2000);t.session.action({kind:'selectDevice',id:'b'},ok=>{clearTimeout(timeout);ok?resolve():reject(Error('Selection rejected'));});});
 assert.deepEqual(received.at(-1).action,{kind:'selectDevice',id:'b'});assert.equal(t.session.state.devices[0].status,'active','reply alone must not switch devices');
 }finally{t.stop();for(const socket of clients)socket.destroy();await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});}
});
