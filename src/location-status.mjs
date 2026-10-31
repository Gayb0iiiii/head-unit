// Read-only GNSS display contract. Never a motion/parking or navigation authority.
export const LOCATION_TTL_MS=10000;
const qualities=['none','gps','dgps','pps','rtk','rtkFloat','estimated','manual','simulated'];
const modes=['none','2d','3d'];
const number=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max?value:null;
export const emptyLocation=(status='unavailable')=>({status,latitude:null,longitude:null,fixQuality:null,fixMode:null,satellitesUsed:null,satellitesVisible:null,sampledAt:null,freshForMs:0});
export function filterLocationStatus(value,connected){
 if(!connected)return emptyLocation('disconnected');
 const status=['disabled','unavailable','receiver-unavailable','stale','no-fix','unsupported-fix','current'].includes(value?.status)?value.status:'unavailable';
 const result=emptyLocation(status);
 if(!['no-fix','unsupported-fix','current'].includes(status))return result;
 if(!Number.isFinite(value.freshForMs)||value.freshForMs<=0||value.freshForMs>LOCATION_TTL_MS)return emptyLocation('stale');
 result.freshForMs=value.freshForMs;result.fixQuality=qualities.includes(value.fixQuality)?value.fixQuality:null;result.fixMode=modes.includes(value.fixMode)?value.fixMode:null;
 for(const key of ['satellitesUsed','satellitesVisible'])result[key]=Number.isInteger(value[key])?number(value[key],0,256):null;
 if(status==='current'){
  const lat=number(value.latitude,-90,90),lng=number(value.longitude,-180,180),at=number(value.sampledAt,1,8640000000000000);
  if(lat===null||lng===null||at===null||!['gps','dgps','pps','rtk','rtkFloat'].includes(result.fixQuality)||!['2d','3d'].includes(result.fixMode))return emptyLocation('unavailable');
  Object.assign(result,{latitude:lat,longitude:lng,sampledAt:at});
 }
 return result;
}
export function renderLocationStatus(value){
 const status=filterLocationStatus(value,value?.status!=='disconnected');
 const label={disconnected:'Location source disconnected',unavailable:'GNSS status unavailable',disabled:'GNSS disabled in native configuration','receiver-unavailable':'Receiver unavailable',stale:'Location data is stale','no-fix':'Receiving · no usable position fix','unsupported-fix':'Estimated, manual or simulated fix · not a live position',current:'Current GNSS fix'}[status.status];
 const quality={gps:'GPS',dgps:'Differential GPS',pps:'PPS',rtk:'RTK',rtkFloat:'RTK float',estimated:'Estimated',manual:'Manual',simulated:'Simulated',none:'No fix'}[status.fixQuality];
 return `<section class="settings-card settings-location" data-location-status="${status.status}"><h2>GPS & location</h2><p class="settings-note" role="status">${label}</p>${status.status==='current'?`<p class="location-coordinate" aria-label="Latitude and longitude">${status.latitude.toFixed(5)}, ${status.longitude.toFixed(5)}</p><p class="settings-note">Fix time: ${new Date(status.sampledAt).toISOString().replace('T',' ').replace('.000Z',' UTC')}</p>`:''}${quality?`<p class="settings-note">${quality}${status.fixMode&&status.fixMode!=='none'?' · '+status.fixMode.toUpperCase():''}</p>`:''}${status.satellitesUsed!==null||status.satellitesVisible!==null?`<p class="settings-note">Satellites used / visible: ${status.satellitesUsed??'—'} / ${status.satellitesVisible??'—'}</p>`:''}<p class="settings-note">Read-only native GNSS data. No receiver is assumed. This screen does not save location or send it to weather services. Maps and offline routing are not provided here.</p></section>`;
}
