# Sensor alert rules: bounded prototype

The rules engine is a pure, in-memory evaluation module. A new state contains zero rules and zero samples. It does not discover sensors, connect a vehicle, supply demo readings, play sound, start timers, or change the projection/media session. It is not a safety-certified warning system and does not replace vehicle warnings.

## Public API

Import from `src/sensor-alerts.mjs`:

- `MAX_SENSOR_RULES`: 32.
- `validateSensorRule(input)`: returns a normalized copy or throws `TypeError`/`RangeError`.
- `createSensorAlertState(rules = [])`: validates unique rule ids and the count limit; returns `{ rules, runtime: {}, lastEvaluatedAt: null }`.
- `upsertSensorRule(state, rule)`: returns a new state with a validated addition/replacement. Editing resets that rule's evaluation history; other rules retain their history. The caller must treat editing as an explicit configuration operation, not use it to refresh unchanged rules on every sample.
- `removeSensorRule(state, id)`: returns a new state without the rule and its history; throws for an unknown id.
- `evaluateSensorAlerts(state, { now, readings = {}, capabilities = {} })`: returns `{ state, banners, events, statuses }`. Retain the returned state for the next evaluation.

All operations leave their input objects unchanged. Runtime state is private to an engine instance and should not be edited or restored from storage. Persist validated rules only. Start with `createSensorAlertState(savedRules)` when starting a new session.

## Rule schema

| Field | Meaning / default |
| --- | --- |
| `id` | Required unique safe identifier, 1–64 characters |
| `sensor` | Required sensor identifier, 1–64 characters |
| `label` | Plain text, 1–80 trimmed characters; defaults to sensor id |
| `condition` | Required: `above`, `below`, `missing`, or `stale` |
| `threshold` | Required finite number for above/below; forbidden for missing/stale |
| `hysteresis` | Finite nonnegative canonical-unit delta, default 0; missing/stale require 0 |
| `debounceMs` | Integer 0–600000, default 1000 |
| `staleAfterMs` | Integer 1–86400000, default 5000 |
| `repeat` | `once` (default) or `repeat` |
| `repeatMs` | Integer 1000–86400000, default 60000; only used in repeat mode |
| `enabled` | Boolean, default true |
| `audio` | Boolean, default false; expresses the user's requested alert mode |

Identifiers match `[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}`. Reserved `constructor`, `prototype`, and `__proto__` ids are rejected. Labels reject angle brackets and control characters. Unknown rule properties, explicit null values, invalid types, overflow in threshold ± hysteresis, duplicate ids, and oversized rule lists are rejected. The engine never coerces numeric strings to numbers.

The core engine is sensor-agnostic. Threshold and sample values must already be expressed in the same canonical unit. The `units.mjs` integration provides registry-specific conversions and `validateCanonicalSample(sensorId, sample)`. A future provider adapter must validate explicit canonical units and, for pressure, the matching gauge/absolute reference before invoking this engine. Unit switching must convert display values without changing the canonical threshold or infer a pressure reference. No provider is connected by this prototype.

## Input readings and clock

`readings` is one complete plain-object snapshot keyed by sensor id. An entry contains explicit own fields `{ value, timestamp }`. Only configured sensors are examined; extra entries never create rules or grow runtime storage. An absent key, `null`, or `undefined` is missing. A malformed entry is invalid, not a numeric breach.

`now` and each timestamp must be finite, nonnegative numbers no greater than `Number.MAX_SAFE_INTEGER`, in the same millisecond clock domain. Evaluation time must never decrease. A clock rollback or malformed snapshot throws before state changes. A caller using a monotonic clock must map provider timestamps into that domain without changing their age. Equal evaluation times are allowed but do not duplicate notifications.

Each rule classifies its sample as:

- `fresh`: finite value and timestamp, age less than or equal to `staleAfterMs`.
- `stale`: valid sample with age greater than `staleAfterMs`.
- `missing`: absent entry.
- `invalid`: malformed/nonfinite value or timestamp.
- `future`: sample timestamp is after `now`.
- `out-of-order`: timestamp is older than the last accepted observation, or the same timestamp supplies a conflicting value.

Invalid, future, and out-of-order observations never advance the accepted sample cursor. Missing/stale values never participate in numeric comparisons. Output status and banners omit numeric values unless the sample is fresh. The engine may retain the last accepted value internally solely to detect conflicting duplicates; it never presents that value as current.

## Trigger and recovery behavior

Above enters strictly above the threshold; below enters strictly below it. A numeric episode remains open through its hysteresis band. Above resets at or below `threshold - hysteresis`; below resets at or above `threshold + hysteresis`.

Matching observations must persist for `debounceMs`. A normal or unavailable observation resets pending debounce. An unobserved numeric sample gap greater than `staleAfterMs` also restarts debounce, so a stale interval does not count as continuous evidence. Debounce is observation-based, not a guarantee about unobserved physical behavior.

Numeric missing/stale/invalid/future/out-of-order observations hide the active numeric banner and report unavailable. They do not prove normal, close the episode, or rearm a once-until-normal notification. When fresh matching readings return, the banner can return after debounce without producing another once notification. Only a fresh reading beyond the hysteresis reset boundary rearms it.

Missing and stale are separate rules. Missing matches an absent entry and clears when a valid sample is present, including a stale sample. Stale matches a valid old sample, clears on a fresh sample, and reports unavailable for a missing sample. Invalid/future/out-of-order entries report unavailable for both types. This avoids relabeling corrupted data as either ordinary missing data or a numeric event.

## Banners and event delivery

`statuses` contains one entry per configured rule: `{ ruleId, sensor, status, quality, value? }`. Status is `disabled`, `unavailable`, `inactive`, `pending`, or `active`.

`banners` contains current active banners, each with `{ id, ruleId, sensor, label, condition, message, raisedAt, delivery: 'banner', value? }`. An original episode's `raisedAt` is retained across unavailable gaps. The host chooses placement and priority without interrupting the projection/media session. Render text safely; messages contain no HTML.

`events` is the rate-controlled notification stream. Each event contains the banner fields plus `emittedAt` and `audioIntent`:

- `none`: this rule is silent.
- `blocked`: audible was selected but no explicit audio capability is available.
- `request`: audible was selected and the caller passed a plain `capabilities: { audio: true }` object with its own audio field.

These are declarative intents. No sound is played and no volume or audio-routing command exists in this module. Only an independently validated adapter may interpret a request. Default capabilities do not permit audio.

`repeat: 'once'` emits once per episode, and rearms only after proven normal. `repeat: 'repeat'` emits at most once per `repeatMs`, including across short clears/re-entry. A persistent banner remains visible between events. At most 32 statuses, banners, and events can be returned per evaluation; runtime storage is bounded by configured rules. There is no accumulated event queue.

## Verification

Run `node --test tests/sensor-alerts.test.mjs` for focused behavior tests, and `npm test` for integration regressions. Test fixtures provide explicit observations only inside tests; no fixture provider or simulated sensor feed is shipped by the engine.
