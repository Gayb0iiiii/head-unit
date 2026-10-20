import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {filterWindowConfig,observeWindowConfig} from '../electron/window-config.mjs';
import {CoreTransport} from '../src/transport.mjs';
import {encode} from '../src/protocol.mjs';
const config=()=>({mainScreenWidth:1280,mainScreenHeight:720,clusterScreenActive:true,clusterScreenWidth:800,clusterScreenHeight:480,auxScreenActive:false,auxScreenWidth:600,auxScreenHeight:400,kiosk:{main:false,cluster:true,aux:false},uiZoomPercent:120,mainScreenBounds:{x:-200,y:10,width:800,height:480},wifiPassword:'secret',dashboard:{cluster:true},camera:{aux:true},bindings:{ptt:'private'},displayMode:'private'});
const snapshot=cfg=>({ready:true,status:'ready',state:{config:cfg,telemetry:{private:true}}});
test('privileged config projects only verified bounded window fields without inventing a display',()=>{
 const view=filterWindowConfig(snapshot(config()));
 assert.deepEqual(view,{available:true,zoomPercent:120,main:{size:{width:1280,height:720},bounds:{x:-200,y:10,width:800,height:480},kiosk:false},cluster:{active:true,size:{width:800,height:480},bounds:null,kiosk:true},aux:{active:false,size:{width:600,height:400},bounds:null,kiosk:false}});
 assert.doesNotMatch(JSON.stringify(view),/secret|private|dashboard|camera|bindings|displayMode/);
 const missing=filterWindowConfig(snapshot({}));assert.equal(missing.main.size,null);assert.equal(missing.cluster.active,null);assert.equal(missing.zoomPercent,null);
});
test('invalid or inherited configuration fails closed without coercion',()=>{
 const cfg=config();Object.assign(cfg,{mainScreenWidth:'1280',clusterScreenActive:1,auxScreenActive:'true',auxScreenHeight:99999,uiZoomPercent:201,mainScreenBounds:{x:NaN,y:0,width:800,height:480},kiosk:{main:'false',cluster:1,aux:null}});
 const view=filterWindowConfig(snapshot(cfg));assert.equal(view.main.size,null);assert.equal(view.main.bounds,null);assert.equal(view.main.kiosk,null);assert.equal(view.cluster.active,null);assert.equal(view.aux.active,null);assert.equal(view.aux.size,null);assert.equal(view.zoomPercent,null);
 for(const value of [null,[],Object.create(config())])assert.equal(filterWindowConfig(snapshot(value)).available,false);
 const accessor={};Object.defineProperty(accessor,'uiZoomPercent',{get(){throw Error('must not invoke');}});assert.equal(filterWindowConfig(snapshot(accessor)).zoomPercent,null);
});
test('range edges and optional zero bounds preserve absence without fallback',()=>{
 for(const value of [50,200])assert.equal(filterWindowConfig(snapshot({...config(),uiZoomPercent:value})).zoomPercent,value);
 for(const value of [49,201,Infinity,100.5])assert.equal(filterWindowConfig(snapshot({...config(),uiZoomPercent:value})).zoomPercent,null);
 const cfg={...config(),mainScreenWidth:300,mainScreenHeight:200,auxScreenWidth:4096,auxScreenHeight:2160,mainScreenBounds:{x:0,y:0,width:0,height:0}};
 const view=filterWindowConfig(snapshot(cfg));assert.deepEqual(view.main.size,{width:300,height:200});assert.deepEqual(view.aux.size,{width:4096,height:2160});assert.equal(view.main.bounds,null);
});
test('unsynchronized and malformed snapshots cannot retain privileged config',()=>{
 for(const value of [null,{},snapshot(null),{...snapshot(config()),ready:false},{...snapshot(config()),status:'resyncing'}]){
  const view=filterWindowConfig(value);assert.equal(view.available,false);assert.equal(view.main.kiosk,null);assert.equal(view.cluster.active,null);
 }
});
test('observer deduplicates relevant state, isolates subscribers and ignores late callbacks after disposal',()=>{
 let publish,detached=0;const observer=observeWindowConfig({subscribe:fn=>{publish=fn;fn({});return()=>detached++;}});
 const seen=[];observer.subscribe(value=>{value.main.kiosk='corrupt';throw Error('subscriber');});const remove=observer.subscribe(value=>seen.push(value));
 publish(snapshot(config()));assert.equal(seen.at(-1).main.kiosk,false);const count=seen.length;
 publish(snapshot({...config(),wifiPassword:'new secret'}));assert.equal(seen.length,count);
 publish({...snapshot(config()),ready:false,status:'resyncing'});assert.equal(seen.at(-1).available,false);
 publish(snapshot(config()));assert.equal(seen.at(-1).available,true);
 remove();observer.dispose();observer.dispose();const end=seen.length;publish(snapshot(config()));assert.equal(seen.length,end);assert.equal(detached,1);assert.throws(()=>observer.subscribe(()=>{}),/disposed/i);
});
test('real session revisions invalidate on gaps and recover only from a synchronized snapshot',()=>{
 const socket=new EventEmitter();socket.write=()=>true;socket.destroy=()=>{};
 const transport=new CoreTransport('/tmp/window-config/core.sock',()=>socket),observer=observeWindowConfig(transport),seen=[];
 observer.subscribe(value=>seen.push(value));transport.connect();socket.emit('connect');socket.emit('data',encode({type:'welcome',protocol:8,rev:0,state:{config:config()}}));assert.equal(seen.at(-1).cluster.active,true);
 socket.emit('data',encode({type:'patch',rev:1,ops:[{op:'set',path:['config','clusterScreenActive'],value:false}]}));assert.equal(seen.at(-1).cluster.active,false);
 socket.emit('data',encode({type:'patch',rev:3,ops:[]}));assert.equal(seen.at(-1).available,false);
 socket.emit('data',encode({type:'welcome',protocol:8,rev:4,state:{config:config()}}));assert.equal(seen.at(-1).available,true);
 socket.emit('close');assert.equal(seen.at(-1).available,false);observer.dispose();transport.stop();
});
