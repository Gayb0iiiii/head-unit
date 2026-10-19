export const MAX_FRAME=16<<20;
export function encode(message){const body=Buffer.from(JSON.stringify(message),'utf8');if(!body.length||body.length>MAX_FRAME)throw Error('Invalid frame size');const header=Buffer.alloc(4);header.writeUInt32LE(body.length);return Buffer.concat([header,body]);}
/** Fail-closed decoder: caller drops the connection after malformed input. */
export class Decoder{
 constructor(){this.buffer=Buffer.alloc(0);}
 push(chunk){this.buffer=Buffer.concat([this.buffer,chunk]);const messages=[];while(this.buffer.length>=4){const size=this.buffer.readUInt32LE(0);if(!size||size>MAX_FRAME){this.buffer=Buffer.alloc(0);throw Error('Invalid frame size');}if(this.buffer.length<4+size)break;const body=this.buffer.subarray(4,4+size);this.buffer=this.buffer.subarray(4+size);messages.push(JSON.parse(body.toString('utf8')));}return messages;}
}
