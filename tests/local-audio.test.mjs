import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalAudio, describeFile} from '../src/local-audio.mjs';
class Media extends EventTarget {
  paused=true; currentTime=0; duration=120; src='';
  async play(){this.paused=false;this.dispatchEvent(new Event('play'));}
  pause(){this.paused=true;this.dispatchEvent(new Event('pause'));}
  load(){} removeAttribute(){this.src='';}
}
function setup(saved={}){
 const media=new Media(), rows=new Map(), prefs={...saved}, revoked=[];
 const store={list:async()=>[...rows.values()].map(({blob,...row})=>row),put:async row=>rows.set(row.id,row),get:async id=>rows.get(id),remove:async id=>rows.delete(id)};
 const storage={getItem:()=>JSON.stringify(prefs.value??{}),setItem:(_k,v)=>prefs.value=JSON.parse(v)};
 const audio=new LocalAudio({media,store,storage,urls:{createObjectURL:()=>`blob:${rows.size}`,revokeObjectURL:url=>revoked.push(url)},random:()=>0});
 return {audio,media,rows,prefs,revoked};
}
const file=(name)=>new File(['audio'],name,{type:'audio/wav',lastModified:1});
test('import retains playable files, deduplicates and reports unsupported input without autoplay',async()=>{
 const {audio,rows,media}=setup();await audio.ready;
 await audio.importFiles([file('One.wav'),file('Two.flac'),file('notes.txt'),file('One.wav')]);
 assert.equal(rows.size,2);assert.equal(audio.tracks.length,2);assert.equal(media.paused,true);assert.equal(audio.queue.length,0);
 assert.match(audio.message,/1 unsupported/);
 assert.equal(describeFile(file('notes.txt')),null);
});
test('queue follows explicit order, repeats only when requested, and stops at its end',async()=>{
 const {audio,media}=setup();await audio.ready;await audio.importFiles([file('One.wav'),file('Two.wav')]);
 await audio.playTrack(audio.tracks[0].id);audio.enqueue(audio.tracks[1].id);
 await audio.next();assert.equal(audio.current.title,'Two');
 await audio.next(true);assert.equal(media.paused,true);assert.equal(audio.current.title,'Two');
 audio.repeat='all';await audio.next(true);assert.equal(audio.current.title,'One');
 audio.repeat='one';await audio.next(true);assert.equal(audio.current.title,'One');
 await audio.next();assert.equal(audio.current.title,'Two');
});
test('queue reorder/remove preserve current item and previous restarts after three seconds',async()=>{
 const {audio,media}=setup();await audio.ready;await audio.importFiles([file('A.wav'),file('B.wav'),file('C.wav')]);
 await audio.playTrack(audio.tracks[1].id);audio.enqueue(audio.tracks[0].id);audio.enqueue(audio.tracks[2].id);
 audio.move(2,-1);assert.deepEqual(audio.queue.map(id=>audio.tracks.find(t=>t.id===id).title),['B','C','A']);
 audio.removeQueued(1);assert.equal(audio.current.title,'B');
 media.currentTime=9;await audio.previous();assert.equal(media.currentTime,0);
 await audio.next();await audio.previous();assert.equal(audio.current.title,'B');
});
test('saved queue and favourites restore paused without loading media',async()=>{
 const {audio,prefs,media}=setup();await audio.ready;await audio.importFiles([file('A.wav')]);
 await audio.playTrack(audio.tracks[0].id);audio.favourite(audio.current.id);audio.pause();
 const restored=new LocalAudio({media:new Media(),store:audio.store,storage:{getItem:()=>JSON.stringify(prefs.value)},urls:{}});await restored.ready;
 assert.equal(restored.current.title,'A');assert.equal(restored.favourites.has(restored.current.id),true);assert.equal(restored.media.src,'');assert.equal(media.paused,true);
});
test('removing current file stops playback and removes all queue references',async()=>{
 const {audio,media,revoked}=setup();await audio.ready;await audio.importFiles([file('A.wav')]);
 await audio.playTrack(audio.tracks[0].id);audio.enqueue(audio.current.id);await audio.removeTrack(audio.current.id);
 assert.equal(media.paused,true);assert.equal(audio.queue.length,0);assert.equal(audio.tracks.length,0);assert.equal(revoked.length,1);
});
test('seek clamps to real duration and playback errors are actionable',async()=>{
 const {audio,media}=setup();await audio.ready;await audio.importFiles([file('A.wav')]);await audio.playTrack(audio.tracks[0].id);
 audio.seek(900);assert.equal(media.currentTime,120);audio.seek(-3);assert.equal(media.currentTime,0);
 media.play=async()=>{throw Error('decoder');};audio.pause();await audio.play();assert.equal(media.paused,true);assert.match(audio.message,/Cannot play/);
});
test('late file load cannot restart after pause or replace a newer selection',async()=>{
 const {audio,media}=setup();await audio.ready;await audio.importFiles([file('A.wav'),file('B.wav')]);
 const get=audio.store.get;let release;audio.store.get=id=>new Promise(resolve=>{release=async()=>resolve(await get(id));});
 const pending=audio.playTrack(audio.tracks[0].id);audio.pause();await release();await pending;assert.equal(media.paused,true);assert.equal(media.src,'');
});
test('shuffle selects a different track and storage failure is visible',async()=>{
 const {audio}=setup();await audio.ready;await audio.importFiles([file('A.wav'),file('B.wav')]);await audio.playTrack(audio.tracks[0].id);audio.enqueue(audio.tracks[1].id);audio.shuffle=true;await audio.next();assert.equal(audio.current.title,'B');
 audio.store.put=async()=>{throw Error('quota');};await audio.importFiles([file('C.wav')]);assert.equal(audio.tracks.length,2);assert.match(audio.message,/storage/i);
});
test('saved position restores only after an explicit play and loaded metadata',async()=>{
 const {audio,prefs,media}=setup();await audio.ready;await audio.importFiles([file('A.wav')]);await audio.playTrack(audio.tracks[0].id);media.currentTime=42;audio.pause();
 const output=new Media(), restored=new LocalAudio({media:output,store:audio.store,storage:{getItem:()=>JSON.stringify(prefs.value)},urls:{createObjectURL:()=> 'blob:saved',revokeObjectURL:()=>{}}});await restored.ready;
 assert.equal(output.paused,true);assert.equal(output.src,'');await restored.play();output.dispatchEvent(new Event('loadedmetadata'));assert.equal(output.currentTime,42);
});
test('import waits for initial library restore so existing tracks cannot be lost',async()=>{
 const {audio}=setup();await audio.ready;await audio.importFiles([file('Old.wav')]);let finish;
 const store={...audio.store,list:()=>new Promise(resolve=>{finish=()=>resolve([...audio.tracks]);})};
 const fresh=new LocalAudio({media:new Media(),store});const importing=fresh.importFiles([file('New.wav')]);await new Promise(resolve=>setImmediate(resolve));finish();await importing;await fresh.ready;
 assert.deepEqual(fresh.tracks.map(t=>t.title),['Old','New']);
});
test('native ownership denies playback including a takeover during file loading',async()=>{
 const {audio,media}=setup();await audio.ready;await audio.importFiles([file('A.wav')]);let allowed=true;audio.canPlay=()=>allowed;
 const get=audio.store.get;audio.store.get=async id=>{allowed=false;return get(id);};await audio.playTrack(audio.tracks[0].id);assert.equal(media.paused,true);assert.match(audio.message,/phone audio|display/i);
});
test('a duplicate queued file starts at the beginning when selected',async()=>{
 const {audio,media}=setup();await audio.ready;await audio.importFiles([file('A.wav')]);await audio.playTrack(audio.tracks[0].id);audio.enqueue(audio.current.id);media.currentTime=44;await audio.next();assert.equal(media.currentTime,0);
});
test('paused seeks save immediately for restart continuity',async()=>{
 const {audio,media,prefs}=setup();await audio.ready;await audio.importFiles([file('A.wav')]);await audio.playTrack(audio.tracks[0].id);audio.pause();audio.seek(37);
 assert.equal(media.paused,true);assert.equal(prefs.value.position,37);
});
test('reimport repairs a missing stored blob without losing favourites or queue',async()=>{
 const {audio,rows}=setup();await audio.ready;const input=file('A.wav');await audio.importFiles([input]);const id=audio.tracks[0].id;audio.enqueue(id);audio.favourite(id);
 rows.set(id,{...rows.get(id),blob:undefined});await audio.play();assert.match(audio.message,/Cannot play/);
 await audio.importFiles([input]);assert.ok(rows.get(id).blob);assert.equal(audio.tracks.length,1);assert.deepEqual(audio.queue,[id]);assert.equal(audio.favourites.has(id),true);await audio.play();assert.equal(audio.playing,true);
});
