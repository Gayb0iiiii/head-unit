/** Display policy for this shell's pages. Native CarPlay owns its own units. */
export const DEFAULT_UNIT_PREFERENCES = Object.freeze({
  temperature: 'celsius', pressure: 'psi'
});
const temperatureUnits = new Set(['celsius', 'fahrenheit']);
const pressureUnits = new Set(['psi', 'kPa', 'bar']);

/** Validate on input; no coercion, storage, or mutation. Missing keys use defaults. */
export function validateUnitPreferences(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))
    || Object.keys(input).some(key => !Object.hasOwn(DEFAULT_UNIT_PREFERENCES, key))) {
    throw new TypeError('Choose valid temperature and pressure units');
  }
  const preferences = { ...DEFAULT_UNIT_PREFERENCES, ...input };
  if (!temperatureUnits.has(preferences.temperature) || !pressureUnits.has(preferences.pressure)) {
    throw new TypeError('Choose valid temperature and pressure units');
  }
  return preferences;
}

// Planned sensor identities, not available hardware, readings, or preset rules.
// Gauge and absolute pressure are different quantities, despite sharing kPa.
const definitions = [
  ['insideTemperature', 'Inside temperature', 'temperature', 'celsius'],
  ['outsideTemperature', 'Outside temperature', 'temperature', 'celsius'],
  ['coolantTemperature', 'Coolant temperature', 'temperature', 'celsius'],
  ['oilTemperature', 'Oil temperature', 'temperature', 'celsius'],
  ['transmissionTemperature', 'Transmission temperature', 'temperature', 'celsius'],
  ['boostPressure', 'Boost pressure', 'pressure', 'kPa', 'gauge'],
  ['intakePressure', 'Intake manifold pressure', 'pressure', 'kPa', 'absolute'],
  ['oilPressure', 'Oil pressure', 'pressure', 'kPa', 'gauge'],
  ['fuelPressure', 'Fuel pressure', 'pressure', 'kPa', 'gauge'],
  ['batteryVoltage', 'Battery voltage', 'voltage', 'V']
];
export const SENSOR_REGISTRY = Object.freeze(Object.fromEntries(definitions.map(
  ([id, label, quantity, canonicalUnit, pressureReference]) => [id, Object.freeze({
    id, label, quantity, canonicalUnit,
    ...(pressureReference ? { pressureReference } : {})
  })]
)));

export function getSensorDefinition(sensorId) {
  if (typeof sensorId !== 'string' || !Object.hasOwn(SENSOR_REGISTRY, sensorId)) {
    throw new TypeError('Unknown sensor');
  }
  return SENSOR_REGISTRY[sensorId];
}

export function sensorDisplayUnit(sensorId, preferences) {
  const sensor = getSensorDefinition(sensorId);
  const selected = validateUnitPreferences(preferences);
  if (sensor.quantity === 'temperature') return selected.temperature === 'celsius' ? '°C' : '°F';
  if (sensor.quantity === 'pressure') return selected.pressure;
  return sensor.canonicalUnit;
}

const kPaPerPressureUnit = Object.freeze({ psi: 6.894757293168361, kPa: 1, bar: 100 });
function finite(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError('Enter a valid sensor value');
  }
  return value;
}

function convert(sensorId, value, preferences, toCanonical, delta) {
  const sensor = getSensorDefinition(sensorId);
  const selected = validateUnitPreferences(preferences);
  finite(value);
  let result = value;
  if (sensor.quantity === 'temperature' && selected.temperature === 'fahrenheit') {
    const offset = delta ? 0 : 32;
    result = toCanonical ? (value - offset) / 1.8 : value * 1.8 + offset;
  } else if (sensor.quantity === 'pressure') {
    const factor = kPaPerPressureUnit[selected.pressure];
    // This scales the selected sensor's pressure. It never changes its reference.
    result = toCanonical ? value * factor : value / factor;
  }
  return finite(result);
}

/** Render canonical values without rounding or writing back to rules. */
export function toDisplayValue(sensorId, value, preferences) {
  return convert(sensorId, value, preferences, false, false);
}
/** Commit a user-entered display value in the selected sensor's canonical unit. */
export function toCanonicalValue(sensorId, value, preferences) {
  return convert(sensorId, value, preferences, true, false);
}
/** Hysteresis is a difference: temperature conversions have no offset. */
export function toDisplayDelta(sensorId, value, preferences) {
  return convert(sensorId, value, preferences, false, true);
}
export function toCanonicalDelta(sensorId, value, preferences) {
  return convert(sensorId, value, preferences, true, true);
}

/**
 * Optional provider boundary. Only canonical samples with explicit matching
 * pressure references may reach evaluation. This never infers or converts a
 * pressure reference, and does not validate availability, timestamps or quality.
 */
export function validateCanonicalSample(sensorId, sample) {
  const sensor = getSensorDefinition(sensorId);
  if (!sample || typeof sample !== 'object' || Array.isArray(sample)
    || !Object.hasOwn(sample, 'value') || !Object.hasOwn(sample, 'unit')) {
    throw new TypeError('Invalid canonical sensor sample');
  }
  finite(sample.value);
  if (sample.unit !== sensor.canonicalUnit) {
    throw new TypeError('Sensor sample must use its canonical unit');
  }
  if (sensor.quantity === 'pressure') {
    if (!Object.hasOwn(sample, 'pressureReference') || sample.pressureReference !== sensor.pressureReference) {
      throw new TypeError('Sensor sample pressure reference must match explicitly');
    }
  } else if (Object.hasOwn(sample, 'pressureReference')) {
    throw new TypeError('Non-pressure sensor cannot have a pressure reference');
  }
  return true;
}
