# Verification checkpoint 3

2026-10-19. Standalone shell customization and optional sensor-settings checkpoint; not a v4 merge.

## Passed checks

The full Node suite and static build results are captured in evidence/tests-final.txt and evidence/build-final.txt. Tests execute the real modules with injected socket, clock, DOM and Electron boundaries. They do not execute a live native engine.

Coverage includes:
- App grid/dashboard quick switch, honest unavailable sensors, simulated music controls, startup screen/layout persistence, disabled unsupported Phones controls.
- Protocol 8 framing, revisions, atomic patches/resync, exact action snapshots, u32 request bounds, refusal/error handling, backpressure and bounded cancellation.
- Managed connect/handshake/action deadlines, capped backoff, no frame replay, stop cleanup, old-generation isolation.
- Real controller + session + transport integration over fake sockets: authoritative Home/override restoration, stable full multitouch frames, no stale-touch replay, actual path reporting.
- Startup preference restoration, deferred restoration through camera override, deduplicated owner-only atomic preference files, last successful user-chosen phone, phone-return playback policy, deliberate pause protection and second wired-phone wait policy.
- Actual preload CJS executed in a VM with mocked Electron APIs; main-window/main-frame/exact-URL authentication, payload/view allowlists, event stripping, navigation/popup denial, renderer-loss cancellation, generic errors.
- Pure capability-gated call/music role arbitration, manual route/volume ownership, stale events and call end/disconnect. Its effects are declarations only, not LIVI commands.

Independent reviews: docs/review.md is checkpoint 1 history; docs/review-increment2.md records the host review; docs/review-increment3.md records the latest independent shell/settings review. Regression failures were observed before fixes, with selected red-phase logs retained in evidence/.

## Verification limits

- Browser visual QA remains blocked. Local Chromium could not create required sockets; escalation failed before launch during environment setup; the separate cloud browser rejects file: URLs. No screenshot or responsive visual-pass claim is included.
- App render tests use a minimal DOM facade for real event/markup wiring. They do not verify layout, touch ergonomics, accessibility tree or pixels.
- Electron runtime/compositor/native Rust/GStreamer were not built or launched. Boundary tests inject Electron APIs and confirm intended configuration, not platform enforcement in a running app.
- Transport uses fake socket emitters in tests; no real Unix peer, adapter, phone, MFi, Orange Pi or Pi touchscreen was attached.
- No actual pairing, contact sync, call answering, Bluetooth audio routing, microphone, projection frames or vehicle service integration occurred.
- Physical release of touches cannot be proven by enqueueing cancellation. Native core ignores pointer input after its front changes away from projection; an abrupt socket loss can prevent release delivery. This remains a hardware/native integration gate.
- Preference files use atomic rename and restrictive modes, not fsync-based power-loss durability. Ignition-loss persistence is unverified.
- The browser preview intentionally remains a simulation and does not invoke the host bridge. Native projection plane wiring and live renderer binding remain to be completed.
- v4 baseline ZIP access was denied by selected Library scope; no baseline files were read, changed or regression-tested.

## Extraction gate

No upstream capability was removed. Preserve the necessary authentication/pairing, phone/session, projection, audio/microphone, touch, reconnect and cluster engine. Replace the shell only after complete pinned-source dependency analysis/build evidence. Independent Bluetooth roles, profile routing and PBAP need their own backend integration and permission handling; see phones-backlog.md.

Prior checkpoint aggregate: 127 Node tests passed, 0 failed; static build passed. This includes three appearance-policy tests and the unavailable-projection path fallback regression added after the independent review's earlier recorded run. The independent host review remains narrower than the aggregate and does not certify the separately isolated call-role or appearance models as native integrations.

## Increment 3 additions

Glass transparency/backdrop blur/strength and fallback rules are source-contract checked, not visually certified. App/dashboard reorder, reset, persisted validation, keyboard focus and known-moving guards are tested with the actual model and app wiring. Optional sensor Settings and units use separate validated versioned storage, canonical thresholds, bounded rules and no live data. The pure evaluator covers separate missing/stale/numeric state, monotonic input, debounce/hysteresis, episode latching and capability-gated sound intents.

The static/offline preview build follows an explicit browser-module allowlist; bundled source is syntax-checked and excludes native IPC/transport code. Nine native-control boundary files were checked byte-for-byte against the preserved prior ZIP, with results in evidence/native-boundary-unchanged.txt. No engine extraction or removal occurred.

Final increment 3 aggregate: **210 Node tests passed, 0 failed; static/offline build passed**. Fresh output is in evidence/tests-final.txt and evidence/build-final.txt (also copied to increment3-named files). npm emitted an environment-only unknown http-proxy configuration warning. No dependency install or upgrade was performed. Independent review results and fixes are recorded in docs/review-increment3.md.

## Dock polish checkpoint

215 Node tests pass and the static/offline build passes. New tests cover left/right default/validation/persistence/storage/motion guards, Settings controls/focus, wide-screen mirrored CSS with compact layout unchanged, and whole CarPlay-button activation separated from music playback. The CarPlay tile behavior already existed; this increment adds an explicit regression test rather than a new native projection capability. No brightness requirements were inferred. Actual pixel/layout behavior remains unverified.

## Source acquisition and startup correction

The complete pinned upstream repository has been acquired and verified separately; see evidence/upstream-source-provenance.json. No upstream script, dependency install or native process was executed. Latest confirmed startup behavior changes only the controller fallback for a saved unavailable projection route to Home. The older phone-selection fallback remains for an explicit user projection request with no session. The preferred startup route is retained, and no new phone takeover or playback action was added. Earlier unchanged-native-boundary evidence applies to its recorded checkpoint, before this single controller-line change.

The bounded dropout policy additionally returns Home after an authoritative projection-to-shell transition with session loss and exposes only the fixed `projection-reconnecting` notice code through the isolated boundary. A later manual route clears the notice. Manual-exit/dropout and rapid Home→CarPlay races are regression-tested; the latter issues one fresh command for the newest intent rather than replaying a queue. Existing managed transport retries and last-phone recovery are unchanged. The browser preview is not bound to this host view, so no actual CarPlay banner, physical phone reconnection or timing claim is made.

Final source-acquisition/policy aggregate: **219 Node tests pass, 0 fail; static/offline build passes**. Upstream checkout remains clean and no upstream native build/test/launch has run. See docs/review-increment5.md for the independent review.
