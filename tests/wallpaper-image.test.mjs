import test from 'node:test';
import assert from 'node:assert/strict';
import {validateWallpaperDataUrl,readWallpaperFile} from '../src/wallpaper-image.mjs';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/uXcAAAAASUVORK5CYII=';
test('wallpaper image rejects active, external, malformed, and oversized content',()=>{
 assert.equal(validateWallpaperDataUrl(png),png);
 for(const value of ['https://example.com/a.png','data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=','data:image/png;base64,AAAA','data:image/png;base64,'+'A'.repeat(1400000)])assert.throws(()=>validateWallpaperDataUrl(value));
});
test('local wallpaper file is bounded, decoded, and cannot persist dimensions beyond limit',async()=>{
 const bytes=Uint8Array.from(Buffer.from(png.split(',')[1],'base64'));
 bytes.set([0,0,3,32,0,0,2,88],16); // PNG header claims 800×600; decoder is injected below.
 const file={size:bytes.length,arrayBuffer:async()=>bytes.buffer};
 const imported=`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
 const readDataUrl=async()=>imported;
 assert.equal(await readWallpaperFile(file,{decodeImage:async()=>({width:800,height:600,close(){}}),readDataUrl}),imported);
 await assert.rejects(readWallpaperFile(file,{decodeImage:async()=>({width:8192,height:1080,close(){}}),readDataUrl}));
 await assert.rejects(readWallpaperFile({size:1100000,arrayBuffer:async()=>bytes.buffer},{decodeImage:async()=>({width:1,height:1}),readDataUrl}));
 const bomb=bytes.slice();bomb.set([0,1,0,0,0,1,0,0],16);
 let decoded=false;await assert.rejects(readWallpaperFile({size:bomb.length,arrayBuffer:async()=>bomb.buffer},{decodeImage:async()=>{decoded=true;return {width:1,height:1};},readDataUrl}));assert.equal(decoded,false);
});
test('lossy WebP dimensions use little-endian frame fields',async()=>{
 const bytes=Uint8Array.from([82,73,70,70,22,0,0,0,87,69,66,80,86,80,56,32,10,0,0,0,176,105,0,157,1,42,32,3,88,2]);
 const data=`data:image/webp;base64,${Buffer.from(bytes).toString('base64')}`;
 const file={size:bytes.length,arrayBuffer:async()=>bytes.buffer};
 assert.equal(await readWallpaperFile(file,{decodeImage:async()=>({width:800,height:600,close(){}}),readDataUrl:async()=>data}),data);
});
