import {emptyHomeStatus} from '../src/home-status.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {publicView} from '../src/view.mjs';
test('UI projection omits secrets, telemetry, and personal metadata',()=>{const v=publicView({ready:true,state:{front:{main:'projection'},sessions:{active:'carplay',position:1,total:2},devices:[{id:'a',name:'Phone',status:'active',carrierName:'Private carrier'}],config:{wifiPassword:'secret',huVolume:.4},telemetry:{location:'private'}}});assert.deepEqual(v,{homeStatus:emptyHomeStatus(),connected:true,front:'projection',phones:[{id:'a',name:'Phone',status:'active'}],volume:.4});assert.doesNotMatch(JSON.stringify(v),/secret|carrier|private/);});
test('desynchronized core exposes disconnected state, not stale phone data',()=>{assert.deepEqual(publicView({ready:false,state:{devices:[{name:'stale'}]}}),{homeStatus:emptyHomeStatus('disconnected'),connected:false,front:'livi',phones:[],volume:null});});
test('sanitized front truthfully reports native camera and cluster ownership',()=>{for(const front of ['camera','cluster'])assert.equal(publicView({ready:true,state:{front:{main:front},devices:[],config:{}}}).front,front);});
test('configured projection geometry crosses the public view without raw config and disappears on takeover',()=>{
 const session={ready:true,state:{front:{main:'projection'},sessions:{active:'carplay'},config:{projectionWidth:800,projectionHeight:480,cameraId:'secret',wifiPassword:'secret'}}};
 assert.deepEqual(publicView(session).picture,{width:800,height:480,insets:null});session.state.front.main='camera';assert.equal(publicView(session).picture,undefined);session.state.front.main='projection';session.ready=false;assert.equal(publicView(session).picture,undefined);
});
