# Head-unit feature audit — 2026-10-30

This increment is based on audio commit `9d5e649`, stacked above draft PR #3 and the weather work in PR #2. It audits the available software, not a vehicle or connected display. No native service, DSP tuning, deployment, cluster ownership or output route is changed.

## Findings and fixes

- `src/style.css`: production panels used 94–96% opacity, fixed 22px blur, and hard-coded day whites. Multiple higher-specificity rules bypassed the glass setting. Replaced those competing paints with shared surface tokens driven by the stored glass strength, and used the same backdrop blur across Home, Settings, Apps, source states, wallpaper controls and Audio. Day uses muted blue-grey instead of near-white; night uses soft grey-blue text, dark controls and restrained highlights. Foreground opacity stays 1. Clear glass retains enough backing for text contrast.
- `src/style.css`: night clock/weather fields and selected controls were bright even in night mode. They now use the shared control and selection palette. Wallpaper swatches retain their images rather than being recoloured as selected buttons. Secondary labels, focus outlines and selected Audio tabs have explicit contrast checks. Reduced transparency and increased contrast remove blur and use solid surfaces. Forced colours use system colours. The implementation changes interface luminance, not physical panel backlight.
- `src/local-audio-view.mjs`: favourite/queue actions lost keyboard focus after rerender; stable focus keys now retain it. Deleting an imported copy now names the track and requires a second action, with Cancel focused first. Long empty-state copy wraps. Imported originals remain untouched.
- `src/style.css`: Audio's fixed minimum column widths overflowed at 800×480 with 115% UI scale. Flexible columns preserve the available width; portrait retains one column.
- `src/native-model.mjs`: Apps and Bluetooth did not request the native projection surface back when leaving CarPlay. They now use the existing allowlisted Home navigation command and retain their local route. No new native command is exposed.
- `src/picture.mjs`, `src/app.mjs`: production CSP blocked inline sizing attributes, leaving the configured projection region at 0×0 in Chromium. Geometry is now applied via individual DOM style properties after the same validation. Production CSP is unchanged. The fixture verifies an 800×480 region and its 24px top mask, with no CSP errors. This does not establish live projection, touch calibration or compositor alignment.

## Feature inventory

| Feature | Software status and checks | Remaining dependency |
| --- | --- | --- |
| Home, dock, Apps | Navigation, persistent ordering, clock/media/weather presentation, unavailable/stale states, keyboard and compact layout checked | Physical display/touch comfort |
| Appearance | Day/night/manual/automatic policy, glass, wallpapers, custom images, dim/blur/brightness, accents, dock position and 90–115% scale; preference/reset tests | Verified headlight signal; physical backlight control is unavailable |
| Local audio | Actual Chromium WAV decode/progress, import/persistence, metadata bounds, search/folders, favourites, queue, seek/repeat/shuffle, paused reload, deletion and focus checks | Pi codec set, USB import on Armbian, power loss/profile migration, HELIX output and native call/navigation focus |
| CarPlay/phone switching | Existing transport/controller/model suite; configured region sizing under CSP, local return routes, disconnect and takeover states checked | Native runtime, MFi hardware, physical phones, compositor planes, microphone and echo cancellation |
| Bluetooth | Honest unavailable screen retained; local navigation works | A standalone Bluetooth service/profile implementation; no pairing or audio claim |
| Weather | Existing provider/service tests plus rendered search/selection/current/unavailable outcomes using a labelled fixture | Live network/provider availability; stale readings remain marked |
| Date/time | Existing service and authorization tests plus rendered timezone, NTP and manual-time outcomes via fixture | OS authorization and actual clock change validation on target |
| Software updates | Existing supervisor/release tests; confirmation, cancel and outcome rendering via fixture | Installed supervised target; no actual update run by this audit |
| Desktop handoff | Existing narrow boundary/controller tests; unavailable action stays disabled | Installed desktop/session runtime; not launched here |
| Diagnostics | Connection states and debug enable/disable checked; missing metrics remain unavailable | Real GPU/counter/provider support |
| Optional sensors | Existing rules/units/storage/motion tests; settings remain separate from instrumentation | Real sensors/evaluation/audio delivery; critical cluster remains independent |
| Camera/cluster | Honest camera unavailable and display-in-use transitions checked; old projection elements removed | Camera capture hardware/native integration; no cluster controls added |

## Verification

Run `npm test`, `npm run build`, `npm run test:electron:fixture`, then `python3 tests/ui-production.py` with Python Playwright and Chromium available. The browser runner hosts the actual `dist` output locally and runs four contracts: comfort/cascade, feature flows, local audio and wheel/touch scrolling. No internet or host mutations are needed. `HEADUNIT_TEST_CHROMIUM` selects a local browser executable; `COMFORT_EVIDENCE` selects the screenshot directory.

The comfort contract checks resolved glass tint/blur at both slider endpoints on 16 production surfaces per mode; primary text against black/white backgrounds; selected-button contrast; wallpaper preview retention; six routes at 1920×1080, 1280×720, 800×480 and 480×800; 48 additional scale/dock/route combinations; reduced-transparency, increased-contrast and forced-colour preferences. Node token tests cover primary/secondary text ≥4.5:1 and focus ≥3:1 over five extreme/busy colours at all 101 strengths. These mathematical bounds complement actual browser cascade checks; they are not a full accessibility certification.

The feature contract injects explicit host responses for weather, clock and updates. It verifies the UI's handling of those responses, without executing system changes. The audio contract uses generated silent WAV files, real IndexedDB and Chromium decoding. Stored screenshots are software evidence with fixture/empty data, not evidence of sound quality or physical-panel brightness.

No HDMI/touch is attached to the Pi. Browser or VNC results cannot certify viewing glare, touch ergonomics, panel brightness, audio/call mixing, independent cluster behavior or vehicle safety. Those remain target-hardware acceptance work. Gapless playback, ReplayGain, ten-channel stereo conversion and HELIX controls are not advertised or implemented.

## Scrolling and runtime follow-through

A 30-track browser reproduction showed that background host updates replaced the nested list and reset scroll to zero. Scroll positions now survive same-screen redraws and focus restoration does not scroll the page. Actual Chromium mouse-wheel and touch-event gestures scroll the library without starting playback. The Settings wheel path also passes. This does not prove the reported remote VNC input path or physical touchscreen works. Local audio controls and seek hit regions are at least 48 CSS pixels before user scaling.

The host updater now accepts an explicit validated host-side branch configuration while keeping fixed-origin, clean-tree, ancestry, staging/tests and rollback gates. Default channel is unchanged. Electron exits on an unresponsive-renderer event for its existing supervisor to recover. Release manifests sync the file and directory before success. Persistent local Plasma and return-shortcut templates plus the [Pi installation/recovery plan](pi-install-recovery-plan.md) address the actual missing runtime setup. None was installed.

All four requested Library references resolved, but their bundled-helper downloads returned `library file transfer failed: download failed`. No reference pixels were available or inspected; visual work follows the written direction and the existing design only.

Final local results: **543 Node tests passed, 0 failed**; build passed; Unix socket fixture **1 passed**; all four production browser contracts passed. Logs and representative rendered screenshots are in `evidence/glass-comfort/`. `systemd-analyze verify` succeeded on both staged units after substituting the cloud checkout's launcher path for the Pi-only `/home/cruiser/head-unit` path; the unchanged Pi template cannot resolve that path in this workspace. This is unit syntax/dependency validation, not a service start or boot test. The base remote was freshly checked and still equals audio commit `9d5e649517a0e37c7afd2eb165d36d2e79f1fffa`.

## Reference-led refinement

A subsequent independent reviewer inspected all four supplied references and described a near-black automotive canvas, compact top bar, restrained cyan, narrow right-side driver controls and artwork/library content taking priority over large decorative cards. This workspace still could not access the image bytes; the refinement uses that verified description, not a claim of direct image inspection.

Production now defaults to Graphite and the right dock for new profiles; saved wallpaper and dock choices remain respected. Day uses lifted graphite, night near-black, with muted cyan selection instead of pale fills. The 76px landscape dock, 48px header, smaller corner radii, larger artwork, narrower player and combined library search/browse toolbar reduce decorative space. Compact landscape puts artwork beside track details; portrait retains a bottom dock and natural document scrolling. Existing profiles can select Graphite/right dock in Settings to use the new composition.

The follow-up adds a production-default/persistence test and screenshot checks for a real imported 30-file WAV library at 1920×1080, 1280×720, 800×480 and 480×800. Files are silent fixtures, not user music. No functionality, source ownership, DSP settings or live installation changed. Full local verification after refinement: **544 tests passed**, build and socket fixture passed, and all four production browser suites passed, including contrast preferences and 48 scale/dock combinations. Updated evidence is retained under `evidence/glass-comfort/`.

## Recovery and continuity follow-up

Three reproduced failures have fixes and regression tests: paused seeks now persist immediately; re-import repairs missing audio blobs without discarding queue/favourites; boot resolution accepts a valid staged active release even if the source checkout's generated build is absent. A separate test ensures an unavailable recorded release never silently resets an existing manifest. CarPlay now distinguishes an available system connection from a ready phone display; Bluetooth continues to state its unavailable backend honestly.

Portrait follow-up used a populated 30-track library. Labels appeared after a paint delay and import controls scrolled above the fixed dock, but an immediate tagged-library viewport capture reproduced blank rows. Removed `content-visibility:auto` from rows to eliminate deferred label painting; metadata was intact. Tests check visible labels and non-overlapping controls and retain immediate viewport captures. This is browser evidence, not physical touch acceptance.

`tests/ui-audio-artwork.py` generates six original geometric PNG covers and silent MP3 files with title/artist/album tags using Pillow/ffmpeg. It verifies real import, embedded-art decoding, MP3 duration, metadata presentation and paused reload; captures four viewports without presenting fixtures as user music. The reference-faithful arrangement of navigation and separate driver controls remains design review work; the current right rail is still primary navigation and no unsupported vehicle/audio controls were added.

A direct file-origin persistent-profile continuity test is included for a suitable local runner, but managed Chromium blocked its `file://` navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`. That verification remains blocked; no alternate executor or policy bypass was used. The Pi installation and physical recovery gates remain unchanged.

Follow-up local verification: **548 Node tests passed, 0 failed**, build passed, Unix socket fixture passed, all four dist browser suites passed, and the separate original-artwork MP3 fixture passed. Immediate portrait pixels were inspected after removing deferred painting. Logs, viewport captures and the explicit file-origin blocker are in `evidence/continuity/`.

## Deterministic recovery checkpoint

Regression tests reproduced and fixed duplicate supervisor starts, a late child arriving after disposal, activation verification completing after shutdown, and a second update request after activation acknowledgement. Startup now has one owner; disposed supervisors terminate late children and refuse new activation. Shutdown escalates a non-exiting owned child from SIGTERM to SIGKILL after ten seconds. A real Node child that deliberately ignores SIGTERM verifies escalation with a 50ms test deadline. Unit fixtures separately exercise the default deadline callbacks and race boundaries.

Missing active releases may recover only to the recorded, verified previous SHA. Wrong-hash fallbacks and missing active/previous builds leave the manifest intact and fail closed. This does not turn an unverified build into a recovery candidate or clear the existing crash budget. Browser portrait coverage now captures the top player and scrolled library at distinct document positions; the earlier controls/list captures were the same view and are not independent coverage.

### Remaining implementation and acceptance work

- Standalone Bluetooth pairing/music, calls/contacts and independent maps/navigation have no complete backend. They are unimplemented, not fixed by these UI changes.
- CarPlay still needs the pinned native ARM64 runtime, MFi/phone integration and real compositor/input/audio testing. System connectivity alone is not presented as projection readiness.
- Camera, physical brightness/headlight/motion input and sensor/alert delivery remain unavailable. Critical instrumentation is independent; the saved sensor settings do not start monitoring or sounds.
- Installed desktop handoff, update activation and cold-boot/power-loss behavior are still Pi acceptance gates. No services were changed on the live Pi; software supervision is not a hardware watchdog.
- Profile continuity across release paths remains blocked by the managed browser's file-origin policy. No bypass attempted.
- Visual reference fidelity remains incomplete: the current rail is app navigation, the music view still uses player/list panels, and compact screens trade visible rows/artwork size for touch targets. Separate driver controls and an alternative artwork-led composition remain design work, with only supported actions eligible for controls.

Verification at this checkpoint: **555 Node tests passed**, build and socket fixture passed; four production browser suites passed, including distinct portrait player/library viewports. Evidence is in `evidence/recovery/`. No file-origin retry, deployment, reboot or native hardware trial was performed.
