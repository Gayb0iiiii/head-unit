import {emptyHomeStatus,filterHomeStatus,HOME_STATUS_TTL_MS} from './home-status.mjs';
export function activeDevice(state) {
  const active=(Array.isArray(state?.devices)?state.devices:[]).filter(device=>device&&device.status==='active'&&typeof device.id==='string'&&device.id.length>0&&device.id.length<=256);
  return active.length===1?active[0]:null;
}
const phoneSession=state=>['carplay','androidauto'].includes(state?.sessions?.active)&&state?.dab?.active!==true;
export function observeHome(session,message) {
  const observation=session.homeObservation;
  const owner=activeDevice(session.state)?.id??null;
  if(observation.owner!==owner) {observation.phoneAt=null;observation.mediaAt=null;observation.mediaOwner=null;observation.mediaFields=[];}
  observation.owner=owner;
  if(!phoneSession(session.state)){observation.mediaAt=null;observation.mediaOwner=null;observation.mediaFields=[];}
  const touched=key=>message.type==='welcome'||message.ops?.some(op=>op.path.length===0||op.path[0]===key);
  if(owner&&touched('devices'))observation.phoneAt=session.now();
  const fields=['title','artist','playing'].filter(field=>message.type==='welcome'||message.ops?.some(op=>op.path.length===0||(op.path[0]==='nowPlaying'&&(op.path.length===1||op.path[1]===field))));
  if(owner&&phoneSession(session.state)&&fields.length) {
    observation.mediaAt=session.now();observation.mediaOwner=owner;
    observation.mediaFields=[...new Set([...(observation.mediaFields??[]),...fields])];
  }
}
export function homeView(session) {
  if(!session.ready)return emptyHomeStatus('disconnected');
  const device=activeDevice(session.state), observation=session.homeObservation??{};
  const result=emptyHomeStatus(),expired=[];
  if(!device)return result;
  const now=session.now?.()??0;
  for(const [key,at] of [['phone',observation.phoneAt],['media',observation.mediaAt]]) {
    if(!Number.isFinite(at)||at>now)continue;
    if(key==='media'&&(!phoneSession(session.state)||observation.mediaOwner!==device.id))continue;
    const freshForMs=Math.max(0,HOME_STATUS_TTL_MS-(now-at));
    if(freshForMs===0)expired.push(key);
    result[key]={...result[key],phoneId:device.id,status:'available',freshForMs:freshForMs||HOME_STATUS_TTL_MS};
    if(key==='phone')Object.assign(result.phone,{batteryPercent:device.batteryLevel,charging:device.batteryCharging});
    else for(const field of observation.mediaFields??[])result.media[field]=session.state.nowPlaying?.[field];
  }
  const filtered=filterHomeStatus(result,true,device.id);
  for(const key of expired)if(filtered[key].status==='available')filtered[key]={...emptyHomeStatus('stale')[key],phoneId:device.id};
  return filtered;
}
