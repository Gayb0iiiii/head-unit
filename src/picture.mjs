// Configured projection geometry, not a live-frame size or calibrated input rectangle.
const own=(value,key)=>value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,key)?.value:undefined;
const integer=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
export function filterPicture(value,connected,front) {
  if(connected!==true||front!=='projection')return null;
  const width=own(value,'width'),height=own(value,'height');
  if(!integer(width,300,4096)||!integer(height,200,2160))return null;
  const source=own(value,'insets'),top=own(source,'top'),bottom=own(source,'bottom'),left=own(source,'left'),right=own(source,'right');
  const valid=integer(top,0,height)&&integer(bottom,0,height)&&integer(left,0,width)&&integer(right,0,width)&&top+bottom<height&&left+right<width;
  return {width,height,insets:valid?{top,bottom,left,right}:null};
}
export function configuredPicture(session) {
  if(session?.ready!==true||session.state?.front?.main!=='projection'||!['carplay','androidauto'].includes(session.state?.sessions?.active))return null;
  const config=session.state.config;
  return filterPicture({width:own(config,'projectionWidth'),height:own(config,'projectionHeight'),insets:{top:own(config,'projectionViewAreaTop'),bottom:own(config,'projectionViewAreaBottom'),left:own(config,'projectionViewAreaLeft'),right:own(config,'projectionViewAreaRight')}},true,'projection');
}
export function pictureMarkup(value) {
  const picture=filterPicture(value,true,'projection');
  if(!picture)return '<div class="native-projection-region"><p class="native-picture-notice" role="status">Phone display size unavailable</p></div>';
  const {width,height,insets}=picture;
  const masks=insets?`<div class="native-picture-mask top" style="height:${insets.top/height*100}%"></div><div class="native-picture-mask bottom" style="height:${insets.bottom/height*100}%"></div><div class="native-picture-mask left" style="width:${insets.left/width*100}%"></div><div class="native-picture-mask right" style="width:${insets.right/width*100}%"></div>`:'';
  return `<div class="native-projection-region" aria-label="Phone display area"><div class="native-picture" style="width:min(100cqw, calc(100cqh * ${width} / ${height}));height:min(100cqh, calc(100cqw * ${height} / ${width}))">${masks}</div></div>`;
}
