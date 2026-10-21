import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {watchParentLifeline} from '../electron/parent-lifeline.mjs';
const pipe=()=>({isFIFO:()=>true,isSocket:()=>false});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('lifeline is opt-in and ignores non-pipe stdin like the pinned host',()=>{
 const input=new PassThrough();let lost=0;
 const stop=watchParentLifeline({env:{},input,stat:()=>{throw Error('must not inspect');},onLost:()=>lost++});stop();
 const stopFile=watchParentLifeline({env:{LIVI_LIFELINE:'1'},input,stat:()=>({isFIFO:()=>false,isSocket:()=>false}),onLost:()=>lost++});stopFile();
 assert.equal(input.listenerCount('end'),0);assert.equal(input.readableFlowing,null);assert.equal(lost,0);
});
for(const event of ['end','close','error'])test(`parent ${event} notifies once and releases borrowed stream listeners`,async()=>{
 const input=new PassThrough();let lost=0;
 const stop=watchParentLifeline({env:{LIVI_LIFELINE:'1'},input,stat:pipe,onLost:()=>lost++});
 if(event==='end'){input.end();await tick();}else input.emit(event,new Error('test'));
 assert.equal(lost,1);input.emit('close');stop();stop();assert.equal(lost,1);
 for(const name of ['end','close','error'])assert.equal(input.listenerCount(name),0);
});
test('disposal does not close borrowed stdin or call quit and already ended pipes fail immediately',()=>{
 const input=new PassThrough();let lost=0;
 const stop=watchParentLifeline({env:{LIVI_LIFELINE:'1'},input,stat:pipe,onLost:()=>lost++});
 stop();assert.equal(input.destroyed,false);input.emit('end');assert.equal(lost,0);
 input.destroy();watchParentLifeline({env:{LIVI_LIFELINE:'1'},input,stat:pipe,onLost:()=>lost++});assert.equal(lost,1);
});

for(const delayed of [false,true])test(`queued terminal error is drained after quit, asynchronous destruction: ${delayed}`,async()=>{
 const {spawnSync}=await import('node:child_process');
 const moduleURL=new URL('../electron/parent-lifeline.mjs',import.meta.url).href;
 const result=spawnSync(process.execPath,['--input-type=module','-e',`
 import {PassThrough,Readable} from 'node:stream';
 import {watchParentLifeline} from ${JSON.stringify(moduleURL)};
 const input=${delayed ? "new Readable({read(){},destroy(error,done){setTimeout(()=>done(error),20);}})" : "new PassThrough()"};let lost=0;
 input.destroy(new Error('queued parent failure'));
 watchParentLifeline({env:{LIVI_LIFELINE:'1'},input,stat:()=>({isFIFO:()=>true,isSocket:()=>false}),onLost:()=>lost++});
 setTimeout(()=>{if(lost!==1||input.listenerCount('error')||input.listenerCount('close'))process.exitCode=2;else console.log('clean shutdown');},50);
 `],{encoding:'utf8',timeout:5000});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/clean shutdown/);
});
