import {filterPicture} from './picture.mjs';
const bridgeReleases=new WeakMap();

// The native protocol takes fractions of the full contained picture. Insets
// mask visible content; they do not rescale its coordinate system.
export function mapPicturePoint(x,y,rect,value){
 const picture=filterPicture(value,true,'projection');
 if(!picture||!rect||![x,y,rect.left,rect.top,rect.width,rect.height].every(Number.isFinite)||rect.width<=0||rect.height<=0)return null;
 const nx=(x-rect.left)/rect.width,ny=(y-rect.top)/rect.height;
 if(nx<0||nx>1||ny<0||ny>1)return null;
 const {width,height,insets}=picture;
 if(insets&&(nx*width<insets.left||nx*width>width-insets.right||ny*height<insets.top||ny*height>height-insets.bottom))return null;
 return {x:nx,y:ny};
}

/** A single renderer owner. The trusted host remains the final input authority. */
export function createProjectionInput({element,bridge,picture,ready,requestFrame=fn=>requestAnimationFrame(fn),cancelFrame=id=>cancelAnimationFrame(id)}){
 if(!element||typeof bridge?.touch!=='function'||typeof bridge?.cancelTouch!=='function')throw TypeError('Projection input boundary required');
 const geometry=filterPicture(picture,true,'projection');
 const active=new Map(),ids=new Map(),listeners=[];
 let bound=null,disposed=false,pending=[],busy=false,draining=Promise.resolve(),cancelling=false,faulted=false,frame=null,generation=0;
 let ownerReady=!bridgeReleases.has(bridge);
 if(!ownerReady)void bridgeReleases.get(bridge).then(ok=>{ownerReady=ok;});
 const on=(name,fn)=>{element.addEventListener(name,fn);listeners.push([name,fn]);};
 const point=(event)=>mapPicturePoint(event.clientX,event.clientY,element.getBoundingClientRect(),geometry);
 function enqueue(points){
  if(disposed)return;
  if(pending.length>=20){interrupt();return;}
  pending.push({points,generation});if(!busy)draining=pump();
 }
 async function pump(){
  if(busy||disposed)return;busy=true;
  while(pending.length&&!disposed){const item=pending.shift();if(item.generation!==generation)continue;
   try{await bridge.touch(item.points);}catch{interrupt();break;}}
  busy=false;
 }
 function flushMoves(){frame=null;if(!active.size)return;const moved=[...active.values()].filter(p=>p.dirty).map(p=>({id:p.id,x:p.x,y:p.y,phase:'move'}));for(const p of active.values())p.dirty=false;if(moved.length)enqueue(moved);}
 function releaseCapture(pointerId){try{if(element.hasPointerCapture?.(pointerId)??true)element.releasePointerCapture?.(pointerId);}catch{}}
 function interrupt(){
  if(frame!==null){cancelFrame(frame);frame=null;}
  const had=active.size>0||pending.length>0||busy;
  const captured=[...ids.keys()];
  active.clear();ids.clear();bound=null;pending=[];generation++;
  for(const pointerId of captured)releaseCapture(pointerId);
  if(had&&!cancelling){
   cancelling=true;
   const release=draining.then(()=>bridge.cancelTouch()).then(()=>true,()=>false);
   bridgeReleases.set(bridge,release);
   void release.then(ok=>{cancelling=false;if(!ok)faulted=true;});
  }
 }
 function valid(){return !disposed&&ownerReady&&!cancelling&&!faulted&&geometry&&ready()===true;}
 function sameRect(rect){return bound&&['left','top','width','height'].every(key=>rect[key]===bound[key]);}
 on('pointerdown',event=>{
  if(!valid()||!['touch','pen','mouse'].includes(event.pointerType)||ids.has(event.pointerId)||active.size>=10)return;
  const rect=element.getBoundingClientRect();if(active.size&&!sameRect(rect)){interrupt();return;}
  const at=point(event);if(!at)return;
  const id=Array.from({length:10},(_,i)=>i).find(i=>!active.has(i));
  if(id===undefined)return;
  if(!bound)bound={left:rect.left,top:rect.top,width:rect.width,height:rect.height};
  try{element.setPointerCapture?.(event.pointerId);}catch{return;}
  ids.set(event.pointerId,id);active.set(id,{id,...at,dirty:false});event.preventDefault?.();enqueue([{id,...at,phase:'down'}]);
 });
 on('pointermove',event=>{
  const id=ids.get(event.pointerId);if(id===undefined)return;
  if(!valid()||!sameRect(element.getBoundingClientRect())){interrupt();return;}
  const at=point(event);if(!at){interrupt();return;}
  Object.assign(active.get(id),at,{dirty:true});event.preventDefault?.();if(frame===null)frame=requestFrame(flushMoves);
 });
 function finish(event,phase){
  const id=ids.get(event.pointerId);if(id===undefined)return;
  if(!valid()||!sameRect(element.getBoundingClientRect())){interrupt();return;}
  const at=point(event)??active.get(id);
  if(frame!==null){cancelFrame(frame);frame=null;flushMoves();}
  ids.delete(event.pointerId);active.delete(id);releaseCapture(event.pointerId);if(!active.size)bound=null;
  event.preventDefault?.();enqueue([{id,x:at.x,y:at.y,phase}]);
 }
 on('pointerup',event=>finish(event,'up'));
 on('pointercancel',event=>finish(event,'cancel'));
 on('lostpointercapture',event=>{if(ids.has(event.pointerId))interrupt();});
 return {interrupt,dispose(){if(disposed)return;interrupt();disposed=true;for(const [name,fn] of listeners)element.removeEventListener(name,fn);}};
}
