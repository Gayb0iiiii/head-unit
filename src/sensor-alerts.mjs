/** Pure prototype rules: no sensor provider, vehicle commands, timers, or audio. */
export const MAX_SENSOR_RULES = 32;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const forbiddenIds = new Set(['constructor', 'prototype', '__proto__']);
const fields = new Set(['id', 'sensor', 'label', 'condition', 'threshold', 'hysteresis',
  'debounceMs', 'staleAfterMs', 'repeatMs', 'enabled', 'audio', 'repeat']);
const numericConditions = new Set(['above', 'below']);
const conditions = new Set([...numericConditions, 'missing', 'stale']);
const plainObject = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const finite = value => typeof value === 'number' && Number.isFinite(value);

function identifier(value, field) {
  if (typeof value !== 'string' || !idPattern.test(value) || forbiddenIds.has(value)) {
    throw new TypeError(`${field} must be a safe identifier of 1–64 characters`);
  }
  return value;
}

function duration(value, field, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${field} must be an integer from ${minimum} to ${maximum} milliseconds`);
  }
  return value;
}

/** Validate and copy configuration. Thresholds/readings must use the same canonical unit. */
export function validateSensorRule(input) {
  if (!plainObject(input)) throw new TypeError('A sensor rule must be a plain object');
  if (Object.keys(input).some(key => !fields.has(key))) throw new TypeError('Unknown sensor rule field');
  if (Object.values(input).some(value => value === null)) throw new TypeError('Sensor rule fields cannot be null');
  const id = identifier(input.id, 'id');
  const sensor = identifier(input.sensor, 'sensor');
  const label = input.label === undefined ? sensor : input.label;
  if (typeof label !== 'string' || !label.trim() || label.trim().length > 80 || /[<>\u0000-\u001f\u007f]/.test(label)) {
    throw new TypeError('label must be 1–80 characters of plain text');
  }
  if (!conditions.has(input.condition)) throw new TypeError('Unknown sensor condition');
  const hysteresis = input.hysteresis ?? 0;
  if (!finite(hysteresis) || hysteresis < 0) throw new RangeError('hysteresis must be finite and nonnegative');
  if (numericConditions.has(input.condition)) {
    if (!finite(input.threshold)) throw new TypeError('Numeric rules require a finite threshold');
    if (!finite(input.threshold - hysteresis) || !finite(input.threshold + hysteresis)) {
      throw new RangeError('Threshold and hysteresis overflow');
    }
  } else if (Object.hasOwn(input, 'threshold') || hysteresis !== 0) {
    throw new TypeError('Missing and stale rules cannot have a numeric threshold or hysteresis');
  }
  const enabled = input.enabled ?? true;
  const audio = input.audio ?? false;
  const repeat = input.repeat ?? 'once';
  if (typeof enabled !== 'boolean' || typeof audio !== 'boolean') throw new TypeError('enabled and audio must be booleans');
  if (!['once', 'repeat'].includes(repeat)) throw new TypeError('repeat must be once or repeat');
  return {
    id, sensor, label: label.trim(), condition: input.condition,
    ...(numericConditions.has(input.condition) ? { threshold: input.threshold } : {}),
    hysteresis,
    debounceMs: duration(input.debounceMs ?? 1000, 'debounceMs', 0, 600000),
    staleAfterMs: duration(input.staleAfterMs ?? 5000, 'staleAfterMs', 1, 86400000),
    repeatMs: duration(input.repeatMs ?? 60000, 'repeatMs', 1000, 86400000),
    enabled, audio, repeat
  };
}

export function createSensorAlertState(rules = []) {
  if (!Array.isArray(rules)) throw new TypeError('rules must be an array');
  if (rules.length > MAX_SENSOR_RULES) throw new RangeError(`At most ${MAX_SENSOR_RULES} rules are supported`);
  const normalized = rules.map(validateSensorRule);
  if (new Set(normalized.map(rule => rule.id)).size !== normalized.length) throw new TypeError('Rule ids must be unique');
  return { rules: normalized, runtime: {}, lastEvaluatedAt: null };
}

export function upsertSensorRule(state, input) {
  const rule = validateSensorRule(input);
  const exists = state.rules.some(item => item.id === rule.id);
  const rules = exists ? state.rules.map(item => item.id === rule.id ? rule : item) : [...state.rules, rule];
  const validated = createSensorAlertState(rules);
  const runtime = { ...state.runtime };
  delete runtime[rule.id];
  return { ...state, rules: validated.rules, runtime };
}

export function removeSensorRule(state, id) {
  identifier(id, 'id');
  if (!state.rules.some(rule => rule.id === id)) throw new RangeError('Unknown sensor rule');
  const runtime = { ...state.runtime };
  delete runtime[id];
  return { ...state, rules: state.rules.filter(rule => rule.id !== id), runtime };
}

const validTime = value => finite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
const emptyRuntime = () => ({
  active: false, episodeOpen: false, notified: false, pendingSince: null,
  raisedAt: null, lastEmittedAt: null, lastSampleAt: null, lastSampleValue: null
});

function classifySample(readings, rule, now, previous) {
  const { lastSampleAt, lastSampleValue } = previous;
  if (!Object.hasOwn(readings, rule.sensor) || readings[rule.sensor] == null) return { quality: 'missing' };
  const sample = readings[rule.sensor];
  if (!plainObject(sample) || !Object.hasOwn(sample, 'value') || !Object.hasOwn(sample, 'timestamp') ||
      !finite(sample.value) || !validTime(sample.timestamp)) return { quality: 'invalid' };
  if (sample.timestamp > now) return { quality: 'future' };
  if (lastSampleAt !== null && (sample.timestamp < lastSampleAt ||
      (sample.timestamp === lastSampleAt && sample.value !== lastSampleValue))) return { quality: 'out-of-order' };
  return {
    quality: now - sample.timestamp > rule.staleAfterMs ? 'stale' : 'fresh',
    timestamp: sample.timestamp, value: sample.value
  };
}

// null means unknown, and must not be treated as a proven return to normal.
function conditionMatches(rule, sample, episodeOpen) {
  if (['invalid', 'future', 'out-of-order'].includes(sample.quality)) return null;
  if (rule.condition === 'missing') return sample.quality === 'missing';
  if (rule.condition === 'stale') return sample.quality === 'missing' ? null : sample.quality === 'stale';
  if (sample.quality !== 'fresh') return null;
  if (rule.condition === 'above') return sample.value > rule.threshold - (episodeOpen ? rule.hysteresis : 0);
  return sample.value < rule.threshold + (episodeOpen ? rule.hysteresis : 0);
}

function bannerFor(rule, sample, raisedAt) {
  const message = rule.condition === 'missing' ? `${rule.label}: reading missing` :
    rule.condition === 'stale' ? `${rule.label}: reading stale` :
      `${rule.label}: ${rule.condition} configured threshold`;
  return {
    id: `sensor-alert:${rule.id}`, ruleId: rule.id, sensor: rule.sensor,
    label: rule.label, condition: rule.condition, message,
    raisedAt, delivery: 'banner', ...(sample.quality === 'fresh' ? { value: sample.value } : {})
  };
}

/**
 * Evaluate one complete observation snapshot, using a nondecreasing caller clock.
 * Store result.state for the next call. events are notification intents, never IO.
 */
export function evaluateSensorAlerts(state, { now, readings = {}, capabilities = {} } = {}) {
  if (!validTime(now)) throw new RangeError('now must be a finite, nonnegative millisecond time');
  if (state.lastEvaluatedAt !== null && now < state.lastEvaluatedAt) throw new RangeError('Evaluation time cannot move backwards');
  if (!plainObject(readings)) throw new TypeError('readings must be a plain object');
  const audioCapable = plainObject(capabilities) && Object.hasOwn(capabilities, 'audio') && capabilities.audio === true;
  const runtime = {};
  const banners = [];
  const events = [];
  const statuses = [];
  for (const rule of state.rules) {
    const previous = Object.hasOwn(state.runtime, rule.id) ? state.runtime[rule.id] : emptyRuntime();
    const current = { ...previous };
    const sample = classifySample(readings, rule, now, previous);
    if (sample.timestamp !== undefined) {
      current.lastSampleAt = sample.timestamp;
      current.lastSampleValue = sample.value;
    }
    if (numericConditions.has(rule.condition) && sample.quality === 'fresh' &&
        previous.lastSampleAt !== null && sample.timestamp - previous.lastSampleAt > rule.staleAfterMs) {
      current.pendingSince = null;
    }
    const matches = conditionMatches(rule, sample, previous.episodeOpen);
    let status;
    if (!rule.enabled) {
      current.active = false;
      current.pendingSince = null;
      status = 'disabled';
    } else if (matches === null) {
      current.active = false;
      current.pendingSince = null;
      status = 'unavailable';
    } else if (!matches) {
      current.active = false;
      current.episodeOpen = false;
      current.notified = false;
      current.pendingSince = null;
      current.raisedAt = null;
      status = 'inactive';
    } else {
      if (current.pendingSince === null) current.pendingSince = now;
      current.active = now - current.pendingSince >= rule.debounceMs;
      status = current.active ? 'active' : 'pending';
      if (current.active) {
        if (!current.episodeOpen) current.raisedAt = now;
        current.episodeOpen = true;
        const banner = bannerFor(rule, sample, current.raisedAt);
        banners.push(banner);
        const emit = rule.repeat === 'once' ? !current.notified :
          current.lastEmittedAt === null || now - current.lastEmittedAt >= rule.repeatMs;
        if (emit) {
          events.push({ ...banner, emittedAt: now,
            audioIntent: !rule.audio ? 'none' : audioCapable ? 'request' : 'blocked' });
          current.lastEmittedAt = now;
          current.notified = true;
        }
      }
    }
    runtime[rule.id] = current;
    statuses.push({ ruleId: rule.id, sensor: rule.sensor, status, quality: sample.quality,
      ...(sample.quality === 'fresh' ? { value: sample.value } : {}) });
  }
  return { state: { ...state, runtime, lastEvaluatedAt: now }, banners, events, statuses };
}
