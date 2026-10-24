import test from 'node:test';
import assert from 'node:assert/strict';
import { Headunit } from '../src/model.mjs';
test('home preserves an active phone session',()=>{const h=new Headunit();h.connect('phone-a');h.home();assert.equal(h.state.screen,'home');assert.equal(h.state.activePhone,'phone-a');});
test('switching changes exactly one active session',()=>{const h=new Headunit();h.connect('phone-a');h.connect('phone-b');assert.equal(h.state.activePhone,'phone-b');assert.equal(h.state.phones.filter(p=>p.active).length,1);});
test('reconnect restores last phone without changing vehicle service',()=>{const h=new Headunit();h.connect('phone-b');h.disconnect();h.reconnect();assert.equal(h.state.activePhone,'phone-b');assert.equal(h.state.vehicleStatus,'independent');});
test('unknown phones and wallpapers cannot enter state',()=>{const h=new Headunit();assert.throws(()=>h.connect('unknown'));assert.throws(()=>h.wallpaper('url(http://external)'));});
test('appearance persists without a phone session and tolerates broken storage',()=>{const data={};const storage={getItem:k=>data[k],setItem:(k,v)=>data[k]=v};const h=new Headunit(storage);h.wallpaper('dusk');assert.equal(new Headunit(storage).state.wallpaper,'dusk');h.connect('phone-a');assert.equal(new Headunit(storage).state.activePhone,null);assert.doesNotThrow(()=>new Headunit({getItem:()=>{throw Error('blocked')}}));});

const memoryStorage = () => {
  const data = new Map();
  return { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
};

test('Home offers an app grid and dashboard without ending the phone session', () => {
  const h = new Headunit();
  assert.equal(h.state.homeMode, 'apps');
  h.connect('phone-a');
  h.setHomeMode('dashboard');
  assert.equal(h.state.screen, 'home');
  assert.equal(h.state.homeMode, 'dashboard');
  assert.equal(h.state.activePhone, 'phone-a');
  h.setHomeMode('apps');
  assert.equal(h.state.homeMode, 'apps');
  assert.throws(() => h.setHomeMode('camera'));
});

test('startup restores the last explicit screen and Home layout', () => {
  const storage = memoryStorage();
  const h = new Headunit(storage);
  h.setHomeMode('dashboard');
  h.navigate('settings');
  const restored = new Headunit(storage);
  assert.equal(restored.state.screen, 'settings');
  assert.equal(restored.state.homeMode, 'dashboard');
  restored.home();
  assert.equal(new Headunit(storage).state.screen, 'home');
  assert.equal(new Headunit(storage).state.homeMode, 'dashboard');
});

test('disconnect never replaces the last explicit function or restores a phone session', () => {
  const storage = memoryStorage();
  const h = new Headunit(storage);
  h.connect('phone-b');
  h.disconnect();
  assert.equal(h.state.screen, 'home');
  const restored = new Headunit(storage);
  assert.equal(restored.state.screen, 'projection');
  assert.equal(restored.state.activePhone, null);
  assert.equal(restored.lastPhone, null);
  assert.equal(restored.state.phones.some(p => p.active), false);
});

test('native overlays and invalid saved state can never become startup screens', () => {
  for (const screen of ['camera', 'cluster', 'disconnected', '__proto__', '<script>']) {
    const storage = memoryStorage();
    storage.setItem('headunit.navigation', JSON.stringify({ screen, homeMode: 'dashboard' }));
    const h = new Headunit(storage);
    assert.equal(h.state.screen, 'home');
    assert.equal(h.state.homeMode, 'dashboard');
    assert.throws(() => h.navigate(screen));
  }
  for (const value of ['null', 'false', '{broken', '{"homeMode":"camera"}']) {
    const storage = memoryStorage();
    storage.setItem('headunit.navigation', value);
    assert.equal(new Headunit(storage).state.screen, 'home');
    assert.equal(new Headunit(storage).state.homeMode, 'apps');
  }
});

test('preview music controls are simulated and never resume playback on startup', () => {
  const storage = memoryStorage();
  const h = new Headunit(storage);
  assert.equal(h.state.demoPlaying, false);
  h.toggleDemoPlayback();
  assert.equal(h.state.demoPlaying, true);
  assert.equal(new Headunit(storage).state.demoPlaying, false);
  h.toggleDemoPlayback();
  assert.equal(h.state.demoPlaying, false);
  assert.equal(h.state.vehicleStatus, 'independent');
});

test('navigation remains usable if browser preference storage is unavailable', () => {
  const h = new Headunit({ getItem() { throw Error('blocked'); }, setItem() { throw Error('full'); } });
  assert.doesNotThrow(() => h.setHomeMode('dashboard'));
  assert.doesNotThrow(() => h.navigate('audio'));
  assert.equal(h.state.screen, 'audio');
  assert.equal(h.state.homeMode, 'dashboard');
});

test('simulated reconnect restores the explicit function without replacing it with projection', () => {
  const storage = memoryStorage();
  const h = new Headunit(storage);
  h.connect('phone-a');
  h.setHomeMode('dashboard');
  h.navigate('settings');
  h.disconnect();
  h.reconnect();
  assert.equal(h.state.screen, 'settings');
  assert.equal(h.state.activePhone, 'phone-a');
  assert.equal(new Headunit(storage).state.screen, 'settings');
  assert.equal(new Headunit(storage).state.homeMode, 'dashboard');
});

test('glass strength has a balanced default and persists without replacing wallpaper', () => {
  const storage = memoryStorage();
  const h = new Headunit(storage);
  assert.equal(h.state.glassStrength, 55);
  h.wallpaper('dusk');
  h.setGlassStrength(0);
  assert.equal(new Headunit(storage).state.glassStrength, 0);
  assert.equal(new Headunit(storage).state.wallpaper, 'dusk');
  h.setGlassStrength(100);
  h.wallpaper('graphite');
  assert.equal(new Headunit(storage).state.glassStrength, 100);
  for (const value of [-1, 101, NaN, Infinity, '55', null, 0.5]) {
    assert.throws(() => h.setGlassStrength(value));
  }
  assert.equal(h.state.glassStrength, 100);
});
test('debug overlay is disabled by default and persists only an explicit boolean',()=>{
 const storage=memoryStorage(),model=new Headunit(storage,{simulation:false});
 assert.equal(model.state.debugOverlay,false);
 model.setDebugOverlay(true);
 assert.equal(new Headunit(storage,{simulation:false}).state.debugOverlay,true);
 model.setDebugOverlay(false);
 assert.equal(new Headunit(storage,{simulation:false}).state.debugOverlay,false);
 assert.throws(()=>model.setDebugOverlay('true'));
});
test('native Apps order contains only real destinations and persists reordering',()=>{
 const storage=memoryStorage(),model=new Headunit(storage,{simulation:false});
 assert.deepEqual(model.state.appOrder,['radio','bluetooth','projection','settings']);
 assert.equal(model.beginLayoutEdit(),true);
 assert.equal(model.moveLayoutItem('apps','settings',-1),true);
 assert.deepEqual(new Headunit(storage,{simulation:false}).state.appOrder,['radio','bluetooth','settings','projection']);
 model.resetLayout('apps');
 assert.deepEqual(model.state.appOrder,['radio','bluetooth','projection','settings']);
});

test('saved layouts keep allowlisted unique IDs and append missing defaults', () => {
  const storage = memoryStorage();
  storage.setItem('headunit.layout', JSON.stringify({
    appOrder: ['audio', 'audio', '<script>', 'phones', '__proto__'],
    dashboardOrder: ['temperature', 'temperature', 'unknown']
  }));
  const h = new Headunit(storage);
  assert.deepEqual(h.state.appOrder, ['audio', 'phones', 'projection', 'vehicle', 'settings']);
  assert.deepEqual(h.state.dashboardOrder, ['temperature', 'music']);
  assert.equal(h.state.editingLayout, false);
  assert.equal(h.state.motionState, 'unknown');
});

test('icons and dashboard tiles can be moved independently, persisted and reset', () => {
  const storage = memoryStorage();
  const h = new Headunit(storage);
  assert.equal(h.beginLayoutEdit(), true);
  assert.equal(h.moveLayoutItem('apps', 'phones', -1), true);
  assert.equal(h.moveLayoutItem('dashboard', 'temperature', -1), true);
  assert.equal(h.moveLayoutItem('apps', 'phones', -1), false);
  h.endLayoutEdit();
  const restored = new Headunit(storage);
  assert.deepEqual(restored.state.appOrder, ['phones', 'projection', 'vehicle', 'audio', 'settings']);
  assert.deepEqual(restored.state.dashboardOrder, ['temperature', 'music']);
  assert.equal(restored.state.editingLayout, false);
  restored.beginLayoutEdit();
  restored.resetLayout('apps');
  assert.deepEqual(restored.state.appOrder, ['projection', 'phones', 'vehicle', 'audio', 'settings']);
  assert.deepEqual(restored.state.dashboardOrder, ['temperature', 'music']);
  restored.resetLayout('dashboard');
  assert.deepEqual(new Headunit(storage).state.dashboardOrder, ['music', 'temperature']);
});

test('layout actions reject invalid IDs and cannot mutate outside edit mode', () => {
  const h = new Headunit();
  const original = [...h.state.appOrder];
  assert.equal(h.moveLayoutItem('apps', 'phones', -1), false);
  assert.equal(h.resetLayout('apps'), false);
  h.beginLayoutEdit();
  for (const args of [['settings', 'phones', -1], ['apps', 'unknown', -1], ['apps', 'phones', 2]]) {
    assert.throws(() => h.moveLayoutItem(...args));
  }
  assert.throws(() => h.resetLayout('unknown'));
  assert.deepEqual(h.state.appOrder, original);
});

test('known motion immediately locks editing; unknown is never treated as parked', () => {
  const storage = memoryStorage();
  const h = new Headunit(storage);
  assert.equal(h.state.motionState, 'unknown');
  h.beginLayoutEdit();
  h.setMotionState('moving');
  assert.equal(h.state.editingLayout, false);
  assert.equal(h.beginLayoutEdit(), false);
  assert.equal(h.moveLayoutItem('apps', 'phones', -1), false);
  assert.equal(h.resetLayout('apps'), false);
  assert.throws(() => h.setMotionState('parked'));
  h.setMotionState('stationary');
  assert.equal(h.beginLayoutEdit(), true);
  assert.equal(new Headunit(storage).state.motionState, 'unknown');
});

test('corrupt saved layouts and appearance fall back safely without restoring motion', () => {
  for (const value of ['null', 'false', '5', '"abc"', '{broken', '{"appOrder":false,"dashboardOrder":null,"motionState":"stationary","glassStrength":101}']) {
    const storage = memoryStorage();
    storage.setItem('headunit.layout', value);
    storage.setItem('headunit.appearance', value);
    const h = new Headunit(storage);
    assert.deepEqual(h.state.appOrder, ['projection', 'phones', 'vehicle', 'audio', 'settings']);
    assert.deepEqual(h.state.dashboardOrder, ['music', 'temperature']);
    assert.equal(h.state.glassStrength, 55);
    assert.equal(h.state.motionState, 'unknown');
  }
});

test('blocked storage keeps preferences usable and reports that changes were not saved', () => {
  const h = new Headunit({ getItem() { throw Error('blocked'); }, setItem() { throw Error('full'); } });
  h.beginLayoutEdit();
  assert.doesNotThrow(() => h.moveLayoutItem('apps', 'phones', -1));
  assert.doesNotThrow(() => h.setGlassStrength(25));
  assert.equal(h.state.glassStrength, 25);
  assert.equal(h.state.appOrder[0], 'phones');
  assert.equal(h.state.persistenceError, true);
});

test('known motion also blocks wallpaper and glass personalization until stationary', () => {
  const h = new Headunit();
  h.setMotionState('moving');
  assert.equal(h.wallpaper('dusk'), false);
  assert.equal(h.setGlassStrength(90), false);
  assert.equal(h.state.wallpaper, 'coast');
  assert.equal(h.state.glassStrength, 55);
  h.setMotionState('stationary');
  h.wallpaper('dusk');
  h.setGlassStrength(90);
  assert.equal(h.state.wallpaper, 'dusk');
  assert.equal(h.state.glassStrength, 90);
});
test('UI scale is bounded, persisted, and can be restored independently of wallpaper',()=>{
 const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
 const h=new Headunit(storage,{simulation:false});
 assert.equal(h.state.uiScale,100);
 assert.throws(()=>h.setUiScale(150));assert.throws(()=>h.setUiScale(91));
 h.setUiScale(115);assert.equal(new Headunit(storage,{simulation:false}).state.uiScale,115);
 h.wallpaper('dusk');assert.equal(new Headunit(storage,{simulation:false}).state.uiScale,115);
 data.set('headunit.appearance',JSON.stringify({uiScale:999,wallpaper:'coast'}));
 assert.equal(new Headunit(storage,{simulation:false}).state.uiScale,100);
});
test('custom wallpaper accepts only a validated local data image and reset clears saved bytes',()=>{
 const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 const h=new Headunit(storage,{simulation:false});
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/uXcAAAAASUVORK5CYII=';
 assert.throws(()=>h.setCustomWallpaper('url(https://example.com/x)'));
 h.setCustomWallpaper(png);assert.equal(h.state.wallpaper,'custom');
 assert.equal(new Headunit(storage,{simulation:false}).state.wallpaper,'custom');
 h.resetCustomWallpaper();assert.equal(h.state.wallpaper,'coast');assert.equal(data.has('headunit.wallpaper.image'),false);
});

test('curated landscape, pastel, solid and gradient wallpapers persist without accepting arbitrary URLs',()=>{
 const storage=memoryStorage(),h=new Headunit(storage,{simulation:false});
 for(const id of ['meadow','blue-forms','pastel-mint','pastel-lilac','solid-slate','gradient-lagoon']){
  h.wallpaper(id);
  assert.equal(new Headunit(storage,{simulation:false}).state.wallpaper,id);
 }
 assert.throws(()=>h.wallpaper('https://example.com/image.jpg'));
 assert.throws(()=>h.wallpaper('__proto__'));
 storage.setItem('headunit.appearance',JSON.stringify({wallpaper:'../../secret'}));
 assert.equal(new Headunit(storage,{simulation:false}).state.wallpaper,'coast');
});

test('wallpaper tuning and accent are bounded, persistent and reset without deleting the selected wallpaper',()=>{
 const storage=memoryStorage(),h=new Headunit(storage,{simulation:false});
 assert.deepEqual([h.state.accent,h.state.wallpaperBrightness,h.state.wallpaperDim,h.state.wallpaperBlur],['sea',100,0,0]);
 h.wallpaper('pastel-mint');h.setAccent('coral');h.setWallpaperBrightness(125);h.setWallpaperDim(35);h.setWallpaperBlur(4);
 const saved=new Headunit(storage,{simulation:false});
 assert.deepEqual([saved.state.wallpaper,saved.state.accent,saved.state.wallpaperBrightness,saved.state.wallpaperDim,saved.state.wallpaperBlur],['pastel-mint','coral',125,35,4]);
 for(const [method,value] of [['setAccent','url(x)'],['setWallpaperBrightness',145],['setWallpaperBrightness',61],['setWallpaperDim',65],['setWallpaperDim',3],['setWallpaperBlur',9],['setWallpaperBlur',.5]])assert.throws(()=>h[method](value));
 h.setMotionState('moving');
 assert.equal(h.setAccent('cobalt'),false);assert.equal(h.setWallpaperDim(20),false);
 assert.equal(h.state.accent,'coral');assert.equal(h.state.wallpaperDim,35);
 h.setMotionState('stationary');h.resetWallpaperTuning();
 assert.deepEqual([h.state.wallpaper,h.state.accent,h.state.wallpaperBrightness,h.state.wallpaperDim,h.state.wallpaperBlur],['pastel-mint','sea',100,0,0]);
 assert.equal(new Headunit(storage,{simulation:false}).state.wallpaper,'pastel-mint');
 storage.setItem('headunit.appearance',JSON.stringify({accent:'invalid',wallpaperBrightness:-50,wallpaperDim:900,wallpaperBlur:99}));
 const invalid=new Headunit(storage,{simulation:false});
 assert.deepEqual([invalid.state.accent,invalid.state.wallpaperBrightness,invalid.state.wallpaperDim,invalid.state.wallpaperBlur],['sea',100,0,0]);
});

test('dock side defaults left and persists either explicit side without losing appearance',()=>{
 const storage=memoryStorage(),h=new Headunit(storage);assert.equal(h.state.dockSide,'left');
 h.wallpaper('dusk');h.setGlassStrength(80);h.setDockSide('right');
 const restored=new Headunit(storage);assert.equal(restored.state.dockSide,'right');assert.equal(restored.state.wallpaper,'dusk');assert.equal(restored.state.glassStrength,80);
 restored.setDockSide('left');assert.equal(new Headunit(storage).state.dockSide,'left');
});
test('dock side rejects invalid saved or requested values and obeys motion/storage guards',()=>{
 const storage=memoryStorage();storage.setItem('headunit.appearance',JSON.stringify({dockSide:'auto-rhd'}));
 const h=new Headunit(storage);assert.equal(h.state.dockSide,'left');assert.throws(()=>h.setDockSide('bottom'));
 h.setMotionState('moving');assert.equal(h.setDockSide('right'),false);assert.equal(h.state.dockSide,'left');
 const session=new Headunit();session.setDockSide('right');assert.equal(session.state.dockSide,'right');assert.equal(session.state.persistenceError,true);
});

test('appearance override persists and auto retains the last mode without inventing headlights',()=>{
 const storage=memoryStorage(),h=new Headunit(storage);
 assert.deepEqual(h.state.appearance,{mode:'night',source:'fallback',signalAvailable:false});
 h.setAppearancePreference('day');h.setAppearancePreference('auto');
 const restored=new Headunit(storage);
 assert.equal(restored.state.appearancePreference,'auto');
 assert.deepEqual(restored.state.appearance,{mode:'day',source:'fallback',signalAvailable:false});
 assert.equal(restored.state.activePhone,null);
});
test('verified appearance signal is ephemeral and manual override wins',()=>{
 const storage=memoryStorage(),h=new Headunit(storage);
 h.updateHeadlights(false);assert.equal(h.state.appearance.mode,'day');
 h.setAppearancePreference('night');h.updateHeadlights(false);assert.equal(h.state.appearance.mode,'night');
 h.setAppearancePreference('auto');assert.equal(h.state.appearance.mode,'day');
 h.updateHeadlights(null);assert.deepEqual(h.state.appearance,{mode:'day',source:'fallback',signalAvailable:false});
 assert.equal(new Headunit(storage).state.appearance.signalAvailable,false);
 assert.throws(()=>h.updateHeadlights('on'));assert.throws(()=>h.setAppearancePreference('sunset'));
});
test('appearance handles corrupt storage, failed writes and moving edit lock',()=>{
 const h=new Headunit({getItem:()=>'{"appearancePreference":"wrong","lastAppearance":"wrong"}',setItem:()=>{throw Error('full');}});
 assert.equal(h.state.appearance.mode,'night');h.setAppearancePreference('day');
 assert.equal(h.state.persistenceError,true);assert.equal(h.state.appearance.mode,'day');
 h.setMotionState('moving');assert.equal(h.setAppearancePreference('night'),false);
 assert.equal(h.state.appearancePreference,'day');
});
