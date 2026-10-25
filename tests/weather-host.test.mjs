import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchWeatherJSON,weatherCache} from '../electron/weather-host.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const response=chunks=>({ok:true,status:200,body:{getReader(){let i=0;return {read:async()=>i<chunks.length?{done:false,value:chunks[i++]}:{done:true},cancel:async()=>{}};}}});

test('weather transport accepts only fixed Open-Meteo HTTPS hosts and bounded JSON',async()=>{
  const calls=[];const fetchImpl=async(url,options)=>{calls.push([url,options]);return response([new TextEncoder().encode('{"results":[]}')]);};
  assert.deepEqual(await fetchWeatherJSON(new URL('https://geocoding-api.open-meteo.com/v1/search?name=Albany'),undefined,{fetchImpl}),{results:[]});
  assert.equal(calls[0][1].redirect,'error');
  await assert.rejects(()=>fetchWeatherJSON(new URL('https://evil.test/'),undefined,{fetchImpl}),/host/i);
  await assert.rejects(()=>fetchWeatherJSON(new URL('http://api.open-meteo.com/v1/forecast'),undefined,{fetchImpl}),/host/i);
  assert.equal(calls.length,1);
});

test('weather transport rejects oversized or unsuccessful replies before parsing',async()=>{
  await assert.rejects(()=>fetchWeatherJSON(new URL('https://api.open-meteo.com/v1/forecast'),undefined,{fetchImpl:async()=>response([new Uint8Array(65537)])}),/large/i);
  await assert.rejects(()=>fetchWeatherJSON(new URL('https://api.open-meteo.com/v1/forecast'),undefined,{fetchImpl:async()=>({ok:false,status:503})}),/unavailable/i);
});
test('oversized on-disk cache is ignored before JSON parsing',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'headunit-weather-test-'));
  try{
    const file=path.join(directory,'weather.json');await writeFile(file,JSON.stringify({pad:'x'.repeat(65537)}));
    assert.equal(await weatherCache(file).read(),null);
  }finally{await rm(directory,{recursive:true,force:true});}
});
