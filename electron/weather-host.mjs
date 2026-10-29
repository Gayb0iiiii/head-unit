import {readFile,writeFile,rename,unlink,mkdir,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {get as httpsGet} from 'node:https';
import {Readable} from 'node:stream';
import path from 'node:path';

const endpoints=new Set(['https://geocoding-api.open-meteo.com/v1/search','https://api.open-meteo.com/v1/forecast']);
const limit=65536;

// The Pi's Node 22 fetch can stall during dual-stack connection setup even
// when HTTPS over IPv4 is available. Keep this request local to the host and
// try IPv6 only when IPv4 cannot be reached.
function fetchHTTPS(url,{signal,headers}={}){
  return new Promise((resolve,reject)=>{
    const attempt=family=>{
      const request=httpsGet(url,{family,signal,headers},response=>{
        const status=response.statusCode??0;
        if(status<200||status>=300){response.destroy();resolve({ok:false,status});return;}
        resolve({ok:true,status,body:Readable.toWeb(response)});
      });
      request.on('error',error=>{
        if(family===4&&!signal?.aborted&&['ENOTFOUND','EAI_AGAIN','EADDRNOTAVAIL','ENETUNREACH'].includes(error.code))attempt(6);
        else reject(error);
      });
    };
    attempt(4);
  });
}

/** Fixed-provider, small, time-bounded HTTPS JSON read. No renderer URL crosses this boundary. */
export async function fetchWeatherJSON(url,signal,{fetchImpl=fetchHTTPS}={}){
  if(!(url instanceof URL)||!endpoints.has(url.origin+url.pathname)||url.username||url.password||url.hash)throw TypeError('Weather host unavailable');
  const timeout=AbortSignal.timeout(8000);
  const boundedSignal=signal?AbortSignal.any([signal,timeout]):timeout;
  const reply=await fetchImpl(url.href,{signal:boundedSignal,redirect:'error',headers:{Accept:'application/json'},cache:'no-store'});
  if(!reply?.ok||!reply.body?.getReader)throw Error('Weather unavailable');
  const reader=reply.body.getReader(),chunks=[];let size=0;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      if(!(value instanceof Uint8Array))throw Error('Invalid weather reply');
      size+=value.byteLength;if(size>limit)throw Error('Weather reply too large');
      chunks.push(value);
    }
  }catch(error){try{await reader.cancel();}catch{}throw error;}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}

/** Host-owned cache path. A malformed or unreadable file is ignored by the service. */
export function weatherCache(file){
  if(typeof file!=='string'||!path.isAbsolute(file))throw TypeError('Absolute weather cache path required');
  return {
    async read(){try{if((await stat(file)).size>limit)return null;const data=await readFile(file);return data.byteLength<=limit?JSON.parse(data.toString('utf8')):null;}catch{return null;}},
    async write(value){
      await mkdir(path.dirname(file),{recursive:true,mode:0o700});
      const temp=`${file}.${randomUUID()}.tmp`;
      try{await writeFile(temp,JSON.stringify(value),{mode:0o600,flag:'wx'});await rename(temp,file);}
      catch(error){try{await unlink(temp);}catch{}throw error;}
    },
  };
}
