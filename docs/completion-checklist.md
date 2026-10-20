# Head-unit completion checklist

Updated 2026-10-20. This repository is the ongoing head-unit project for the HZJ105. A completed software item means source-level behavior is implemented and tested; it does not establish vehicle readiness.

## Completed software

- [x] Glass Apps/Dashboard shell, touch controls, dock preference, wallpaper and saved layout; known-motion personalization lock.
- [x] Trusted preload binding, bounded public filters, manual phone selection and reply/readiness ordering, cancellation on manual navigation.
- [x] Bounded connection-phase guidance for connecting, synchronization, automatic retry, refusal and stopped states; no raw errors or added control capability.
- [x] Startup fallback, bounded transport reconnect, no command replay, and explicit pause intent preserved through delayed state and phone return.
- [x] Home media and optional phone battery, honest unavailable/stale/disconnected states, local observation expiry, owner-checked play/pause and independent clock.
- [x] Settings Auto/Day/Night override, persistence, unavailable Auto fallback, day palette and native-background transparency. Live headlights remain disconnected.
- [x] Opt-in compositor-compatible window preset and host-owned title; local focus/unresponsive input gating and best-effort contact cancellation. Native death cleanup remains open.
- [x] Explicit parent-lifeline attachment matching the pinned environment/pipe check, disposal-before-quit callback and idempotent startup; actual application exit remains unverified.
- [x] Explicit Electron main-window entry point with single-instance ownership, non-activating duplicate handling, SIGTERM/SIGINT cleanup and lifeline quit wiring; injected lifecycle validation only.
- [x] Main compositor geometry left unspecified, explicit Linux identity before readiness, opt-in delayed fullscreen and interruptible resize reflow; actual compositor classification/layout remains unverified.
- [x] Privileged synchronized window-config observation with strict bounds, invalidation, deduplication and disposal; main compositor kiosk/zoom consumption with asynchronous transition reconciliation. Secondary role fields remain private; the explicit secondary opt-in consumes them.
- [x] Explicit opt-in authenticated cluster/aux leases, dedicated read-only preload/page, host-scoped livi reports and create/close/reactivate/disconnect/shutdown lifecycle; no RealDash instrumentation or camera role added. Actual secondary output composition remains unverified.
- [x] Bounded configured main-picture contain geometry/inset masks and honest unavailable camera surfaces, including repeated takeovers/disconnects. Actual frame alignment and capture remain unverified.
- [x] Source regressions, static/offline build, fake-core Unix-socket fixture and optional sandbox-enabled Electron harness.

## Software work remaining

- [ ] Run secure Electron and browser acceptance in a compatible sandbox environment; inspect day/night contrast, touch targets, overflow and focus at 800×480, 1280×720 and portrait. Harnesses exist; visual acceptance is open.
- [ ] Complete native host embedding beyond the local window/input guards: observed app ID, projection geometry, secondary plane presentation, actual process isolation/exit, fullscreen/resize acceptance and remaining native lifecycle ownership. Local application wiring is implemented but runtime acceptance remains open. Implement against the pinned host contract before real runtime acceptance.
- [ ] Complete native readiness/health and dead-client input release before promoting the modeled appliance supervisor to executable behavior.
- [ ] Integrate verified provider contracts for headlight/motion inputs without widening the renderer to raw state.
- [ ] Implement pairing/forget and Bluetooth-only/call/contact flows only after their backend capabilities, permissions and privacy lifecycle are defined. Current disabled controls are intentional.

## Hardware-dependent acceptance

- [ ] Real CarPlay/Android Auto pairing, wired/wireless switching and disconnect/reconnect with both phones.
- [ ] Native video composition, display geometry, calibrated multitouch and physical controls on the selected Orange Pi/display.
- [ ] Audio output, microphone, calls, navigation ducking and recovery; DSP/output/master-volume choices.
- [ ] Real ignition/power-loss, boot and crash/freeze recovery; storage durability and repeated on-device tests.
- [ ] Headlight/ambient/temperature/reverse providers and panel-brightness backend. Do not substitute CSS dimming or fake live signals.

## Approval or access dependent

- [ ] Authorized original v4 baseline access before integrating its vehicle-service contracts; retain instrumentation as a separate later system.
- [ ] Explicit authorization and an isolated suitable host before native LIVI startup, service installation or security/network changes.
- [ ] Hardware/backend decisions for display, audio, wheel inputs, cameras and sensors before implementing device-specific behavior.
- [ ] Review and approval before merging the draft PR, deploying, flashing or distributing an image. None is part of the current increment.

The next bounded software milestone is secure runtime/visual acceptance, followed by native host integration against verified interfaces. The existing environment blocker does not prevent independent source work, but no source test substitutes for these acceptance gates.

## Remaining software backlog, in dependency order

1. **Completed source prerequisite: bounded privileged native config observation.** Verified main/cluster/aux active, size, kiosk, zoom and bounds fields are projected privately, with malformed-state/resync/disconnect/disposal coverage. Main compositor kiosk/zoom consumption is wired. Native compositor geometry remains authoritative; desktop bounds application/persistence is not yet implemented.
2. **Completed source increment: isolated secondary ownership.** Explicit opt-in cluster/aux windows now have host-derived identity, read-only views, bounded livi-only reports and lease-safe create/close/reactivate/disconnect/shutdown behavior. Main controls remain exclusive to main, and RealDash instrumentation stays separate. Configured main-picture layout and unavailable camera surfaces are now implemented; role status surfaces are not complete native display integration.
3. **Completed source portion: configured main-picture geometry and unavailable camera presentation.** Main contain/inset geometry follows pinned source, with interrupted/repeated transitions tested. Cluster has a distinct layout; native frame/crop alignment and physical calibration remain acceptance dependencies. Camera capture requires a selected source and explicit permission/ownership policy. Do not enable projection touch before real calibration or synthesize a live feed.
4. **Native source/build work: dead-client input cleanup and readiness/health.** Establish the pinned native build/test workspace and test per-client touch/key/PTT release in the actual engine. Define and version a readiness/health contract on both ends before turning the modeled supervisor into executable recovery. Current protocol has no such guarantee; shell callbacks cannot supply it. Native startup remains separately gated.
5. **Blocked validation, alongside the remaining source work:** secure Electron/browser execution in a compatible environment, followed by permitted isolated native composition. Observe actual app-ID classification, secondary output ownership, fullscreen/resize, real signal/lifeline exit and isolation. Run responsive visual QA. Current sandbox-helper failure prevents these checks here; no bypass is permitted.
6. **Backend/product decisions, then implementation:** verified headlights/motion/provider adapters; pairing/forget and Bluetooth-only calls/contacts permissions/lifecycle; display/audio/wheel/camera/sensor choices. The original v4 baseline is needed for its vehicle-service integration. These are not reasons to invent live values or enable unsupported controls.

Hardware acceptance follows the native runtime gate. Merge, deployment, flashing, native services and security/network changes are outside the source-work authorization. Completion of the implement-now items must not be presented as appliance completion.
