// Privileged projection of pinned protocol-8 Config. Never export this through preload.
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const own=(value,key)=>record(value)?Object.getOwnPropertyDescriptor(value,key)?.value:undefined;
const integer=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
const boolean=value=>typeof value==='boolean'?value:null;
function size(width,height) {
  return integer(width,300,4096)&&integer(height,200,2160)?{width,height}:null;
}
function bounds(value) {
  const dimensions=size(own(value,'width'),own(value,'height'));
  const x=own(value,'x'),y=own(value,'y');
  return dimensions&&integer(x,-2147483648,2147483647)&&integer(y,-2147483648,2147483647)?{x,y,...dimensions}:null;
}
export function filterWindowConfig(snapshot) {
  const config=own(own(snapshot,'state'),'config');
  const available=own(snapshot,'ready')===true&&own(snapshot,'status')==='ready'&&record(config);
  const source=available?config:null,kiosk=own(source,'kiosk'),zoom=own(source,'uiZoomPercent');
  const result={available,zoomPercent:integer(zoom,50,200)?zoom:null};
  for(const role of ['main','cluster','aux'])result[role]={
    ...(role==='main'?{}:{active:boolean(own(source,`${role}ScreenActive`))}),
    size:size(own(source,`${role}ScreenWidth`),own(source,`${role}ScreenHeight`)),
    bounds:bounds(own(source,`${role}ScreenBounds`)),kiosk:boolean(own(kiosk,role)),
  };
  return result;
}
export function observeWindowConfig(transport) {
  let disposed=false,current=filterWindowConfig(null),key=JSON.stringify(current);
  const listeners=new Set();
  const notify=listener=>{try{listener(structuredClone(current));}catch{/* Isolate privileged consumers. */}};
  const detach=transport.subscribe(snapshot=>{
    if(disposed)return;
    const next=filterWindowConfig(snapshot),nextKey=JSON.stringify(next);
    if(key===nextKey)return;
    current=next;key=nextKey;
    for(const listener of [...listeners])if(!disposed&&listeners.has(listener))notify(listener);
  });
  return {
    subscribe(listener) {
      if(disposed)throw Error('Window config observer disposed');
      if(typeof listener!=='function')throw new TypeError('Config listener required');
      listeners.add(listener);notify(listener);return()=>listeners.delete(listener);
    },
    dispose() {if(disposed)return;disposed=true;detach();listeners.clear();current=filterWindowConfig(null);},
  };
}
