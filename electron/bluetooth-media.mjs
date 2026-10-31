const text=value=>typeof value==='string'&&value.length?value.slice(0,256):null;
const milliseconds=value=>Number.isInteger(value)&&value>=0&&value<0xffffffff?value:null;
/** BlueZ MediaPlayer1 observations only: no time extrapolation or fabricated artwork. */
export function bluetoothMetadata(player){
 return {status:['playing','paused','stopped','forward-seek','reverse-seek','error'].includes(player?.Status)?player.Status:'unknown',title:text(player?.Track?.Title),artist:text(player?.Track?.Artist),album:text(player?.Track?.Album),durationMs:milliseconds(player?.Track?.Duration),positionMs:milliseconds(player?.Position)};
}
