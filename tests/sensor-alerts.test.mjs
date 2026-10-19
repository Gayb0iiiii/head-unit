import test from 'node:test';
import assert from 'node:assert/strict';
import * as alerts from '../src/sensor-alerts.mjs';

test('sensor alert engine starts with no configured rules or runtime data', () => {
  assert.equal(typeof alerts.createSensorAlertState, 'function');
  assert.deepEqual(alerts.createSensorAlertState(), {
    rules: [], runtime: {}, lastEvaluatedAt: null
  });
});

const numericRule = (overrides = {}) => ({
  id: 'temperature-high', sensor: 'coolant.temperature', label: 'Coolant',
  condition: 'above', threshold: 100, ...overrides
});

test('rule validation normalizes defaults without changing caller input', () => {
  assert.equal(typeof alerts.validateSensorRule, 'function');
  const input = numericRule({ label: '  Coolant  ' });
  const before = structuredClone(input);
  const rule = alerts.validateSensorRule(input);
  assert.deepEqual(rule, {
    ...numericRule(), hysteresis: 0, debounceMs: 1000,
    staleAfterMs: 5000, repeatMs: 60000, enabled: true,
    audio: false, repeat: 'once'
  });
  assert.deepEqual(input, before);
});

test('validation rejects ambiguous, malformed and unbounded rules', () => {
  assert.equal(typeof alerts.validateSensorRule, 'function');
  const invalid = [null, [], {}, numericRule({ id: '__proto__' }),
    numericRule({ sensor: '' }), numericRule({ label: 'x'.repeat(81) }),
    numericRule({ label: '<script>' }), numericRule({ condition: 'equals' }),
    numericRule({ threshold: NaN }), numericRule({ threshold: Infinity }),
    numericRule({ threshold: '100' }), numericRule({ hysteresis: -1 }),
    numericRule({ hysteresis: Infinity }), numericRule({ threshold: Number.MAX_VALUE, hysteresis: Number.MAX_VALUE }),
    numericRule({ debounceMs: -1 }), numericRule({ debounceMs: 600001 }),
    numericRule({ debounceMs: 1.5 }), numericRule({ staleAfterMs: 0 }),
    numericRule({ staleAfterMs: Infinity }), numericRule({ repeatMs: 0 }),
    numericRule({ repeatMs: 86400001 }), numericRule({ enabled: 'true' }),
    numericRule({ audio: 'yes' }), numericRule({ repeat: 'forever' }),
    numericRule({ arbitrary: true }), numericRule({ condition: 'missing' }),
    { id: 'bad', sensor: 'x', condition: 'stale', hysteresis: 1 }
  ];
  for (const input of invalid) assert.throws(() => alerts.validateSensorRule(input));
});

test('missing and stale rules remain distinct from numeric thresholds', () => {
  assert.equal(typeof alerts.validateSensorRule, 'function');
  for (const condition of ['missing', 'stale']) {
    const rule = alerts.validateSensorRule({ id: condition, sensor: 'pressure', condition });
    assert.equal(rule.condition, condition);
    assert.equal(rule.label, 'pressure');
    assert.equal(Object.hasOwn(rule, 'threshold'), false);
    assert.equal(rule.hysteresis, 0);
  }
});

test('create, add, edit and remove are pure validated operations with a bounded rule count', () => {
  assert.equal(alerts.MAX_SENSOR_RULES, 32);
  assert.equal(typeof alerts.upsertSensorRule, 'function');
  assert.equal(typeof alerts.removeSensorRule, 'function');
  const empty = alerts.createSensorAlertState();
  const added = alerts.upsertSensorRule(empty, numericRule());
  assert.equal(empty.rules.length, 0);
  assert.equal(added.rules.length, 1);
  const edited = alerts.upsertSensorRule(added, numericRule({ threshold: 110 }));
  assert.equal(edited.rules.length, 1);
  assert.equal(edited.rules[0].threshold, 110);
  assert.equal(added.rules[0].threshold, 100);
  assert.deepEqual(alerts.removeSensorRule(edited, 'temperature-high').rules, []);
  assert.throws(() => alerts.removeSensorRule(edited, 'absent'));
  assert.throws(() => alerts.createSensorAlertState([numericRule(), numericRule()]));
  assert.throws(() => alerts.createSensorAlertState({}));
  const many = Array.from({ length: 32 }, (_, i) => numericRule({ id: `rule-${i}` }));
  const full = alerts.createSensorAlertState(many);
  assert.equal(full.rules.length, 32);
  assert.throws(() => alerts.upsertSensorRule(full, numericRule()));
  assert.throws(() => alerts.createSensorAlertState([...many, numericRule()]));
  assert.equal(alerts.upsertSensorRule(full, numericRule({ id: 'rule-0' })).rules.length, 32);
});

const sample = (value, timestamp) => ({ 'coolant.temperature': { value, timestamp } });
const evaluate = (state, now, readings = {}, extras = {}) => {
  assert.equal(typeof alerts.evaluateSensorAlerts, 'function');
  return alerts.evaluateSensorAlerts(state, { now, readings, ...extras });
};

test('empty rules produce no sample values, banners or events', () => {
  const state = alerts.createSensorAlertState();
  const result = evaluate(state, 1000);
  assert.deepEqual(result.banners, []);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.statuses, []);
  assert.deepEqual(result.state.runtime, {});
  assert.equal(result.state.lastEvaluatedAt, 1000);
  assert.equal(state.lastEvaluatedAt, null);
});

test('above and below use strict entry thresholds and fresh finite readings', () => {
  const state = alerts.createSensorAlertState([
    numericRule({ debounceMs: 0 }),
    numericRule({ id: 'temperature-low', condition: 'below', threshold: 20, debounceMs: 0 })
  ]);
  const equal = evaluate(state, 1000, sample(100, 1000));
  assert.equal(equal.banners.length, 0);
  assert.equal(evaluate(equal.state, 1001, sample(101, 1001)).banners[0].ruleId, 'temperature-high');
  assert.equal(evaluate(state, 1000, sample(19, 1000)).banners[0].ruleId, 'temperature-low');
  assert.equal(evaluate(state, 1000, sample(20, 1000)).banners.length, 0);
});

test('debounce requires continued matching observations and resets on normal or unavailable', () => {
  let state = alerts.createSensorAlertState([numericRule({ debounceMs: 1000 })]);
  let result = evaluate(state, 0, sample(101, 0));
  assert.equal(result.statuses[0].status, 'pending');
  assert.equal(result.banners.length, 0);
  result = evaluate(result.state, 999, sample(101, 999));
  assert.equal(result.banners.length, 0);
  result = evaluate(result.state, 1000, sample(101, 1000));
  assert.equal(result.banners.length, 1);
  assert.equal(result.events.length, 1);
  assert.equal(result.banners[0].raisedAt, 1000);
  state = evaluate(state, 0, sample(101, 0)).state;
  state = evaluate(state, 500, sample(99, 500)).state;
  state = evaluate(state, 1000, sample(101, 1000)).state;
  assert.equal(evaluate(state, 1999, sample(101, 1999)).banners.length, 0);
  state = evaluate(state, 2000).state;
  assert.equal(evaluate(state, 3000, sample(101, 3000)).banners.length, 0);
});

test('hysteresis holds above and below episodes through noise until their reset boundaries', () => {
  for (const [condition, start, noise, reset] of [['above', 101, 98, 95], ['below', 99, 102, 105]]) {
    let result = evaluate(alerts.createSensorAlertState([
      numericRule({ condition, hysteresis: 5, debounceMs: 0 })
    ]), 0, sample(start, 0));
    assert.equal(result.banners.length, 1);
    result = evaluate(result.state, 100, sample(noise, 100));
    assert.equal(result.banners.length, 1);
    assert.equal(result.events.length, 0);
    result = evaluate(result.state, 200, sample(reset, 200));
    assert.equal(result.banners.length, 0);
    assert.equal(result.statuses[0].status, 'inactive');
    assert.equal(evaluate(result.state, 300, sample(start, 300)).events.length, 1);
  }
});

test('missing and stale conditions never masquerade as numeric threshold breaches', () => {
  const state = alerts.createSensorAlertState([
    numericRule({ debounceMs: 0, staleAfterMs: 100 }),
    { id: 'missing', sensor: 'coolant.temperature', condition: 'missing', debounceMs: 0, staleAfterMs: 100 },
    { id: 'stale', sensor: 'coolant.temperature', condition: 'stale', debounceMs: 0, staleAfterMs: 100 }
  ]);
  const missing = evaluate(state, 1000);
  assert.deepEqual(missing.banners.map(item => item.ruleId), ['missing']);
  assert.equal(missing.statuses[0].status, 'unavailable');
  assert.equal(missing.statuses[0].quality, 'missing');
  const stale = evaluate(state, 1000, sample(1000, 0));
  assert.deepEqual(stale.banners.map(item => item.ruleId), ['stale']);
  assert.equal(stale.statuses[0].status, 'unavailable');
  assert.equal(stale.statuses[0].quality, 'stale');
  assert.equal(Object.hasOwn(stale.statuses[0], 'value'), false);
  assert.equal(Object.hasOwn(stale.banners[0], 'value'), false);
  assert.deepEqual(evaluate(state, 1000, sample(50, 900)).banners, []);
});

test('invalid, future, inherited and out-of-order samples cannot trigger numeric banners', () => {
  const initial = alerts.createSensorAlertState([numericRule({ debounceMs: 0 })]);
  for (const value of [NaN, Infinity, -Infinity, '101', null, undefined]) {
    const result = evaluate(initial, 1000, sample(value, 1000));
    assert.equal(result.banners.length, 0);
    assert.equal(result.statuses[0].quality, 'invalid');
    assert.equal(result.statuses[0].status, 'unavailable');
  }
  for (const timestamp of [NaN, Infinity, -1, '1000', Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(evaluate(initial, 1000, sample(101, timestamp)).statuses[0].quality, 'invalid');
  }
  assert.equal(evaluate(initial, 1000, sample(101, 1001)).statuses[0].quality, 'future');
  const current = evaluate(initial, 1000, sample(90, 1000));
  const old = evaluate(current.state, 1001, sample(150, 999));
  assert.equal(old.statuses[0].quality, 'out-of-order');
  assert.equal(old.banners.length, 0);
  const inherited = Object.create({ 'coolant.temperature': { value: 150, timestamp: 1000 } });
  assert.throws(() => evaluate(initial, 1000, inherited));
});

test('clock validation rejects nonfinite and backwards evaluation without mutating state', () => {
  const initial = alerts.createSensorAlertState([numericRule()]);
  const state = evaluate(initial, 1000).state;
  const before = structuredClone(state);
  for (const now of [NaN, Infinity, -1, '1000', 999, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => evaluate(state, now, sample(101, 0)));
  }
  assert.throws(() => evaluate(state, 1000, []));
  assert.deepEqual(state, before);
  assert.doesNotThrow(() => evaluate(state, 1000));
});

test('once-until-normal stays latched through unknown gaps and the hysteresis band', () => {
  let result = evaluate(alerts.createSensorAlertState([
    numericRule({ debounceMs: 0, hysteresis: 5, staleAfterMs: 100 })
  ]), 0, sample(101, 0));
  assert.equal(result.events.length, 1);
  for (const [now, readings] of [[200, sample(101, 0)], [300, {}], [400, sample(NaN, 400)]]) {
    result = evaluate(result.state, now, readings);
    assert.equal(result.statuses[0].status, 'unavailable');
    assert.equal(result.banners.length, 0);
  }
  result = evaluate(result.state, 500, sample(99, 500));
  assert.equal(result.banners.length, 1);
  assert.equal(result.events.length, 0);
  result = evaluate(result.state, 600, sample(95, 600));
  assert.equal(result.banners.length, 0);
  result = evaluate(result.state, 700, sample(101, 700));
  assert.equal(result.events.length, 1);
});

test('repeat events obey the interval while persistent and across rapid normal re-entry', () => {
  let result = evaluate(alerts.createSensorAlertState([
    numericRule({ debounceMs: 0, repeat: 'repeat', repeatMs: 1000 })
  ]), 0, sample(101, 0));
  assert.equal(result.events.length, 1);
  result = evaluate(result.state, 999, sample(101, 999));
  assert.equal(result.events.length, 0);
  result = evaluate(result.state, 1000, sample(101, 1000));
  assert.equal(result.events.length, 1);
  result = evaluate(result.state, 1000, sample(101, 1000));
  assert.equal(result.events.length, 0);
  result = evaluate(result.state, 1200, sample(99, 1200));
  result = evaluate(result.state, 1300, sample(101, 1300));
  assert.equal(result.banners.length, 1);
  assert.equal(result.events.length, 0);
  assert.equal(evaluate(result.state, 2000, sample(101, 2000)).events.length, 1);
});

test('audio choice creates capability-gated intent only, and is silent by default', () => {
  for (const [audio, capabilities, expected] of [[false, {}, 'none'], [true, {}, 'blocked'],
    [true, { audio: false }, 'blocked'], [true, { audio: true }, 'request'], [true, { audio: 'true' }, 'blocked']]) {
    const result = evaluate(alerts.createSensorAlertState([
      numericRule({ debounceMs: 0, audio })
    ]), 0, sample(101, 0), { capabilities });
    assert.equal(result.events[0].audioIntent, expected);
    assert.equal(result.banners[0].delivery, 'banner');
  }
});

test('disabled rules never raise banners and edits reset only the edited runtime', () => {
  const initial = alerts.createSensorAlertState([
    numericRule({ debounceMs: 0 }), numericRule({ id: 'other', debounceMs: 0 })
  ]);
  const current = evaluate(initial, 1000, sample(101, 1000));
  const before = structuredClone(current.state);
  const edited = alerts.upsertSensorRule(current.state, numericRule({ enabled: false }));
  assert.equal(Object.hasOwn(edited.runtime, 'temperature-high'), false);
  assert.deepEqual(edited.runtime.other, current.state.runtime.other);
  assert.deepEqual(current.state, before);
  const result = evaluate(edited, 2000, sample(101, 2000));
  assert.equal(result.statuses[0].status, 'disabled');
  assert.deepEqual(result.banners.map(item => item.ruleId), ['other']);
  const removed = alerts.removeSensorRule(result.state, 'other');
  assert.equal(Object.hasOwn(removed.runtime, 'other'), false);
});

test('evaluation never mutates its input state or caller readings', () => {
  const state = alerts.createSensorAlertState([numericRule({ debounceMs: 0 })]);
  const input = sample(101, 0);
  const before = structuredClone({ state, input });
  const result = evaluate(state, 0, input);
  assert.equal(result.banners[0].value, 101);
  assert.equal(result.statuses[0].value, 101);
  assert.deepEqual({ state, input }, before);
});

test('explicit null configuration fields are rejected instead of silently enabling defaults', () => {
  for (const field of ['hysteresis', 'debounceMs', 'staleAfterMs', 'repeatMs', 'enabled', 'audio', 'repeat']) {
    assert.throws(() => alerts.validateSensorRule(numericRule({ [field]: null })), field);
  }
});

test('safe prototype-like rule names never read inherited runtime state', () => {
  for (const id of ['toString', 'hasOwnProperty', 'valueOf']) {
    const result = evaluate(alerts.createSensorAlertState([
      numericRule({ id, debounceMs: 0 })
    ]), 0, sample(101, 0));
    assert.equal(result.banners.length, 1);
    assert.equal(result.banners[0].ruleId, id);
  }
});

test('conflicting values for the same observation timestamp cannot reset the once latch', () => {
  let result = evaluate(alerts.createSensorAlertState([
    numericRule({ debounceMs: 0 })
  ]), 1000, sample(101, 1000));
  assert.equal(result.events.length, 1);
  result = evaluate(result.state, 1001, sample(99, 1000));
  assert.equal(result.statuses[0].quality, 'out-of-order');
  assert.equal(result.banners.length, 0);
  result = evaluate(result.state, 1002, sample(101, 1002));
  assert.equal(result.events.length, 0);
});

test('debounce restarts after an unobserved gap longer than the freshness window', () => {
  let result = evaluate(alerts.createSensorAlertState([
    numericRule({ debounceMs: 1000, staleAfterMs: 500 })
  ]), 0, sample(101, 0));
  result = evaluate(result.state, 1000, sample(101, 1000));
  assert.equal(result.statuses[0].status, 'pending');
  result = evaluate(result.state, 1500, sample(101, 1500));
  assert.equal(result.banners.length, 0);
  result = evaluate(result.state, 2000, sample(101, 2000));
  assert.equal(result.banners.length, 1);
});

test('inherited audio capability cannot grant a sound request', () => {
  const result = evaluate(alerts.createSensorAlertState([
    numericRule({ debounceMs: 0, audio: true })
  ]), 0, sample(101, 0), { capabilities: Object.create({ audio: true }) });
  assert.equal(result.events[0].audioIntent, 'blocked');
});

test('sample numeric fields must be own properties', () => {
  Object.defineProperty(Object.prototype, 'value', { value: 101, configurable: true });
  try {
    const result = evaluate(alerts.createSensorAlertState([
      numericRule({ debounceMs: 0 })
    ]), 0, { 'coolant.temperature': { timestamp: 0 } });
    assert.equal(result.statuses[0].quality, 'invalid');
    assert.equal(result.banners.length, 0);
  } finally {
    delete Object.prototype.value;
  }
});
