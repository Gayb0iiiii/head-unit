import net from 'node:net';
import {chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {Decoder,encode} from '../../src/protocol.mjs';

// Test peer only. Never connects to, starts, or discovers a native LIVI service.
export async function createFakeCore(directory) {
  const socketPath=join(directory,'core.sock');
  const clients=new Set(), actions=[];
  let rev=0;
  let state={front:{main:'livi'},sessions:{active:{id:'fake-session'}},
    devices:[{id:'driver',name:'Driver',status:'active'},{id:'passenger',name:'Passenger',status:'available'}],
    config:{huVolume:0.5,password:'fake-private-config'},nowPlaying:{playing:false}};
  const server=net.createServer(socket=>{
    clients.add(socket);
    const decoder=new Decoder();
    socket.on('error',()=>{});
    socket.on('close',()=>clients.delete(socket));
    socket.on('data',data=>{
      try {
        for(const message of decoder.push(data)) {
          if(message.type==='hello')socket.write(encode({type:'welcome',protocol:8,rev,state}));
          if(message.type==='action') {
            actions.push(message);
            const selecting=['selectDevice','connectDevice'].includes(message.action.kind);
            socket.write(encode({type:'reply',id:message.id,...(selecting?{error:'fake-selection-rejected-private-detail'}:{})}));
          }
        }
      } catch { socket.destroy(); }
    });
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,resolve);});
  await chmod(socketPath,0o600);
  return {
    socketPath,actions,
    patch(ops) {
      // Tests use top-level/subfield set operations only, with an explicit fixture schema.
      for(const {op,path,value} of ops) {
        if(op!=='set'||path.length<1||path.length>2||path.some(key=>['__proto__','constructor','prototype'].includes(key)))throw Error('Unsupported fixture patch');
        if(path.length===1)state[path[0]]=structuredClone(value);
        else state[path[0]][path[1]]=structuredClone(value);
      }
      const frame=encode({type:'patch',rev:++rev,ops});
      for(const socket of clients)socket.write(frame);
    },
    disconnect(){for(const socket of clients)socket.destroy();},
    async close(){
      for(const socket of clients)socket.destroy();
      await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    }
  };
}
