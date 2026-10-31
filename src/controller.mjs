import {hasProjectionSession} from './picture.mjs';
import {filterConnectionPhase} from './connection-status.mjs';
import {activeDevice,homeView} from './home-view.mjs';
import {publicView} from './view.mjs';
const routes=new Set(['home','dashboard','phones','settings','audio','vehicle','projection']);
const exact=(value,keys)=>Object.keys(value).sort().join(',')===keys.sort().join(',');
export class HeadunitController {
  constructor(transport,preferences={}) {
    this.transport=transport; this.preferences=preferences; this.listeners=new Set();
    this.lastActive=null;this.lastReportedRoute=null;this.contacts=new Map(); this.route='home'; this.front=null; this.started=false;
    this.leavingProjection=false;this.projectionInterrupted=false;this.lastPhone=null;this.resume=false;this.pauseIntent=false;this.pendingChoice=null;this.recoveryAttempted=false;this.resumeAttempted=false;this.wasReady=false;this.recovering=true;
    try { const saved=preferences.load();this.preferred=typeof saved==='string'?saved:saved?.route;this.lastPhone=typeof saved?.lastPhone==='string'?saved.lastPhone:null;this.resume=saved?.resume===true; } catch {}
    if(!routes.has(this.preferred))this.preferred='home';
    this.unsubscribe=transport.subscribe(()=>this.sync());
  }
  view() { return {...publicView(this.transport.session),connectionPhase:filterConnectionPhase(this.transport.status,this.transport.session.ready),projectionReady:hasProjectionSession(this.transport.session),route:this.route,preferredRoute:this.preferred,notice:this.projectionInterrupted?'projection-reconnecting':null}; }
  subscribe(listener) {this.listeners.add(listener);listener(this.view());return ()=>this.listeners.delete(listener);}
  publish(){for(const listener of this.listeners)listener(this.view());}
  savePreferences(){const value={route:this.preferred,lastPhone:this.lastPhone,resume:this.resume};const encoded=JSON.stringify(value);if(encoded===this.lastSaved)return;try{this.preferences.save?.(value);this.lastSaved=encoded;}catch{}}
  reportPath(){if(this.lastReportedRoute===this.route)return;try{this.transport.session.path('/'+this.route);this.lastReportedRoute=this.route;}catch{}}
  sync(){
    const session=this.transport.session;
    const next=session.ready?session.state?.front?.main:null;
    if(next!=='projection'&&this.contacts.size)this.cancelTouch();
    if(!session.ready){this.wasReady=false;this.pendingChoice=null;this.lastReportedRoute=null;this.front=null;this.route='disconnected';this.contacts.clear();this.publish();return;}
    if(this.front==='projection'&&next==='livi'&&!this.leavingProjection&&!hasProjectionSession(session))this.projectionInterrupted=true;
    if(next==='projection')this.projectionInterrupted=false;
    if(next!=='projection')this.leavingProjection=false;
    this.front=next;
    const devices=Array.isArray(session.state?.devices)?session.state.devices.filter(d=>d&&typeof d.id==='string'&&d.id.length>0&&d.id.length<=256):[];
    const active=devices.find(d=>d.status==='active');
    if(this.lastActive===this.lastPhone&&!active&&this.lastPhone){this.recovering=true;this.recoveryAttempted=false;this.resumeAttempted=false;}
    this.lastActive=active?.id??null;
    if(this.pendingChoice&&active?.id===this.pendingChoice){this.lastPhone=this.pendingChoice;this.pendingChoice=null;this.savePreferences();}
    if(active&&active.id!==this.lastPhone){this.recoveryAttempted=true;this.recovering=false;}
    if(this.recovering&&!this.recoveryAttempted&&!active&&this.lastPhone){const target=devices.find(d=>d.id===this.lastPhone);if(target){this.recoveryAttempted=true;session.action({kind:target.status==='available'?'selectDevice':'connectDevice',id:target.id});}}
    if(active?.id===this.lastPhone&&typeof session.state?.nowPlaying?.playing==='boolean'){
      const playing=session.state.nowPlaying.playing;
      const shouldResume=this.recovering&&!this.resumeAttempted&&this.resume&&!playing;
      // Playback snapshots and command replies cannot prove which intent caused playback.
      // Preserve deliberate pause for recovery until a newer explicit Play supersedes it.
      this.recovering=false;this.resume=this.pauseIntent?false:playing;this.savePreferences();
      if(shouldResume){this.resumeAttempted=true;session.action({kind:'media',control:'play'});}
    }
    this.wasReady=true;
    if(next==='camera'||next==='cluster')this.route=next;
    else if(next==='projection')this.route='projection';
    else this.route=this.projectionInterrupted||this.preferred==='projection'?'home':this.preferred;
    // Restore display preference separately from the authorized phone/media recovery policy.
    if(!this.started&&next!=='camera'&&next!=='cluster'){if(next==='projection'||this.preferred!=='projection')this.started=true;else if(hasProjectionSession(session)&&next==='livi'){this.started=true;session.action({kind:'show',screen:'main',front:'projection'});}}
    this.reportPath();
    this.publish();
  }
  cancelTouch(){
    const points=[...this.contacts.values()].map(p=>({...p,phase:'cancel'}));this.contacts.clear();
    if(points.length&&this.transport.session.ready){try{this.transport.session.pointer(points);}catch{}}
  }
  intent(raw){
    const intent=structuredClone(raw);
    if(!intent||typeof intent!=='object'||Array.isArray(intent))throw Error('Invalid intent');
    const session=this.transport.session;
    if(!session.ready)throw Error('Core unavailable');
    if(intent.type==='navigate'&&exact(intent,['type','route'])&&routes.has(intent.route)){
      this.projectionInterrupted=false;this.preferred=intent.route;this.savePreferences();
      if(this.front==='camera'||this.front==='cluster')return this.view();
      if(intent.route!=='projection')this.cancelTouch();
      if(intent.route==='projection'){
        if(!hasProjectionSession(session)){this.route='phones';this.reportPath();this.publish();return this.view();}
        if(this.front!=='projection'||this.leavingProjection)session.action({kind:'show',screen:'main',front:'projection'});
        this.leavingProjection=false;
      }else if(this.front==='projection'){session.action({kind:'show',screen:'main',front:'livi'});this.leavingProjection=true;}
      else {this.route=intent.route;this.reportPath();this.publish();}
      return this.view();
    }
    if(intent.type==='selectPhone'&&exact(intent,['type','id'])&&typeof intent.id==='string'&&session.state?.devices?.some(d=>d?.id===intent.id)){
      const device=session.state.devices.find(d=>d?.id===intent.id);
      this.cancelTouch();this.pendingChoice=intent.id;
      const choice=Symbol();this.choiceToken=choice;
      let finish;const completion=new Promise(resolve=>{finish=resolve;});
      try {
        const requestId=session.action({kind:device.status==='offline'?'connectDevice':'selectDevice',id:intent.id},ok=>{
          if(!ok&&this.choiceToken===choice)this.pendingChoice=null;
          finish(ok);
        });
        return {requestId,completion};
      }catch(error){if(this.choiceToken===choice)this.pendingChoice=null;throw error;}
    }
    if(intent.type==='media'&&(exact(intent,['type','control'])||exact(intent,['type','control','phoneId']))&&['play','pause'].includes(intent.control)){
      // Renderer calls always carry the observed owner; trusted host callers may omit it.
      if('phoneId' in intent && (intent.phoneId!==activeDevice(session.state)?.id || this.pendingChoice || homeView(session).media.status!=='available'))throw Error('Media owner unavailable');
      this.pauseIntent=intent.control==='pause';if(this.pauseIntent)this.resume=false;
      this.recovering=false;this.resumeAttempted=true;this.savePreferences();
      let finish;const completion=new Promise(resolve=>{finish=resolve;});
      const requestId=session.action({kind:'media',control:intent.control},ok=>finish(ok));
      return {requestId,completion};
    }
    if(intent.type==='volume'&&exact(intent,['type','value'])&&Number.isFinite(intent.value)&&intent.value>=0&&intent.value<=1)return {requestId:session.action({kind:'setConfig',patch:{huVolume:intent.value}})};
    if(intent.type==='touch'&&exact(intent,['type','points'])&&this.front==='projection'&&Array.isArray(intent.points)&&intent.points.length>0&&intent.points.length<=10){
      const points=intent.points;const seen=new Set();const next=new Map(this.contacts);
      for(const p of points){if(!p||!exact(p,['id','x','y','phase'])||!Number.isInteger(p.id)||p.id<0||p.id>9||seen.has(p.id)||![p.x,p.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1)||!['down','move','up','cancel'].includes(p.phase))throw Error('Invalid touch');seen.add(p.id);if(p.phase==='down'){if(next.has(p.id))throw Error('Duplicate touch');next.set(p.id,p);}else{if(!next.has(p.id))throw Error('Unknown touch');if(p.phase==='move')next.set(p.id,p);else next.delete(p.id);}}
      const overrides=new Map(points.map(p=>[p.id,p]));
      const frame=[...this.contacts.values()].map(p=>overrides.get(p.id)??({...p,phase:'move'})).concat(points.filter(p=>!this.contacts.has(p.id)));
      if(frame.length>10)throw Error('Too many active touches');
      session.pointer(frame);this.contacts=next;return {accepted:true};
    }
    if(intent.type==='cancelTouch'&&exact(intent,['type'])){this.cancelTouch();return {accepted:true};}
    throw Error('Intent not allowed');
  }
  dispose(){this.cancelTouch();this.unsubscribe?.();this.listeners.clear();}
}
