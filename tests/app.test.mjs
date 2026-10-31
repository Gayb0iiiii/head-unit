import test from 'node:test';
import assert from 'node:assert/strict';

// A small DOM boundary for event wiring and rendered markup, not browser/layout QA.
// All navigation, storage, and playback-preview state use the real application.
let instance = 0;
async function launch(data = new Map(), host = null, mode = null) {
  const root = { innerHTML: '' };
  let buttons = [];
  let elements = [];
  const listeners = new Map();
  const style = new Map();
  let doc;
  Object.defineProperty(root, 'innerHTML', {
    get() { return this.html || ''; },
    set(html) {
      this.html = html;
      elements = [...html.matchAll(/<(button|input|output|p)\b([^>]*)(?:>([\s\S]*?)<\/\1>|\s*\/?>(?!<\/input>))/g)].map(([, tag, attrs, text]) => {
        const dataset = Object.fromEntries([...attrs.matchAll(/data-([\w-]+)(?:="([^"]*)")?/g)].map(([, key, value]) => [key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value??'']));
        return {
          dataset, attrs, text, tag, onclick: null, oninput: null,
          id: attrs.match(/\bid="([^"]*)"/)?.[1],
          value: attrs.match(/\bvalue="([^"]*)"/)?.[1],
          disabled: /(?:^|\s)disabled(?:\s|$)/.test(attrs),
          focus() { doc.activeElement = this; },
          setAttribute(name, value) { this[name] = value; }
        };
      });
      buttons = elements.filter(element => element.tag === 'button');
      if (doc) doc.activeElement = null;
    }
  });
  globalThis.localStorage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  globalThis.window = host ? {headunit:host} : {};
  doc = globalThis.document = {
    documentElement: {dataset:{mode}},
    body: { dataset: {}, style: { setProperty: (key, value) => style.set(key, value) } },
    activeElement: null,
    addEventListener(type,listener) { listeners.set(type,listener); },
    getElementById: id => id === 'app' ? root : elements.find(element => element.id === id),
    querySelectorAll(selector) {
      if(selector==='.local-list,.dock-apps')return [];
      const [,tag,keyName] = selector.match(/^(button)?\[data-([\w-]+)\]$/);
      const key = keyName.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return [...elements,doc.body].filter(element => (!tag || element.tag === tag) && key in element.dataset);
    }
  };
  const application = await import(`../src/app.mjs?unit=${++instance}`);
  return {
    root, data, style, doc,
    key(key) { let prevented=false;listeners.get('keydown')?.({key,altKey:false,ctrlKey:false,metaKey:false,preventDefault(){prevented=true;}});return prevented; },
    updateMotion: value => application.updateVehicleMotion(value),
    focus(key) { elements.find(element => element.dataset.focusKey === key)?.focus(); },
    input(key, value) {
      const input = elements.find(element => key in element.dataset);
      assert.ok(input, `Rendered input ${key} exists`);
      assert.equal(typeof input.oninput, 'function');
      input.value = value;
      input.focus();
      input.oninput();
      return input;
    },
    click(key, value) {
      const button = buttons.find(button => button.dataset[key] === value);
      assert.ok(button, `Rendered button ${key}=${value} exists`);
      assert.equal(typeof button.onclick, 'function');
      if (!button.disabled) { button.onclick(); doc.body.onclick?.(); }
    }
  };
}

test('production page without preload never creates demo state or controls',async()=>{
 const ui=await launch(new Map(),null,'production');
 assert.match(ui.root.innerHTML,/System unavailable/);
 assert.doesNotMatch(ui.root.innerHTML,/Driver.s iPhone|Passenger.s iPhone|Coastal drive|Demo|data-action/);
});
test('Settings update requires a second parked action and stays disabled in motion',async()=>{
 let requests=0,publish;
 const host={onView:()=>()=>{},getView:async()=>({connected:false,phones:[]}),getUpdateStatus:async()=>({phase:'idle',sha:null}),
   onUpdateStatus:fn=>{publish=fn;return()=>{};},requestUpdate:async parked=>{assert.equal(parked,true);requests++;return {accepted:true};}};
 const ui=await launch(new Map(),host,'production');await new Promise(setImmediate);
 ui.click('action','settings');
 assert.match(ui.root.innerHTML,/Check for update/);
 ui.click('action','arm-update');assert.equal(requests,0);
 assert.match(ui.root.innerHTML,/I am parked · Update/);
 ui.click('action','home');ui.click('action','settings');
 assert.doesNotMatch(ui.root.innerHTML,/I am parked · Update/);
 assert.equal(requests,0);
 ui.click('action','arm-update');
 ui.focus('confirm-update');
 ui.click('action','confirm-update');await new Promise(setImmediate);assert.equal(requests,1);
 publish({phase:'checking'});assert.match(ui.root.innerHTML,/Cancel check/);
 assert.equal(ui.doc.activeElement?.dataset?.focusKey,'cancel-update');
 publish({phase:'activating'});assert.equal(ui.doc.activeElement?.dataset?.focusKey,'update-status');
 ui.updateMotion('moving');assert.match(ui.root.innerHTML,/data-action="arm-update"[^>]*disabled/);
});
test('production bridge stays empty until an authoritative view arrives',async()=>{
 let publish;
 const ui=await launch(new Map(),{onView:fn=>{publish=fn;return()=>{};},getView:async()=>({connected:false,route:'disconnected',phones:[]})},'production');
 assert.doesNotMatch(ui.root.innerHTML,/Driver.s iPhone|Passenger.s iPhone|Coastal drive|Simulated/);
 assert.match(ui.root.innerHTML,/<h1>Home<\/h1>/);
 assert.match(ui.root.innerHTML,/id="headunit-home-clock"/);
 assert.doesNotMatch(ui.root.innerHTML,/id="headunit-clock"/);
 assert.match(ui.root.innerHTML,/class="home-dashboard"/);
 assert.match(ui.root.innerHTML,/class="[^"]*home-media"/);
 assert.doesNotMatch(ui.root.innerHTML,/CarPlay, phone and media features are unavailable while/);
 assert.match(ui.root.innerHTML,/Now playing/);
 assert.match(ui.root.innerHTML,/Weather/);
 assert.match(ui.root.innerHTML,/Weather unavailable/);
 assert.match(ui.root.innerHTML,/data-action="settings"/);
 assert.doesNotMatch(ui.root.innerHTML,/Choose a phone|data-phone=|data-media=/);
 publish({connected:true,route:'home',front:'livi',phones:[]});
 assert.match(ui.root.innerHTML,/<h1>Home<\/h1>/);
 assert.doesNotMatch(ui.root.innerHTML,/Driver.s iPhone|Passenger.s iPhone|Coastal drive|Simulated|data-media=/);
 publish({connected:true,route:'phones',front:'livi',phones:[]});
 assert.match(ui.root.innerHTML,/No saved phones/);
 assert.doesNotMatch(ui.root.innerHTML,/Add phone|Contacts are unavailable|Demo/);
});
test('production Home keeps one clock and aligned information surfaces after a live view',async()=>{
 let publish;const ui=await launch(new Map(),{onView:fn=>{publish=fn;return()=>{};},getView:async()=>({connected:false,connectionPhase:'backoff'})},'production');
 publish({connected:true,route:'home',front:'livi',phones:[]});
 assert.equal((ui.root.innerHTML.match(/id="headunit-home-clock"/g)||[]).length,1);
 assert.doesNotMatch(ui.root.innerHTML,/id="headunit-clock"/);
 assert.match(ui.root.innerHTML,/class="home-dashboard"/);
 assert.match(ui.root.innerHTML,/Now playing/);
 assert.match(ui.root.innerHTML,/Weather/);
});

test('offline Home keeps missing media and weather compact and offers a real local destination',async()=>{
 const ui=await launch(new Map(),{onView:()=>()=>{},getView:async()=>({connected:false,connectionPhase:'backoff',phones:[]})},'production');
 assert.match(ui.root.innerHTML,/data-media-status="unavailable"/);
 assert.match(ui.root.innerHTML,/data-weather-status="unavailable"/);
 assert.match(ui.root.innerHTML,/No source connected/);
 assert.match(ui.root.innerHTML,/Weather unavailable/);
 assert.doesNotMatch(ui.root.innerHTML,/Outdoor temperature unavailable|class="weather-empty"/);
 assert.match(ui.root.innerHTML,/<button class="media-browse" data-action="audio"[^>]*>[\s\S]*?<span>Open local audio<\/span>/);
 ui.click('action','audio');
 assert.match(ui.root.innerHTML,/<h1>Local audio<\/h1>/);
});

test('production Home shows only observed weather with provider age and host clock zone',async()=>{
 const now=Date.now();
 const host={onView:()=>()=>{},getView:async()=>({connected:false,connectionPhase:'backoff',phones:[]}),
   onWeather:()=>()=>{},getWeather:async()=>({status:'current',location:{id:123,label:'Albany, Western Australia'},temperatureC:18.4,apparentC:17.1,windKmh:14.3,weatherCode:2,isDay:true,fetchedAt:now,observedAt:now-900000}),
   getTimeStatus:async()=>({timezone:'Australia/Perth',canNtp:true,ntpEnabled:true,synchronized:true})};
 const ui=await launch(new Map(),host,'production');await new Promise(setImmediate);
 assert.match(ui.root.innerHTML,/Albany, Western Australia/);
 assert.match(ui.root.innerHTML,/18°C/);
 assert.match(ui.root.innerHTML,/Partly cloudy/);
 assert.match(ui.root.innerHTML,/Weather data by Open-Meteo.com/);
 assert.match(ui.root.innerHTML,/Observed 15 min ago/);
 assert.match(ui.root.innerHTML,/Australia\/Perth/);
 assert.doesNotMatch(ui.root.innerHTML,/Weather unavailable/);
});

test('weather age does not shrink after a host clock rollback',async()=>{
 const now=Date.now();
 const host={onView:()=>()=>{},getView:async()=>({connected:false,phones:[]}),
   getWeather:async()=>({status:'stale',location:{id:123,label:'Albany, Western Australia'},temperatureC:18,weatherCode:2,observedAt:now-3600000,fetchedAt:now+2*3600000})};
 const ui=await launch(new Map(),host,'production');await new Promise(setImmediate);
 assert.match(ui.root.innerHTML,/Earlier weather · Observed 3 hrs ago/);
});

test('clock settings expose truthful sync state and bounded manual action',async()=>{
 const calls=[];const host={onView:()=>()=>{},getView:async()=>({connected:false,phones:[]}),
   getTimeStatus:async()=>({timezone:'Australia/Perth',canNtp:true,ntpEnabled:true,synchronized:true}),
   setManualTime:async value=>{calls.push(value);return {changed:true};}};
 const ui=await launch(new Map(),host,'production');await new Promise(setImmediate);
 ui.click('action','settings');
 assert.match(ui.root.innerHTML,/Automatic time/);
 assert.match(ui.root.innerHTML,/Synchronized/);
 assert.match(ui.root.innerHTML,/Australia\/Perth/);
 assert.match(ui.root.innerHTML,/data-manual-time/);
 ui.input('manualTime','2026-10-25T12:30');ui.click('action','apply-manual-time');await new Promise(setImmediate);
 assert.deepEqual(calls,['2026-10-25T12:30']);
});

test('denied manual clock authorization retains the entered time and keyboard focus',async()=>{
 const host={onView:()=>()=>{},getView:async()=>({connected:false,phones:[]}),
   getTimeStatus:async()=>({timezone:'Australia/Perth',canNtp:true,ntpEnabled:true,synchronized:true}),
   setManualTime:async()=>{throw Error('authorization denied');}};
 const ui=await launch(new Map(),host,'production');await new Promise(setImmediate);
 ui.click('action','settings');ui.input('manualTime','2026-10-25T12:30');ui.focus('clock-apply');
 ui.click('action','apply-manual-time');await new Promise(setImmediate);await new Promise(setImmediate);
 assert.match(ui.root.innerHTML,/System authorization unavailable/);
 assert.match(ui.root.innerHTML,/value="2026-10-25T12:30"/);
 assert.equal(ui.doc.activeElement?.dataset?.focusKey,'clock-apply');
});

test('uncertain manual clock outcome warns when automatic time was not confirmed restored',async()=>{
 const host={onView:()=>()=>{},getView:async()=>({connected:false,phones:[]}),
   getTimeStatus:async()=>({timezone:'Australia/Perth',canNtp:true,ntpEnabled:false,synchronized:false}),
   setManualTime:async()=>({changed:null,ntpRestored:false})};
 const ui=await launch(new Map(),host,'production');await new Promise(setImmediate);
 ui.click('action','settings');ui.input('manualTime','2026-10-25T12:30');ui.click('action','apply-manual-time');
 await new Promise(setImmediate);await new Promise(setImmediate);
 assert.match(ui.root.innerHTML,/Automatic time may be off/);
});

test('uncertain manual clock with automatic time already off never claims it was restored',async()=>{
 const host={onView:()=>()=>{},getView:async()=>({connected:false,phones:[]}),
   getTimeStatus:async()=>({timezone:'Australia/Perth',canNtp:true,ntpEnabled:false,synchronized:false}),
   setManualTime:async()=>({changed:null,status:{timezone:'Australia/Perth',canNtp:true,ntpEnabled:false,synchronized:false}})};
 const ui=await launch(new Map(),host,'production');await new Promise(setImmediate);
 ui.click('action','settings');ui.input('manualTime','2026-10-25T12:30');ui.click('action','apply-manual-time');
 await new Promise(setImmediate);await new Promise(setImmediate);
 assert.match(ui.root.innerHTML,/Automatic time is off/);
 assert.doesNotMatch(ui.root.innerHTML,/Automatic time restored/);
});

test('late host clock status enables Settings without navigating away',async()=>{
  let resolveStatus;
  const host={onView:()=>()=>{},getView:async()=>({connected:false,phones:[]}),getTimeStatus:()=>new Promise(resolve=>{resolveStatus=resolve;})};
  const ui=await launch(new Map(),host,'production');ui.click('action','settings');
  assert.match(ui.root.innerHTML,/Time sync status unavailable/);
  resolveStatus({timezone:'Australia/Perth',canNtp:true,ntpEnabled:true,synchronized:true});await new Promise(setImmediate);
  assert.match(ui.root.innerHTML,/Synchronized/);
});

test('Escape backs out of a local destination while keyboard activation remains native',async()=>{
 const ui=await launch(new Map(),{onView:()=>()=>{},getView:async()=>({connected:false,connectionPhase:'backoff',phones:[]})},'production');
 ui.click('action','settings');
 assert.match(ui.root.innerHTML,/<h1>Settings<\/h1>/);
 assert.equal(ui.key('Escape'),true);
 assert.match(ui.root.innerHTML,/<h1>Home<\/h1>/);
 assert.equal(ui.key('Enter'),false);
});

test('glass interface uses native phone state and waits for the selected phone', async () => {
  const calls = [];
  let publish;
  const host = {
    onView(listener) { publish = listener; return () => {}; },
    getView: async () => ({connected:false,route:'disconnected',phones:[]}),
    navigate: async route => { calls.push(['navigate',route]); return {accepted:true}; },
    selectPhone: async id => { calls.push(['selectPhone',id]); return {accepted:true}; }
  };
  const ui = await launch(new Map(),host);
  assert.doesNotMatch(ui.root.innerHTML,/Driver’s iPhone|Passenger’s iPhone|Simulate disconnect/);
  publish({connected:true,projectionReady:true,route:'phones',front:'livi',phones:[
    {id:'one',name:'Driver',status:'active'},
    {id:'two',name:'Passenger <script>test</script>',status:'available'}
  ]});
  assert.match(ui.root.innerHTML,/Driver/);
  assert.doesNotMatch(ui.root.innerHTML,/<script>test<\/script>/);
  ui.click('phone','two');
  assert.deepEqual(calls,[['selectPhone','two']]);
  assert.match(ui.root.innerHTML,/Switching phone/);
  assert.match(ui.root.innerHTML,/Driver.*Active/s);
  publish({connected:true,projectionReady:true,route:'phones',front:'livi',phones:[
    {id:'one',name:'Driver',status:'available'}, {id:'two',name:'Passenger',status:'active'}
  ]});
  await Promise.resolve();
  assert.deepEqual(calls,[['selectPhone','two'],['navigate','projection']]);
  publish({connected:true,projectionReady:true,route:'projection',front:'projection',phones:[{id:'two',name:'Passenger',status:'active'}]});
  assert.match(ui.root.innerHTML,/native-projection-region/);
  assert.doesNotMatch(ui.root.innerHTML,/CarPlay demo|Simulated/);
});

test('glass phone list offers manual wake for a remembered offline phone', async () => {
  const calls = [];
  let publish;
  const host = {
    onView(listener) { publish = listener; return () => {}; },
    getView: async () => ({connected:false,route:'disconnected',phones:[]}),
    navigate: async route => { calls.push(['navigate',route]); return {accepted:true}; },
    selectPhone: async id => { calls.push(['selectPhone',id]); return {accepted:true}; }
  };
  const ui = await launch(new Map(),host);
  publish({connected:true,projectionReady:true,route:'phones',front:'livi',phones:[{id:'away',name:'Away',status:'offline'}]});
  ui.click('phone','away');
  assert.deepEqual(calls,[['selectPhone','away']]);
  assert.match(ui.root.innerHTML,/Switching phone/);
});

test('Home switches directly between app grid and a clearly simulated music/vehicle dashboard', async () => {
  const ui = await launch();
  assert.match(ui.root.innerHTML, /data-home-mode="apps"[^>]*aria-pressed="true"/);
  assert.match(ui.root.innerHTML, /data-home-mode="dashboard"/);
  ui.click('homeMode', 'dashboard');
  assert.match(ui.root.innerHTML, /data-home-mode="dashboard"[^>]*aria-pressed="true"/);
  assert.match(ui.root.innerHTML, /Now playing/);
  assert.match(ui.root.innerHTML, /Vehicle/);
  assert.match(ui.root.innerHTML, /Inside/);
  assert.match(ui.root.innerHTML, /Outside/);
  assert.match(ui.root.innerHTML, /Unavailable/);
  assert.match(ui.root.innerHTML, /data-action="projection"/);
  assert.doesNotMatch(ui.root.innerHTML, /312|km\/h|Demo values|battery/i);
  assert.match(ui.root.innerHTML, /Simulated phones · Local files play on this device/);
  ui.click('homeMode', 'apps');
  assert.match(ui.root.innerHTML, /class="apps"/);
  assert.doesNotMatch(ui.root.innerHTML, /class="dashboard"/);
});

test('dashboard music interaction changes the demo control but reload never starts playback', async () => {
  const ui = await launch();
  ui.click('homeMode', 'dashboard');
  assert.match(ui.root.innerHTML, /aria-label="Play demo track"/);
  ui.click('action', 'demo-playback');
  assert.match(ui.root.innerHTML, /aria-label="Pause demo track"/);
  assert.match(ui.root.innerHTML, /Simulated playback/);
  const reloaded = await launch(ui.data);
  assert.match(reloaded.root.innerHTML, /data-home-mode="dashboard"[^>]*aria-pressed="true"/);
  assert.match(reloaded.root.innerHTML, /aria-label="Play demo track"/);
});

test('last screen survives reload and Home returns to the chosen dashboard without losing a phone', async () => {
  const ui = await launch();
  ui.click('action', 'phones');
  ui.click('phone', 'phone-a');
  ui.click('action', 'home');
  ui.click('homeMode', 'dashboard');
  assert.match(ui.root.innerHTML, /Driver’s iPhone/);
  ui.click('action', 'vehicle');
  const reloaded = await launch(ui.data);
  assert.match(reloaded.root.innerHTML, /<h1>Vehicle<\/h1>/);
  reloaded.click('action', 'home');
  assert.match(reloaded.root.innerHTML, /data-home-mode="dashboard"[^>]*aria-pressed="true"/);
  assert.match(reloaded.root.innerHTML, /Choose a phone/);
});
test('Phones labels unsupported pairing, modes, forgetting, and contacts without fake controls',async()=>{const ui=await launch();ui.click('action','phones');assert.match(ui.root.innerHTML,/<button disabled[^>]*>Add phone<\/button>/);assert.match(ui.root.innerHTML,/Remove saved phone/);assert.match(ui.root.innerHTML,/Connection options are unavailable/);assert.match(ui.root.innerHTML,/Contacts are unavailable/);assert.doesNotMatch(ui.root.innerHTML,/backend|integration|v4|scaffold/);});


test('app editing reorders, announces position and preserves the exact keyboard control', async () => {
  const ui = await launch();
  assert.match(ui.root.innerHTML, /No vehicle motion signal/);
  assert.doesNotMatch(ui.root.innerHTML, /Vehicle parked/);
  ui.click('action', 'edit-layout');
  ui.focus('apps-phones-earlier');
  ui.click('move', 'apps:phones:-1');
  const order = [...ui.root.innerHTML.matchAll(/data-layout-id="([^"]*)"/g)].map(match => match[1]);
  assert.deepEqual(order, ['phones', 'projection', 'vehicle', 'audio', 'settings']);
  assert.equal(ui.doc.activeElement.dataset.focusKey, 'apps-phones-earlier');
  assert.match(ui.doc.activeElement.attrs, /aria-disabled="true"/);
  assert.match(ui.root.innerHTML, /Phones moved to position 1 of 5/);
  ui.click('action', 'done-layout');
  assert.equal(ui.doc.activeElement.dataset.focusKey, 'edit-layout');
  assert.doesNotMatch(ui.root.innerHTML, /data-move=/);
  assert.deepEqual([...JSON.parse(ui.data.get('headunit.layout')).appOrder], order);
});

test('dashboard tile editing persists independently and its reset restores the default order', async () => {
  const ui = await launch();
  ui.click('homeMode', 'dashboard');
  ui.click('action', 'edit-layout');
  ui.click('move', 'dashboard:temperature:-1');
  assert.ok(ui.root.innerHTML.indexOf('data-layout-id="temperature"') < ui.root.innerHTML.indexOf('data-layout-id="music"'));
  const reloaded = await launch(ui.data);
  assert.ok(reloaded.root.innerHTML.indexOf('data-layout-id="temperature"') < reloaded.root.innerHTML.indexOf('data-layout-id="music"'));
  reloaded.click('action', 'edit-layout');
  reloaded.click('action', 'reset-layout');
  assert.ok(reloaded.root.innerHTML.indexOf('data-layout-id="music"') < reloaded.root.innerHTML.indexOf('data-layout-id="temperature"'));
  assert.match(reloaded.root.innerHTML, /Default dashboard order restored/);
});

test('glass slider updates the backdrop without replacing its focused input, and survives reload', async () => {
  const ui = await launch();
  ui.click('action', 'settings');
  assert.match(ui.root.innerHTML, /type="range"[^>]*min="0"[^>]*max="100"/);
  assert.match(ui.root.innerHTML, /Clear/);
  assert.match(ui.root.innerHTML, /Frosted/);
  const control = ui.input('glassStrength', '100');
  assert.equal(ui.doc.activeElement, control);
  assert.equal(ui.style.get('--glass-blur'), '28px');
  assert.equal(JSON.parse(ui.data.get('headunit.appearance')).glassStrength, 100);
  ui.click('wallpaper', 'dusk');
  const reloaded = await launch(ui.data);
  assert.equal(reloaded.style.get('--glass-blur'), '28px');
  assert.equal(reloaded.doc.body.dataset.wallpaper, 'dusk');
  reloaded.click('action', 'reset-glass');
  assert.equal(JSON.parse(reloaded.data.get('headunit.appearance')).glassStrength, 55);
  assert.match(reloaded.root.innerHTML, /id="sensor-settings"/);
});

test('moving host state ends editing and disables personalization without pretending it is connected by default', async () => {
  const ui = await launch();
  ui.click('action', 'edit-layout');
  ui.focus('apps-phones-earlier');
  ui.updateMotion('moving');
  assert.equal(ui.doc.activeElement?.dataset.focusKey, 'dock-button-home');
  assert.doesNotMatch(ui.root.innerHTML, /data-move=/);
  assert.match(ui.root.innerHTML, /Editing is locked while the vehicle is moving/);
  assert.match(ui.root.innerHTML, /data-action="edit-layout"[^>]*disabled/);
  ui.click('action', 'settings');
  assert.match(ui.root.innerHTML, /data-glass-strength="true"[^>]*disabled/);
  assert.match(ui.root.innerHTML, /data-wallpaper="coast"[^>]*disabled/);
  ui.updateMotion('unknown');
  assert.match(ui.root.innerHTML, /No vehicle motion signal/);
  assert.doesNotMatch(ui.root.innerHTML, /data-glass-strength="true"[^>]*disabled/);
});

test('Settings includes empty optional sensor rules with no fabricated alerts or audio',async()=>{
 const ui=await launch();ui.click('action','settings');
 assert.match(ui.root.innerHTML,/No alert rules added/);
 assert.match(ui.root.innerHTML,/Sensor readings and alerts are unavailable/);
 assert.match(ui.root.innerHTML,/data-sensor-action="add"/);
 assert.doesNotMatch(ui.root.innerHTML,/sensor-alert:/);
});

test('repeated identical motion observations do not remount Settings or lose focus',async()=>{
 const ui=await launch();ui.updateMotion('stationary');ui.click('action','settings');
 ui.focus('glass-strength');const focused=ui.doc.activeElement;
 ui.updateMotion('stationary');assert.equal(ui.doc.activeElement,focused);
});

test('Settings offers persisted left and right dock buttons and locks them while moving',async()=>{
 const ui=await launch();ui.click('action','settings');ui.click('dockSide','right');
 assert.equal(ui.doc.body.dataset.dockSide,'right');assert.equal(ui.doc.activeElement?.dataset.focusKey,'dock-right');
 const reloaded=await launch(ui.data);assert.equal(reloaded.doc.body.dataset.dockSide,'right');
 reloaded.updateMotion('moving');assert.match(reloaded.root.innerHTML,/data-dock-side="left"[^>]*disabled/);
 reloaded.click('dockSide','left');assert.equal(reloaded.doc.body.dataset.dockSide,'right');
});
test('whole CarPlay tile is a single projection button and dashboard playback stays separate',async()=>{
 const ui=await launch();const tile=ui.root.innerHTML.match(/<button class="tile mint"[^>]*data-action="projection"[^>]*>([\s\S]*?)<\/button>/);
 assert.ok(tile);assert.match(tile[1],/CarPlay/);assert.doesNotMatch(tile[1],/<button|demo-playback/);
 ui.click('action','projection');assert.match(ui.root.innerHTML,/CarPlay demo/);
 ui.click('action','home');ui.click('homeMode','dashboard');ui.click('action','demo-playback');assert.match(ui.root.innerHTML,/Your dashboard/);assert.match(ui.root.innerHTML,/Pause demo track/);
});

for(const target of ['home','phones','projection','camera','cluster','disconnected'])test(`native diagnostics yields to ${target} and does not reopen`,async()=>{
 let publish;
 const host={onView(fn){publish=fn;return()=>{};},getView:async()=>({connected:true,projectionReady:true,route:'settings',front:'livi',phones:[]}),navigate:async()=>({accepted:true})};
 const ui=await launch(new Map(),host);
 ui.click('action','diagnostics');assert.match(ui.root.innerHTML,/<h1>Diagnostics<\/h1>/);
 if(['home','projection'].includes(target))ui.click('action',target);
 publish({connected:target!=='disconnected',route:target,front:['camera','cluster','projection'].includes(target)?target:'livi',phones:[]});
 assert.doesNotMatch(ui.root.innerHTML,/<h1>Diagnostics<\/h1>/);
 publish({connected:true,projectionReady:true,route:'settings',front:'livi',phones:[]});
 assert.match(ui.root.innerHTML,/<h1>Settings<\/h1>/);
});

test('native Home renders verified media/battery safely and explicit controls preserve navigation',async()=>{
 let publish;const calls=[];
 const host={onView(fn){publish=fn;return()=>{};},getView:async()=>({connected:false,route:'disconnected',phones:[]}),navigate:async()=>({accepted:true}),media:async(...args)=>{calls.push(args);return {accepted:true};}};
 const ui=await launch(new Map(),host);
 publish({connected:true,route:'home',front:'livi',phones:[{id:'a',status:'active'}],homeStatus:{phone:{status:'available',phoneId:'a',batteryPercent:73,charging:true,freshForMs:30000},media:{status:'available',phoneId:'a',title:'<img src=x onerror=bad()>',artist:'Artist',playing:true,freshForMs:30000}}});
 assert.match(ui.root.innerHTML,/data-media="pause"/);assert.doesNotMatch(ui.root.innerHTML,/data-media="play"/);
 assert.match(ui.root.innerHTML,/73%/);assert.doesNotMatch(ui.root.innerHTML,/Signal.*Unavailable/s);
 assert.match(ui.root.innerHTML,/&lt;img/);assert.doesNotMatch(ui.root.innerHTML,/<img src=x/);
 ui.click('media','pause');assert.deepEqual(calls,[['pause','a']]);assert.match(ui.root.innerHTML,/<h1>Home<\/h1>/);
 assert.doesNotMatch(ui.root.innerHTML,/data-action="apps"/);
 ui.click('action','home');
 publish({connected:true,route:'home',front:'livi',phones:[{id:'a',status:'active'}],homeStatus:{media:{status:'stale',phoneId:'a'}}});
 assert.match(ui.root.innerHTML,/Media update paused/);
 assert.doesNotMatch(ui.root.innerHTML,/&lt;img|data-media="play"/);
 publish({connected:true,route:'home',front:'livi',phones:[{id:'a',status:'active'}],homeStatus:{media:{status:'available',phoneId:'a',title:'Track',playing:false,freshForMs:30000}}});
 assert.match(ui.root.innerHTML,/data-media="play"/);assert.doesNotMatch(ui.root.innerHTML,/data-media="pause"/);
});

test('Settings exposes persistent day/night controls, unavailable Auto status and focus retention',async()=>{
 const app=await launch();app.click('action','settings');
 assert.match(app.root.innerHTML,/Headlight signal unavailable/);
 app.click('appearance','day');assert.equal(app.doc.body.dataset.appearance,'day');
 assert.equal(app.doc.activeElement.dataset.focusKey,'appearance-day');
 assert.match(app.root.innerHTML,/data-appearance="day"[^>]*aria-pressed="true"/);
 app.click('appearance','auto');assert.equal(app.doc.body.dataset.appearance,'day');
 const restored=await launch(app.data);assert.equal(restored.doc.body.dataset.appearance,'day');
 restored.updateMotion('moving');restored.click('appearance','night');
 assert.equal(restored.doc.body.dataset.appearance,'day');
});
test('offline native theme changes persist locally without phone or media commands',async()=>{
 const calls=[];const data=new Map();const host={onView:()=>()=>{},getView:async()=>({connected:false,front:'livi',route:'disconnected',phones:[]}),navigate:()=>calls.push('navigate'),media:()=>calls.push('media')};
 const app=await launch(data,host,'production');
 await new Promise(resolve=>setImmediate(resolve));
 app.click('action','settings');
 app.click('appearance','day');assert.equal(app.doc.body.dataset.appearance,'day');
 assert.deepEqual(calls,[]);assert.match(app.root.innerHTML,/Panel brightness unavailable/);
 const restored=await launch(data,host,'production');assert.equal(restored.doc.body.dataset.appearance,'day');
});
test('production Settings groups local controls and keeps sensors secondary',async()=>{
 const host={onView:()=>()=>{},getView:async()=>({connected:false,route:'disconnected'})};
 const app=await launch(new Map(),host,'production');app.click('action','settings');
 assert.match(app.root.innerHTML,/class="settings-grid"/);
 const gridStart=app.root.innerHTML.indexOf('class="settings-grid"');
 const gridEnd=app.root.innerHTML.indexOf('class="settings-system"');
 const debug=app.root.innerHTML.indexOf('class="settings-card debug-settings"');
 assert.ok(gridStart<debug&&debug<gridEnd,'Debug overlay belongs alongside UI scale in the balanced settings grid');
 assert.match(app.root.innerHTML,/<details class="settings-advanced">/);
 assert.match(app.root.innerHTML,/data-appearance="day"/);
 assert.match(app.root.innerHTML,/data-wallpaper="coast"/);
 assert.match(app.root.innerHTML,/data-wallpaper-file/);
 assert.match(app.root.innerHTML,/data-ui-scale/);
 assert.doesNotMatch(app.root.innerHTML,/data-dock-side=/);
 assert.match(app.root.innerHTML,/data-debug-overlay="true"/);
 assert.match(app.root.innerHTML,/Exit to Desktop/);
 assert.match(app.root.innerHTML,/data-action="exit-to-desktop"[^>]*disabled/);
 assert.match(app.root.innerHTML,/Desktop session unavailable/);
});

test('production wallpaper gallery groups offline artwork and persists its selected palette and tuning',async()=>{
 const data=new Map(),host={onView:()=>()=>{},getView:async()=>({connected:false,route:'disconnected',phones:[]})};
 const ui=await launch(data,host,'production');
 ui.click('action','settings');ui.click('action','wallpaper-gallery');
 assert.match(ui.root.innerHTML,/<h1>Wallpapers<\/h1>/);
 for(const group of ['Landscapes','Pastels','Solid colours','Gradients'])assert.match(ui.root.innerHTML,new RegExp(group));
 for(const id of ['meadow','blue-forms','pastel-mint','pastel-lilac','solid-slate','gradient-lagoon'])assert.match(ui.root.innerHTML,new RegExp(`data-wallpaper="${id}"`));
 assert.match(ui.root.innerHTML,/data-wallpaper-file/);
 ui.click('wallpaper','pastel-mint');assert.equal(ui.doc.body.dataset.wallpaper,'pastel-mint');
 ui.focus('accent-coral');ui.click('accent','coral');assert.equal(ui.doc.body.dataset.accent,'coral');
 assert.equal(ui.doc.activeElement?.dataset.focusKey,'accent-coral','accent remains keyboard-focused after rerender');
 ui.input('wallpaperDim','35');assert.equal(ui.style.get('--wallpaper-dim'),'0.35');
 ui.input('wallpaperBlur','4');assert.equal(ui.style.get('--wallpaper-blur'),'4px');
 ui.input('wallpaperBrightness','125');assert.equal(ui.style.get('--wallpaper-brightness'),'1.25');
 assert.equal(ui.key('Escape'),true);assert.match(ui.root.innerHTML,/<h1>Settings<\/h1>/);
 const restored=await launch(data,host,'production');
 assert.equal(restored.doc.body.dataset.wallpaper,'pastel-mint');assert.equal(restored.doc.body.dataset.accent,'coral');
 restored.click('action','settings');restored.click('action','wallpaper-gallery');restored.click('action','reset-wallpaper-tuning');
 assert.equal(restored.doc.body.dataset.wallpaper,'pastel-mint');assert.equal(restored.doc.body.dataset.accent,'sea');
 assert.equal(restored.style.get('--wallpaper-dim'),'0');
});
test('Debug overlay is off by default and can be enabled from offline Settings',async()=>{
 const data=new Map();let reads=0;
 const host={onView:()=>()=>{},getView:async()=>({connected:false,route:'disconnected'}),getMetrics:async()=>{reads++;return {cpuPercent:null,gpuPercent:null};}};
 const app=await launch(data,host,'production');app.click('action','settings');
 assert.doesNotMatch(app.root.innerHTML,/id="debug-overlay"/);assert.equal(reads,0);
 app.click('debugOverlay','true');assert.match(app.root.innerHTML,/id="debug-overlay"/);
 assert.match(app.doc.getElementById('debug-overlay').textContent,/UI FPS measuring/);
 app.click('debugOverlay','false');assert.doesNotMatch(app.root.innerHTML,/id="debug-overlay"/);
 assert.equal(reads,0);
});
test('production route changes preserve the overlay sample and do not restart host collection',async()=>{
 const original=globalThis.setInterval;let overlayTick,reads=0;
 globalThis.setInterval=(fn,ms)=>{if(ms===2000)overlayTick=fn;return {unref(){}};};
 try{
  const host={onView:()=>()=>{},getView:async()=>({connected:false,route:'disconnected'}),getMetrics:async()=>{reads++;return {cpuPercent:42,ramUsedBytes:1073741824,ramTotalBytes:4294967296,pingMs:31};}};
  const app=await launch(new Map(),host,'production');app.click('action','settings');app.click('debugOverlay','true');
  assert.ok(overlayTick);await overlayTick();assert.equal(reads,1);
  app.click('action','audio');assert.equal(reads,1);
  assert.match(app.doc.getElementById('debug-overlay').textContent,/CPU 42\.0%/);
  app.click('action','home');assert.equal(reads,1);
  assert.match(app.doc.getElementById('debug-overlay').textContent,/Google TCP latency 31 ms/);
  app.click('action','settings');app.click('debugOverlay','false');
 }finally{globalThis.setInterval=original;}
});
test('production top bar follows requested order and all destinations have honest screens',async()=>{
 const calls=[];const host={onView:()=>()=>{},getView:async()=>({connected:false,route:'disconnected'}),navigate:route=>{calls.push(route);return Promise.resolve({accepted:true});}};
 const app=await launch(new Map(),host,'production');await new Promise(resolve=>setImmediate(resolve));
 const order=[...app.root.innerHTML.matchAll(/class="dock-button" data-action="([^"]+)"/g)].map(match=>match[1]);
 assert.deepEqual(order,['home','audio','bluetooth','projection','phones','settings']);
 app.click('action','audio');assert.match(app.root.innerHTML,/<h1>Local audio<\/h1>/);assert.match(app.root.innerHTML,/Add files/);assert.doesNotMatch(app.root.innerHTML,/data-action="tune"/);
 assert.match(app.root.innerHTML,/data-action="audio"[^>]*aria-current="page"/);
 app.click('action','bluetooth');assert.match(app.root.innerHTML,/<h1>Bluetooth<\/h1>/);assert.match(app.root.innerHTML,/class="feature-stage"/);assert.doesNotMatch(app.root.innerHTML,/Pair now|Connected device/);
 app.click('action','projection');assert.match(app.root.innerHTML,/<h1>CarPlay<\/h1>/);
 app.click('action','settings');assert.match(app.root.innerHTML,/<h1>Settings<\/h1>/);
 app.click('action','phones');assert.match(app.root.innerHTML,/<h1>Phones<\/h1>/);
 assert.doesNotMatch(app.root.innerHTML,/data-action="apps"/);
 app.click('action','home');assert.match(app.root.innerHTML,/<h1>Home<\/h1>/);
 assert.deepEqual(calls,[]);
});

test('bubbled navigation clicks do not rewrite appearance preferences',async()=>{
 let appearanceWrites=0;const data=new Map();const originalSet=data.set.bind(data);
 data.set=(key,value)=>{if(key==='headunit.appearance')appearanceWrites++;return originalSet(key,value);};
 const app=await launch(data);app.click('action','settings');app.click('appearance','day');
 const before=appearanceWrites;app.click('action','home');
 assert.equal(appearanceWrites,before,'navigation must not trigger body appearance handlers');
 assert.equal(app.doc.body.dataset.appearance,'day');
});

test('native connection screen explains retry, refusal and synchronization without claiming readiness',async()=>{
 let emit;const app=await launch(new Map(),{onView:fn=>{emit=fn;return()=>{};},getView:async()=>({connected:false,route:'disconnected',connectionPhase:'connecting',phones:[]})});
 await new Promise(resolve=>setImmediate(resolve));assert.match(app.root.innerHTML,/<h1>Home<\/h1>/);assert.match(app.root.innerHTML,/Connecting phone system/);
 emit({connected:false,connectionPhase:'backoff'});assert.match(app.root.innerHTML,/Phone system offline/);assert.doesNotMatch(app.root.innerHTML,/reconnect automatically|Unable to complete that action/);
 assert.doesNotMatch(app.root.innerHTML,/data-phone=|data-media=/);
 app.click('action','settings');assert.match(app.root.innerHTML,/<h1>Settings<\/h1>/);assert.match(app.root.innerHTML,/data-action="audio"/);
 emit({connected:false,connectionPhase:'backoff'});assert.match(app.root.innerHTML,/<h1>Settings<\/h1>/);
 app.click('action','home');assert.match(app.root.innerHTML,/<h1>Home<\/h1>/);assert.match(app.root.innerHTML,/Phone system offline/);
 emit({connected:true,route:'home',front:'livi',phones:[]});
 emit({connected:false,connectionPhase:'backoff'});assert.match(app.root.innerHTML,/Reconnecting phone system/);
 emit({connected:false,connectionPhase:'refused'});assert.match(app.root.innerHTML,/Unable to connect phone system/);assert.doesNotMatch(app.root.innerHTML,/Reconnecting/);
 emit({connected:false,connectionPhase:'resyncing'});assert.match(app.root.innerHTML,/Updating phone system/);
 emit({connected:false,connectionPhase:'secret'});assert.doesNotMatch(app.root.innerHTML,/secret/);
});
test('native picture geometry replaces the content-column placeholder and clears through repeated interruptions',async()=>{
 let publish;const ui=await launch(new Map(),{onView:fn=>{publish=fn;return()=>{};},getView:async()=>({connected:false}),navigate:async()=>({accepted:true})});
 const projection={connected:true,projectionReady:true,front:'projection',route:'projection',phones:[],picture:{width:800,height:480,insets:{top:10,bottom:0,left:0,right:0}}};
 for(let i=0;i<2;i++){
  publish(projection);assert.match(ui.root.innerHTML,/class="native-picture"/);assert.match(ui.root.innerHTML,/native-picture-mask/);
  publish({...projection,front:'camera',route:'camera'});assert.match(ui.root.innerHTML,/Camera unavailable/);assert.doesNotMatch(ui.root.innerHTML,/native-picture-mask|Display in use/);
  publish({...projection,picture:null});assert.match(ui.root.innerHTML,/Phone display size unavailable/);assert.doesNotMatch(ui.root.innerHTML,/native-picture-mask/);
  publish({connected:false,route:'disconnected',picture:projection.picture});assert.doesNotMatch(ui.root.innerHTML,/native-picture-mask|100cqh/);
 }
});

test('weather UI ignores out-of-order search replies and rejected selection cannot claim saved',async()=>{
 const pending=[];const host={onView:()=>()=>{},getView:async()=>({connected:false,phones:[]}),searchWeather:()=>new Promise(resolve=>pending.push(resolve)),selectWeather:async()=>({accepted:false}),getWeather:async()=>({status:'unavailable',location:{id:1,label:'Albany'}})};
 const ui=await launch(new Map(),host,'production');await new Promise(setImmediate);ui.click('action','settings');
 ui.input('weatherSearch','Albany');ui.click('action','search-weather');ui.input('weatherSearch','Perth');ui.click('action','search-weather');
 pending[1]([{id:2,label:'Perth'}]);await new Promise(setImmediate);pending[0]([{id:1,label:'Albany'}]);await new Promise(setImmediate);
 assert.match(ui.root.innerHTML,/data-weather-city="2"/);assert.doesNotMatch(ui.root.innerHTML,/data-weather-city="1"/);
 ui.click('weatherCity','2');await new Promise(setImmediate);assert.doesNotMatch(ui.root.innerHTML,/Location saved/);assert.match(ui.root.innerHTML,/Unable to use that city/);
});
