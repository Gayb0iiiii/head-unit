import test from 'node:test';
import assert from 'node:assert/strict';

// A small DOM boundary for event wiring and rendered markup, not browser/layout QA.
// All navigation, storage, and playback-preview state use the real application.
let instance = 0;
async function launch(data = new Map()) {
  const root = { innerHTML: '' };
  let buttons = [];
  let elements = [];
  const style = new Map();
  let doc;
  Object.defineProperty(root, 'innerHTML', {
    get() { return this.html || ''; },
    set(html) {
      this.html = html;
      elements = [...html.matchAll(/<(button|input|output|p)\b([^>]*)(?:>([\s\S]*?)<\/\1>|\s*\/?>(?!<\/input>))/g)].map(([, tag, attrs, text]) => {
        const dataset = Object.fromEntries([...attrs.matchAll(/data-([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value]));
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
  doc = globalThis.document = {
    body: { dataset: {}, style: { setProperty: (key, value) => style.set(key, value) } },
    activeElement: null,
    getElementById: id => id === 'app' ? root : elements.find(element => element.id === id),
    querySelectorAll(selector) {
      const key = selector.slice(6, -1).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return elements.filter(element => key in element.dataset);
    }
  };
  const application = await import(`../src/app.mjs?unit=${++instance}`);
  return {
    root, data, style, doc,
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
      if (!button.disabled) button.onclick();
    }
  };
}

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
  assert.match(ui.root.innerHTML, /No live audio or vehicle connection/);
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
test('Phones labels unsupported pairing, modes, forgetting, and contacts without fake controls',async()=>{const ui=await launch();ui.click('action','phones');assert.match(ui.root.innerHTML,/<button disabled[^>]*>Add phone<\/button>/);assert.match(ui.root.innerHTML,/Remove saved phone/);assert.match(ui.root.innerHTML,/Bluetooth-only/);assert.match(ui.root.innerHTML,/Contact sync/);assert.match(ui.root.innerHTML,/backend integration/);});


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
 assert.match(ui.root.innerHTML,/No rules configured/);
 assert.match(ui.root.innerHTML,/No live sensor data is connected/);
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
 ui.click('action','projection');assert.match(ui.root.innerHTML,/Projection preview/);
 ui.click('action','home');ui.click('homeMode','dashboard');ui.click('action','demo-playback');assert.match(ui.root.innerHTML,/Your dashboard/);assert.match(ui.root.innerHTML,/Pause demo track/);
});
