# Independent review: increment 3

Status: completed against the frozen increment 3 source on 2026-10-19. All three reported defects were corrected and regression-tested. No remaining blocking defect was identified within this code/test scope; visual and native verification remain outstanding.

## Scope and baseline

Compared the working prototype with the preserved v2 checkpoint ZIP. This workspace is not a Git repository, so the preserved archive is the historical baseline; Git blame is unavailable. Reviewed changed browser app/model/CSS and build packer, new sensor settings/alert/unit modules, related tests and documentation. No implementation changes were made by this reviewer.

The Electron directory and src/{controller,session,transport,protocol,view,phone-arbitration,preferences,appearance}.mjs are byte-for-byte unchanged from v2. No upstream engine removal, native call/audio integration, or vehicle service modification was found in this increment.

## Findings corrected during review

1. **Medium: a finite canonical threshold can crash unit rendering.** `validateSensorRule` accepts a temperature threshold of `1e308`, while the Fahrenheit display conversion overflows and throws. `renderSensorSettings` does not originally contain that failure; persisting Fahrenheit can make subsequent Settings rendering fail too. Reproduced independently with the public functions. Correction verified: `src/sensor-settings.mjs:11–29` validates displayability across supported units before save/restore, and `sensorRuleSummary` catches conversion errors for direct render callers. An independent reproduction now confirms rejected save without a write, rejected malformed stored rules, and safe fallback rendering.
2. **Low: label-only edits can change an unchanged canonical threshold.** The editor originally always converts the displayed number back to canonical units on Save. A threshold of 1 Celsius becomes 0.9999999999999984 after a Fahrenheit display round trip. This contradicts the documented promise to preserve the original canonical value when numeric inputs are unchanged. Correction verified: the submit path compares numeric input strings to the original displayed values and preserves the original canonical threshold/delta when unchanged. The new Fahrenheit label-only regression passes with exact equality.
3. **Medium usability: full app renders discard unsaved Settings state.** The app originally destroys and recreates the settings binding for wallpaper changes and every motion update. This drops session-only rules if storage writes fail and discards an open draft even on repeated stationary observations. Worker independently identified the session-only case. Correction verified: `getSnapshot` (`src/sensor-settings.mjs:150–156`) captures live unsaved form fields and detached rules/units in memory before app DOM replacement; restore does not persist drafts. `updateVehicleMotion` avoids unchanged-state renders. A known moving state discards the editor without saving it. New regressions cover snapshot detachment, storage failure, draft retention, exact canonical preservation, and moving-state closure.

## Reviewed invariants

- Layout IDs and startup destinations are allowlisted. Restored layout orders drop invalid/duplicate IDs and append missing defaults. Reorder/reset paths check edit mode and known moving state.
- Glass strength is an integer in 0–100. Styling uses transparent background and backdrop filters, with reduced-transparency and unsupported-filter fallbacks; foreground content is not blurred.
- Rule storage is versioned, validates bounded counts and known sensors, and does not silently overwrite malformed stored content. Rule labels are escaped in markup; IDs are constrained and dangerous prototype identifiers rejected.
- Once-until-normal numeric episodes retain their latch through missing/stale/invalid/future/out-of-order samples; recovery requires a fresh normal value beyond hysteresis. Repeating notifications deliberately rate-limit across rapid clear/re-entry, as documented.
- Units separate temperature values from deltas and preserve gauge versus absolute identity. The generic evaluator is not a provider validator: future live integration must first validate canonical units and explicit pressure reference.
- No default rules, live provider, fake sensor readings, evaluation timers, actual sounds, or new native commands are introduced. Audio results are declarative capability-gated intents.
- The small build packer follows only an explicit browser dependency allowlist, rejects unsupported imports/exports/cycles, syntax-checks the bundle, and keeps host/IPC/native modules out of browser output. It is deliberately a restricted packer, not a general JavaScript parser.

## Evidence and limits

Final independent verification after source freeze:

- `node --test --test-reporter=tap tests/*.test.mjs`: **210 passed, 0 failed, 0 skipped**.
- `npm run build`: **passed**, generating static/self-contained previews and syntax-checking adapters.
- Independent overflow reproduction: **passed** after the fix.
- Byte comparisons of the unchanged native boundary and adapter modules: **passed**.

Earlier test runs overlapped edits and exposed transient incomplete interfaces; the final run above supersedes them. No dependency installation was performed. The build emitted only the existing npm unknown `http-proxy` environment-config warning. Existing test DOM doubles validate event/markup contracts, not actual layout or assistive-technology behavior.

No browser visual verification, contrast measurement, compositor/native execution, sensor hardware, motion provider, actual phone pairing, or audio verification was performed. Unknown motion is visibly disclosed and editing remains allowed in this offline prototype; this is not a verified parked signal or a production driving-safety guarantee.

## Reviewed source identity

SHA-256 after the final independent test/build run:

```text
e9ac31435234229e9594e6655c092e35b83a951f90281fc688aad916d94a79cb  src/app.mjs
0095d60b38e0ecaf0575bd40edf106e12b62e5e47caf6c191112262e79677d2e  src/model.mjs
9867f94a15d975d5b35e2c49f7988b4642791eff52e65ec4a3ca4016b04ad53a  src/sensor-settings.mjs
1b11b1d5a94e3ca4b0e1cdb080384b39566d737487c7edd0cd9986c212cc892d  src/sensor-alerts.mjs
4d91aee72a474651bc308a39f97805398d2914eec18aa2375723792dff83c6c6  src/units.mjs
0e2d1ee809d46ce4bd0351d630c410c1c40fa4f7441ba1da273ab10a0227a7b7  src/style.css
dc352d59ed02839092575fe44e55cdfaee5048dfd69da927e2cd101cea450fd8  scripts/build.mjs
```
