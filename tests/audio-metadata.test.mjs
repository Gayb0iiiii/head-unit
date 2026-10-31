import test from 'node:test';
import assert from 'node:assert/strict';
import {readAudioMetadata} from '../src/audio-metadata.mjs';
const frame=(id,text)=>{const content=Buffer.concat([Buffer.from([3]),Buffer.from(text)]),header=Buffer.alloc(10);header.write(id);header.writeUInt32BE(content.length,4);return Buffer.concat([header,content]);};
const tagged=(frames)=>{const body=Buffer.concat(frames),header=Buffer.from([73,68,51,3,0,0,0,0,0,0]);let n=body.length;for(let i=9;i>=6;i--){header[i]=n&127;n>>=7;}return new Blob([header,body]);};
test('reads ID3 title, artist and album without network lookups',async()=>{
 assert.deepEqual(await readAudioMetadata(tagged([frame('TIT2','Road'),frame('TPE1','Asher'),frame('TALB','Driving')])) ,{title:'Road',artist:'Asher',album:'Driving'});
});
test('unsupported, truncated and oversized tag data safely fall back',async()=>{
 assert.deepEqual(await readAudioMetadata(new Blob(['not tags'])),{});
 assert.deepEqual(await readAudioMetadata(new Blob([Buffer.from([73,68,51,3,0,0,127,127,127,127])])),{});
 assert.deepEqual(await readAudioMetadata(tagged([Buffer.from('TIT2')])),{});
});
test('only bounded PNG/JPEG embedded pictures are accepted',async()=>{
 const png=Buffer.from([137,80,78,71,13,10,26,10]);
 const picture=(mime,data)=>{const content=Buffer.concat([Buffer.from([0]),Buffer.from(mime),Buffer.from([0,3,0]),data]),header=Buffer.alloc(10);header.write('APIC');header.writeUInt32BE(content.length,4);return Buffer.concat([header,content]);};
 assert.equal((await readAudioMetadata(tagged([picture('image/png',png)]))).artwork,'data:image/png;base64,iVBORw0KGgo=');
 assert.deepEqual(await readAudioMetadata(tagged([picture('image/svg+xml',Buffer.from('<svg/>'))])),{});
});
test('reads FLAC Vorbis title artist and album',async()=>{
 const fields=['TITLE=Road','ARTIST=Asher','ALBUM=Driving'];const count=Buffer.alloc(4);count.writeUInt32LE(fields.length);const data=Buffer.concat([Buffer.alloc(4),count,...fields.flatMap(text=>{const b=Buffer.from(text),size=Buffer.alloc(4);size.writeUInt32LE(b.length);return [size,b];})]);
 const header=Buffer.from([132,0,0,data.length]);
 assert.deepEqual(await readAudioMetadata(new Blob(['fLaC',header,data])),{title:'Road',artist:'Asher',album:'Driving'});
});
