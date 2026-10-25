// WMO descriptions published by Open-Meteo; unknown codes remain unavailable.
const labels={0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Rime fog',51:'Light drizzle',53:'Moderate drizzle',55:'Dense drizzle',56:'Light freezing drizzle',57:'Dense freezing drizzle',61:'Slight rain',63:'Moderate rain',65:'Heavy rain',66:'Light freezing rain',67:'Heavy freezing rain',71:'Slight snowfall',73:'Moderate snowfall',75:'Heavy snowfall',77:'Snow grains',80:'Slight rain showers',81:'Moderate rain showers',82:'Violent rain showers',85:'Slight snow showers',86:'Heavy snow showers',95:'Thunderstorm',96:'Thunderstorm with slight hail',97:'Heavy thunderstorm',99:'Thunderstorm with heavy hail'};
export function weatherLabel(code){return Object.hasOwn(labels,code)?labels[code]:'Conditions unavailable';}
export function weatherAge(now,fetchedAt){
  if(!Number.isFinite(now)||!Number.isFinite(fetchedAt))return 'time unavailable';
  if(fetchedAt-now>60000)return 'time unavailable';
  const minutes=Math.max(0,Math.floor((now-fetchedAt)/60000));
  if(minutes<1)return 'just now';
  if(minutes<60)return `${minutes} min ago`;
  const hours=Math.floor(minutes/60);
  if(hours<24)return `${hours} hr${hours===1?'':'s'} ago`;
  const days=Math.floor(hours/24);return `${days} day${days===1?'':'s'} ago`;
}
