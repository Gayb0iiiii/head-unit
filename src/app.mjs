import {connectionPresentation} from './connection-status.mjs';
import {startClock} from './clock.mjs';
import {Headunit} from './model.mjs';
import {NativeHeadunit} from './native-model.mjs';
import {renderSensorSettings, bindSensorSettings} from './sensor-settings.mjs';
let sensorSettingsBinding;
let sensorSettingsSnapshot;

let storage;try{storage=localStorage;}catch{}
const native=typeof window !== 'undefined' && window.headunit && typeof window.headunit.getView === 'function';
const model=native?new NativeHeadunit(storage,window.headunit,()=>render()):new Headunit(storage);
let diagnosticsOpen=false;
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const glyphs={home:'<rect x="4" y="4" width="6" height="6" rx="2"/><rect x="14" y="4" width="6" height="6" rx="2"/><rect x="4" y="14" width="6" height="6" rx="2"/><rect x="14" y="14" width="6" height="6" rx="2"/>',phones:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/>',projection:'<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3z"/>',settings:'<path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',vehicle:'<path d="m4 10 2-5h12l2 5M3 16h18V10H3zM6 16v3m12-3v3M6 13h2m8 0h2"/>',audio:'<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',back:'<path d="m14 5-7 7 7 7"/>',dashboard:'<rect x="3" y="4" width="11" height="16" rx="2"/><rect x="17" y="4" width="4" height="7" rx="1"/><rect x="17" y="14" width="4" height="6" rx="1"/>',play:'<path d="m9 5 11 7-11 7z"/>',pause:'<path d="M8 5v14M16 5v14"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${glyphs[name]||glyphs.home}</svg>`;
const button=(name,key,cls='')=>`<button class="${cls}" data-action="${key}" data-focus-key="${cls.split(' ')[0]||'action'}-${key}">${icon(key)}<span>${name}</span></button>`;

const appCatalog={projection:{name:'CarPlay',color:'mint'},phones:{name:'Phones',color:'blue'},vehicle:{name:'Vehicle',color:'orange'},audio:{name:'Audio',color:'pink'},settings:{name:'Settings',color:'silver'}};
const itemName=id=>appCatalog[id]?.name||({music:'Now playing',temperature:'Temperatures'})[id];
let layoutMessage='';
const motionNotice=s=>s.motionState==='moving'?'Editing is locked while the vehicle is moving.':s.motionState==='stationary'?'Vehicle is stationary.':'No vehicle motion signal. Only edit when safely parked.';
const saveNotice=()=>model.state.persistenceError?'Changes apply for this session. Device storage is unavailable; changes were not saved.':'';
function applyAppearance(){
  const strength=model.state.glassStrength;
  document.body.dataset.appearance=model.state.appearance.mode;
  document.body.dataset.wallpaper=model.state.wallpaper;
  document.body.dataset.dockSide=model.state.dockSide;
  document.body.style.setProperty('--glass-blur',`${strength*28/100}px`);
  document.body.style.setProperty('--glass-tint',`${0.18+strength*0.0044}`);
  document.body.style.setProperty('--glass-highlight',`${0.05+strength*0.0011}`);
}
function reorderControls(kind,id,s){
  const order=kind==='apps'?s.appOrder:s.dashboardOrder;
  const position=order.indexOf(id);
  return `<div class="reorder-controls" role="group" aria-label="Reorder ${itemName(id)}"><button data-move="${kind}:${id}:-1" data-focus-key="${kind}-${id}-earlier" aria-label="Move ${itemName(id)} earlier" aria-disabled="${position===0}"><span aria-hidden="true">←</span><span>Earlier</span></button><span class="item-position">${position+1}/${order.length}</span><button data-move="${kind}:${id}:1" data-focus-key="${kind}-${id}-later" aria-label="Move ${itemName(id)} later" aria-disabled="${position===order.length-1}"><span>Later</span><span aria-hidden="true">→</span></button></div>`;
}
function renderApps(s){
  return `<div class="apps">${s.appOrder.map(id=>`<div class="app-entry" data-layout-id="${id}"><button class="tile ${appCatalog[id].color}" data-action="${id}" data-focus-key="app-${id}" ${s.editingLayout?'disabled':''}><span class="app-symbol">${icon(id)}</span><span>${appCatalog[id].name}</span></button>${s.editingLayout?reorderControls('apps',id,s):''}</div>`).join('')}</div>`;
}
function renderNativeMedia(s){
  const media=s.homeStatus.media;
  const available=media.status==='available';
  const message=media.status==='stale'?'Media status is stale. Waiting for a core update.':media.status==='disconnected'?'Media disconnected.':'Media details unavailable.';
  const enabled=available&&media.playing!==null&&!model.pendingPhone;
  return `<section class="dashboard-card music-card native-media" data-layout-id="music" aria-label="Now playing"><h2>Now playing</h2>${available?`<h3>${escapeHtml(media.title??'Track unavailable')}</h3><p>${escapeHtml(media.artist??'Artist unavailable')}</p><p>${media.playing===null?'Playback state unavailable':media.playing?'Playing':'Paused'}</p>`:`<p>${message}</p>`}<div class="native-media-controls"><button data-media="play" ${enabled?'':'disabled'}>Play</button><button data-media="pause" ${enabled?'':'disabled'}>Pause</button></div>${s.mediaPending?'<p role="status">Sending media command…</p>':''}${s.editingLayout&&s.homeMode==='dashboard'?reorderControls('dashboard','music',s):''}</section>`;
}
function renderHomeStatus(s){
  const phone=s.homeStatus.phone;
  const battery=phone.status==='stale'?'Stale':phone.batteryPercent===null?'Unavailable':`${Math.round(phone.batteryPercent)}%${phone.charging===true?' · Charging':''}`;
  return `<dl class="home-status" aria-label="Head unit status"><div><dt>Inside</dt><dd>Unavailable</dd></div><div><dt>Outside</dt><dd>Unavailable</dd></div><div><dt>Phone battery</dt><dd>${battery}</dd></div><div><dt>Signal</dt><dd>Unavailable</dd></div></dl>`;
}
function renderDashboardCard(s,id){return id==='music'?(native?renderNativeMedia(s):`<section class="dashboard-card music-card" data-layout-id="music" aria-label="Music preview"><div class="card-heading"><h2>Now playing</h2><button class="text-button" data-action="audio">Audio details</button></div><div class="track"><div class="demo-art" aria-hidden="true">${icon('audio')}</div><div class="track-copy"><h3>Coastal drive</h3><p>Demo track</p><span class="playback-status" role="status">${s.demoPlaying?'Simulated playback':'Paused preview'}</span></div></div><div class="music-controls"><div class="demo-timeline"><div class="track-line" aria-hidden="true"><span></span></div><div class="track-time"><span>0:42</span><span>3:18</span></div></div><button class="play-button" data-action="demo-playback" aria-label="${s.demoPlaying?'Pause':'Play'} demo track" aria-pressed="${s.demoPlaying}">${icon(s.demoPlaying?'pause':'play')}</button></div><p class="card-note">Preview control only. No sound is played.</p>${s.editingLayout?reorderControls('dashboard','music',s):''}</section>`):`<section class="dashboard-card vehicle-card" data-layout-id="temperature" aria-label="Temperature information"><div class="card-heading"><h2>Temperatures</h2></div><dl class="temperature-metrics"><div><dt>Inside</dt><dd>Unavailable</dd></div><div><dt>Outside</dt><dd>Unavailable</dd></div></dl><p class="sensor-note">Separate temperature sensors are planned. No sensor data is connected.</p><button class="vehicle-details" data-action="vehicle">Vehicle details ${icon('back')}</button>${s.editingLayout?reorderControls('dashboard','temperature',s):''}</section>`;}
function renderSettings(s){return `<header><h1>Settings</h1></header>
<p class="motion-note">${motionNotice(s)}</p>
<section class="appearance-settings" aria-label="Appearance"><h2>Day & night</h2><div class="appearance-modes" role="group" aria-label="Day and night appearance">${['auto','day','night'].map(mode=>`<button data-appearance="${mode}" data-focus-key="appearance-${mode}" aria-pressed="${s.appearancePreference===mode}" ${s.motionState==='moving'?'disabled':''}>${mode[0].toUpperCase()+mode.slice(1)}</button>`).join('')}</div><p class="help" role="status">${s.appearance.source==='fallback'?`Headlight signal unavailable. Keeping ${s.appearance.mode} appearance.`:s.appearance.source==='manual'?`Manual ${s.appearance.mode} appearance. Auto needs a connected headlight signal.`:'Appearance follows the headlights.'}</p><p class="help">Panel brightness unavailable. Day and night change the interface colors only.</p><h2>Dock position</h2><div class="dock-position" role="group" aria-label="Dock position">${['left','right'].map(side=>`<button data-dock-side="${side}" data-focus-key="dock-${side}" aria-pressed="${s.dockSide===side}" ${s.motionState==='moving'?'disabled':''}>${side==='left'?'Left':'Right'}</button>`).join('')}</div><p class="help">Choose either side. On compact screens, the dock stays along the bottom.</p><h2>Wallpaper</h2><div class="swatches">${['coast','dusk','graphite'].map(w=>`<button class="swatch ${w}" data-wallpaper="${w}" data-focus-key="wallpaper-${w}" aria-pressed="${s.wallpaper===w}" ${s.motionState==='moving'?'disabled':''}><span>${w[0].toUpperCase()+w.slice(1)}</span></button>`).join('')}</div>
<div class="glass-settings"><div class="glass-heading"><label for="glass-strength">Glass strength</label><output id="glass-value" for="glass-strength">${s.glassStrength}%</output></div><input id="glass-strength" type="range" min="0" max="100" step="1" value="${s.glassStrength}" data-glass-strength="true" data-focus-key="glass-strength" ${s.motionState==='moving'?'disabled':''} aria-describedby="glass-help"><div class="range-endpoints"><span>Clear</span><span>Frosted</span></div><p id="glass-help">Wallpaper color passes through the glass. Text and symbols stay sharp.</p><button class="text-button" data-action="reset-glass" data-focus-key="reset-glass" ${s.motionState==='moving'?'disabled':''}>Reset glass strength</button></div></section>
<p id="save-status" class="save-status" role="status">${saveNotice()}</p>
<div class="rows compact"><button class="row" data-action="audio">${icon('audio')}<span><strong>Audio & microphone</strong><small>Native host routing</small></span><b>›</b></button><button class="row" data-action="diagnostics">${icon('settings')}<span><strong>Diagnostics</strong><small>Connection & integration status</small></span><b>›</b></button></div><section id="sensor-settings">${renderSensorSettings({storage,snapshot:sensorSettingsSnapshot,moving:s.motionState==='unknown'?null:s.motionState==='moving'})}</section>`;}

function render(focusKey=document.activeElement?.dataset?.focusKey){if(sensorSettingsBinding)sensorSettingsSnapshot=sensorSettingsBinding.getSnapshot?.();sensorSettingsBinding?.destroy();sensorSettingsBinding=null;const s=model.state;if(native&&(s.screen!=='settings'||s.front!=='livi'||!s.connected))diagnosticsOpen=false;const screen=diagnosticsOpen?'diagnostics':s.screen==='dashboard'?'home':s.screen;applyAppearance();document.body.dataset.nativeFront=native?s.front:'';const active=s.phones.find(p=>p.active);let content='';
if(screen==='home')content=`
<header class="home-header"><div><p class="eyebrow">Your drive, connected</p><h1>${s.homeMode==='dashboard'?'Your dashboard.':'Good to go.'}</h1></div><div class="connection"><i class="${active?'on':''}"></i>${active?escapeHtml(active.name):'Choose a phone'}</div></header>
${native?renderHomeStatus(s):''}<div class="home-toolbar"><div class="home-switch" role="group" aria-label="Home layout"><button data-home-mode="apps" data-focus-key="mode-apps" aria-pressed="${s.homeMode==='apps'}">${icon('home')}<span>Apps</span></button><button data-home-mode="dashboard" data-focus-key="mode-dashboard" aria-pressed="${s.homeMode==='dashboard'}">${icon('dashboard')}<span>Dashboard</span></button></div><div class="layout-actions">${s.editingLayout?'<button class="text-button" data-action="reset-layout" data-focus-key="reset-layout">Reset order</button><button class="done-button" data-action="done-layout" data-focus-key="done-layout">Done</button>':`<button class="text-button" data-action="edit-layout" data-focus-key="edit-layout" ${s.motionState==='moving'?'disabled':''}>Edit ${s.homeMode==='apps'?'apps':'dashboard'}</button>`}</div></div><div class="layout-guidance"><p class="motion-note">${motionNotice(s)}</p><p class="layout-status" role="status" aria-live="polite">${layoutMessage}</p><p id="save-status" class="save-status" role="status">${saveNotice()}</p></div>
${s.homeMode==='apps'?`${renderApps(s)}${native?renderNativeMedia(s):''}`:`
<div class="dashboard">
${s.dashboardOrder.map(id=>renderDashboardCard(s,id)).join('')}
</div><div class="dashboard-shortcuts">${button('CarPlay','projection','dashboard-shortcut carplay-shortcut')}${button('Switch phone','phones','dashboard-shortcut')}${button('Settings','settings','dashboard-shortcut')}</div>`}`;
if(screen==='phones')content=`<header><div><p class="eyebrow">${native?'Native device list':'Connection preview'}</p><h1>Phones</h1></div></header><p class="intro">${native?'Choose a phone already known to LIVI. The active phone changes only when the native engine reports it.':'Choose which phone takes the screen. Pairing and switching here are simulated.'}</p><div class="rows">${s.phones.map(p=>`<button class="row" data-phone="${escapeHtml(p.id)}" aria-label="Connect ${escapeHtml(p.name)}" ${native&&!s.connected?'disabled':''}>${icon('phones')}<span><strong>${escapeHtml(p.name)}</strong><small>${native?(p.active?'Active':p.status==='available'?'Available':'Offline'):p.active?'Active preview':'Saved demo phone'}</small></span><b>${p.active?'Open':'Connect'}</b></button>`).join('')}</div>${native&&model.pendingPhone?'<p role="status">Switching phone…</p>':''}${native&&!s.phones.length?'<p class="help">No phones reported by LIVI.</p>':''}<p class="help">Live pairing requires the native host and a supported adapter.</p><section class="phone-capabilities" aria-label="Phone capabilities"><div class="actions"><button disabled title="Native pairing backend not connected">Add phone</button><button disabled title="Native device registry not connected">Remove saved phone</button></div><p>Wired / wireless CarPlay and Bluetooth-only selection: per-phone backend integration required.</p><p>Contact sync: PBAP backend and phone permission required. No contacts accessed.</p><p>Separate call and music phones: capability testing required.</p></section>`;
if(screen==='projection')content=native?`<div class="native-projection-region" aria-label="Native projection surface"></div>`:`<header><div><p class="eyebrow">${active?escapeHtml(active.name):'No phone selected'}</p><h1>Projection preview</h1></div><span class="pill">Simulated</span></header><div class="projection-placeholder">${icon('projection')}<h2>${active?'Your phone’s screen goes here':'Connect a phone to begin'}</h2><p>Live CarPlay is rendered by the native compositor.<br>This preview does not stream video, audio or microphone input.</p>${button(active?'Switch phone':'Choose phone','phones','primary')}</div>`;
if(screen==='settings')content=renderSettings(s);
if(screen==='diagnostics')content=native?`<header>${button('Back','back','back')}<h1>Diagnostics</h1></header><div class="panel"><h2>Native connection</h2><p>${s.connected?'Connected to LIVI':'Disconnected from LIVI'}</p><p>Projection, audio and microphone are owned by the native host.</p></div>`:`<header>${button('Back','back','back')}<h1>Diagnostics</h1></header><div class="panel"><h2>Hardware not connected</h2><p>Transport: simulated UI state</p><p>LIVI: 9.5.0 contract research</p><p>Vehicle service: independent, not connected</p><p>v4 baseline: awaiting file access</p><p>Audio, microphone, touch forwarding and MFi adapter: untested</p><div class="actions"><button data-action="disconnect">Simulate disconnect</button><button data-action="reconnect">Simulate reconnect</button></div></div>`;
if(screen==='vehicle')content=`<header><h1>Vehicle</h1></header><div class="panel"><h2>Vehicle service stays independent</h2><p>No vehicle data or controls are connected in this scaffold. The existing vehicle service will be integrated after the v4 baseline is available.</p><p>Phone switching must never restart vehicle services.</p></div>`;
if(screen==='audio')content=`<header><h1>Audio & microphone</h1></header><div class="panel"><h2>Owned by the native host</h2><p>Music, call audio, microphone input and audio focus stay in the native pipeline.</p><p>No audio devices are connected here. Hardware routing and echo testing are still required.</p></div>`;
if(screen==='disconnected'){const status=connectionPresentation(s.connectionPhase);content=`<header><h1>${status.title}</h1></header><div class="panel" role="status"><p>${status.detail}</p></div>`;}
if(screen==='camera'||screen==='cluster')content='<header><h1>Native display in control</h1></header>';
document.getElementById('app').innerHTML=`<aside aria-label="Dock"><output id="headunit-clock" class="time">${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false})}</output><div class="dock-apps">${button('CarPlay','projection','dock-button')}${button('Phones','phones','dock-button')}</div>${button('Home','home','dock-button home-button')}</aside><main data-editing="${s.editingLayout}">${content}${native&&s.notice?'<p role="status">Projection reconnecting</p>':''}${native&&s.commandError?'<p role="alert">Native command unavailable</p>':''}<footer class="bottom-note"><span>${native?'LIVI native shell':'Software preview'}</span><span>${native?'Vehicle data unavailable':'No live audio or vehicle connection'}</span></footer></main>`;
document.querySelectorAll('[data-action]').forEach(el=>el.onclick=()=>{
  const a=el.dataset.action;
  if(a==='edit-layout'){
    if(model.beginLayoutEdit()) layoutMessage='Use Earlier and Later to reorder. Changes save automatically.';
    render('done-layout');return;
  }
  if(a==='done-layout'){model.endLayoutEdit();layoutMessage='';render('edit-layout');return;}
  if(a==='reset-layout'){
    if(model.resetLayout(s.homeMode)) layoutMessage=`Default ${s.homeMode==='apps'?'app':'dashboard'} order restored.`;
    render();return;
  }
  if(a==='reset-glass'){model.setGlassStrength(55);render();return;}
  layoutMessage='';
  if(native&&a!=='diagnostics')diagnosticsOpen=false;
  if(a==='home')model.home();
  else if(a==='back'&&native)diagnosticsOpen=false;
  else if(a==='back')model.navigate('settings');
  else if(a==='diagnostics'&&native)diagnosticsOpen=true;
  else if(a==='disconnect')model.disconnect();
  else if(a==='reconnect')model.reconnect();
  else if(a==='demo-playback')model.toggleDemoPlayback();
  else model.navigate(a);
  render();
});
document.querySelectorAll('[data-home-mode]').forEach(el=>el.onclick=()=>{layoutMessage='';model.setHomeMode(el.dataset.homeMode);render();});
document.querySelectorAll('[data-media]').forEach(el=>el.onclick=()=>{model.media(el.dataset.media);render();});
document.querySelectorAll('[data-phone]').forEach(el=>el.onclick=()=>{model.connect(el.dataset.phone);render();});
document.querySelectorAll('button[data-wallpaper]').forEach(el=>el.onclick=()=>{model.wallpaper(el.dataset.wallpaper);render();});
document.querySelectorAll('[data-move]').forEach(el=>el.onclick=()=>{
  const [kind,id,step]=el.dataset.move.split(':');
  if(model.moveLayoutItem(kind,id,Number(step))){
    const order=kind==='apps'?s.appOrder:s.dashboardOrder;
    layoutMessage=`${itemName(id)} moved to position ${order.indexOf(id)+1} of ${order.length}.`;
  }
  render(el.dataset.focusKey);
});
document.querySelectorAll('button[data-appearance]').forEach(el=>el.onclick=()=>{model.setAppearancePreference(el.dataset.appearance);render(el.dataset.focusKey);});
document.querySelectorAll('button[data-dock-side]').forEach(el=>el.onclick=()=>{model.setDockSide(el.dataset.dockSide);render(el.dataset.focusKey);});
document.querySelectorAll('[data-glass-strength]').forEach(el=>el.oninput=()=>{
  model.setGlassStrength(Number(el.value));
  applyAppearance();
  document.getElementById('glass-value').textContent=`${s.glassStrength}%`;
  document.getElementById('save-status').textContent=saveNotice();
});
if(screen==='settings')sensorSettingsBinding=bindSensorSettings(document.getElementById('sensor-settings'),{storage,snapshot:sensorSettingsSnapshot,getMoving:()=>model.state.motionState==='unknown'?null:model.state.motionState==='moving'});
if(focusKey){[...document.querySelectorAll('[data-focus-key]')].find(el=>el.dataset.focusKey===focusKey&&!el.disabled)?.focus();}
}
// Integration entry point for a real vehicle host. This preview has no source;
// its default remains unknown, and there is deliberately no fake motion toggle.
export function updateVehicleMotion(value){
  if(value===model.state.motionState)return;
  const wasEditing=model.state.editingLayout;
  model.setMotionState(value);
  if(value==='moving'&&wasEditing) layoutMessage='Layout editing ended because the vehicle is moving.';
  render(value==='moving'&&wasEditing?'dock-button-home':undefined);
}
render();
if(native)model.start();

const stopClock=startClock(date=>{const node=document.getElementById('headunit-clock');if(node)node.textContent=date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});});
window.addEventListener?.('unload',()=>{stopClock();model.stop?.();});
