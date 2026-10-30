import test from 'node:test';
import assert from 'node:assert/strict';
import {configuredPicture,filterPicture,pictureMarkup,applyPictureGeometry} from '../src/picture.mjs';
const session=(config,front='projection')=>({ready:true,state:{front:{main:front},sessions:{active:'carplay'},config}});
const cfg={projectionWidth:1920,projectionHeight:1080,projectionViewAreaTop:10,projectionViewAreaBottom:20,projectionViewAreaLeft:30,projectionViewAreaRight:40,wifiPassword:'private',cameraId:'private-camera'};
test('only synchronized active main projection supplies bounded configured picture metadata',()=>{
 const p=configuredPicture(session(cfg));assert.deepEqual(p,{width:1920,height:1080,insets:{top:10,bottom:20,left:30,right:40}});assert.doesNotMatch(JSON.stringify(p),/private|camera|ready|live/);
 for(const value of [{...session(cfg),ready:false},session(cfg,'camera'),session(cfg,'cluster'),{ready:true,state:{front:{main:'projection'},config:cfg,sessions:{active:null}}}])assert.equal(configuredPicture(value),null);
});
test('missing, malformed and unsupported geometry is unavailable without resolution or margin defaults',()=>{
 for(const config of [{},{...cfg,projectionWidth:0},{...cfg,projectionHeight:'1080'},{...cfg,projectionWidth:4097},{...cfg,projectionHeight:Infinity}])assert.equal(configuredPicture(session(config)),null);
 const onlySize=configuredPicture(session({projectionWidth:800,projectionHeight:480}));assert.deepEqual(onlySize,{width:800,height:480,insets:null});
 for(const extra of [{projectionViewAreaLeft:-1},{projectionViewAreaRight:1920},{projectionViewAreaTop:1080},{projectionViewAreaBottom:1.5}])assert.equal(configuredPicture(session({...cfg,...extra})).insets,null);
});
test('public geometry is filtered again without leaked extras or inherited values',()=>{
 const p=filterPicture({...configuredPicture(session(cfg)),cameraId:'secret',insets:{top:10,bottom:20,left:30,right:40,secret:true}},true,'projection');assert.deepEqual(p,configuredPicture(session(cfg)));
 assert.equal(filterPicture(p,false,'projection'),null);assert.equal(filterPicture(p,true,'camera'),null);assert.equal(filterPicture(Object.create(p),true,'projection'),null);
});
test('projection sizing uses validated DOM properties rather than CSP-blocked style attributes',()=>{
 const nodes=Object.fromEntries(['.native-picture',...['top','bottom','left','right'].map(side=>`.native-picture-mask.${side}`)].map(selector=>[selector,{style:{}}]));
 const root={querySelector:selector=>nodes[selector]};
 applyPictureGeometry(root,{width:800,height:480,insets:{top:24,bottom:0,left:80,right:0}});
 assert.equal(nodes['.native-picture'].style.width,'min(100cqw, calc(100cqh * 800 / 480))');
 assert.equal(nodes['.native-picture'].style.height,'min(100cqh, calc(100cqw * 480 / 800))');
 assert.equal(nodes['.native-picture-mask.top'].style.height,'5%');
 assert.equal(nodes['.native-picture-mask.left'].style.width,'10%');
 const html=pictureMarkup(configuredPicture(session(cfg)));assert.doesNotMatch(html,/style=/);assert.match(html,/native-picture-mask/);
 assert.match(pictureMarkup(null),/Phone display size unavailable/);
 const unchanged=JSON.stringify(nodes);applyPictureGeometry(root,{width:'bad',height:480});assert.equal(JSON.stringify(nodes),unchanged);
});
