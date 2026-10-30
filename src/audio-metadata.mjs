// Bounded, best-effort tags. Unsupported tag versions/flags keep filename fallbacks.
const limit=1024*1024;
const text=(bytes,encoding='utf-8')=>new TextDecoder(encoding).decode(bytes).replace(/\0/g,'').trim().slice(0,256);
const picture=(mime,bytes)=>{
 if(bytes.length>256*1024)return null;
 const png=mime==='image/png'&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b);
 const jpeg=mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(!png&&!jpeg)return null;
 let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
 return `data:${mime};base64,${btoa(binary)}`;
};
export function readAudioMetadata(file){return (async()=>{
 const out={};try{
 const bytes=new Uint8Array(await file.slice(0,limit).arrayBuffer());const view=new DataView(bytes.buffer);
 const be=offset=>view.getUint32(offset);const le=offset=>view.getUint32(offset,true);
 const sync=offset=>{if(bytes.slice(offset,offset+4).some(b=>b>127))throw Error('Invalid tag');return (bytes[offset]<<21)|(bytes[offset+1]<<14)|(bytes[offset+2]<<7)|bytes[offset+3];};
 const signature=text(bytes.slice(0,4));
 if(signature.startsWith('ID3')&&[3,4].includes(bytes[3])&&bytes[5]===0){
   const end=10+sync(6);if(end>bytes.length)return out;
   for(let offset=10;offset+10<=end;){
     const id=text(bytes.slice(offset,offset+4));const size=bytes[3]===4?sync(offset+4):be(offset+4);
     if(!size||offset+10+size>end)break;
     const flags=bytes[offset+8]|bytes[offset+9];const data=bytes.slice(offset+10,offset+10+size);offset+=10+size;if(flags)continue;
     const field={TIT2:'title',TPE1:'artist',TALB:'album'}[id];
     if(field&&[0,1,2,3].includes(data[0])){const value=text(data.slice(1),['windows-1252','utf-16','utf-16be','utf-8'][data[0]]);if(value)out[field]=value;}
     if(id==='APIC'&&[0,3].includes(data[0])){
       const mimeEnd=data.indexOf(0,1);if(mimeEnd<0)continue;const descriptionEnd=data.indexOf(0,mimeEnd+2);if(descriptionEnd<0)continue;
       const art=picture(text(data.slice(1,mimeEnd)),data.slice(descriptionEnd+1));if(art)out.artwork=art;
     }
   }
 }else if(signature==='fLaC'){
   for(let offset=4;offset+4<=bytes.length;){
     const kind=bytes[offset]&127,last=!!(bytes[offset]&128),size=(bytes[offset+1]<<16)|(bytes[offset+2]<<8)|bytes[offset+3];offset+=4;const end=offset+size;if(end>bytes.length)break;
     if(kind===4){let pos=offset;const vendorSize=le(pos);pos+=4+vendorSize;if(pos+4>end)break;const count=le(pos);pos+=4;
       for(let i=0;i<Math.min(count,256)&&pos+4<=end;i++){const length=le(pos);pos+=4;if(pos+length>end)break;const value=text(bytes.slice(pos,pos+length));pos+=length;const split=value.indexOf('=');const field={TITLE:'title',ARTIST:'artist',ALBUM:'album'}[value.slice(0,split).toUpperCase()];if(field)out[field]=value.slice(split+1);}
     }
     if(kind===6){let pos=offset+4;const mimeLength=be(pos);pos+=4;const mime=text(bytes.slice(pos,pos+mimeLength));pos+=mimeLength;const descriptionLength=be(pos);pos+=4+descriptionLength+16;const length=be(pos);pos+=4;if(pos+length<=end){const art=picture(mime,bytes.slice(pos,pos+length));if(art)out.artwork=art;}}
     offset=end;if(last)break;
   }
 }
 }catch{/* Truncated or unsupported metadata never blocks file playback. */}return out;
})();}
