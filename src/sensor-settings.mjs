import {validateSensorRule, MAX_SENSOR_RULES} from './sensor-alerts.mjs';
import {SENSOR_REGISTRY, DEFAULT_UNIT_PREFERENCES, validateUnitPreferences, sensorDisplayUnit, toDisplayValue, toCanonicalValue, toDisplayDelta, toCanonicalDelta} from './units.mjs';

export const SENSOR_RULES_KEY = 'livi.sensor-rules.v1';
export const UNIT_PREFERENCES_KEY = 'livi.units.v1';
const sensorConditions = {above:'Value above',below:'Value below',missing:'Reading missing',stale:'Reading stale'};
const escapeSensorText = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const sensorSessionWarning = 'Storage unavailable. Changes last only for this session while the settings panel stays open.';
let sensorRuleSequence = 0;

function validatedSensorRules(rules) {
  if (!Array.isArray(rules) || rules.length > MAX_SENSOR_RULES) throw new TypeError('Invalid rule list.');
  const ids = new Set();
  return rules.map(input => {
    const rule = validateSensorRule(input);
    if (!Object.hasOwn(SENSOR_REGISTRY,rule.sensor)) throw new TypeError('Unknown sensor.');
    if (['above','below'].includes(rule.condition)) {
      try {
        for (const preferences of [{temperature:'celsius',pressure:'psi'},{temperature:'fahrenheit',pressure:'kPa'},{temperature:'fahrenheit',pressure:'bar'}]) {
          toDisplayValue(rule.sensor,rule.threshold,preferences);
          toDisplayDelta(rule.sensor,rule.hysteresis,preferences);
        }
      } catch {throw new RangeError('Threshold and hysteresis must be displayable in all supported units.');}
    }
    if (ids.has(rule.id)) throw new TypeError('Duplicate rule ID.');
    ids.add(rule.id);
    return rule;
  });
}

/** Reading settings never writes, repairs, or starts an alert evaluation. */
export function readSensorRules(storage) {
  if (!storage?.getItem) return {rules:[],warning:sensorSessionWarning};
  let raw;
  try { raw = storage.getItem(SENSOR_RULES_KEY); }
  catch { return {rules:[],warning:sensorSessionWarning}; }
  if (raw == null) return {rules:[],warning:''};
  try {
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) throw new TypeError('Unsupported settings version.');
    return {rules:validatedSensorRules(data.rules),warning:''};
  } catch { return {rules:[],warning:'Saved sensor rules could not be loaded. No rules are active here. Add a rule to replace the invalid settings.'}; }
}

/** Own-page display settings; native CarPlay owns its separate unit preferences. */
export function readUnitPreferences(storage) {
  const defaults = () => ({...DEFAULT_UNIT_PREFERENCES});
  if (!storage?.getItem) return {preferences:defaults(),warning:sensorSessionWarning};
  let raw;
  try {raw = storage.getItem(UNIT_PREFERENCES_KEY);}
  catch {return {preferences:defaults(),warning:sensorSessionWarning};}
  if (raw == null) return {preferences:defaults(),warning:''};
  try {
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !Object.hasOwn(data,'preferences')) throw new TypeError('Unsupported unit settings.');
    return {preferences:validateUnitPreferences(data.preferences),warning:''};
  } catch {return {preferences:defaults(),warning:'Saved display units could not be loaded. Celsius and PSI are shown until you choose new units.'};}
}

function sensorUnitControls(preferences, moving) {
  const option = (value,label,current) => `<option value="${value}"${value === current ? ' selected' : ''}>${label}</option>`;
  return `<div class="sensor-unit-settings"><h2>Units</h2><fieldset data-unit-controls${moving === true ? ' disabled' : ''}><legend>Display units</legend><div class="sensor-fields">
<div class="sensor-field"><label for="sensor-units-temperature">Temperature</label><select id="sensor-units-temperature" name="temperature" data-sensor-unit="temperature">${option('celsius','Celsius (°C)',preferences.temperature)}${option('fahrenheit','Fahrenheit (°F)',preferences.temperature)}</select></div>
<div class="sensor-field"><label for="sensor-units-pressure">Pressure</label><select id="sensor-units-pressure" name="pressure" data-sensor-unit="pressure">${option('psi','PSI',preferences.pressure)}${option('kPa','kPa',preferences.pressure)}${option('bar','bar',preferences.pressure)}</select></div>
</div></fieldset><p class="help">Applies to this headunit’s own pages. CarPlay uses the phone’s own units. Gauge and absolute pressures remain distinct.</p></div>`;
}

function sensorUnitLabel(sensor, preferences) {
  const definition = SENSOR_REGISTRY[sensor];
  if (!definition) return 'sensor units';
  const reference = definition.pressureReference ? ` ${definition.pressureReference}` : '';
  return sensorDisplayUnit(sensor, preferences) + reference;
}
function sensorRuleSummary(rule, preferences) {
  const condition = sensorConditions[rule.condition];
  let threshold = '';
  if (['above','below'].includes(rule.condition)) {
    try {threshold = ` ${new Intl.NumberFormat('en',{maximumFractionDigits:6}).format(toDisplayValue(rule.sensor,rule.threshold,preferences))} ${sensorUnitLabel(rule.sensor,preferences)}`;}
    catch {threshold = ' (value unavailable in selected units)';}
  }
  return `${condition}${threshold} · ${rule.audio ? 'Sound requested' : 'Silent'} · ${rule.repeat === 'repeat' ? 'Repeats' : 'Once until normal'}${rule.enabled ? '' : ' · Disabled'}`;
}
function sensorDraft(rule, preferences) {
  if (!rule) return {id:'',sensor:'',label:'',condition:'above',threshold:'',hysteresis:'0',debounceMs:'1000',staleAfterMs:'5000',repeatMs:'60000',repeat:'once',audio:'false',enabled:true};
  return {...rule,threshold:rule.threshold === undefined ? '' : String(toDisplayValue(rule.sensor,rule.threshold,preferences)),hysteresis:String(toDisplayDelta(rule.sensor,rule.hysteresis,preferences)),audio:String(rule.audio)};
}
function sensorEditorMarkup(editor, preferences, moving) {
  if (!editor) return '';
  const numeric = ['above','below'].includes(editor.condition);
  const option = (value,label,current) => `<option value="${escapeSensorText(value)}"${String(value) === String(current) ? ' selected' : ''}>${escapeSensorText(label)}</option>`;
  const select = (name,label,options) => `<div class="sensor-field"><label for="sensor-rule-${name}">${label}</label><select id="sensor-rule-${name}" name="${name}">${options}</select></div>`;
  const number = (name,label,{min,step='1',disabled=false}={}) => `<div class="sensor-field"><label for="sensor-rule-${name}">${escapeSensorText(label)}</label><input id="sensor-rule-${name}" name="${name}" type="number" step="${step}"${min === undefined ? '' : ` min="${min}"`} value="${escapeSensorText(editor[name])}"${disabled ? ' disabled' : ' required'}></div>`;
  const unit = sensorUnitLabel(editor.sensor,preferences);
  return `<form data-sensor-rule-form novalidate aria-describedby="sensor-rule-error sensor-rule-help"><fieldset${moving === true ? ' disabled' : ''}><legend>${editor.id ? 'Edit rule' : 'New rule'}</legend><div class="sensor-fields">
${select('sensor','Sensor',option('','Choose a sensor',editor.sensor)+Object.values(SENSOR_REGISTRY).map(sensor => option(sensor.id,`${sensor.label}${sensor.pressureReference ? ` (${sensor.pressureReference})` : ''}`,editor.sensor)).join(''))}
<div class="sensor-field"><label for="sensor-rule-label">Rule name (optional)</label><input id="sensor-rule-label" name="label" type="text" maxlength="80" value="${escapeSensorText(editor.label)}"></div>
${select('condition','Condition',Object.entries(sensorConditions).map(([value,label]) => option(value,label,editor.condition)).join(''))}
${number('threshold',`Threshold (${unit})`,{step:'any',disabled:!numeric})}
${number('hysteresis',`Hysteresis (${unit})`,{step:'any',min:0,disabled:!numeric})}
${number('debounceMs','Debounce (milliseconds)',{min:0})}
${number('staleAfterMs','Stale after (milliseconds)',{min:1})}
${select('audio','Alert sound',option('false','Silent',editor.audio)+option('true','Audible (when supported)',editor.audio))}
${select('repeat','Alert behavior',option('once','Once until normal',editor.repeat)+option('repeat','Repeat while active',editor.repeat))}
${number('repeatMs','Repeat interval (milliseconds)',{min:1000,disabled:editor.repeat !== 'repeat'})}
<div class="sensor-field sensor-checkbox"><label for="sensor-rule-enabled">Rule enabled</label><input id="sensor-rule-enabled" name="enabled" type="checkbox"${editor.enabled ? ' checked' : ''}></div>
</div><p id="sensor-rule-help" class="help">Thresholds use the selected units. Hysteresis sets the gap before a warning clears; debounce avoids brief spikes. No sound backend is connected; audible rules save intent only.</p><div class="actions"><button type="submit">${editor.id ? 'Save changes' : 'Add rule'}</button><button type="button" data-sensor-action="cancel">Cancel</button></div></fieldset></form>`;
}

/** A pure settings view. It cannot invent readings or trigger warnings. */
export function renderSensorSettings(options = {}) {
  options = {...options.snapshot,...options};
  const loaded = options.rules ? {rules:options.rules,warning:''} : readSensorRules(options.storage);
  const rules = loaded.rules;
  const loadedUnits = readUnitPreferences(options.storage);
  const preferences = options.unitPreferences || loadedUnits.preferences;
  const unitWarning = options.unitWarning ?? loadedUnits.warning;
  const moving = options.moving ?? null;
  const renderedEditor = moving === true ? null : options.editor;
  const disabled = moving === true ? ' disabled' : '';
  const warning = options.warning ?? loaded.warning;
  return `<div class="sensor-settings-content">${sensorUnitControls(preferences,moving)}
${unitWarning ? `<p class="sensor-unit-warning" role="status">${escapeSensorText(unitWarning)}</p>` : ''}
${options.notice ? `<p class="sensor-settings-notice" role="status">${escapeSensorText(options.notice)}</p>` : ''}
<h2>Sensor alerts</h2><p class="help">No live sensor data is connected. Rules are saved for a future sensor connection.</p><p class="sensor-motion-note">${moving === true ? 'Park before editing sensor rules.' : moving === false ? 'Vehicle reports stationary. Edit only while safely parked.' : 'Motion state unavailable. Edit only while safely parked.'}</p>
${warning ? `<p class="sensor-storage-note" role="status">${escapeSensorText(warning)}</p>` : ''}
<p id="sensor-rule-error"${options.error ? ' role="alert"' : ''}>${escapeSensorText(options.error || '')}</p>
${rules.length ? `<ul class="sensor-rule-list">${rules.map(rule => `<li><div><strong>${escapeSensorText(rule.label)}</strong><p>${escapeSensorText(sensorRuleSummary(rule,preferences))}</p></div><div class="actions"><button type="button" data-sensor-action="edit" data-sensor-rule-id="${escapeSensorText(rule.id)}" aria-label="Edit ${escapeSensorText(rule.label)}"${disabled}>Edit</button><button type="button" data-sensor-action="remove" data-sensor-rule-id="${escapeSensorText(rule.id)}" aria-label="Remove ${escapeSensorText(rule.label)}"${disabled}>Remove</button></div></li>`).join('')}</ul>` : '<p class="sensor-empty">No rules configured.</p>'}
${renderedEditor ? sensorEditorMarkup(renderedEditor,preferences,moving) : `<button type="button" data-sensor-action="add"${disabled || (rules.length >= MAX_SENSOR_RULES ? ' disabled' : '')}>Add rule</button>`}</div>`;
}

/** Bounded, delegated native-form controller. Rule APIs accept canonical units. */
export function bindSensorSettings(root, options = {}) {
  const loaded = readSensorRules(options.storage);
  const loadedUnits = readUnitPreferences(options.storage);
  let unitPreferences = validateUnitPreferences(options.snapshot?.unitPreferences || options.getUnitPreferences?.() || options.unitPreferences || loadedUnits.preferences);
  let rules = options.snapshot?.rules ? validatedSensorRules(options.snapshot.rules) : loaded.rules;
  let warning = options.snapshot?.warning ?? loaded.warning, unitWarning = options.snapshot?.unitWarning ?? loadedUnits.warning;
  let error = options.snapshot?.error || '', editor = options.snapshot?.editor ? {...options.snapshot.editor} : null, notice = options.snapshot?.notice || '';
  const canRender = typeof root?.addEventListener === 'function';
  function moving() { try {return options.getMoving ? options.getMoving() : options.moving ?? null;} catch {return null;} }
  function preferences() {return {...unitPreferences};}
  function focusAction(id) {root.querySelector?.(id ? `[data-sensor-action="edit"][data-sensor-rule-id="${id}"]` : '[data-sensor-action="add"]')?.focus?.();}
  function refresh() {
    if (moving() === true) editor = null;
    if (canRender) root.innerHTML = renderSensorSettings({rules,warning,unitWarning,notice,error,editor,moving:moving(),unitPreferences:preferences()});
  }
  function fail(message) {error = message; refresh(); return {ok:false,error};}
  function guard() {return moving() === true ? fail('Park before editing settings.') : null;}
  function getRules() {return rules.map(rule => ({...rule}));}
  function getSnapshot() {
    if (moving() === true) editor = null;
    if (editor) {
      const form = root.querySelector?.('form[data-sensor-rule-form]');
      if (typeof form?.elements?.namedItem === 'function') editor = readForm(form);
    }
    return {rules:getRules(),unitPreferences:preferences(),warning,unitWarning,editor:editor ? {...editor} : null,error,notice};
  }
  function commit(next, focusId = null) {
    rules = next; error = ''; editor = null; notice = ''; 
    let persisted = false;
    try {
      if (!options.storage?.setItem) throw new Error('Storage unavailable');
      options.storage.setItem(SENSOR_RULES_KEY,JSON.stringify({version:1,rules}));
      persisted = true; warning = '';
    } catch {warning = sensorSessionWarning;}
    refresh(); focusAction(focusId); options.onChange?.(getRules());
    return {ok:true,persisted,rules:getRules()};
  }
  function saveRule(input) {
    const blocked = guard(); if (blocked) return blocked;
    try {
      const rule = validateSensorRule(input);
      const next = rules.filter(current => current.id !== rule.id);
      const index = rules.findIndex(current => current.id === rule.id);
      if (index < 0) next.push(rule); else next.splice(index,0,rule);
      return commit(validatedSensorRules(next),rule.id);
    } catch (failure) {return fail(failure.message || 'Check the rule values.');}
  }
  function removeRule(id) {
    const blocked = guard(); if (blocked) return blocked;
    if (!rules.some(rule => rule.id === id)) return fail('That rule no longer exists.');
    return commit(rules.filter(rule => rule.id !== id));
  }
  function setUnitPreferences(input, focusUnit = 'temperature') {
    const blocked = guard(); if (blocked) return blocked;
    let next;
    try {next = validateUnitPreferences(input);}
    catch (failure) {return fail(failure.message || 'Choose valid display units.');}
    notice = editor ? 'Units changed. The open rule editor was closed without saving.' : 'Display units updated.';
    editor = null; error = ''; unitPreferences = next;
    let persisted = false;
    try {
      if (!options.storage?.setItem) throw new Error('Storage unavailable');
      options.storage.setItem(UNIT_PREFERENCES_KEY,JSON.stringify({version:1,preferences:next}));
      persisted = true; unitWarning = '';
    } catch {unitWarning = sensorSessionWarning;}
    refresh(); root.querySelector?.(`[data-sensor-unit="${focusUnit}"]`)?.focus?.();
    options.onUnitsChange?.(preferences());
    return {ok:true,persisted,preferences:preferences()};
  }
  function startAdd() {
    const blocked = guard(); if (blocked) return blocked;
    if (rules.length >= MAX_SENSOR_RULES) return fail(`Use at most ${MAX_SENSOR_RULES} rules.`);
    editor = sensorDraft(null,preferences()); error = ''; notice = ''; refresh();
    root.querySelector?.('[name="sensor"]')?.focus?.();
    return {ok:true};
  }
  function startEdit(id) {
    const blocked = guard(); if (blocked) return blocked;
    const rule = rules.find(item => item.id === id);
    if (!rule) return fail('That rule no longer exists.');
    editor = sensorDraft(rule,preferences()); error = ''; notice = ''; refresh();
    root.querySelector?.('[name="sensor"]')?.focus?.();
    return {ok:true};
  }
  function readForm(form) {
    const draft = {...editor};
    for (const name of ['sensor','label','condition','threshold','hysteresis','debounceMs','staleAfterMs','audio','repeat','repeatMs']) draft[name] = form.elements.namedItem(name)?.value ?? draft[name];
    draft.enabled = form.elements.namedItem('enabled')?.checked === true;
    return draft;
  }
  function requiredNumber(value, label) {
    if (String(value ?? '').trim() === '') throw new TypeError(`${label} is required.`);
    const number = Number(value);
    if (!Number.isFinite(number)) throw new TypeError(`${label} must be a finite number.`);
    return number;
  }
  function submit(event) {
    if (!event.target?.matches?.('form[data-sensor-rule-form]')) return;
    event.preventDefault();
    const blocked = guard(); if (blocked) return;
    editor = readForm(event.target);
    try {
      if (!Object.hasOwn(SENSOR_REGISTRY,editor.sensor)) throw new TypeError('Choose a sensor.');
      const id = editor.id || `rule-${Date.now().toString(36)}-${++sensorRuleSequence}`;
      const rule = {id,sensor:editor.sensor,label:editor.label.trim() || SENSOR_REGISTRY[editor.sensor].label,condition:editor.condition,hysteresis:0,debounceMs:requiredNumber(editor.debounceMs,'Debounce'),staleAfterMs:requiredNumber(editor.staleAfterMs,'Stale interval'),repeatMs:editor.repeat === 'repeat' ? requiredNumber(editor.repeatMs,'Repeat interval') : 60000,repeat:editor.repeat,audio:editor.audio === 'true',enabled:editor.enabled};
      if (['above','below'].includes(rule.condition)) {
        const original = rules.find(item => item.id === editor.id && item.sensor === rule.sensor);
        const unchangedThreshold = original?.threshold !== undefined && String(editor.threshold) === String(toDisplayValue(rule.sensor,original.threshold,preferences()));
        const unchangedHysteresis = original && String(editor.hysteresis) === String(toDisplayDelta(rule.sensor,original.hysteresis,preferences()));
        rule.threshold = unchangedThreshold ? original.threshold : toCanonicalValue(rule.sensor,requiredNumber(editor.threshold,'Threshold'),preferences());
        rule.hysteresis = unchangedHysteresis ? original.hysteresis : toCanonicalDelta(rule.sensor,requiredNumber(editor.hysteresis,'Hysteresis'),preferences());
      }
      saveRule(rule);
    } catch (failure) {fail(failure.message || 'Check the rule values.');}
  }
  function click(event) {
    const button = event.target?.closest?.('[data-sensor-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.sensorAction;
    if (action === 'add') startAdd();
    else if (action === 'edit') startEdit(button.dataset.sensorRuleId);
    else if (action === 'remove') removeRule(button.dataset.sensorRuleId);
    else if (action === 'cancel') {const id = editor?.id; editor = null; error = ''; refresh(); focusAction(id);}
  }
  function change(event) {
    const unit = event.target?.dataset?.sensorUnit;
    if (['temperature','pressure'].includes(unit)) {setUnitPreferences({...preferences(),[unit]:event.target.value},unit); return;}
    if (!editor || !['sensor','condition','repeat'].includes(event.target?.name)) return;
    const form = event.target.closest?.('form[data-sensor-rule-form]');
    if (!form) return;
    editor = readForm(form);
    if (event.target.name === 'sensor') {editor.threshold = ''; editor.hysteresis = '0';}
    error = ''; refresh(); root.querySelector?.(`[name="${event.target.name}"]`)?.focus?.();
  }
  if (canRender) {
    root.addEventListener('submit',submit); root.addEventListener('click',click); root.addEventListener('change',change); refresh();
  }
  return {refresh,getRules,getSnapshot,saveRule,removeRule,startAdd,startEdit,getUnitPreferences:preferences,setUnitPreferences,destroy(){if (canRender) {root.removeEventListener('submit',submit);root.removeEventListener('click',click);root.removeEventListener('change',change);}}};
}
