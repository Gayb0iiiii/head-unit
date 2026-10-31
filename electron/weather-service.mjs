const geocodeHost='https://geocoding-api.open-meteo.com/v1/search';
const forecastHost='https://api.open-meteo.com/v1/forecast';
const refreshMs=15*60*1000;
const currentMs=30*60*1000;
const observationCurrentMs=90*60*1000;
const futureToleranceMs=5*60*1000;
const text=(value,max=80)=>typeof value==='string'&&value.length>0&&value.length<=max;
const finite=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;

function location(value){
  if(!Number.isSafeInteger(value?.id)||value.id<1||!text(value.name)||!text(value.admin1)||!text(value.country_code,2)||!finite(value.latitude,-90,90)||!finite(value.longitude,-180,180))return null;
  return {id:value.id,name:value.name,admin1:value.admin1,countryCode:value.country_code,latitude:value.latitude,longitude:value.longitude,label:`${value.name}, ${value.admin1}`};
}

function reading(value,now){
  const c=value?.current;
  if(!Number.isSafeInteger(c?.time)||!finite(c.temperature_2m,-90,65)||!finite(c.apparent_temperature,-100,70)||!finite(c.wind_speed_10m,0,350)||!Number.isInteger(c.weather_code)||c.weather_code<0||c.weather_code>99||![0,1].includes(c.is_day))return null;
  const observedAt=c.time*1000;
  if(observedAt<now-4*3600000||observedAt>now+3600000)return null;
  return {temperatureC:c.temperature_2m,apparentC:c.apparent_temperature,windKmh:c.wind_speed_10m,weatherCode:c.weather_code,isDay:c.is_day===1,observedAt,fetchedAt:now};
}

const initialUrl=()=>new URL(`${geocodeHost}?name=Albany&countryCode=AU&count=10&language=en&format=json`);
const cityUrl=query=>{const url=new URL(geocodeHost);url.search=new URLSearchParams({name:query,count:'10',language:'en',format:'json'}).toString();return url;};
const forecastUrl=city=>{const url=new URL(forecastHost);url.search=new URLSearchParams({latitude:String(city.latitude),longitude:String(city.longitude),current:'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m',temperature_unit:'celsius',wind_speed_unit:'kmh',timezone:'auto',timeformat:'unixtime',forecast_days:'0'}).toString();return url;};

/** Host-only weather, with no device geolocation and no renderer-chosen URL. */
export function createWeatherService({fetchJSON,readCache=async()=>null,writeCache=async()=>{},now=Date.now,steadyNow=()=>performance.now(),setEvery=setInterval,clearEvery=clearInterval}){
  if(typeof fetchJSON!=='function'||typeof readCache!=='function'||typeof writeCache!=='function')throw TypeError('Weather dependencies required');
  let searchGeneration=0;
  let city=null,data=null,loaded=false,failed=false,disposed=false,inFlight=null,searchResults=[],timer=null,controller=null,persistenceError=false,lastSuccessTick=null;
  const listeners=new Set();
  const publish=()=>{for(const listener of listeners){try{listener(snapshot());}catch{}}};
  async function load(){
    if(loaded)return;loaded=true;
    try{
      const cached=await readCache();
      city=location(cached?.location&&{...cached.location,country_code:cached.location.countryCode});
      const item=cached?.weather;
      if(city&&finite(item?.temperatureC,-90,65)&&finite(item?.apparentC,-100,70)&&finite(item?.windKmh,0,350)&&Number.isInteger(item?.weatherCode)&&finite(item?.observedAt,0,now()+3600000)&&finite(item?.fetchedAt,0,now())){data={temperatureC:item.temperatureC,apparentC:item.apparentC,windKmh:item.windKmh,weatherCode:item.weatherCode,isDay:item.isDay===true,observedAt:item.observedAt,fetchedAt:item.fetchedAt};failed=true;}
    }catch{}
  }
  function snapshot(){
    const age=lastSuccessTick===null?Infinity:steadyNow()-lastSuccessTick;
    // A wall-clock rollback must not promote an old observation to current.
    // The monotonic age accumulated since this process fetched it is a floor.
    const observationAge=data?Math.max(now()-data.observedAt,data.fetchedAt-data.observedAt+age):Infinity;
    return {status:data?(failed||age<0||age>currentMs||observationAge < -futureToleranceMs||observationAge>observationCurrentMs?'stale':'current'):city||failed?'unavailable':'loading',
      location:city?{id:city.id,label:city.label}:null,
      persistenceError,
      temperatureC:data?.temperatureC??null,apparentC:data?.apparentC??null,windKmh:data?.windKmh??null,weatherCode:data?.weatherCode??null,isDay:data?.isDay??null,
      observedAt:data?.observedAt??null,fetchedAt:data?.fetchedAt??null};
  }
  async function save(){try{await writeCache({location:city,weather:data});persistenceError=false;}catch{persistenceError=true;}}
  async function run(){
    await load();if(disposed)return snapshot();
    controller=new AbortController();
    try{
      if(!city){
        const results=(await fetchJSON(initialUrl(),controller.signal))?.results;
        const selected=Array.isArray(results)?results.map(location).find(item=>item?.name==='Albany'&&item.admin1==='Western Australia'&&item.countryCode==='AU'):null;
        if(!selected)throw Error('Albany WA not resolved');
        city=selected;await save();
      }
      const fresh=reading(await fetchJSON(forecastUrl(city),controller.signal),now());
      if(!fresh)throw Error('Invalid weather observation');
      if(disposed)return snapshot();
      data=fresh;failed=false;lastSuccessTick=steadyNow();await save();
    }catch{if(!disposed)failed=true;}
    finally{controller=null;if(!disposed)publish();}
    return snapshot();
  }
  const refresh=()=>{if(disposed)return Promise.resolve(snapshot());if(!inFlight)inFlight=run().finally(()=>{inFlight=null;});return inFlight;};
  async function search(query){
    if(disposed)throw Error('Weather stopped');
    if(typeof query!=='string'||query.length<3||query.length>64||!/^[-'., \p{L}\p{M}]+$/u.test(query))throw TypeError('Invalid city');
    const generation=++searchGeneration;searchResults=[];
    const results=(await fetchJSON(cityUrl(query.trim()),undefined))?.results;
    if(disposed||generation!==searchGeneration)return [];
    searchResults=(Array.isArray(results)?results:[]).slice(0,10).map(location).filter(Boolean);
    return searchResults.map(item=>({id:item.id,label:`${item.label}, ${item.countryCode}`}));
  }
  async function select(id){
    const selected=Number.isSafeInteger(id)?searchResults.find(item=>item.id===id):null;
    if(!selected||disposed)throw Error('City unavailable');
    if(inFlight)await inFlight;
    if(disposed)throw Error('Weather stopped');
    city=selected;data=null;failed=false;lastSuccessTick=null;searchResults=[];await save();publish();return refresh();
  }
  function start(){if(timer||disposed)return;void refresh();timer=setEvery(()=>{void refresh();},refreshMs);timer?.unref?.();}
  function dispose(){disposed=true;searchGeneration++;searchResults=[];controller?.abort();if(timer)clearEvery(timer);timer=null;listeners.clear();}
  return {snapshot,refresh,search,select,start,dispose,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}};
}
