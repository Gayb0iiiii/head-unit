import {emptyLocation,filterLocationStatus,LOCATION_TTL_MS} from './location-status.mjs';
// Source times are checked once against local wall time, then age monotonically.
// Repeated timestamps and unrelated patches cannot renew an observation.
export function observeLocation(session){
 const g=session.state?.telemetry?.gnss,p=session.state?.telemetry?.gps;
 for(const [key,stamp] of [['receiver',g?.updatedAt],['fix',p?.fixTs]]){
  const old=session.locationObservation[key];if(old&&Object.is(old.stamp,stamp))continue;
  const age=(session.wallNow?.()??Date.now())-stamp;
  const knownAge=Number.isSafeInteger(stamp)&&stamp>0&&Number.isFinite(age)&&age>=0;
  session.locationObservation[key]={stamp,at:session.now(),knownAge,remaining:knownAge&&age<LOCATION_TTL_MS?LOCATION_TTL_MS-age:0};
 }
}
export function locationView(session){
 if(!session.ready)return emptyLocation('disconnected');
 if(session.state?.config?.gpsEnabled===false)return emptyLocation('disabled');
 const g=session.state?.telemetry?.gnss,p=session.state?.telemetry?.gps;
 if(!g||typeof g.connected!=='boolean')return emptyLocation();
 if(!g.connected)return emptyLocation('receiver-unavailable');
 const life=key=>{const o=session.locationObservation?.[key],elapsed=session.now?.()-o?.at;return o&&Number.isFinite(elapsed)&&elapsed>=0?Math.max(0,o.remaining-elapsed):0;};
 const expiredStatus=key=>session.locationObservation?.[key]?.knownAge===true?'stale':'unavailable';
 const receiver=life('receiver');if(!receiver)return emptyLocation(expiredStatus('receiver'));
 const base={fixQuality:g.fixQuality,fixMode:g.fixMode,satellitesUsed:g.satellitesUsed,satellitesVisible:g.satellitesVisible,freshForMs:receiver};
 if(['estimated','manual','simulated'].includes(g.fixQuality))return filterLocationStatus({...base,status:'unsupported-fix'},true);
 if(!['gps','dgps','pps','rtk','rtkFloat'].includes(g.fixQuality)||!['2d','3d'].includes(g.fixMode))return filterLocationStatus({...base,status:'no-fix'},true);
 const fix=life('fix');if(!fix)return emptyLocation(expiredStatus('fix'));
 return filterLocationStatus({...base,status:'current',freshForMs:Math.min(receiver,fix),latitude:p?.lat,longitude:p?.lng,sampledAt:p?.fixTs},true);
}
