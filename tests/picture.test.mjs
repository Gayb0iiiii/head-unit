import test from 'node:test';
import assert from 'node:assert/strict';
import {configuredPicture,filterPicture,pictureMarkup} from '../src/picture.mjs';
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
test('projection layout uses the pinned centered contain formula and bounded view-area masks',()=>{
 const html=pictureMarkup(configuredPicture(session(cfg)));
 assert.match(html,/min\(100cqw, calc\(100cqh \* 1920 \/ 1080\)\)/);assert.match(html,/min\(100cqh, calc\(100cqw \* 1080 \/ 1920\)\)/);assert.match(html,/native-picture-mask/);
 assert.doesNotMatch(pictureMarkup(null),/native-picture-mask|min\(100cq/);assert.match(pictureMarkup(null),/Picture geometry unavailable/);
 const portrait=pictureMarkup({width:600,height:1000,insets:null});assert.match(portrait,/100cqh \* 600 \/ 1000/);assert.doesNotMatch(portrait,/native-picture-mask/);
});
