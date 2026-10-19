import net from 'node:net';
import path from 'node:path';
import {CoreSession} from './session.mjs';
import {Decoder,encode} from './protocol.mjs';

const defaults={connectTimeoutMs:5000,handshakeTimeoutMs:5000,actionTimeoutMs:5000,reconnectInitialMs:250,reconnectMaxMs:10000};
class RecoverableSendError extends Error{}

/** Explicit local transport. start() opts into reconnects; no outbound frame is replayed. */
export class CoreTransport{
 constructor(socketPath,connect=options=>net.createConnection(options),options={}){
  if(typeof socketPath!=='string'||!path.isAbsolute(socketPath)||path.basename(socketPath)!=='core.sock'||socketPath.includes('\0'))throw Error('Explicit local core.sock path required');
  this.options={...defaults,...options};
  for(const key of Object.keys(defaults))if(!Number.isSafeInteger(this.options[key])||this.options[key]<1||this.options[key]>2147483647)throw Error(`Invalid timeout/reconnect duration: ${key}`);
  if(this.options.reconnectInitialMs>this.options.reconnectMaxMs)throw Error('Initial reconnect duration exceeds maximum');
  this.clock=options.clock??globalThis;
  if(typeof this.clock.setTimeout!=='function'||typeof this.clock.clearTimeout!=='function')throw Error('Clock must supply setTimeout and clearTimeout');
  this.socketPath=socketPath;this.createConnection=connect;this.socket=null;this.generation=0;this.error=null;this.backpressured=false;this.cancelUnderPressure=false;
  this.status='idle';this.managed=false;this.retryAttempt=0;this.retryInMs=null;this.timers=new Map();this.listeners=new Set();
  this.session=new CoreSession(message=>this._send(message));
 }

 /** Timers are owned by both a connection generation and a unique cancellation token. */
 _schedule(key,delay,callback){
  this._cancel(key);const generation=this.generation;const token={handle:null};this.timers.set(key,token);
  token.handle=this.clock.setTimeout(()=>{
   if(generation!==this.generation||this.timers.get(key)!==token)return;
   this.timers.delete(key);callback();
  },delay);
  if(!this.managed)token.handle?.unref?.();
 }
 _cancel(key){const token=this.timers.get(key);if(token){this.timers.delete(key);this.clock.clearTimeout(token.handle);}}
 _clearActions(){for(const key of this.timers.keys())if(key.startsWith('action:'))this._cancel(key);}
 _handshakeDeadline(){this._schedule('handshake',this.options.handshakeTimeoutMs,()=>this._fail('Core handshake timed out'));}

 _send(message){
  if(!this.socket)throw new RecoverableSendError('Socket unavailable');
  const emergencyCancel=message.type==='input'&&message.input?.kind==='pointer'&&message.input.points?.length>0&&message.input.points.length<=10&&message.input.points.every(p=>p.phase==='cancel');
  if(this.backpressured){if(!emergencyCancel||this.cancelUnderPressure)throw new RecoverableSendError('Socket backpressure: wait for drain');this.cancelUnderPressure=true;}
  const socket=this.socket;const generation=this.generation;const frame=encode(message);
  const current=()=>generation===this.generation&&this.socket===socket;
  let writable;
  try{writable=socket.write(frame);}catch(error){if(current())this._fail(error.message);throw error;}
  if(!current())throw new RecoverableSendError('Socket connection ended during write');
  if(!writable)this.backpressured=true;
  if(message.type==='action'){
   this._schedule(`action:${message.id}`,this.options.actionTimeoutMs,()=>this._fail('Action reply timed out; outcome unknown. Command was not replayed.'));
   this._publish();
  }
  if(message.type==='resync'){
   this._clearActions();this.status='resyncing';this._handshakeDeadline();
  }
 }

 snapshot(){
  return {status:this.status,ready:this.session.ready,state:structuredClone(this.session.state),rev:this.session.rev,pending:this.session.pending.size,error:this.error??this.session.lastError,managed:this.managed,retryAttempt:this.retryAttempt,retryInMs:this.retryInMs};
 }
 subscribe(listener){
  if(typeof listener!=='function')throw Error('Subscriber must be a function');
  this.listeners.add(listener);this._notify(listener);return ()=>this.listeners.delete(listener);
 }
 _notify(listener){try{listener(this.snapshot());}catch{/* A broken view must not break the transport. */}}
 _publish(){for(const listener of [...this.listeners])if(this.listeners.has(listener))this._notify(listener);}

 _dispose(){
  this.generation++;for(const key of this.timers.keys())this._cancel(key);
  this.backpressured=false;this.cancelUnderPressure=false;this.retryInMs=null;
  const socket=this.socket;this.socket=null;this.session.close();socket?.destroy();
 }
 _fail(reason,{terminal=false,status='error'}={}){
  this.error=String(reason);this._dispose();
  if(terminal)this.managed=false;
  this.status=status;
  if(this.managed){
   const delay=Math.min(this.options.reconnectMaxMs,this.options.reconnectInitialMs*2**Math.min(this.retryAttempt,31));
   this.retryAttempt=Math.min(this.retryAttempt+1,Number.MAX_SAFE_INTEGER);this.retryInMs=delay;this.status='backoff';
   this._schedule('retry',delay,()=>{if(this.managed)this._connect();});
  }
  this._publish();
 }
 _connect(){
  this._dispose();this.error=null;this.session.lastError=null;this.status='connecting';
  const generation=this.generation;this._publish();if(generation!==this.generation)return;
  let socket;
  try{socket=this.createConnection({path:this.socketPath});}catch(error){this._fail(error.message);return;}
  this.socket=socket;const decoder=new Decoder();
  const current=()=>generation===this.generation&&this.socket===socket;
  this._schedule('connect',this.options.connectTimeoutMs,()=>this._fail('Core connect timed out'));
  socket.on('drain',()=>{if(current()){this.backpressured=false;this.cancelUnderPressure=false;this._publish();}});
  socket.on('connect',()=>{
   if(!current())return;
   this._cancel('connect');this.status='handshaking';this._handshakeDeadline();
   try{this.session.open();}catch(error){if(current())this._fail(error.message);return;}
   if(current())this._publish();
  });
  socket.on('data',data=>{
   if(!current())return;
   let messages;
   try{messages=decoder.push(data);}catch(error){this._fail(error.message,{terminal:true});return;}
   for(const message of messages){
    if(!current())return;
    try{this.session.receive(message);}catch(error){
     if(current())this._fail(error.message,{terminal:!(error instanceof RecoverableSendError),status:message?.type==='welcome'?'refused':'error'});
     return;
    }
    if(message.type==='refused'){this._fail(this.session.lastError,{terminal:true,status:'refused'});return;}
    for(const key of this.timers.keys())if(key.startsWith('action:')&&!this.session.pending.has(Number(key.slice(7))))this._cancel(key);
    if(this.session.ready){this._cancel('handshake');this.status='ready';this.retryAttempt=0;}
    else if(this.session.resyncing)this.status='resyncing';
    this._publish();
   }
  });
  socket.on('error',error=>{if(current())this._fail(error.message);});
  socket.on('close',()=>{if(current())this._fail('Core disconnected');});
 }

 /** One-shot connection APIs deliberately never inherit automatic retry authorization. */
 connect(){this.managed=false;this.retryAttempt=0;this._connect();}
 reconnect(){this.connect();}
 start(){this.managed=true;this.retryAttempt=0;this._connect();}
 action(action){return this.session.action(action);}
 stop(){
  if(this.status==='stopped'&&!this.socket&&!this.timers.size)return;
  this.managed=false;this.retryAttempt=0;this._dispose();this.status='stopped';this._publish();
 }
 close(){this.stop();}
}
