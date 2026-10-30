# Head-unit feature audit — 2026-10-30

This increment is based on audio commit `9d5e649`, stacked above draft PR #3 and the weather work in PR #2. It audits the available software, not a vehicle or connected display. No native service, DSP tuning, deployment, cluster ownership or output route is changed.

## Findings and fixes

- `src/style.css`: production panels used 94–96% opacity, fixed 22px blur, and hard-coded day whites. Multiple higher-specificity rules bypassed the glass setting. Replaced those competing paints with shared surface tokens driven by the stored glass strength, and used the same backdrop blur across Home, Settings, Apps, source states, wallpaper controls and Audio. Day uses muted blue-grey instead of near-white; night uses soft grey-blue text, dark controls and restrained highlights. Foreground opacity stays 1. Clear glass retains enough backing for text contrast.
- `src/style.css`: night clock/weather fields and selected controls were bright even in night mode. They now use the shared control and selection palette. Wallpaper swatches retain their images rather than being recoloured as selected buttons. Secondary labels, focus outlines and selected Audio tabs have explicit contrast checks. Reduced transparency and increased contrast remove blur and use solid surfaces. Forced colours use system colours. The implementation changes interface luminance, not physical panel backlight.
- `src/local-audio-view.mjs`: favourite/queue actions lost keyboard focus after rerender; stable focus keys now retain it. Deleting an imported copy now names the track and requires a second action, with Cancel focused first. Long empty-state copy wraps; large lists use content visibility. Imported originals remain untouched.
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
