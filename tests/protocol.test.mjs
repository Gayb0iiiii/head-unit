import test from 'node:test';
import assert from 'node:assert/strict';
import {encode,Decoder} from '../src/protocol.mjs';
test('encodes byte length in little-endian, including Unicode',()=>{const value={text:'📱'};const bytes=encode(value);assert.equal(bytes.readUInt32LE(0),Buffer.byteLength(JSON.stringify(value)));assert.deepEqual(new Decoder().push(bytes),[value]);});
test('decodes fragmented and coalesced frames in order',()=>{const bytes=Buffer.concat([encode({a:1}),encode({a:2})]);const d=new Decoder();assert.deepEqual(d.push(bytes.subarray(0,2)),[]);assert.deepEqual(d.push(bytes.subarray(2,9)),[]);assert.deepEqual(d.push(bytes.subarray(9)),[{a:1},{a:2}]);});
test('rejects zero and oversized frames before buffering payload',()=>{for(const n of [0,16*1024*1024+1]){const frame=Buffer.alloc(4);frame.writeUInt32LE(n);assert.throws(()=>new Decoder().push(frame));}});
test('rejects malformed JSON and encoder oversize',()=>{assert.throws(()=>new Decoder().push(Buffer.from([1,0,0,0,123])));assert.throws(()=>encode({a:'a'.repeat(16*1024*1024)}));});
