import test from 'node:test';
import assert from 'node:assert/strict';
import {createBluetoothMusicHost} from '../electron/bluetooth-music-host.mjs';
const adapter='/org/bluez/hci0',device=adapter+'/dev_11_22_33_44_55_66';
const source='0000110a-0000-1000-8000-00805f9b34fb';
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(options={}){
 const calls=[];let observer,agent,handler=async()=>{};
 let objects={[adapter]:{'org.bluez.Adapter1':{Powered:true}},[device]:{'org.bluez.Device1':{Adapter:adapter,Alias:'Phone',Paired:false,UUIDs:[source]}}};
 const bluez={watch:fn=>{observer=fn;fn({owner:':1.20',objects});return()=>{observer=null;};},call:request=>{calls.push(request);return handler(request);},exportAgent:(_path,value)=>{agent=value;return()=>{agent=null;};}};
 const lease={valid:()=>true,onLost:()=>()=>{},release:()=>{lease.released=true;}};
 const host=createBluetoothMusicHost({bluez,adapterPath:adapter,isParked:()=>true,audio:{acquire:async()=>lease,sinkReady:()=>true},...options});host.start();
 return {host,calls,get agent(){return agent;},lease,setHandler:fn=>{handler=fn;},emit:(patch={},owner=':1.20')=>{objects={...objects,...patch};observer?.({owner,objects});},deviceId:()=>host.view().devices[0].id};
}
test('discovery uses only selected adapter and releases its own session',async()=>{
 const f=fixture();await f.host.discover();assert.equal(f.host.view().discovering,true);await f.host.stopDiscovery();
 assert.deepEqual(f.calls.map(x=>[x.path,x.member]),[[adapter,'StartDiscovery'],[adapter,'StopDiscovery']]);await f.host.dispose();
});
test('unknown motion and powered-off adapters cannot start discovery',async()=>{
 const f=fixture({isParked:()=>false});await assert.rejects(f.host.discover());assert.equal(f.calls.length,0);await f.host.dispose();
 const g=fixture();g.emit({[adapter]:{'org.bluez.Adapter1':{Powered:false}}});await assert.rejects(g.host.discover());assert.equal(g.host.view().availability,'powered-off');await g.host.dispose();
});
test('pairing requires explicit matching numeric confirmation without trusting device',async()=>{
 const f=fixture();f.setHandler(async request=>{if(request.member==='Pair')await f.agent.RequestConfirmation(device,42);});
 const pair=f.host.pair(f.deviceId());await tick();const prompt=f.host.view().confirmation;
 assert.equal(prompt.passkey,'000042');assert.throws(()=>f.host.confirm('wrong',true));f.host.confirm(prompt.token,true);await pair;
 assert.equal(f.host.view().devices[0].paired,false);assert.ok(f.calls.some(x=>x.member==='RegisterAgent'));assert.equal(f.calls.some(x=>['RequestDefaultAgent','Set','Connect'].includes(x.member)),false);await f.host.dispose();
});
test('rejected pairing clears prompt and reports bounded error',async()=>{
 const f=fixture();f.setHandler(async r=>{if(r.member==='Pair')await f.agent.RequestConfirmation(device,123456);});
 const pair=f.host.pair(f.deviceId());await tick();f.host.confirm(f.host.view().confirmation.token,false);await assert.rejects(pair);
 assert.equal(f.host.view().confirmation,null);assert.equal(f.host.view().error,'rejected');await f.host.dispose();
});
test('agent rejects unsolicited device and unsupported authorization',async()=>{
 const f=fixture();let finish;f.setHandler(r=>r.member==='Pair'?new Promise(resolve=>{finish=resolve;}):Promise.resolve());
 const pair=f.host.pair(f.deviceId());await tick();await assert.rejects(f.agent.RequestConfirmation('/wrong',12));await assert.rejects(f.agent.AuthorizeService(device,source));finish();await pair;await f.host.dispose();
});
test('A2DP requests remote source profile only and reports observations, not audible success',async()=>{
 const f=fixture();f.emit({[device]:{'org.bluez.Device1':{Adapter:adapter,Paired:true,UUIDs:[source]}}});await f.host.connectMusic(f.deviceId());
 assert.equal(f.calls.at(-1).member,'ConnectProfile');assert.deepEqual(f.calls.at(-1).args,[source]);assert.equal(f.host.view().devices[0].transport,'unavailable');assert.equal(f.host.view().audible,null);
 f.emit({[device+'/sep1/fd0']:{'org.bluez.MediaTransport1':{Device:device,UUID:source,State:'active'}}});assert.equal(f.host.view().devices[0].transport,'active');await f.host.dispose();
});
test('no audio ownership or sink evidence means no connection attempt',async()=>{
 for(const audio of [{sinkReady:()=>false,acquire:async()=>null},{sinkReady:()=>true,acquire:async()=>null}]){
 const f=fixture({audio});f.emit({[device]:{'org.bluez.Device1':{Adapter:adapter,Paired:true,UUIDs:[source]}}});await assert.rejects(f.host.connectMusic(f.deviceId()));assert.equal(f.calls.length,0);await f.host.dispose();
 }
});
test('service loss invalidates pending pairing and stale confirmations',async()=>{
 const f=fixture();f.setHandler(async r=>{if(r.member==='Pair')await f.agent.RequestConfirmation(device,1);});const pair=f.host.pair(f.deviceId());await tick();const token=f.host.view().confirmation.token;
 f.emit({},null);await assert.rejects(pair);assert.equal(f.host.view().devices.length,0);assert.throws(()=>f.host.confirm(token,true));assert.equal(f.host.view().availability,'unavailable');await f.host.dispose();
});
test('permission errors are classified without raw error or device identifiers',async()=>{
 const f=fixture();f.setHandler(async()=>{throw Object.assign(Error('private details'),{name:'org.bluez.Error.NotAuthorized'});});await assert.rejects(f.host.discover());assert.equal(f.host.view().error,'not-authorized');assert.doesNotMatch(JSON.stringify(f.host.view()),/private|11_22|org\/bluez/);await f.host.dispose();
});
test('disposal during discovery releases late acquired discovery and prevents resurrection',async()=>{
 const f=fixture();let resolve;f.setHandler(r=>r.member==='StartDiscovery'?new Promise(r=>{resolve=r;}):Promise.resolve());const pending=f.host.discover();await tick();const disposed=f.host.dispose();resolve();await assert.rejects(pending);await disposed;assert.equal(f.host.view().discovering,false);assert.ok(f.calls.some(x=>x.member==='StopDiscovery'));
});
test('late discovery after timeout is released rather than becoming active',async()=>{
 const f=fixture({operationMs:5});let finish;f.setHandler(r=>r.member==='StartDiscovery'?new Promise(resolve=>{finish=resolve;}):Promise.resolve());
 await assert.rejects(f.host.discover());finish();await tick();assert.equal(f.host.view().discovering,false);assert.ok(f.calls.some(x=>x.member==='StopDiscovery'));await f.host.dispose();
});
test('timed-out audio lease acquisition cannot connect a profile later',async()=>{
 let finish;const f=fixture({operationMs:5,audio:{sinkReady:()=>true,acquire:()=>new Promise(r=>{finish=r;})}});f.emit({[device]:{'org.bluez.Device1':{Adapter:adapter,Paired:true,UUIDs:[source]}}});
 await assert.rejects(f.host.connectMusic(f.deviceId()));finish(f.lease);await tick();assert.equal(f.calls.length,0);assert.equal(f.lease.released,true);await f.host.dispose();
});
test('pairing service replacement never cancels a new daemon operation',async()=>{
 const f=fixture();f.setHandler(async r=>{if(r.member==='Pair')await f.agent.RequestConfirmation(device,1);});const pending=f.host.pair(f.deviceId());await tick();f.emit({},':1.21');await assert.rejects(pending);
 assert.equal(f.calls.some(x=>x.member==='CancelPairing'&&x.destination===':1.21'),false);await f.host.dispose();
});
test('timed-out request blocks overlapping operations until its late cleanup completes',async()=>{
 const f=fixture({operationMs:5});let finish;f.setHandler(r=>r.member==='StartDiscovery'?new Promise(resolve=>{finish=resolve;}):Promise.resolve());
 await assert.rejects(f.host.discover());assert.equal(f.host.view().busy,'canceling');await assert.rejects(f.host.pair(f.deviceId()));finish();await tick();assert.equal(f.host.view().busy,null);await f.host.dispose();
});
test('revoked music ownership disconnects only the requested A2DP profile',async()=>{
 let lost;const lease={valid:()=>true,onLost:fn=>{lost=fn;return()=>{};},release:()=>{}};
 const f=fixture({audio:{sinkReady:()=>true,acquire:async()=>lease}});f.emit({[device]:{'org.bluez.Device1':{Adapter:adapter,Paired:true,UUIDs:[source]}}});await f.host.connectMusic(f.deviceId());lost();await tick();
 assert.deepEqual(f.calls.at(-1).args,[source]);assert.equal(f.calls.at(-1).member,'DisconnectProfile');assert.equal(f.calls.some(x=>x.member==='Disconnect'),false);await f.host.dispose();
});
test('adapter loss cancels a displayed pairing confirmation',async()=>{
 const f=fixture();f.setHandler(async r=>{if(r.member==='Pair')await f.agent.RequestConfirmation(device,123);});const pair=f.host.pair(f.deviceId());await tick();f.emit({[adapter]:{'org.bluez.Adapter1':{Powered:false}}});await assert.rejects(pair);assert.equal(f.host.view().confirmation,null);await f.host.dispose();
});
test('immediate disposal prevents deferred discovery from calling BlueZ',async()=>{
 const f=fixture();const pending=f.host.discover();await f.host.dispose();await assert.rejects(pending);assert.equal(f.calls.length,0);
});
test('synchronously revoked lease does not connect or disconnect an unrequested profile',async()=>{
 const lease={valid:()=>true,onLost:fn=>{fn();return()=>{};},release:()=>{}};
 const f=fixture({audio:{sinkReady:()=>true,acquire:async()=>lease}});f.emit({[device]:{'org.bluez.Device1':{Adapter:adapter,Paired:true,UUIDs:[source]}}});await assert.rejects(f.host.connectMusic(f.deviceId()));assert.equal(f.calls.length,0);await f.host.dispose();
});
test('timeout registering an agent does not cancel another client pairing operation',async()=>{
 const f=fixture({pairMs:5});let finish;f.setHandler(r=>r.member==='RegisterAgent'?new Promise(resolve=>{finish=resolve;}):Promise.resolve());await assert.rejects(f.host.pair(f.deviceId()));assert.equal(f.calls.some(x=>x.member==='CancelPairing'),false);finish();await tick();assert.equal(f.calls.some(x=>x.member==='Pair'),false);await f.host.dispose();
});
test('failed discovery stop retains owned session and exposes a bounded error',async()=>{
 const f=fixture();await f.host.discover();f.setHandler(async()=>{throw Object.assign(Error('private'),{name:'org.bluez.Error.NotAuthorized'});});await assert.rejects(f.host.stopDiscovery(),/Bluetooth operation unavailable/);assert.equal(f.host.view().discovering,true);assert.equal(f.host.view().error,'not-authorized');f.setHandler(async()=>{});await f.host.dispose();
});
test('discovery deadline stops only this application discovery session',async()=>{
 const timers=new Map();let next=0;const clock={setTimeout:fn=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id)};
 const f=fixture({clock});await f.host.discover();assert.equal(timers.size,1);[...timers.values()][0]();await tick();assert.equal(f.host.view().discovering,false);assert.equal(f.calls.filter(x=>x.member==='StopDiscovery').length,1);await f.host.dispose();
});
test('explicit pairing cancellation clears prompt and cancels only the requested device',async()=>{
 const f=fixture();f.setHandler(async r=>{if(r.member==='Pair')await f.agent.RequestConfirmation(device,77);});const pair=f.host.pair(f.deviceId());await tick();await f.host.cancelPairing();await assert.rejects(pair);assert.equal(f.host.view().confirmation,null);assert.equal(f.calls.filter(x=>x.member==='CancelPairing'&&x.path===device).length,1);await f.host.dispose();
});
test('revocation waits for an outstanding connect before disconnecting and releasing focus',async()=>{
 let lost,finish;const lease={valid:()=>true,onLost:fn=>{lost=fn;return()=>{};},release:()=>{lease.released=true;}};
 const f=fixture({audio:{sinkReady:()=>true,acquire:async()=>lease}});f.emit({[device]:{'org.bluez.Device1':{Adapter:adapter,Paired:true,UUIDs:[source]}}});f.setHandler(r=>r.member==='ConnectProfile'?new Promise(resolve=>{finish=resolve;}):Promise.resolve());
 const connecting=f.host.connectMusic(f.deviceId());await tick();const releasing=lost();assert.equal(lease.released,undefined);assert.equal(f.calls.some(x=>x.member==='DisconnectProfile'),false);finish();await releasing;await assert.rejects(connecting);assert.equal(lease.released,true);assert.equal(f.calls.filter(x=>x.member==='DisconnectProfile').length,1);await f.host.dispose();
});
test('stopDiscovery waits for pending acquisition cleanup and cannot leave a late scan active',async()=>{
 const f=fixture();let finish;f.setHandler(r=>r.member==='StartDiscovery'?new Promise(resolve=>{finish=resolve;}):Promise.resolve());const starting=f.host.discover();const failed=assert.rejects(starting);await tick();let stopped=false;const stopping=f.host.stopDiscovery().then(()=>{stopped=true;});await tick();assert.equal(stopped,false);finish();await stopping;await failed;assert.equal(f.host.view().discovering,false);assert.equal(f.calls.filter(x=>x.member==='StopDiscovery').length,1);await f.host.dispose();
});
test('releaseMusic waits for pending focus acquisition and blocks a late profile connect',async()=>{
 let finish;const f=fixture({audio:{sinkReady:()=>true,acquire:()=>new Promise(resolve=>{finish=resolve;})}});f.emit({[device]:{'org.bluez.Device1':{Adapter:adapter,Paired:true,UUIDs:[source]}}});const connecting=f.host.connectMusic(f.deviceId());const failed=assert.rejects(connecting);await tick();let released=false;const releasing=f.host.releaseMusic().then(()=>{released=true;});await tick();assert.equal(released,false);finish(f.lease);await releasing;await failed;assert.equal(f.calls.length,0);assert.equal(f.lease.released,true);await f.host.dispose();
});
test('pending discovery cleanup failure never reports a successful stop',async()=>{
 const f=fixture();let finish;f.setHandler(r=>r.member==='StartDiscovery'?new Promise(resolve=>{finish=resolve;}):Promise.reject(Error('stop failed')));const starting=f.host.discover();const failed=assert.rejects(starting);await tick();const stopping=f.host.stopDiscovery();const stopFailed=assert.rejects(stopping);finish();await failed;await stopFailed;assert.equal(f.host.view().discovering,true);f.setHandler(async()=>{});await f.host.dispose();
});
async function playingFixture(options={}){
 const f=fixture(options);f.emit({[device]:{'org.bluez.Device1':{Adapter:adapter,Paired:true,UUIDs:[source]}}});await f.host.connectMusic(f.deviceId());
 const player=device+'/player0';f.emit({[device]:{'org.bluez.Device1':{Adapter:adapter,Paired:true,Connected:true,UUIDs:[source]},'org.bluez.MediaControl1':{Connected:true,Player:player}},[player]:{'org.bluez.MediaPlayer1':{Device:device,Status:'paused',Track:{Title:'Original fixture',Artist:'Test artist',Duration:10000},Position:2500}}});return {...f,player};
}
test('AVRCP metadata is bounded and controls target only the addressed owned player',async()=>{
 const f=await playingFixture();const media=f.host.view().media;assert.equal(media.title,'Original fixture');assert.equal(media.positionMs,2500);await f.host.media(media.token,'play');assert.equal(f.calls.at(-1).path,f.player);assert.equal(f.calls.at(-1).interface,'org.bluez.MediaPlayer1');assert.equal(f.calls.at(-1).member,'Play');assert.equal(f.host.view().media.status,'paused');await f.host.dispose();
});
test('stale player token and unsupported AVRCP control are rejected without fallback',async()=>{
 const f=await playingFixture();const token=f.host.view().media.token;f.setHandler(async r=>{if(r.member==='Next')throw Object.assign(Error('unsupported'),{name:'org.bluez.Error.NotSupported'});});await assert.rejects(f.host.media(token,'next'));assert.equal(f.host.view().media.controls.includes('next'),false);f.emit({[device]:{'org.bluez.Device1':{Adapter:adapter,Paired:true,Connected:true,UUIDs:[source]},'org.bluez.MediaControl1':{Connected:true,Player:device+'/player1'}}});const before=f.calls.length;await assert.rejects(f.host.media(token,'play'));assert.equal(f.calls.length,before);await f.host.dispose();
});
test('forget requires matching confirmation and refuses connected devices',async()=>{
 const f=fixture({canForget:()=>true});f.emit({[device]:{'org.bluez.Device1':{Adapter:adapter,Paired:true,Connected:false,UUIDs:[source]}}});f.host.requestForget(f.deviceId());const token=f.host.view().forget.token;await assert.rejects(f.host.confirmForget('wrong',true));assert.equal(f.calls.length,0);await f.host.confirmForget(token,false);assert.equal(f.calls.length,0);f.host.requestForget(f.deviceId());await f.host.confirmForget(f.host.view().forget.token,true);assert.equal(f.calls.at(-1).member,'RemoveDevice');assert.deepEqual(f.calls.at(-1).args,[device]);assert.equal(f.host.view().devices.length,1);f.emit({[device]:{'org.bluez.Device1':{Adapter:adapter,Paired:true,Connected:true}}});assert.throws(()=>f.host.requestForget(f.deviceId()));await f.host.dispose();
});
test('explicit pause still reaches the phone when saving pause intent fails',async()=>{
 const f=await playingFixture({onMediaIntent:async()=>{throw Error('disk full');}});f.emit({[f.player]:{'org.bluez.MediaPlayer1':{Device:device,Status:'playing'}}});await assert.rejects(f.host.media(f.host.view().media.token,'pause'));assert.equal(f.calls.at(-1).member,'Pause');await f.host.dispose();
});
test('forget is blocked if clearing remembered preference fails or idle state changes',async()=>{
 const f=fixture({canForget:()=>true,onForget:async()=>{throw Error('disk full');}});f.emit({[device]:{'org.bluez.Device1':{Adapter:adapter,Paired:true,Connected:false}}});f.host.requestForget(f.deviceId());await assert.rejects(f.host.confirmForget(f.host.view().forget.token,true));assert.equal(f.calls.some(x=>x.member==='RemoveDevice'),false);await f.host.dispose();
});
