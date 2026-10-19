/** Pure proposed appliance policy. It never spawns, signals, opens sockets or changes host power. */
const components=['outerWayland','engine','shell'];
const owner=component=>component==='shell'?'core-ui-supervisor':'appliance';
const defaults={heartbeatIntervalMs:1000,heartbeatTimeoutMs:5000,stopTimeoutMs:3000,forceStopTimeoutMs:2000,retryInitialMs:500,retryMaxMs:4000,maxRetries:3};
const startupDefaults={outerWayland:10000,engine:15000,shell:10000};
const exact=(value,keys)=>Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const empty=()=>({generation:0,phase:'idle',alive:false,ready:false,failures:0,deadlineAt:null,retryAt:null,healthDueAt:null,probe:null,inputRevoked:false});

export class ApplianceLifecycle {
 constructor(options={}){
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['clock','startupTimeoutMs',...Object.keys(defaults)].includes(k)))throw Error('Invalid policy options');
  this.options={...defaults,...options,startupTimeoutMs:{...startupDefaults,...options.startupTimeoutMs}};
  for(const key of Object.keys(defaults)){
   const value=this.options[key];
   if(!Number.isSafeInteger(value)||value<(key==='maxRetries'?0:1)||value>(key==='maxRetries'?10:3600000))throw Error(`Invalid policy option ${key}`);
  }
  if(this.options.retryInitialMs>this.options.retryMaxMs)throw Error('Invalid retry bounds');
  if(!exact(this.options.startupTimeoutMs,components)||Object.values(this.options.startupTimeoutMs).some(v=>!Number.isSafeInteger(v)||v<1||v>3600000))throw Error('Invalid startup timeout options');
  this.clock=options.clock??{now:()=>performance.now()};
  if(typeof this.clock.now!=='function')throw Error('Invalid monotonic clock');
  this.lastNow=-Infinity;this.now=this._time();this.nextGeneration=1;this.nextProbe=1;this.nextPresentation=1;
  this.components=Object.fromEntries(components.map(c=>[c,empty()]));this.status='idle';this.active=false;this.incident=null;this.recovery=null;this.presentation=null;this.effects=[];
 }
 _time(){const now=this.clock.now();if(!Number.isFinite(now))throw Error('Invalid clock time');if(now<this.lastNow)throw Error('Clock must be monotonic; moved backward');this.lastNow=now;return now;}
 _effect(type,component,extra={}){this.effects.push({type,owner:owner(component),component,generation:this.components[component].generation,...extra});}
 _present(screen,reason=null){
  this.presentation={screen,reason,presentationId:this.nextPresentation++,confirmed:false};
  this.effects=this.effects.filter(e=>e.type!=='present');this.effects.push({type:'present',owner:'appliance-presenter',...this.presentation});
 }
 _begin(component){
  const prior=this.components[component];const state={...empty(),failures:prior.failures,generation:this.nextGeneration++,phase:'starting',deadlineAt:this.now+this.options.startupTimeoutMs[component]};
  this.components[component]=state;this.status='starting';this._effect('start',component);
  if(component==='shell')this._effect('fullscreen',component,{appId:'dev.f-io.livi',role:'main'});
 }
 _revokeShell(){const shell=this.components.shell;if(shell.generation&&!shell.inputRevoked){shell.inputRevoked=true;this._effect('revoke-input','shell');}}
 _cancelQueued(index){this.effects=this.effects.filter(e=>!(['start','fullscreen','probe'].includes(e.type)&&components.indexOf(e.component)>=index));}
 _idle(component){const state=this.components[component];state.phase='idle';state.alive=false;state.ready=false;state.deadlineAt=null;state.retryAt=null;state.healthDueAt=null;state.probe=null;}
 _requestStop(component){
  const state=this.components[component];if(component==='shell')this._revokeShell();
  state.phase='stopping';state.ready=false;state.stopMode='graceful';state.deadlineAt=this.now+this.options.stopTimeoutMs;state.healthDueAt=null;state.probe=null;
  this._effect('stop',component,{mode:'graceful'});
 }
 _latch(component,reason){this.incident=null;this.status='recovery';this.recovery={component,reason};this._present('recovery',reason);}
 _fail(component,reason,{exited=false,terminal=false}={}){
  const index=components.indexOf(component);const state=this.components[component];
  if(this.incident&&(this.incident.manual||index>=this.incident.index)){if(exited)this._idle(component);this._progress();return;}
  state.failures++;state.phase='failed';state.ready=false;state.healthDueAt=null;state.probe=null;
  this._revokeShell();if(exited)this._idle(component);
  this._cancelQueued(index);
  for(const child of components.slice(index))if(this.components[child].phase==='backoff')this._idle(child);
  this.incident={index,component,reason,terminal:terminal||!!this.recovery,manual:false};this.status='recovering';this._present('recovery',reason);this._progress();
 }
 _progress(){
  if(this.incident){
   const incident=this.incident;
   for(let i=components.length-1;i>=incident.index;i--){
    const component=components[i],state=this.components[component];
    if(state.phase==='blocked'){this._latch(component,'stop-unconfirmed');return;}
    if(state.phase==='stopping')return;
    if(['starting','ready','failed'].includes(state.phase)){this._requestStop(component);return;}
   }
   this.incident=null;
   if(incident.manual){this.status='stopped';return;}
   const state=this.components[incident.component];
   if(incident.terminal||this.recovery){this._latch(incident.component,incident.reason);return;}
   if(state.failures>this.options.maxRetries){this._latch(incident.component,'retry-exhausted');return;}
   if(incident.operator){this._begin(incident.component);return;}
   state.phase='backoff';state.retryAt=this.now+Math.min(this.options.retryMaxMs,this.options.retryInitialMs*2**Math.max(0,state.failures-1));this.status='recovering';return;
  }
  if(!this.active||this.recovery)return;
  for(const component of components){
   const state=this.components[component];
   if(state.phase==='ready'&&state.ready)continue;
   if(state.phase==='idle')this._begin(component);
   return;
  }
  if(this.status!=='running'){this.status='running';this._present('shell');}
 }
 _tick(){
  for(const component of components){
   const state=this.components[component];
   if(state.phase==='stopping'&&this.now>=state.deadlineAt){
    if(state.stopMode==='graceful'){state.stopMode='force';state.deadlineAt=this.now+this.options.forceStopTimeoutMs;this._effect('stop',component,{mode:'force'});}
    else {state.phase='blocked';state.deadlineAt=null;this._latch(component,'stop-unconfirmed');}
   }
   if(this.active&&state.phase==='starting'&&this.now>=state.deadlineAt)this._fail(component,'startup-timeout');
   if(this.active&&(!this.incident||components.indexOf(component)<this.incident.index)&&state.phase==='ready'&&state.ready){
    if(!state.probe&&this.now>=state.healthDueAt){state.probe={probeId:this.nextProbe++,deadlineAt:this.now+this.options.heartbeatTimeoutMs};this._effect('probe',component,{probeId:state.probe.probeId});}
    if(state.probe&&this.now>=state.probe.deadlineAt)this._fail(component,'heartbeat-timeout');
   }
  }
  this._progress();
  if(this.active&&!this.recovery&&!this.incident){
   for(const component of components){const state=this.components[component];if(state.phase==='backoff'&&this.now>=state.retryAt){this._begin(component);break;}}
  }
 }
 start(){
  this.now=this._time();if(!['idle','stopped'].includes(this.status))return false;
  this.active=true;this.recovery=null;this.incident=null;for(const state of Object.values(this.components))state.failures=0;
  this._present('boot','starting');this._progress();return true;
 }
 stop(){
  this.now=this._time();if(this.status==='stopped'||this.status==='stopping')return false;
  this.active=false;this.recovery=null;this.presentation=null;this.effects=this.effects.filter(e=>e.type!=='present');this._cancelQueued(0);this._revokeShell();for(const component of components)if(this.components[component].phase==='backoff')this._idle(component);
  this.incident={index:0,manual:true};this.status='stopping';this._progress();return true;
 }
 retryRecovery(){
  this.now=this._time();if(!this.recovery||Object.values(this.components).some(s=>['blocked','stopping'].includes(s.phase)))return false;
  this.recovery=null;this.active=true;for(const state of Object.values(this.components))state.failures=0;
  this._present('boot','operator-retry');const component=components.find(c=>!this.components[c].ready);
  if(component){this.incident={index:components.indexOf(component),component,operator:true};this._progress();}else this._progress();return true;
 }
 tick(){this.now=this._time();this._tick();return this.snapshot();}
 handle(event){
  if(!event||typeof event!=='object'||Array.isArray(event))throw Error('Invalid event');
  const input=structuredClone(event);
  if(input.type==='presented'){
   if(!exact(input,['type','owner','presentationId'])||input.owner!=='appliance-presenter'||!Number.isSafeInteger(input.presentationId))throw Error('Invalid presenter event');
   this.now=this._time();this._tick();if(input.presentationId!==this.presentation?.presentationId)return false;this.presentation.confirmed=true;return true;
  }
  if(!components.includes(input.component)||!['alive','ready','heartbeat','failed','exited','stopped','refused'].includes(input.type))throw Error('Invalid event type or component');
  const fields=['type','component','generation'];
  if(input.type==='heartbeat')fields.push('probeId');
  if(input.type==='ready'&&input.component==='engine')fields.push('protocol','compositorReady');
  if(input.type==='ready'&&input.component==='shell')fields.push('appId','fullscreen','role');
  if(!exact(input,fields)||!Number.isSafeInteger(input.generation)||input.generation<1)throw Error('Invalid event fields');
  if(input.type==='heartbeat'&&(!Number.isSafeInteger(input.probeId)||input.probeId<1))throw Error('Invalid heartbeat event');
  this.now=this._time();this._tick();const state=this.components[input.component];
  if(input.generation!==state.generation||['idle','backoff'].includes(state.phase))return false;
  if(input.type==='exited'||input.type==='stopped'){
   if(['stopping','blocked','failed'].includes(state.phase)){this._idle(input.component);this._progress();return true;}
   this._fail(input.component,'process-exit',{exited:true});return true;
  }
  if(['stopping','blocked','failed'].includes(state.phase))return false;
  if(input.type==='alive'){state.alive=true;return true;}
  if(input.type==='failed'||input.type==='refused'){this._fail(input.component,input.type==='refused'?'refused':'process-failed',{terminal:input.type==='refused'});return true;}
  if(input.type==='heartbeat'){
   if(!state.ready||state.probe?.probeId!==input.probeId)return false;
   state.probe=null;state.healthDueAt=this.now+this.options.heartbeatIntervalMs;return true;
  }
  if(state.phase!=='starting')return false;
  if(input.component==='engine'){
   if(input.protocol!==8){this._fail('engine','incompatible-engine',{terminal:true});return false;}
   if(input.compositorReady!==true)return false;
  }
  if(input.component==='shell'&&(input.appId!=='dev.f-io.livi'||input.fullscreen!==true||input.role!=='main'))return false;
  state.phase='ready';state.alive=true;state.ready=true;state.deadlineAt=null;state.healthDueAt=this.now+this.options.heartbeatIntervalMs;
  this._progress();return true;
 }
 isEffectCurrent(effect){
  if(!effect||typeof effect!=='object'||Array.isArray(effect))return false;
  if(effect.type==='present')return !!this.presentation&&exact(effect,['type','owner','screen','reason','presentationId','confirmed'])&&effect.owner==='appliance-presenter'&&effect.presentationId===this.presentation?.presentationId&&effect.screen===this.presentation.screen&&effect.reason===this.presentation.reason&&effect.confirmed===false;
  if(!components.includes(effect.component)||effect.owner!==owner(effect.component))return false;
  const state=this.components[effect.component];if(effect.generation!==state.generation)return false;
  const fields=['type','owner','component','generation'];
  if(effect.type==='stop')return exact(effect,[...fields,'mode'])&&state.phase==='stopping'&&effect.mode===state.stopMode;
  if(effect.type==='revoke-input')return exact(effect,fields)&&effect.component==='shell'&&state.inputRevoked;
  if(effect.type==='probe')return exact(effect,[...fields,'probeId'])&&this.active&&state.ready&&effect.probeId===state.probe?.probeId;
  if(!this.active||state.phase!=='starting'||this.recovery||(this.incident&&components.indexOf(effect.component)>=this.incident.index))return false;
  if(effect.type==='start')return exact(effect,fields);
  return effect.type==='fullscreen'&&exact(effect,[...fields,'appId','role'])&&effect.component==='shell'&&effect.appId==='dev.f-io.livi'&&effect.role==='main';
 }
 snapshot(){return structuredClone({status:this.status,active:this.active,recovery:this.recovery,presentation:this.presentation,components:this.components});}
 takeEffects(){const effects=this.effects.filter(effect=>this.isEffectCurrent(effect));this.effects=[];return structuredClone(effects);}
}
