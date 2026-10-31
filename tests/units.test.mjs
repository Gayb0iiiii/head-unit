import test from 'node:test';
import assert from 'node:assert/strict';
import * as units from '../src/units.mjs';

// Regressions named before implementation: defaults may drift, invalid preferences
// may become accepted, or mutable preferences may leak across page boundaries.
test('default display preferences use Celsius and PSI', () => {
  assert.deepEqual(units.DEFAULT_UNIT_PREFERENCES, { temperature: 'celsius', pressure: 'psi' });
  assert.equal(Object.isFrozen(units.DEFAULT_UNIT_PREFERENCES), true);
});

test('validated display preferences fill defaults without mutating the input', () => {
  assert.equal(typeof units.validateUnitPreferences, 'function');
  const input = Object.freeze({ pressure: 'bar' });
  assert.deepEqual(units.validateUnitPreferences(input), { temperature: 'celsius', pressure: 'bar' });
  assert.deepEqual(units.validateUnitPreferences(), units.DEFAULT_UNIT_PREFERENCES);
  assert.deepEqual(units.validateUnitPreferences({ temperature: 'fahrenheit', pressure: 'kPa' }), {
    temperature: 'fahrenheit', pressure: 'kPa'
  });
});

test('invalid or extra unit preferences fail closed', () => {
  assert.equal(typeof units.validateUnitPreferences, 'function');
  for (const input of [null, [], 'psi', 2, new Date(), { pressure: 'PSI' },
    { pressure: 'Pa' }, { temperature: 'kelvin' }, { temperature: null },
    { pressure: undefined }, { other: 'psi' }]) {
    assert.throws(() => units.validateUnitPreferences(input), /valid temperature and pressure units/i);
  }
});

// A removed/ambiguous pressure reference or invented sensor reading must fail.
test('registry contains planned canonical quantities and explicit pressure references', () => {
  assert.equal(typeof units.getSensorDefinition, 'function');
  assert.deepEqual(Object.keys(units.SENSOR_REGISTRY), [
    'insideTemperature', 'outsideTemperature', 'coolantTemperature',
    'oilTemperature', 'transmissionTemperature', 'boostPressure',
    'intakePressure', 'oilPressure', 'fuelPressure', 'batteryVoltage'
  ]);
  for (const [id, definition] of Object.entries(units.SENSOR_REGISTRY)) {
    assert.equal(units.getSensorDefinition(id), definition);
    assert.equal(definition.id, id);
    assert.equal(typeof definition.label, 'string');
    assert.equal(Object.hasOwn(definition, 'value'), false);
    assert.equal(Object.hasOwn(definition, 'available'), false);
    assert.equal(Object.isFrozen(definition), true);
    if (definition.quantity === 'pressure') {
      assert.equal(definition.canonicalUnit, 'kPa');
      assert.ok(['gauge', 'absolute'].includes(definition.pressureReference));
    }
  }
  assert.equal(Object.isFrozen(units.SENSOR_REGISTRY), true);
  assert.equal(units.SENSOR_REGISTRY.insideTemperature.canonicalUnit, 'celsius');
  assert.equal(units.SENSOR_REGISTRY.outsideTemperature.canonicalUnit, 'celsius');
  assert.equal(units.SENSOR_REGISTRY.boostPressure.pressureReference, 'gauge');
  assert.equal(units.SENSOR_REGISTRY.intakePressure.pressureReference, 'absolute');
  assert.equal(units.SENSOR_REGISTRY.batteryVoltage.canonicalUnit, 'V');
});

test('unknown sensor keys fail closed, including inherited object keys', () => {
  assert.equal(typeof units.getSensorDefinition, 'function');
  for (const id of ['boost', 'constructor', '__proto__', null, 0, {}]) {
    assert.throws(() => units.getSensorDefinition(id), /unknown sensor/i);
  }
});

test('display unit labels follow validated preferences across own pages', () => {
  assert.equal(typeof units.sensorDisplayUnit, 'function');
  assert.equal(units.sensorDisplayUnit('insideTemperature'), '°C');
  assert.equal(units.sensorDisplayUnit('outsideTemperature', { temperature: 'fahrenheit' }), '°F');
  assert.equal(units.sensorDisplayUnit('boostPressure'), 'psi');
  assert.equal(units.sensorDisplayUnit('intakePressure', { pressure: 'kPa' }), 'kPa');
  assert.equal(units.sensorDisplayUnit('oilPressure', { pressure: 'bar' }), 'bar');
  assert.equal(units.sensorDisplayUnit('batteryVoltage'), 'V');
  assert.throws(() => units.sensorDisplayUnit('insideTemperature', { temperature: 'K' }));
});

function nearlyEqual(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

// Wrong scale, added temperature offsets, input coercion, and accidental rounding
// must fail these conversion tests.
test('temperature readings convert with the Fahrenheit offset in both directions', () => {
  assert.equal(typeof units.toDisplayValue, 'function');
  assert.equal(typeof units.toCanonicalValue, 'function');
  const prefs = { temperature: 'fahrenheit' };
  assert.equal(units.toDisplayValue('insideTemperature', 0, prefs), 32);
  assert.equal(units.toDisplayValue('coolantTemperature', 100, prefs), 212);
  assert.equal(units.toCanonicalValue('outsideTemperature', -40, prefs), -40);
  assert.equal(units.toCanonicalValue('oilTemperature', 212, prefs), 100);
  assert.equal(units.toDisplayValue('transmissionTemperature', 91.125), 91.125);
});

test('pressure conversions preserve gauge or absolute identity and use no atmospheric offset', () => {
  assert.equal(typeof units.toDisplayValue, 'function');
  for (const id of ['boostPressure', 'intakePressure', 'oilPressure', 'fuelPressure']) {
    nearlyEqual(units.toDisplayValue(id, 6.894757293168361), 1);
    nearlyEqual(units.toCanonicalValue(id, 1), 6.894757293168361);
    assert.equal(units.toDisplayValue(id, 100, { pressure: 'bar' }), 1);
    assert.equal(units.toCanonicalValue(id, 1, { pressure: 'bar' }), 100);
    assert.equal(units.toDisplayValue(id, 0), 0);
    assert.equal(units.toCanonicalValue(id, 0), 0);
    assert.equal(units.toDisplayValue(id, 100, { pressure: 'kPa' }), 100);
    assert.equal(units.toCanonicalValue(id, 100, { pressure: 'kPa' }), 100);
  }
  nearlyEqual(units.toDisplayValue('boostPressure', -6.894757293168361), -1);
});

test('hysteresis deltas convert by scale only, never adding the Fahrenheit offset', () => {
  assert.equal(typeof units.toDisplayDelta, 'function');
  assert.equal(typeof units.toCanonicalDelta, 'function');
  const prefs = { temperature: 'fahrenheit' };
  assert.equal(units.toDisplayDelta('coolantTemperature', 0, prefs), 0);
  assert.equal(units.toDisplayDelta('coolantTemperature', 5, prefs), 9);
  assert.equal(units.toCanonicalDelta('coolantTemperature', 9, prefs), 5);
  assert.equal(units.toDisplayDelta('coolantTemperature', 5), 5);
  nearlyEqual(units.toDisplayDelta('boostPressure', 6.894757293168361), 1);
  nearlyEqual(units.toCanonicalDelta('boostPressure', 1), 6.894757293168361);
});

test('voltage values and deltas are unaffected by temperature or pressure choices', () => {
  assert.equal(typeof units.toDisplayValue, 'function');
  for (const name of ['toDisplayValue', 'toCanonicalValue', 'toDisplayDelta', 'toCanonicalDelta']) {
    assert.equal(units[name]('batteryVoltage', 12.7125, { temperature: 'fahrenheit', pressure: 'bar' }), 12.7125);
  }
});

test('every conversion rejects nonfinite or nonnumeric values and unknown sensors', () => {
  for (const name of ['toDisplayValue', 'toCanonicalValue', 'toDisplayDelta', 'toCanonicalDelta']) {
    assert.equal(typeof units[name], 'function');
    for (const id of ['insideTemperature', 'boostPressure', 'batteryVoltage']) {
      for (const value of [NaN, Infinity, -Infinity, undefined, null, '', '42', {}, true]) {
        assert.throws(() => units[name](id, value), /valid sensor value/i);
      }
    }
    assert.throws(() => units[name]('unknown', 42), /unknown sensor/i);
    assert.throws(() => units[name]('boostPressure', 42, { pressure: 'atm' }), /valid temperature and pressure units/i);
  }
  assert.throws(() => units.toDisplayValue('insideTemperature', Number.MAX_VALUE,
    { temperature: 'fahrenheit' }), /valid sensor value/i);
  assert.throws(() => units.toCanonicalValue('boostPressure', Number.MAX_VALUE), /valid sensor value/i);
});

test('changing preferences and round trips never mutate canonical rule thresholds', () => {
  assert.equal(typeof units.toDisplayValue, 'function');
  const rule = Object.freeze({ sensorId: 'boostPressure', threshold: 118.325, hysteresis: 3.41 });
  const original = JSON.stringify(rule);
  for (const pressure of ['psi', 'kPa', 'bar', 'psi']) {
    const prefs = Object.freeze({ pressure });
    nearlyEqual(units.toCanonicalValue(rule.sensorId,
      units.toDisplayValue(rule.sensorId, rule.threshold, prefs), prefs), rule.threshold);
    nearlyEqual(units.toCanonicalDelta(rule.sensorId,
      units.toDisplayDelta(rule.sensorId, rule.hysteresis, prefs), prefs), rule.hysteresis);
  }
  for (const temperature of ['celsius', 'fahrenheit', 'celsius']) {
    const prefs = Object.freeze({ temperature });
    nearlyEqual(units.toCanonicalValue('coolantTemperature',
      units.toDisplayValue('coolantTemperature', 97.123456, prefs), prefs), 97.123456);
    nearlyEqual(units.toCanonicalDelta('coolantTemperature',
      units.toDisplayDelta('coolantTemperature', 0.123456, prefs), prefs), 0.123456);
  }
  assert.equal(JSON.stringify(rule), original);
});

// A hardware adapter may only label canonical readings after checking metadata.
// Omitting or swapping gauge/absolute metadata must never be accepted.
test('canonical sample validation accepts matching explicit pressure references without mutation', () => {
  assert.equal(typeof units.validateCanonicalSample, 'function');
  const sample = Object.freeze({ value: 118.325, unit: 'kPa', pressureReference: 'gauge', timestamp: 100 });
  assert.equal(units.validateCanonicalSample('boostPressure', sample), true);
  assert.deepEqual(sample, { value: 118.325, unit: 'kPa', pressureReference: 'gauge', timestamp: 100 });
  assert.equal(units.validateCanonicalSample('intakePressure', {
    value: 101.325, unit: 'kPa', pressureReference: 'absolute'
  }), true);
  assert.equal(units.validateCanonicalSample('outsideTemperature', { value: -10, unit: 'celsius' }), true);
  assert.equal(units.validateCanonicalSample('batteryVoltage', { value: 12.7, unit: 'V' }), true);
});

test('canonical sample validation rejects missing or mixed pressure references', () => {
  assert.equal(typeof units.validateCanonicalSample, 'function');
  for (const pressureReference of [undefined, null, 'absolute', 'g', 'unknown']) {
    assert.throws(() => units.validateCanonicalSample('boostPressure', {
      value: 100, unit: 'kPa', pressureReference
    }), /pressure reference/i);
  }
  assert.throws(() => units.validateCanonicalSample('boostPressure', { value: 100, unit: 'kPa' }), /pressure reference/i);
  assert.throws(() => units.validateCanonicalSample('intakePressure', {
    value: 100, unit: 'kPa', pressureReference: 'gauge'
  }), /pressure reference/i);
  assert.throws(() => units.validateCanonicalSample('insideTemperature', {
    value: 20, unit: 'celsius', pressureReference: 'gauge'
  }), /pressure reference/i);
});

test('canonical sample validation rejects wrong units, missing values and nonfinite numbers', () => {
  assert.equal(typeof units.validateCanonicalSample, 'function');
  for (const sample of [null, [], {}, { value: 10 }, { unit: 'celsius' },
    { value: 10, unit: 'fahrenheit' }, { value: '10', unit: 'celsius' },
    { value: NaN, unit: 'celsius' }, { value: Infinity, unit: 'celsius' },
    Object.create({ value: 10, unit: 'celsius' })]) {
    assert.throws(() => units.validateCanonicalSample('insideTemperature', sample));
  }
  assert.throws(() => units.validateCanonicalSample('boostPressure', {
    value: 14.7, unit: 'psi', pressureReference: 'gauge'
  }), /canonical unit/i);
  assert.throws(() => units.validateCanonicalSample('boost', {
    value: 100, unit: 'kPa', pressureReference: 'gauge'
  }), /unknown sensor/i);
});
