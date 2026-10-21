import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';

const moduleUrl = new URL('../src/sensor-settings.mjs', import.meta.url);
async function subject() {
  assert.ok(existsSync(moduleUrl), 'sensor settings module must exist');
  return import(moduleUrl.href);
}
const rule = (overrides = {}) => ({id:'temp-high', sensor:'insideTemperature', label:'Cabin temperature', condition:'above', threshold:30, hysteresis:2, debounceMs:1000, staleAfterMs:5000, repeatMs:60000, repeat:'once', audio:false, enabled:true, ...overrides});
function storage(raw) {
  const data = new Map();
  if (raw !== undefined) data.set('livi.sensor-rules.v1', raw);
  return {getItem: key => data.get(key) ?? null, setItem: (key, next) => data.set(key,next), get raw() {return data.get('livi.sensor-rules.v1');}};
}
function root() {
  const listeners = new Map();
  return {innerHTML:'', addEventListener:(type, handler) => listeners.set(type, handler), removeEventListener:(type, handler) => {if (listeners.get(type) === handler) listeners.delete(type);}, querySelector:() => null, fire:(type, event) => listeners.get(type)?.(event), listeners};
}

// Returning default rules or presenting missing readings as alerts would break this test.
test('default settings have no rules, no invented readings, and honest motion state', async () => {
  const {renderSensorSettings, readSensorRules} = await subject();
  const store = storage();
  assert.deepEqual(readSensorRules(store).rules, []);
  const html = renderSensorSettings({storage:store});
  assert.match(html, /No alert rules added/);
  assert.match(html, /Sensor readings and alerts are unavailable/);
  assert.match(html, /Motion information unavailable/);
  assert.match(html, /Add rule/);
  assert.doesNotMatch(html, /role="alert"|30 °C|Overheating/);
  assert.equal(store.raw, undefined);
});

test('persisted rules round-trip after validation without telemetry or runtime state', async () => {
  const {bindSensorSettings, readSensorRules, SENSOR_RULES_KEY} = await subject();
  const store = storage();
  const ui = bindSensorSettings(root(), {storage:store});
  assert.equal(ui.saveRule(rule()).ok, true);
  assert.equal(SENSOR_RULES_KEY, 'livi.sensor-rules.v1');
  assert.deepEqual(readSensorRules(store).rules, ui.getRules());
  assert.deepEqual(Object.keys(JSON.parse(store.raw)).sort(), ['rules', 'version']);
  assert.equal(JSON.parse(store.raw).version, 1);
  assert.doesNotMatch(store.raw, /readings|activeSince|timestamp/);
});

test('corrupt, invalid, duplicate, and unknown-version storage fail safely without overwriting', async () => {
  const {readSensorRules, bindSensorSettings} = await subject();
  for (const raw of ['{broken', JSON.stringify({version:2,rules:[rule()]}), JSON.stringify({version:1,rules:[rule({threshold:'bad'})]}), JSON.stringify({version:1,rules:[rule(),rule()]})]) {
    const store = storage(raw);
    const loaded = readSensorRules(store);
    assert.deepEqual(loaded.rules, []);
    assert.match(loaded.warning, /could not be loaded/i);
    bindSensorSettings(root(), {storage:store});
    assert.equal(store.raw, raw);
  }
});

test('unavailable storage is reported and valid changes remain only in this session', async () => {
  const {bindSensorSettings} = await subject();
  const element = root();
  const store = {getItem(){throw Error('denied');},setItem(){throw Error('quota');}};
  const ui = bindSensorSettings(element, {storage:store});
  const result = ui.saveRule(rule());
  assert.equal(result.ok, true);
  assert.equal(result.persisted, false);
  assert.equal(ui.getRules().length, 1);
  assert.match(element.innerHTML, /temporary.*reload or close/i);
});

test('add, edit, and remove keep stable IDs and persist only valid rules', async () => {
  const {bindSensorSettings, readSensorRules} = await subject();
  const store = storage();
  let latest;
  const ui = bindSensorSettings(root(), {storage:store,onChange:rules => {latest = rules;}});
  ui.saveRule(rule());
  assert.equal(ui.saveRule(rule({threshold:40,label:'Higher cabin limit'})).ok, true);
  assert.equal(ui.getRules().length, 1);
  assert.equal(ui.getRules()[0].threshold, 40);
  assert.equal(latest[0].label, 'Higher cabin limit');
  assert.equal(ui.removeRule('temp-high').ok, true);
  assert.deepEqual(readSensorRules(store).rules, []);
});

test('invalid input reports an inline error and never mutates storage', async () => {
  const {bindSensorSettings} = await subject();
  const store = storage();
  const element = root();
  const ui = bindSensorSettings(element, {storage:store});
  for (const invalid of [rule({threshold:NaN}),rule({hysteresis:-1}),rule({debounceMs:-5}),rule({sensor:'bad sensor'})]) {
    assert.equal(ui.saveRule(invalid).ok, false);
    assert.equal(store.raw, undefined);
    assert.equal(ui.getRules().length, 0);
    assert.match(element.innerHTML, /role="alert"/);
  }
});

test('missing and stale rules are distinct and do not gain numeric thresholds', async () => {
  const {bindSensorSettings, renderSensorSettings} = await subject();
  const ui = bindSensorSettings(root(), {storage:storage()});
  for (const condition of ['missing','stale']) {
    const input = rule({id:condition,condition,hysteresis:0});
    delete input.threshold;
    assert.equal(ui.saveRule(input).ok, true);
  }
  assert.deepEqual(ui.getRules().map(r => r.condition), ['missing','stale']);
  for (const saved of ui.getRules()) assert.equal('threshold' in saved, false);
  const html = renderSensorSettings({rules:ui.getRules()});
  assert.match(html, /Reading missing/);
  assert.match(html, /Reading out of date/);
});

test('moving guard prevents add, edit, and remove even when motion changes after mount', async () => {
  const {bindSensorSettings} = await subject();
  const store = storage();
  const element = root();
  let moving = false;
  const ui = bindSensorSettings(element, {storage:store,getMoving:() => moving});
  ui.saveRule(rule());
  const previous = store.raw;
  moving = true;
  assert.equal(ui.saveRule(rule({threshold:50})).ok, false);
  assert.equal(ui.removeRule('temp-high').ok, false);
  assert.equal(store.raw, previous);
  assert.match(element.innerHTML, /Park before editing/);
  assert.match(element.innerHTML, /data-sensor-action="add"[^>]*disabled/);
});

test('native editor exposes labeled controls for sensor, threshold, timing, and sound intent', async () => {
  const {bindSensorSettings} = await subject();
  const element = root();
  const ui = bindSensorSettings(element, {storage:storage()});
  ui.startAdd();
  const html = element.innerHTML;
  assert.match(html, /<form[^>]*data-sensor-rule-form/);
  for (const name of ['sensor','condition','threshold','hysteresis','debounceMs','staleAfterMs','audio','repeat','repeatMs','enabled']) {
    assert.match(html, new RegExp(`<(?:input|select)[^>]*name="${name}"`));
    assert.match(html, new RegExp(`<label[^>]*for="sensor-rule-${name}"`));
  }
  assert.match(html, /once until normal/i);
  assert.match(html, /Alert sounds are unavailable/);
  assert.match(html, /gauge|absolute/);
});

test('all rule labels and validation messages are escaped rather than interpreted as markup', async () => {
  const {renderSensorSettings} = await subject();
  const html = renderSensorSettings({rules:[rule({label:'<img src=x onerror=alert(1)>'})],error:'<script>alert(1)</script>'});
  assert.doesNotMatch(html, /<img|<script/);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;script/);
});

test('display unit changes never rewrite canonical rule thresholds', async () => {
  const {bindSensorSettings, renderSensorSettings} = await subject();
  const store = storage();
  const ui = bindSensorSettings(root(), {storage:store});
  ui.saveRule(rule());
  const previous = store.raw;
  const html = renderSensorSettings({storage:store,unitPreferences:{temperature:'fahrenheit',pressure:'psi'}});
  assert.match(html, /86(?:\.0)? °F/);
  assert.equal(store.raw, previous);
  assert.equal(ui.getRules()[0].threshold, 30);
});

test('bound submit converts display units and persists audio and repeat selection', async () => {
  const {bindSensorSettings} = await subject();
  const element = root();
  const ui = bindSensorSettings(element, {storage:storage(),unitPreferences:{temperature:'fahrenheit',pressure:'psi'}});
  ui.startAdd();
  const values = {sensor:'insideTemperature',label:'Cabin',condition:'above',threshold:'86',hysteresis:'3.6',debounceMs:'1000',staleAfterMs:'5000',repeatMs:'60000',audio:'true',repeat:'repeat'};
  const fields = Object.fromEntries(Object.entries(values).map(([name,value]) => [name,{value}]));
  fields.enabled = {checked:true};
  const form = {matches:selector => selector === 'form[data-sensor-rule-form]',elements:{namedItem:name => fields[name]}};
  let prevented = false;
  element.fire('submit', {target:form,preventDefault:() => {prevented = true;}});
  assert.equal(prevented, true);
  const saved = ui.getRules()[0];
  assert.ok(saved);
  assert.ok(Math.abs(saved.threshold - 30) < 1e-9);
  assert.ok(Math.abs(saved.hysteresis - 2) < 1e-9);
  assert.equal(saved.audio, true);
  assert.equal(saved.repeat, 'repeat');
});

test('blank numeric inputs cannot silently become zero on submit', async () => {
  const {bindSensorSettings} = await subject();
  const element = root();
  const ui = bindSensorSettings(element, {storage:storage()});
  ui.startAdd();
  const values = {sensor:'insideTemperature',label:'Cabin',condition:'above',threshold:'',hysteresis:'0',debounceMs:'1000',staleAfterMs:'5000',repeatMs:'60000',audio:'false',repeat:'once'};
  const form = {matches:() => true,elements:{namedItem:name => name === 'enabled' ? {checked:true} : {value:values[name]}}};
  element.fire('submit', {target:form,preventDefault(){}});
  assert.deepEqual(ui.getRules(), []);
  assert.match(element.innerHTML, /Threshold.*required/i);
});

test('maximum rules, detached snapshots, and cleanup keep the settings boundary bounded', async () => {
  const {bindSensorSettings} = await subject();
  const element = root();
  const ui = bindSensorSettings(element, {storage:storage()});
  for (let i = 0; i < 32; i++) assert.equal(ui.saveRule(rule({id:`rule-${i}`})).ok, true);
  assert.equal(ui.saveRule(rule({id:'one-too-many'})).ok, false);
  const snapshot = ui.getRules();
  snapshot[0].threshold = -999;
  assert.equal(ui.getRules()[0].threshold, 30);
  assert.ok(element.listeners.size > 0);
  ui.destroy();
  assert.equal(element.listeners.size, 0);
});

test('unknown persisted sensor identifiers cannot crash rendering or become saved rules', async () => {
  const {bindSensorSettings, readSensorRules, renderSensorSettings} = await subject();
  const unknown = rule({sensor:'unmappedSensor'});
  const corrupt = storage(JSON.stringify({version:1,rules:[unknown]}));
  assert.deepEqual(readSensorRules(corrupt).rules, []);
  assert.doesNotThrow(() => renderSensorSettings({storage:corrupt}));
  const store = storage();
  const ui = bindSensorSettings(root(),{storage:store});
  assert.equal(ui.saveRule(unknown).ok, false);
  assert.equal(store.raw, undefined);
  assert.deepEqual(ui.getRules(), []);
});

// New unit controls must not alter canonical rule storage or interpret an open draft in new units.
test('own-page unit preferences default to Celsius and PSI and persist independently of rules', async () => {
  const {readUnitPreferences, UNIT_PREFERENCES_KEY, bindSensorSettings} = await subject();
  assert.equal(typeof readUnitPreferences, 'function');
  assert.equal(UNIT_PREFERENCES_KEY, 'livi.units.v1');
  const store = storage();
  assert.deepEqual(readUnitPreferences(store), {preferences:{temperature:'celsius',pressure:'psi'},warning:''});
  const ui = bindSensorSettings(root(),{storage:store});
  ui.saveRule(rule());
  const canonicalRules = store.raw;
  assert.equal(ui.setUnitPreferences({temperature:'fahrenheit',pressure:'bar'}).ok, true);
  assert.deepEqual(readUnitPreferences(store).preferences, {temperature:'fahrenheit',pressure:'bar'});
  assert.equal(store.raw, canonicalRules);
  assert.deepEqual(JSON.parse(store.getItem(UNIT_PREFERENCES_KEY)), {version:1,preferences:{temperature:'fahrenheit',pressure:'bar'}});
});

test('corrupt, unknown-version, and invalid saved unit preferences fall back without writing', async () => {
  const {readUnitPreferences, UNIT_PREFERENCES_KEY, renderSensorSettings} = await subject();
  assert.equal(typeof readUnitPreferences, 'function');
  for (const raw of ['{broken',JSON.stringify({version:2,preferences:{temperature:'fahrenheit',pressure:'bar'}}),JSON.stringify({version:1,preferences:{temperature:'kelvin',pressure:'psi'}}),JSON.stringify({version:1,preferences:{temperature:'celsius',pressure:'psi',unknown:true}})]) {
    const store = storage(); store.setItem(UNIT_PREFERENCES_KEY,raw);
    const result = readUnitPreferences(store);
    assert.deepEqual(result.preferences,{temperature:'celsius',pressure:'psi'});
    assert.match(result.warning,/could not be loaded/i);
    assert.doesNotThrow(() => renderSensorSettings({storage:store}));
    assert.equal(store.getItem(UNIT_PREFERENCES_KEY),raw);
  }
});

test('units menus expose native labels, all choices, and reload the saved selection', async () => {
  const {bindSensorSettings, renderSensorSettings} = await subject();
  const store = storage();
  const ui = bindSensorSettings(root(),{storage:store});
  assert.equal(typeof ui.setUnitPreferences,'function');
  ui.setUnitPreferences({temperature:'fahrenheit',pressure:'kPa'});
  const html = renderSensorSettings({storage:store});
  assert.match(html, /<label[^>]*for="sensor-units-temperature">Temperature/);
  assert.match(html, /<label[^>]*for="sensor-units-pressure">Pressure/);
  for (const value of ['celsius','fahrenheit','psi','kPa','bar']) assert.match(html,new RegExp(`<option value="${value}"`));
  assert.match(html, /value="fahrenheit" selected/);
  assert.match(html, /value="kPa" selected/);
  assert.match(html, /CarPlay.*own units|CarPlay.*phone/i);
});

test('unit changes cancel the open editor without saving or reinterpreting its threshold', async () => {
  const {bindSensorSettings} = await subject();
  const element = root();
  const store = storage();
  const ui = bindSensorSettings(element,{storage:store});
  assert.equal(typeof ui.setUnitPreferences,'function');
  ui.saveRule(rule());
  ui.startEdit('temp-high');
  assert.match(element.innerHTML,/data-sensor-rule-form/);
  const canonicalRules = store.raw;
  ui.setUnitPreferences({temperature:'fahrenheit',pressure:'psi'});
  assert.doesNotMatch(element.innerHTML,/data-sensor-rule-form/);
  assert.match(element.innerHTML,/Unsaved rule changes were discarded/i);
  assert.equal(store.raw,canonicalRules);
  assert.equal(ui.getRules()[0].threshold,30);
  assert.match(element.innerHTML,/86 °F/);
  ui.startEdit('temp-high');
  assert.match(element.innerHTML,/name="threshold"[^>]*value="86"/);
});

test('moving guard and strict validation prevent unit writes even after mount', async () => {
  const {bindSensorSettings, UNIT_PREFERENCES_KEY} = await subject();
  const store = storage(); const element = root(); let moving = false;
  const ui = bindSensorSettings(element,{storage:store,getMoving:()=>moving});
  assert.equal(typeof ui.setUnitPreferences,'function');
  assert.equal(ui.setUnitPreferences({temperature:'kelvin',pressure:'psi'}).ok,false);
  assert.equal(store.getItem(UNIT_PREFERENCES_KEY),null);
  moving = true;
  assert.equal(ui.setUnitPreferences({temperature:'fahrenheit',pressure:'bar'}).ok,false);
  assert.equal(store.getItem(UNIT_PREFERENCES_KEY),null);
  assert.match(element.innerHTML, /<fieldset[^>]*data-unit-controls[^>]*disabled/);
});

test('bound unit selection persists the changed preference and reports it to other own pages', async () => {
  const {bindSensorSettings, readUnitPreferences} = await subject();
  assert.equal(typeof readUnitPreferences,'function');
  const store = storage(); const element = root(); let latest;
  bindSensorSettings(element,{storage:store,onUnitsChange:prefs=>{latest=prefs;}});
  const field = {name:'temperature',value:'fahrenheit',dataset:{sensorUnit:'temperature'}};
  element.fire('change',{target:field});
  assert.deepEqual(readUnitPreferences(store).preferences,{temperature:'fahrenheit',pressure:'psi'});
  assert.deepEqual(latest,{temperature:'fahrenheit',pressure:'psi'});
  assert.match(element.innerHTML,/value="fahrenheit" selected/);
});

test('unit storage failures keep an honest local selection without claiming persistence', async () => {
  const {bindSensorSettings} = await subject();
  const element=root();
  const store={getItem(){throw Error('denied');},setItem(){throw Error('denied');}};
  const ui=bindSensorSettings(element,{storage:store});
  assert.equal(typeof ui.setUnitPreferences,'function');
  const result=ui.setUnitPreferences({temperature:'fahrenheit',pressure:'bar'});
  assert.equal(result.ok,true); assert.equal(result.persisted,false);
  assert.match(element.innerHTML,/value="fahrenheit" selected/);
  assert.match(element.innerHTML,/temporary.*reload or close/i);
});

test('save, cancel, and remove restore keyboard focus to an existing rule action', async () => {
  const {bindSensorSettings} = await subject();
  const element=root(); const focused=[];
  element.querySelector=selector=>({focus:()=>focused.push(selector)});
  const ui=bindSensorSettings(element,{storage:storage()});
  ui.saveRule(rule());
  assert.match(focused.at(-1)||'',/data-sensor-action="edit"/);
  assert.match(focused.at(-1)||'',/temp-high/);
  ui.startEdit('temp-high');
  const button={dataset:{sensorAction:'cancel'}};
  element.fire('click',{target:{closest:()=>button}});
  assert.match(focused.at(-1)||'',/data-sensor-action="edit"/);
  ui.removeRule('temp-high');
  assert.match(focused.at(-1)||'',/data-sensor-action="add"/);
});

test('detached settings snapshots preserve session-only rules and units across rebinds', async () => {
  const {bindSensorSettings, renderSensorSettings} = await subject();
  const store = {getItem(){throw Error('denied');},setItem(){throw Error('quota');}};
  const first = bindSensorSettings(root(),{storage:store});
  assert.equal(typeof first.getSnapshot,'function');
  first.saveRule(rule());
  first.setUnitPreferences({temperature:'fahrenheit',pressure:'bar'});
  const snapshot = first.getSnapshot();
  first.destroy();
  const html = renderSensorSettings({storage:store,snapshot});
  assert.match(html,/86 °F/);
  assert.match(html,/value="bar" selected/);
  const element = root();
  const second = bindSensorSettings(element,{storage:store,snapshot});
  assert.equal(second.getRules()[0].threshold,30);
  assert.deepEqual(second.getUnitPreferences(),{temperature:'fahrenheit',pressure:'bar'});
  assert.match(element.innerHTML,/temporary.*reload or close/i);
  snapshot.rules[0].threshold = -999;
  snapshot.unitPreferences.temperature = 'celsius';
  assert.equal(second.getRules()[0].threshold,30);
  assert.equal(second.getUnitPreferences().temperature,'fahrenheit');
});

test('extreme canonical values cannot strand Settings when display conversion would overflow', async () => {
  const {bindSensorSettings, readSensorRules, renderSensorSettings} = await subject();
  const extremes = [rule({threshold:1e308}),rule({threshold:0,hysteresis:1e308})];
  for (const extreme of extremes) {
    const store = storage();
    const ui = bindSensorSettings(root(),{storage:store});
    assert.equal(ui.saveRule(extreme).ok,false);
    assert.equal(store.raw,undefined);
    assert.deepEqual(ui.getRules(),[]);
    assert.doesNotThrow(() => ui.setUnitPreferences({temperature:'fahrenheit',pressure:'psi'}));
    const persisted = storage(JSON.stringify({version:1,rules:[extreme]}));
    assert.deepEqual(readSensorRules(persisted).rules,[]);
    assert.doesNotThrow(() => renderSensorSettings({storage:persisted,unitPreferences:{temperature:'fahrenheit',pressure:'psi'}}));
    assert.doesNotThrow(() => renderSensorSettings({rules:[extreme],unitPreferences:{temperature:'fahrenheit',pressure:'psi'}}));
  }
});

test('label-only edits in Fahrenheit preserve unchanged canonical threshold and hysteresis exactly', async () => {
  const {bindSensorSettings} = await subject();
  const element = root();
  const ui = bindSensorSettings(element,{storage:storage(),unitPreferences:{temperature:'fahrenheit',pressure:'psi'}});
  ui.saveRule(rule({threshold:1,hysteresis:1}));
  ui.startEdit('temp-high');
  const values={sensor:'insideTemperature',label:'Renamed cabin rule',condition:'above',threshold:'33.8',hysteresis:'1.8',debounceMs:'1000',staleAfterMs:'5000',repeatMs:'60000',audio:'false',repeat:'once'};
  const form={matches:()=>true,elements:{namedItem:name => name === 'enabled' ? {checked:true} : {value:values[name]}}};
  element.fire('submit',{target:form,preventDefault(){}});
  assert.equal(ui.getRules()[0].label,'Renamed cabin rule');
  assert.equal(ui.getRules()[0].threshold,1);
  assert.equal(ui.getRules()[0].hysteresis,1);
});

test('in-memory remount snapshots capture live unsaved form values without persisting drafts', async () => {
  const {bindSensorSettings, renderSensorSettings} = await subject();
  const store=storage(); const element=root();
  const first=bindSensorSettings(element,{storage:store,unitPreferences:{temperature:'fahrenheit',pressure:'psi'}});
  first.saveRule(rule({threshold:1,hysteresis:1}));
  first.startEdit('temp-high');
  const values={sensor:'insideTemperature',label:'Unsaved cabin name',condition:'above',threshold:'44',hysteresis:'1.8',debounceMs:'2000',staleAfterMs:'5000',repeatMs:'60000',audio:'false',repeat:'once'};
  const form={elements:{namedItem:name => name === 'enabled' ? {checked:true} : {value:values[name]}}};
  element.querySelector=selector=>selector === 'form[data-sensor-rule-form]' ? form : null;
  const before=store.raw;
  const snapshot=first.getSnapshot();
  assert.equal(snapshot.editor?.threshold,'44');
  assert.equal(snapshot.editor?.label,'Unsaved cabin name');
  assert.equal(snapshot.rules[0].threshold,1);
  assert.equal(store.raw,before);
  assert.doesNotMatch(store.raw,/Unsaved cabin name|editor/);
  first.destroy();
  const html=renderSensorSettings({storage:store,snapshot});
  assert.match(html,/name="threshold"[^>]*value="44"/);
  const restored=root();
  const second=bindSensorSettings(restored,{storage:store,snapshot});
  assert.match(restored.innerHTML,/value="Unsaved cabin name"/);
  assert.match(restored.innerHTML,/name="threshold"[^>]*value="44"/);
  assert.equal(second.getRules()[0].threshold,1);
  snapshot.editor.label='Mutated outside';
  assert.equal(second.getSnapshot().editor.label,'Unsaved cabin name');
  assert.equal(store.raw,before);
});

test('known moving state closes a carried editor without writing its draft', async () => {
  const {bindSensorSettings, renderSensorSettings} = await subject();
  const store=storage(); const first=bindSensorSettings(root(),{storage:store});
  first.saveRule(rule()); first.startEdit('temp-high');
  const snapshot=first.getSnapshot();
  assert.ok(snapshot.editor);
  const before=store.raw;
  const html=renderSensorSettings({storage:store,snapshot,moving:true});
  assert.doesNotMatch(html,/data-sensor-rule-form/);
  const element=root(); let moving=true;
  const second=bindSensorSettings(element,{storage:store,snapshot,getMoving:()=>moving});
  assert.doesNotMatch(element.innerHTML,/data-sensor-rule-form/);
  moving=false; second.refresh();
  assert.doesNotMatch(element.innerHTML,/data-sensor-rule-form/);
  assert.equal(second.getSnapshot().editor,null);
  assert.equal(store.raw,before);
});
