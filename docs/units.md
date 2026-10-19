# Units policy

`src/units.mjs` is a pure display and validation policy for the headunit's own
pages. It does not configure native CarPlay, the phone, LIVI, or any vehicle
service. It has no storage, transport, timers, hardware, sample generation, or
side effects. Registry entries describe planned sensor identities; their presence
is not evidence that a provider or reading exists.

## Canonical values and display preferences

- Temperature values and alert thresholds remain in Celsius (`celsius`).
- Pressure values and alert thresholds remain in kilopascals (`kPa`), with the
  pressure reference fixed by the sensor identity.
- Voltage values remain in volts (`V`).
- Default display preferences are `{ temperature: 'celsius', pressure: 'psi' }`.
- Own-page temperature choices are `celsius` and `fahrenheit`; pressure choices
  are `psi`, `kPa`, and `bar`. Voltage does not change.

`validateUnitPreferences(input)` returns a new complete preferences object,
using defaults for absent keys. It rejects unknown keys, unsupported values,
arrays, null, and non-record objects. No coercion or mutation occurs. The caller
owns any persistence and should validate restored data before use.

Every own-page reading, settings input, alert label, and future graph should use
the same validated preference source. Switching display preferences must not
rewrite persisted rules or measurements. A UI may format/round for presentation,
but must retain the original canonical value if the user does not change it.
Never commit a rounded presentation string merely because units changed.

## API

- `SENSOR_REGISTRY`: frozen definitions keyed by sensor ID, each with `id`,
  `label`, `quantity`, `canonicalUnit`, and, for pressure, `pressureReference`.
- `getSensorDefinition(sensorId)`: returns a definition; unknown IDs throw.
- `sensorDisplayUnit(sensorId, preferences)`: presentation label, such as `°F`.
- `toDisplayValue(sensorId, canonicalValue, preferences)`: converts values or
  thresholds for display.
- `toCanonicalValue(sensorId, displayValue, preferences)`: converts an explicitly
  edited input back to canonical units.
- `toDisplayDelta(sensorId, canonicalDelta, preferences)` and
  `toCanonicalDelta(sensorId, displayDelta, preferences)`: convert differences,
  including hysteresis, by scale only.
- `validateCanonicalSample(sensorId, sample)`: checks a proposed canonical sample
  before it is supplied to a generic evaluator; returns true or throws.

Preferences default when omitted. All value/delta conversions reject
non-numeric and nonfinite input, nonfinite conversion results, unknown sensors,
and invalid preferences. Conversion does not round. Floating-point round trips
are tested within numerical tolerance; they are not a reason to rewrite stored
canonical values. Numeric plausibility limits, valid threshold direction,
nonnegative hysteresis, staleness, sensor quality, and availability belong to the
rule/provider layers.

Temperature values use `F = C × 1.8 + 32`. Hysteresis and other differences use
`ΔF = ΔC × 1.8`, without the offset. For example, a 100 °C threshold and 5 °C
hysteresis display as 212 °F and 9 °F. Pressure scale factors are
1 psi = 6.894757293168361 kPa and 1 bar = 100 kPa.

## Pressure identity is mandatory

The initial planned registry has the following explicit identities:

| Sensor ID | Quantity | Canonical unit | Pressure reference |
| --- | --- | --- | --- |
| insideTemperature | temperature | celsius | n/a |
| outsideTemperature | temperature | celsius | n/a |
| coolantTemperature | temperature | celsius | n/a |
| oilTemperature | temperature | celsius | n/a |
| transmissionTemperature | temperature | celsius | n/a |
| boostPressure | pressure | kPa | gauge |
| intakePressure | pressure | kPa | absolute |
| oilPressure | pressure | kPa | gauge |
| fuelPressure | pressure | kPa | gauge |
| batteryVoltage | voltage | V | n/a |

These are explicit prototype choices, not guesses about a future vehicle's
provider. A provider that reports oil or fuel pressure with another reference
must not be attached to a gauge identity without an independently verified
mapping. Intake manifold absolute pressure is not boost pressure.

Display scaling never adds/subtracts atmospheric pressure or changes a reference.
The same numeric conversion factor does not make gauge and absolute values
interchangeable. Pressure UI labels should show the registry reference as well as
the selected unit, especially for boost and intake pressure.

For example, a canonical boost sample must carry `{ value: 100, unit: 'kPa',
pressureReference: 'gauge' }`. A matching intake sample must say `absolute`.
`validateCanonicalSample` rejects missing or mismatched references, wrong
canonical units, inherited-only value/unit fields, and nonfinite values. No
pressure reference is inferred from a numeric reading or a bare `kPa`/`psi` label.
It rejects pressure-reference metadata on non-pressure quantities. Additional
fields such as timestamp or quality are untouched and must be validated by their
own layer. There is no live provider wiring in this module.

## Verification

`node --test tests/units.test.mjs` covers defaults, preferences, registry identity,
unit labels, value and delta conversions, zero/negative gauge pressure,
nonfinite rejection, overflow, immutability, round trips, and explicit sample
reference validation. Run the project's `npm test` before integration.
