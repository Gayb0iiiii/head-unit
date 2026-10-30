import test from 'node:test';
import assert from 'node:assert/strict';
import {renderLocalAudio} from '../src/local-audio-view.mjs';
const audio={tracks:[],queue:[],index:-1,favourites:new Set(),repeat:'off',shuffle:false,playing:false,message:'',media:null};
test('empty library offers local imports and disables playback and seek',()=>{
 const html=renderLocalAudio(audio,{});assert.match(html,/Add files/);assert.match(html,/Add folder/);assert.match(html,/data-local="play"[^>]*disabled/);assert.match(html,/id="local-seek"[^>]*disabled/);
});
test('library escapes filenames and filters search and favourites',()=>{
 const a={...audio,tracks:[{id:'a',title:'<song>',folder:'Album',format:'WAV'},{id:'b',title:'Other',folder:'Else',format:'FLAC'}],favourites:new Set(['a'])};
 const html=renderLocalAudio(a,{query:'album',tab:'library'});assert.match(html,/&lt;song&gt;/);assert.doesNotMatch(html,/>Other</);
 assert.doesNotMatch(renderLocalAudio(a,{tab:'favourites'}),/>Other</);
});
test('moving state locks library management but leaves transport controls',()=>{
 const html=renderLocalAudio(audio,{moving:true});assert.match(html,/data-local-files[^>]*disabled/);assert.match(html,/data-local-search[^>]*disabled/);assert.match(html,/Park to browse/);
});
test('library groups embedded albums/artists and keeps untagged files honest',()=>{
 const a={...audio,tracks:[{id:'a',title:'Road',artist:'Asher',album:'Drives',folder:'USB',format:'MP3'},{id:'b',title:'Other',folder:'USB',format:'WAV'}]};
 assert.match(renderLocalAudio(a,{group:'artist'}),/Asher/);assert.match(renderLocalAudio(a,{group:'artist'}),/Unknown artist/);
 assert.match(renderLocalAudio(a,{group:'album'}),/Drives/);assert.match(renderLocalAudio(a,{group:'folder'}),/USB/);
 assert.doesNotMatch(renderLocalAudio(a,{group:'artist',groupValue:'Asher'}),/>Other</);
});
