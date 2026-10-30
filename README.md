# LIVI headunit integration checkpoint

For the prepared Orange Pi 5 Plus system UI boot path, see [deployment/orangepi-system-ui.md](deployment/orangepi-system-ui.md). It starts the production renderer with honest disconnected state and an optional live backend socket; native LIVI/CarPlay readiness remains a separate hardware gate. The published `feat/orangepi-system-ui` branch includes the supervised, user-requested Settings update path; see [update design](docs/update-design.md). It has not been device-tested.

Separate, reversible prototype. This is not an update to the existing v4 demo and does not contain a live CarPlay renderer.

## Run

- Node 24 is the development baseline; Python 3.9+ is used by the test suite. Isolated official Node 22.22.2 on x86_64 also passed all 516 tests, the build, and the real-child supervisor fixture. The Pi's ARM64 Node 22.22.2 still needs its own run. No npm dependencies are required for these checks.
- `npm run test:appliance` runs the fake-clock/fake-owner lifecycle harness only; it does not start or stop real processes.
- Open `dist/preview.html` directly for the self-contained software preview.
- Or run `npm start` and open http://127.0.0.1:8095 for development.
- Optional real Electron checks: see [tests/electron/README.md](tests/electron/README.md); dependencies are pinned separately and sandboxing remains enabled.
- Optional browser test: `python3 tests/ui.py` with Playwright and Chromium, while that server is running. This optional check runs preview flows and injected native-bridge scenarios; it does not launch LIVI. See docs/verification.md for current results.

## Product direction

Phones, media and CarPlay are the headunit priority. Detailed instrumentation belongs to a separate dashboard later; optional sensor rules and units here are a bounded bridge. Native engine extraction has not been performed: this checkpoint maps and adapts the pinned control boundary while preserving the existing engine design.

## What exists

- Persistent Auto/Day/Night appearance controls with a pale coastal day palette and the existing night glass. Auto honestly retains the last mode while the headlight provider is unavailable; this does not control panel brightness. See [completion checklist](docs/completion-checklist.md).
- Touch-first wallpaper-translucent, backdrop-blurred glass home with adjustable strength and persisted keyboard-accessible app/dashboard ordering, defaults and reset, and a saved left/right dock preference (compact screens retain the bottom dock). Known moving state locks personalization; no motion input is fabricated.
- Touch-first glass-inspired home with Apps/Dashboard quick switch, narrow dock, large rounded tiles, phone-switching preview, a single settings page, configurable wallpapers, and nested diagnostics. Native Home shows sanitized observed track/artist/playback and optional battery/charging, with unavailable/stale states and explicit owner-checked play/pause. Signal and temperatures remain unavailable until their provider contracts are verified; no vehicle/aux battery or engine gauges are put on Home.
- Connection screen distinguishes connecting, synchronizing, automatic retry, refusal and stopped states using sanitized transport phases. No socket paths or native errors reach the renderer.
- Node adapter modules for LIVI protocol 8: little-endian length-framed JSON, hello/welcome, ordered revisions, atomic patches, resync, action/reply IDs and local Unix socket reconnect.
- Explicit action allowlist: select/connect/next phone, main-screen LIVI/projection visibility, explicit media play/pause, and five normalized volume controls. The supervised updater adds only a fixed-branch, parked-confirmed update action. Arbitrary restart, quit, configuration and destructive unpairing are not exposed.
- Explicit secondary-role compatibility is available only with `HEADUNIT_SECONDARY_WINDOWS=1` in compositor mode: host-authenticated cluster/aux status surfaces and bounded role-specific livi reports. No secondary main controls or RealDash instrumentation are added; see [secondary ownership](electron/README.md#opt-in-secondary-role-ownership). Native picture/camera geometry and actual output acceptance remain open.
- `publicView` strips credentials, telemetry and unrelated personal metadata from data intended for a future Electron preload boundary. Raw core state must stay in the privileged host.
- Vehicle service is untouched and independent. Optional sensor Settings default to no rules; the pure rules model supports numeric/missing/stale conditions, debounce/hysteresis, once-until-normal or repeat, and capability-gated sound intents. No real sensor evaluation or native banner/audio delivery is wired. See docs/sensor-alerts.md and docs/increment3-scope.md.
- Display units default to PSI/Celsius with canonical stored thresholds and explicit gauge/absolute pressure identities. CarPlay units are outside this policy.
- Separate call/music role arbitration is a capability-gated pure model. Second wired phones remain available for manual selection; no automatic takeover policy is invented. See docs/phone-arbitration.md and docs/phones-backlog.md.

The offline preview uses `Headunit`, a simulation model. When a trusted Electron preload supplies `window.headunit`, the same glass page instead uses `NativeHeadunit`: phones, front, route and connection state come from the narrow host view, and manual phone selection goes through its allowlisted action. An available phone uses native `selectDevice`; a remembered offline phone uses native `connectDevice`. The page waits for the observed active phone before requesting projection. It does not invent saved phones or show a simulated projection screen in native mode. `electron/glass-runtime.mjs` composes the existing controller, local Unix-socket transport, preferences and trusted window boundary; only an explicit `start()` connects to `core.sock`. No Electron/native process was launched or composed in this checkpoint. Native video placement and calibrated projection touch remain a runtime integration gate. Do not attach the browser page to a public control endpoint.

## Version pin and actual seams

Research pin: f-io/LIVI main at `4bcd1335c2daedba40640e6dc432cd2ed7acfaa4`, package 9.5.0 (development main, not the latest stable release). Latest release was v9.4.0 when checked. See docs/upstream-contracts.md for exact sources.

The control channel is a private same-user Unix socket, not a WebSocket. Port 4000 is telemetry. Core rendering, GStreamer, audio, microphone and touch remain native. `LIVI_UI_CMD` is a custom UI launch seam; `LIVI_NO_UI` suppresses the existing UI. The embedded `Custom.tsx` page is not a video stream renderer.

## Safety and compatibility limits

No host connection is made on import. `CoreTransport` requires an explicit absolute `core.sock` path and an explicit `connect()` call (one-shot) or `start()` call (managed retries). It never spawns a shell, writes config files, starts network listeners or replays actions on reconnect. Pending actions are capped at 32 and writes stop under socket backpressure until drain. Managed retries use capped exponential backoff (250ms to 10s), with 5s connect/handshake/reply deadlines by default. stop() clears timers and pending requests. Refusal/version mismatch stops retries.

The decoder intentionally closes on malformed JSON, stricter than upstream's malformed-JSON skip behavior. Patch batches are applied to a deep clone, so they are atomic but do not preserve unchanged branch identity as upstream's reducer does. These choices favor a small isolated checkpoint; performance and exact recovery parity need hardware-host validation.

## Host controller and preferences

The host follows authoritative native front changes and restores the prior explicit screen after projection/camera takeovers. Home requests LIVI visibility without disconnecting a phone. It cancels local touch contacts before user navigation and drops them on disconnect; one bounded cancel-only frame can be queued under backpressure without replay; cancellation after an unsolicited native hide is best-effort because native ownership has already changed.

FilePreferences stores only route, last successful user-chosen phone ID, and previously observed playing state using owner-only atomic file replacement and skips identical writes. This is not a claim of power-cut durability. Transient camera/cluster/call/Siri takeover state is never saved as the user's startup choice. Saved projection falls back to Home when unavailable at startup, preserving the preferred route for later restoration.

At startup or after a confirmed phone absence, the controller gives the saved phone one priority connect/select attempt when no other phone is active. It may send one fresh explicit play command when that same phone returns and prior observed playback was playing. A transport resync alone never rearms playback recovery. It does not replay queued actions, use play/pause toggle, override a deliberate pause observed in an established session, or take over an already active other phone. This recovery policy is user-requested; native pairing and audio effects remain untested.

## Verified / blocked

Passing: Node unit/contract tests and static build/syntax checks. Exact results in evidence/tests-final.txt and evidence/build-final.txt. A later pinned Rust core build and isolated input-ownership test checkpoint is documented in [native/README.md](native/README.md); full engine/Electron runtime acceptance remains open.

Blocked: the v4 ZIP was outside the Library access scope selected for this turn (403). No baseline files were read or modified. Reattach/select that ZIP before merge work.

Earlier Chromium UI checks passed with the test browser sandbox disabled. The browser test now requires sandboxing, and both system Chromium and the new actual Electron smoke test abort in this saved environment because their sandbox helpers are not configured for secure startup. No permissions or sandbox policy were weakened. See tests/electron/README.md for reproduction and the precise blocker. No actual Electron isolation, native composition or physical touch claim is made.

No Orange Pi, Pi touchscreen, MFi hardware, physical phone, live pairing, native projection, audio, microphone or touch forwarding was tested.

## Next validation gate

1. Receive authorized v4 baseline and inspect its vehicle-service/UI boundaries; preserve a read-only baseline copy.
2. Embed the new glass runtime in the pinned LIVI host, load the trusted local page, and verify the transparent native plane/window alignment. Keep native compositor windows and projection touch/audio pipelines.
3. Validate both phones: first pair, switch, disconnect, reconnect, return-to-home, return-to-projection, ignition restart and stale device cases.
4. Test Pi/Orange Pi display sizing, touch orientation/multitouch, mic echo/call audio/music/navigation ducking, and reboots against actual hardware.
5. Complete visible browser/touch QA at 800×480, 1280×720 and portrait; only then promote the UI to the existing demo.

## License

Prototype code is offered under GPL-3.0-or-later; see LICENSE. LIVI is GPL-3.0-or-later. The full pinned upstream tree is acquired separately in the workspace, verified against its Git commit/tree; no upstream source is bundled in this preview archive. Retain upstream notices and provide corresponding source/build instructions when distributing modified GPL-covered binaries. Mere local private work is not a publication. Review the exact distribution arrangement before shipping hardware or images; this checkpoint is not legal advice.

## Concrete next blockers

1. Authorized v4 ZIP selection is required to inspect and integrate the existing vehicle service/demo without guessing its contracts.
2. A usable Electron/native LIVI runtime is required for compositor, real process-isolation, touch and media verification. Current source/VM tests cannot replace it.
3. Actual hardware/provider choices are required for Bluetooth profiles/contacts, temperature/headlight/reverse signals, cameras and wheel inputs. See docs/phones-backlog.md, docs/appearance-and-inputs.md and docs/camera-backlog.md.

## Local audio

Audio now provides an offline imported-file library, artwork/metadata, search, favourites, playback and queue controls. Radio is no longer in the primary navigation. Restart restores choices while remaining paused. See [local audio](docs/local-audio.md) for formats, storage, verification and source-ownership limits. HELIX DSP PRO MK3 tuning remains untouched.

## Complete pinned-source gate

The full 1,924-path upstream tree was previously acquired and verified, but that checkout path is absent in this saved environment. A new isolated sparse worktree at the exact pin supports the [reproducible native patch](native/README.md), core binary compilation and reviewed input tests. Full helper/media/compositor release builds and 40 restricted tests passed in Ubuntu CI at `f0645c6`; deliberately authorized isolated runtime acceptance remains open. Source plans: docs/native-build-plan.md and docs/native-shell-integration.md. Core startup can modify host services and is not a harmless handshake probe. See docs/runtime-validation-gate.md.

Startup fallback and projection dropout return Home; the host exposes a narrow reconnect-notice code, without replacing later manual navigation. Browser/native binding and actual background phone recovery still require runtime verification.

## Appliance lifecycle design

The proposed lifecycle policy orders outer Wayland, native engine/inner compositor readiness and fullscreen shell readiness. It models UI-only recovery, matching health challenges, bounded retries and a latched recovery state with explicit presentation acknowledgment. Effects are declarations for future owners, not executable process commands. No autostart, autologin, service, power control or native watchdog is installed.

Read docs/appliance-policy.md and docs/appliance-deployment.md before native implementation. Stock core currently quits after UI restart exhaustion and has no health/readiness protocol or complete dead-client touch/PTT release. Those native gaps must be fixed and real crash/freeze tests performed before claiming appliance recovery. Disabled examples under deployment/ are not consumed by any runtime.
