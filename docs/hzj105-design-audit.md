# HZJ105 design-skill audit

Baseline: merged PR #4 at `ec59e5842d206e03fe9184078d147fae8d1f3179` on `codex/local-audio`. Its tree matches the preceding `50847e9` checkpoint. Follow-up branch: `codex/hzj105-design-audit`. Read the installed HZJ105 head-unit design skill and its Apple-principles reference; these are project criteria, not Apple certification or native Apple frameworks.

## Corrections

- Preserve the shared Audio-style top navigation and direct destinations, without an Apps launcher. Fix an older Audio-specific rule that made the bar static: reproduced at y=-83 after scrolling. The common bar stays sticky on Audio too.
- Use quiet opaque content surfaces. Remove broad content blur and decorative reflection gradients. Genuine translucent backdrop blur is confined to navigation, with opaque reduced-transparency/high-contrast/unsupported-blur fallback.
- Start controls at 56×56 CSS-pixel hit rectangles, 8px navigation separation and larger 64px-or-greater transport controls. Compensate minimum targets for the existing UI scale. Compact libraries reflow; portrait transport appears before the library so routine playback controls remain above the fold. Short screens allow page scrolling to the full player instead of shrinking controls.
- Fit square artwork, metadata and actions within the library viewport; options occupy their own row. Native list scrolling chains to the page at its boundary rather than trapping vertical gestures.
- Preserve Audio list position per tab/search/group/motion state across route changes. Keep the cache bounded to 16 views; new filters begin at the top, and returning to Library restores its own position. Preserve page positions per destination without persisting new user data.
- Reject the pointer click following a drag or cancellation. Reproduced an accidental playback start after a mouse drag over a track; ordinary taps, repeated actions and keyboard activation remain available.
- Give Bluetooth actions stable focus keys. Reproduced focus loss after a host state refresh; long device names and error updates now retain usable controls/focus.
- Refresh stale browser assertions for the removed Apps menu and old bottom-dock geometry; retain the functional weather/update/desktop/phone and scrolling checks. Historical evidence remains a checkpoint, not current acceptance.

## Acceptance record

| Area | Result | Evidence / limits |
|---|---|---|
| Shared shell | Pass in Chromium | Seven destinations including wallpaper settings; day/night at 1920×1080, 800×480 and 480×800. Navigation also tested at 1280×720 and 320×640, with scale extremes. |
| Materials | Pass in Chromium | Content blur and gradients absent; opaque content pixels are uniform. App-bar patterned pixels show transmission and blur; reduced transparency is opaque. |
| Text contrast | Pass in tested composition | Primary/secondary text ≥4.5:1 over extreme token backgrounds at every stored glass strength; actual white-backdrop secondary text pixels measure 5.38:1 day / 5.34:1 night at default strength. Essential control boundaries tested ≥3:1 against content/control/selected surfaces. Not a physical glare measurement. |
| Target geometry | Pass for tested actions | App bar, audio artwork/actions and Bluetooth controls at least 56px; primary transport ≥64px. Scale tests exercise 90%, 100%, 115%; physical millimetres unknown. |
| Scroll / activation | Pass in Chromium | 30-file library: wheel, touch drag, first/last reachability, route/tab restoration, touch cancellation, mouse drag without playback and repeated Repeat. Artwork suite checks square covers, metadata/action visibility, unobstructed action centres and keyboard focus. Wheel events approximate trackpad input; physical trackpad unverified. |
| Content / states | Pass with explicit fixtures | Original generated artwork and silent MP3s; WAV decode/play/pause, persisted intentional pause, missing artwork, long labels, unavailable peripherals, injected Bluetooth pairing/error/forget, weather stale/request races, update confirmation/cancel, wallpaper persistence, native override states. No real pairing/update is performed. |
| Accessibility | Pass in tested variants | Reduced transparency, increased contrast, reduced motion and forced colours; keyboard navigation and Bluetooth refresh focus. |
| Offline / preferences | Pass in browser fixtures | Offline shell, IndexedDB media, reload without autoplay, persisted wallpaper/accent and appearance; no remote asset dependency introduced. Ignition-loss durability is not established. |
| Performance | Not profiled on target | No real Pi CPU/GPU/frame/thermal measurements. Desktop browser completion is not target performance evidence. |
| Physical / driving | Not verified | Display dimensions/scaling, sunlight/night glare, physical touch/trackpad, motion/parking signal and driver-distraction assessment remain gates. No new motion signal or safety claim. |

The full local suite contains 729 passing Node tests; build and Unix-socket fixture pass. Browser logs and representative screenshots are in `evidence/design-skill/`. Browser tests use a local HTTP server on 127.0.0.1:8097 and an injected host; tests that accept `HEADUNIT_TEST_BASE_URL` require it set accordingly.

## Remaining work and tradeoffs

At 800×480 the scrollable library and right playback controls remain useful, but the detailed bottom player can require page scrolling. Larger hit targets deliberately take precedence over fitting everything into one viewport. Fine sliders still use the existing reset controls; larger increment/decrement alternatives are a future improvement. Saved Audio scroll positions are session-local, not restored after a process restart. A historical development simulator retains its old layout experiments; production does not expose them.

The Pi was not accessed or modified. Repository/Pi equality is not claimed. No services, networking, permissions, native dependencies, HELIX tuning or vehicle cluster behavior were changed. No deployment, reboot, approval or merge is performed by this task.
