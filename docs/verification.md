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

## PR #1 review fixes — saved cloud environment

2026-10-19. Reproduced the diagnostics-overlay, native selection-rejection and active-before-session ordering failures before changing production code (11 failing assertions across the focused regression run). Diagnostics now closes on explicit navigation and authoritative route/front/disconnect changes. Phone selection waits for a correlated successful reply plus observed device activity and session readiness, in either arrival order. Rejected or superseded requests cannot trigger a later projection request. Request IDs and native error strings remain privileged; the renderer receives a generic failure and a boolean readiness flag.

Validation on Node 24.19.0: 275 tests pass, 0 fail; static/offline build passes; the 30-test fake-owner appliance harness passes. `tests/native-bridge-integration.test.mjs` runs the actual transport, session, controller, IPC boundary and VM-executed preload with an injected socket. It covers native errors, unrelated replies, superseded requests, resync, readiness/reply ordering and interrupted selection. This is software contract coverage, not a native engine test.

`python3 tests/ui.py` now passes on Python 3.12.14, Playwright 1.62.0 and system Chromium 154.0.8037.57 while `npm start` serves the preview. The stale post-reload Settings click and exact Diagnostics accessible-name assumption were corrected. Browser checks exercise actual DOM navigation and persistence, repeated diagnostics exits, active-before-ready selection and Home/camera/cluster/disconnect/failure interruptions using an injected bridge. Screenshots are captured at 1280×720, 800×480 and 480×800 with no horizontal overflow; no page errors occurred. This supersedes the historical browser-launch blocker above.

Fresh logs and screenshots for this cloud run are under `/workspace/setup-evidence/` (feature-tests.txt, feature-build.txt, feature-browser.txt, regressions-red.txt and evidence/home-*.png). Required checks need no downloaded npm dependencies. Actual Electron process isolation, LIVI compositor/engine operation, CarPlay, audio, physical touch and Orange Pi behavior remain unverified. No native service or hardware integration was launched.


## Secure Electron smoke step — 2026-10-19

Added a separately locked Electron 44.7.2 test package and reproducible `npm run test:electron` launcher. The main script uses the actual production runtime, main boundary, preload and renderer with a fake protocol-8 Unix socket. It includes startup, authoritative camera/phone updates, correlated rejection, disconnect, renderer API/isolation assertions and screenshots. No production bridge capability was added. The launcher records failure unless the actual app explicitly completes all checks.

Fresh results: `npm test` **275 passed, 0 failed**; `npm run build` passed; `npm run test:electron:fixture` **1 passed** across an actual local Unix socket; launcher/app JavaScript syntax and `git diff --check` passed. Electron dependency and checksum-verified binary installation succeeded using the existing environment proxy.

**Blocked:** the actual Electron executable aborted with SIGTRAP at `sandbox/linux/suid/client/setuid_sandbox_host.cc:166`. Its bundled chrome-sandbox is agent-owned mode 0755; the runtime requires a correctly configured sandbox helper. No app result or Electron screenshot was produced. The application smoke assertions remain unexecuted. Logs: `evidence/electron-smoke-blocked.txt`; raw run result: `evidence/electron-smoke/2026-10-19T02-30-42.587Z/result.json` in this workspace.

`tests/ui.py` now explicitly requires `chromium_sandbox=True`, removing its prior `--no-sandbox` setting. Its new run also aborted at system Chromium's sandbox helper (SIGABRT); it did not reach UI assertions or produce new screenshots. The prior PR review-fix browser pass above remains a historical sandbox-disabled run, not secure-browser or Electron evidence. Full raw browser log: `/workspace/setup-evidence/electron-step-browser.txt`.

No sandbox permissions, credentials, host services or network settings were changed. The next software gate is a securely configured Electron environment and a passing smoke run. Native compositor/LIVI, CarPlay, audio, physical touch and Orange Pi validation remain separate later gates.

## Bounded Home status/media slice — 2026-10-19

Verified the pinned Rust NowPlaying/DeviceView/media-action schema before implementation; fetched state.rs and message.rs blobs match the exact pinned Git tree. Source links, checksums, field limits and the local freshness policy are in [home-status.md](home-status.md).

The native Home now presents bounded title/artist/playing and optional battery/charging through both allowlists, with unavailable/stale/disconnected states. Unrelated updates do not renew the 30-second local observation window; this is not a source timestamp or phone heartbeat guarantee. Signal scale remains unverified and signal is unavailable. Temperature providers are still absent. The clock updates independently at minute boundaries. Explicit play/pause carries an expected phone ID only through IPC, checks current ownership/availability in the host, and waits for the matching native reply without optimistic playback or navigation changes.

Regressions were observed before fixes for absent status data, ownership enforcement, expiry, malformed-device publication, partial metadata after owner changes, unavailable-versus-stale distinctions and native Home edit controls. Fresh `npm test`: **290 pass, 0 fail**. The full suite includes real transport/session/controller/IPC/preload paths with a fake socket; `npm run test:electron:fixture` additionally passes across a real local Unix socket, including Home metadata and explicit pause. Build and the 30-test appliance harness pass. Python browser-test syntax passes.

The sandbox-enabled `python3 tests/ui.py` attempt aborts before UI assertions at the already diagnosed system Chromium sandbox-helper check. No new browser/Electron screenshot or pixel/layout pass is claimed. No sandbox permissions were weakened, no alternate execution path was used, and no native LIVI, phone, audio, Bluetooth, temperature or vehicle service was launched. PR description update was not retried.

Full run logs: `/workspace/setup-evidence/home-full-tests.txt`, `home-build.txt`, `home-socket-fixture.txt`, `home-appliance.txt`, `home-browser.txt`; focused red-phase logs have `home-*-red.txt` names in the same directory. Secure Electron runtime and all physical hardware validation remain open.

## Pause-intent race correction — 2026-10-19

Independent review reproduced Play→Pause on an already-paused remembered phone: the real transport synchronously published the old paused snapshot during send, clearing the prior pausePending flag; delayed playing=true then persisted resume=true. The controller now keeps explicit pause intent separate from observed playback until a newer explicit Play. No snapshot or reply is treated as causal acknowledgment of Pause.

Three integrated regressions failed before the correction and pass afterward, covering delayed playback before/after Pause rejection and after Pause success, old Play completion, subsequent paused/playing observations, phone loss/return without an extra Play, saved preferences, honest observed playback, failure UI, unchanged navigation, and a newer explicit Play. Fresh full suite: **293 passed, 0 failed**; build passed. Logs: `/workspace/setup-evidence/pause-race-red.txt`, `pause-race-green.txt`, `pause-race-full-tests.txt`, `pause-race-build.txt`. No new secure UI/Electron or hardware validation; existing sandbox blocker remains. PR metadata was not retried.

## Day/night Settings increment — 2026-10-20

Implemented the previously unwired appearance requirement: persistent Auto/Day/Night Settings controls in preview and native shell, day palette, focus retention and existing motion/storage guards. Auto retains the last appearance while headlights are unavailable; no provider or physical brightness control is invented. The model-only verified boolean/null input seam is not attached to native IPC. The standalone browser packer now includes the pure appearance policy. See [completion checklist](completion-checklist.md) for completed, remaining software, hardware-dependent and approval/access-dependent work.

Five new regressions were observed failing before implementation, then passing. Fresh `npm test`: **298 passed, 0 failed**; `npm run build`, `npm run test:electron:fixture` (**1 passed**) and `git diff --check` passed. Tests exercise persistence/reload, malformed preferences, blocked storage, motion lock, unavailable Auto fallback, signal non-persistence, manual override, rendered control wiring/focus and absence of native commands from theme changes. Browser scenarios for switching and reload are added but remain unexecuted.

The sandbox-enabled `python3 tests/ui.py` retry again aborted before page navigation, with SIGABRT at `setuid_sandbox_host.cc:172` (system Chromium sandbox helper not correctly configured). No new screenshot, actual layout/contrast validation or Electron pass is claimed. No security permissions were changed. Evidence: `/workspace/setup-evidence/appearance-red.txt`, `appearance-green.txt`, `appearance-full-tests.txt`, `appearance-browser.txt`. Physical CarPlay/audio/touch/Orange Pi and automatic headlight/panel-brightness integration remain open.

## Independent appearance review and connection guidance — 2026-10-20

Independent read-only review of `28579201548c55eef012b3ba27cf52af0cc8020d` found a pre-existing selector collision: wallpaper/dock appearance attributes on body were matched by control bindings, so bubbled background/navigation clicks could write appearance preferences and raise a storage warning without a setting change. The new appearance selector repeated the pattern. The handlers now target buttons only. A DOM-boundary regression that includes body selector matches and click bubbling failed before the fix and passes afterward. No other concrete appearance defect was reported; visual acceptance remains open. Exact-head GitHub CI [39436388167](https://github.com/Gayb0iiiii/head-unit/actions/runs/39436388167) passed for the reviewed commit.

The next software increment projects existing transport phases through a fixed-code allowlist in the controller, a second filter at IPC and another renderer filter. The disconnected screen now distinguishes connecting, handshaking/resyncing, backoff, refusal, error and stopped states. Only actual backoff promises automatic retry. Ready derives from synchronized connection state; unknown or contradictory codes fall back safely. No raw errors, socket paths, retry internals or new control methods cross the boundary. Connection behavior, retry schedules and hardware ownership are unchanged.

New regressions failed before implementation. Fresh verification: **303 Node tests passed, 0 failed**; build, real Unix-socket fixture (**1 passed**) and diff whitespace check passed. Tests cover actual transport/controller/IPC/preload state changes, refusal/backoff/stop and successful reconnect, raw-error omission, fixed-code filtering and rendered guidance. Local logs: `/workspace/setup-evidence/appearance-review-red.txt`, `appearance-review-tests.txt`, `connection-red.txt`, `connection-green.txt`, `connection-full-tests.txt`. Secure browser/Electron startup and physical hardware acceptance remain blocked/unverified as recorded above; no insecure rerun or native service launch occurred.

A second independent read-only review of the selector correction and connection-status diff found no concrete correctness/privacy issue and independently passed 63 focused tests plus `git diff --check`. It did not validate browser/Electron behavior or hardware.

## Local native-window and input lifecycle increment — 2026-10-20

Inspected exact pinned Git blobs for Electron createWindow/core, native server/projection and compositor shell role classification. Added an explicit compositor window preset preserving transparent content sizing, main role title and unthrottled rendering while retaining sandbox isolation. Host-owned title changes are protected. Focus loss or unresponsiveness cancels tracked input and blocks new touch until both conditions recover; initially unfocused/capability-missing windows fail closed. No native readiness message or new renderer method was introduced.

Four lifecycle/preset regressions and title protection failed before fixes. A real transport/controller/IPC/preload test verifies full multi-contact cancellation and no automatic replay when focus/responsiveness return. Fresh **308 Node tests passed, 0 failed**; build, Unix-socket fixture (**1 passed**) and diff check passed. Independent read-only review passed 41 focused boundary/integration tests and found no concrete correctness/security defect. Its role-title provenance request was resolved by directly reading pinned compositor `shell.rs`; source links and exact limitations are in [native-shell-integration.md](native-shell-integration.md).

Cancellation is best effort, without acknowledgment. Native front changes can cause cancellation to be ignored; abrupt process death or failed transport cannot be repaired by a local callback. Native dead-client release, health/readiness, full host embedding and lifeline ownership remain incomplete. No native engine, services, actual Electron compositor or hardware were launched. Secure visual/runtime acceptance remains blocked. Evidence logs: `/workspace/setup-evidence/host-lifecycle-red.txt`, `host-title-red.txt`, `host-lifecycle-green.txt`, `host-lifecycle-full-tests.txt`.
