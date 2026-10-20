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
- [x] Source regressions, static/offline build, fake-core Unix-socket fixture and optional sandbox-enabled Electron harness.

## Software work remaining

- [ ] Run secure Electron and browser acceptance in a compatible sandbox environment; inspect day/night contrast, touch targets, overflow and focus at 800×480, 1280×720 and portrait. Harnesses exist; visual acceptance is open.
- [ ] Complete native host embedding beyond the local window/input guards: app ID, projection geometry, secondary windows, process isolation, application lifeline wiring, single-instance/SIGTERM and lifecycle ownership. Implement against the pinned host contract before real runtime acceptance.
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
