import test from 'node:test';
import assert from 'node:assert/strict';
import {createWeatherService} from '../electron/weather-service.mjs';

const albany={id:123,name:'Albany',admin1:'Western Australia',country_code:'AU',latitude:-35,longitude:117.9};
const other={id:456,name:'Albany',admin1:'New South Wales',country_code:'AU',latitude:-33,longitude:151};
const forecast=time=>({current:{time:Math.floor(time/1000)-900,temperature_2m:18.4,apparent_temperature:17.1,weather_code:2,is_day:1,wind_speed_10m:14.3}});

test('initial location is resolved from Albany WA geocoding results, never invented coordinates',async()=>{
  const now=Date.UTC(2026,9,25,8);const urls=[];
  const service=createWeatherService({now:()=>now,readCache:async()=>null,writeCache:async()=>{},fetchJSON:async url=>{
    urls.push(url);
    return url.hostname==='geocoding-api.open-meteo.com'?{results:[other,albany]}:forecast(now);
  }});
  await service.refresh();
  assert.match(urls[0].href,/name=Albany/);
  assert.match(urls[0].href,/countryCode=AU/);
  assert.equal(urls[1].searchParams.get('latitude'),String(albany.latitude));
  assert.equal(service.snapshot().location.label,'Albany, Western Australia');
  assert.equal(service.snapshot().temperatureC,18.4);
  assert.equal(service.snapshot().status,'current');
  service.dispose();
});

test('failed refresh retains dated saved weather and never reports it as current',async()=>{
  let now=Date.UTC(2026,9,25,8),failure=false,saved;
  const service=createWeatherService({now:()=>now,readCache:async()=>saved,writeCache:async value=>{saved=value;},fetchJSON:async url=>{
    if(failure)throw Error('offline');return url.hostname==='geocoding-api.open-meteo.com'?{results:[albany]}:forecast(now);
  }});
  await service.refresh();const original=service.snapshot();
  now+=20*60*1000;failure=true;await service.refresh();
  assert.equal(service.snapshot().status,'stale');
  assert.equal(service.snapshot().fetchedAt,original.fetchedAt);
  assert.equal(service.snapshot().temperatureC,18.4);
  service.dispose();
});

test('manual city search exposes bounded candidates and selection uses only a returned ID',async()=>{
  const now=Date.UTC(2026,9,25,8);let saved;
  const service=createWeatherService({now:()=>now,readCache:async()=>null,writeCache:async value=>{saved=value;},fetchJSON:async url=>
    url.hostname==='geocoding-api.open-meteo.com'?{results:[albany,other]}:forecast(now)});
  const found=await service.search('Albany');
  assert.deepEqual(found.map(x=>x.id),[123,456]);
  assert.equal('latitude' in found[0],false);
  await assert.rejects(()=>service.select(999));
  await service.select(123);
  assert.equal(saved.location.id,123);
  assert.equal(service.snapshot().location.label,'Albany, Western Australia');
  service.dispose();
});

test('weather rejects invalid network values and leaves no fabricated reading',async()=>{
  const now=Date.UTC(2026,9,25,8);
  const service=createWeatherService({now:()=>now,readCache:async()=>null,writeCache:async()=>{},fetchJSON:async url=>
    url.hostname==='geocoding-api.open-meteo.com'?{results:[albany]}:{current:{...forecast(now).current,temperature_2m:Infinity}}});
  await service.refresh();
  assert.equal(service.snapshot().status,'unavailable');
  assert.equal(service.snapshot().temperatureC,null);
  service.dispose();
});
test('location selection reports storage failure rather than claiming persistence',async()=>{
  const now=Date.UTC(2026,9,25,8);
  const service=createWeatherService({now:()=>now,readCache:async()=>null,writeCache:async()=>{throw Error('read-only');},fetchJSON:async url=>url.hostname==='geocoding-api.open-meteo.com'?{results:[albany]}:forecast(now)});
  await service.search('Albany');await service.select(123);
  assert.equal(service.snapshot().persistenceError,true);
  service.dispose();
});
test('restart treats a disk reading as earlier weather until a fresh fetch succeeds',async()=>{
  const now=Date.UTC(2026,9,25,8),saved={location:{...albany,countryCode:'AU',label:'Albany, Western Australia'},weather:{temperatureC:18.4,apparentC:17.1,windKmh:14.3,weatherCode:2,isDay:true,observedAt:now-900000,fetchedAt:now-600000}};
  let release;const service=createWeatherService({now:()=>now,readCache:async()=>saved,writeCache:async()=>{},fetchJSON:()=>new Promise(resolve=>{release=resolve;})});
  const pending=service.refresh();await new Promise(setImmediate);
  assert.equal(service.snapshot().status,'stale');
  assert.equal(service.snapshot().temperatureC,18.4);
  release(forecast(now));await pending;
  service.dispose();
});
test('failed city search invalidates previous choices',async()=>{
  const now=Date.UTC(2026,9,25,8);let fail=false;
  const service=createWeatherService({now:()=>now,readCache:async()=>null,writeCache:async()=>{},fetchJSON:async url=>{if(fail)throw Error('offline');return url.hostname==='geocoding-api.open-meteo.com'?{results:[albany]}:forecast(now);}});
  await service.search('Albany');fail=true;
  await assert.rejects(()=>service.search('Perth'));
  await assert.rejects(()=>service.select(123));service.dispose();
});
test('manual wall-clock rollback cannot make an old reading current again',async()=>{
  let now=Date.UTC(2026,9,25,8),steady=0;
  const service=createWeatherService({now:()=>now,steadyNow:()=>steady,readCache:async()=>null,writeCache:async()=>{},fetchJSON:async url=>url.hostname==='geocoding-api.open-meteo.com'?{results:[albany]}:forecast(now)});
  await service.refresh();assert.equal(service.snapshot().status,'current');
  now-=2*3600000;steady+=31*60000;
  assert.equal(service.snapshot().status,'stale');service.dispose();
});
test('a newly fetched three-hour-old observation is earlier weather, never current',async()=>{
  const now=Date.UTC(2026,9,25,8);
  const service=createWeatherService({now:()=>now,readCache:async()=>null,writeCache:async()=>{},fetchJSON:async url=>
    url.hostname==='geocoding-api.open-meteo.com'?{results:[albany]}:forecast(now-3*3600000)});
  await service.refresh();
  assert.equal(service.snapshot().status,'stale');
  assert.equal(service.snapshot().observedAt,now-3*3600000-900000);
  service.dispose();
});
