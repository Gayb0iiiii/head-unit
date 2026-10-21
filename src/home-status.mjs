// Bounded renderer contract. Ages describe local core observations, not phone sample times.
export const HOME_STATUS_TTL_MS = 30000;
const text=value=>typeof value==='string'&&value.trim().length>0&&value.length<=256&&!/[\u0000-\u001f\u007f]/.test(value)?value:null;
const percent=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100?value:null;
const boolean=value=>typeof value==='boolean'?value:null;
export function emptyHomeStatus(status='unavailable') {
  return {
    phone:{status,phoneId:null,batteryPercent:null,charging:null,signalLevel:null,freshForMs:0},
    media:{status,phoneId:null,title:null,artist:null,playing:null,freshForMs:0}
  };
}
export function filterHomeStatus(value,connected,activePhoneId) {
  const result=emptyHomeStatus(connected?'unavailable':'disconnected');
  if(!connected||!activePhoneId)return result;
  for(const key of ['phone','media']) {
    const source=value?.[key];
    if(!source||source.phoneId!==activePhoneId)continue;
    const target=result[key];target.phoneId=activePhoneId;
    if(source.status==='stale'){target.status='stale';continue;}
    if(source.status!=='available')continue;
    if(!Number.isFinite(source.freshForMs)||source.freshForMs<=0||source.freshForMs>HOME_STATUS_TTL_MS)continue;
    if(key==='phone') {
      target.batteryPercent=percent(source.batteryPercent);target.charging=boolean(source.charging);
      // Pinned signalStrength exists, but its shared CP/AA scale is not verified.
    } else {
      target.title=text(source.title);target.artist=text(source.artist);target.playing=boolean(source.playing);
    }
    if((key==='phone'&&(target.batteryPercent!==null||target.charging!==null))||
       (key==='media'&&(target.title!==null||target.artist!==null||target.playing!==null))) {
      target.status='available';target.freshForMs=source.freshForMs;
    }
  }
  return result;
}
