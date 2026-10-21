import test from 'node:test';
import assert from 'node:assert/strict';
import {CoreSession} from '../src/session.mjs';
import {publicView} from '../src/view.mjs';
function fixture(){let now=0;const session=new CoreSession(()=>{},()=>now);let rev=0;
 const state={devices:[{id:'a',name:'Driver',status:'active',batteryLevel:73,batteryCharging:false,signalStrength:3,carrierName:'private'}],sessions:{active:'carplay'},nowPlaying:{title:'Track',artist:'Artist',playing:false,artwork:'private image',album:'private album'},config:{},front:{main:'livi'}};
 session.receive({type:'welcome',protocol:8,rev,state});
 return {session,view:()=>publicView(session),advance:ms=>now+=ms,patch:ops=>session.receive({type:'patch',rev:++rev,ops})};
}
test('home status exposes only verified nullable metadata and battery percentage',()=>{
 const f=fixture(), home=f.view().homeStatus;
 assert.equal(home.phone.batteryPercent,73);assert.equal(home.phone.charging,false);
 assert.equal(home.phone.signalLevel,null,'signal scale is not verified');
 assert.equal(home.media.title,'Track');assert.equal(home.media.playing,false);
 assert.equal(home.media.phoneId,'a');assert.equal(home.media.status,'available');
 assert.doesNotMatch(JSON.stringify(home),/private|artwork|carrier|album/);
});
test('unrelated patches and view reads do not refresh expired observations',()=>{
 const f=fixture();f.advance(30001);f.patch([{op:'set',path:['config','huVolume'],value:0.2}]);
 assert.equal(f.view().homeStatus.media.status,'stale');
 assert.equal(f.view().homeStatus.media.title,null);assert.equal(f.view().homeStatus.phone.batteryPercent,null);
 f.patch([{op:'set',path:['nowPlaying','title'],value:'Track'}]);
 assert.equal(f.view().homeStatus.media.status,'available');assert.equal(f.view().homeStatus.phone.status,'stale');
});
test('active-owner transition clears old metadata until a media observation for that owner',()=>{
 const f=fixture();f.patch([{op:'set',path:['devices'],value:[{id:'b',status:'active'}]}]);
 assert.equal(f.view().homeStatus.media.status,'unavailable');assert.equal(f.view().homeStatus.media.title,null);
 f.patch([{op:'set',path:['nowPlaying'],value:{title:'New owner',playing:true}}]);
 assert.equal(f.view().homeStatus.media.phoneId,'b');assert.equal(f.view().homeStatus.media.title,'New owner');
 f.session.close();assert.equal(f.view().homeStatus.media.status,'disconnected');
});
test('malformed values, ambiguous owners, and non-phone media are unavailable',()=>{
 const f=fixture();f.patch([{op:'set',path:['nowPlaying'],value:{title:{secret:'x'},artist:'x'.repeat(257),playing:'true'}},{op:'set',path:['devices'],value:[null,{id:'a',status:'active',batteryLevel:101,batteryCharging:'yes'}]}]);
 let home=f.view().homeStatus;assert.equal(home.phone.batteryPercent,null);assert.equal(home.phone.charging,null);assert.equal(home.media.title,null);assert.equal(home.media.playing,null);
 f.patch([{op:'set',path:['devices'],value:[{id:'a',status:'active'},{id:'b',status:'active'}]}]);
 assert.equal(f.view().homeStatus.media.status,'unavailable');
 f.patch([{op:'set',path:['devices'],value:[{id:'a',status:'active'}]},{op:'set',path:['nowPlaying'],value:{title:'Radio',playing:true}},{op:'set',path:['dab'],value:{active:true}}]);
 assert.equal(f.view().homeStatus.media.status,'unavailable');
});

test('partial media update for a new owner cannot relabel previous owner fields',()=>{
 const f=fixture();f.patch([{op:'set',path:['devices'],value:[{id:'b',status:'active'}]}]);
 f.patch([{op:'set',path:['nowPlaying','playing'],value:true}]);
 assert.equal(f.view().homeStatus.media.playing,true);
 assert.equal(f.view().homeStatus.media.title,null);
 assert.equal(f.view().homeStatus.media.artist,null);
 f.patch([{op:'set',path:['nowPlaying','title'],value:'B track'}]);
 assert.equal(f.view().homeStatus.media.title,'B track');assert.equal(f.view().homeStatus.media.artist,null);
});

test('data never supplied remains unavailable after the observation window',()=>{
 const f=fixture();f.patch([{op:'set',path:['devices'],value:[{id:'a',status:'active'}]},{op:'set',path:['nowPlaying'],value:{title:null,artist:null,playing:null}}]);
 f.advance(30001);
 assert.equal(f.view().homeStatus.phone.status,'unavailable');
 assert.equal(f.view().homeStatus.media.status,'unavailable');
});
