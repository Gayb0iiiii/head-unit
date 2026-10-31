# Shared top navigation and visible glass

Production now uses Audio's horizontal app-bar layout on every shell screen. Home, Audio, Bluetooth, CarPlay, Phones and Settings are directly available. The separate Apps entry and production dock-position control are removed; old Apps routes render Home without deleting saved layout/dock preferences. Home's empty media action opens local audio. Diagnostics and wallpaper settings retain Settings as the active app. The legacy development simulator remains separate.

The bar stays at the top while content scrolls, with horizontal touch scrolling on narrow displays. There is no competing side/bottom app dock. Audio's transport controls remain playback controls. Buttons maintain at least 48px physical CSS height at the supported 90–115% UI scale. No native projection/input ownership behavior was changed. Offline Phones now renders its empty/disabled state rather than silently returning Home.

## Glass correction

The previous default day opacity was approximately 94%; night approximately 83%. Default day is now approximately 77%, night 73%, with darker day graphite. This lower tint exposes the existing backdrop blur while retaining the existing exhaustive token test for 4.5:1 primary/secondary text contrast over extreme backgrounds at every saved strength. A more transparent initial candidate failed that contrast test and was rejected. The production Settings glass control already uses a single card surface; no additional scrim or panel paint was added. Reduced transparency and increased contrast retain opaque surfaces; forced-color fallback remains intact. No blur engine, compositor, GPU or Pi configuration was changed.

## Verification

- 728 Node tests, production build and Unix-socket fixture pass.
- Real Chromium taps navigate repeatedly at 800×480, 480×800, 1280×720 and 1920×1080. Tests check active destination, target dimensions, bar position, document overflow, keyboard activation and mouse-wheel scrolling.
- Supported scale extremes (90%, 115%) preserve 48px app-bar targets. A real Chromium touch swipe scrolls the bar at 320×640 and reaches Settings.
- Existing audio browser journey passes import, WAV decoding/time progress, pause, next, favourites, queue reorder, folder/search, deletion, reload without autoplay and projection handoff pause.
- Pixel tests use an actual Home card over a same-origin patterned test wallpaper under the production CSP. Old day CSS fails the broad-pattern transmission check (pixel standard deviation 2.34). New day/night broad-pattern deviation is 7.80/8.88; reduced-transparency deviation is 0.00. Fine-stripe deviation with blur is 0.26/0.23, versus 10.50/12.00 when blur alone is disabled. This verifies visible transmission, actual blur and opaque accessibility fallback, rather than merely reading computed styles.

Screenshots and logs: `evidence/top-navigation/`. Run browser tests against a read-only HTTP server at 127.0.0.1:8097 with Python Playwright and Chromium. `tests/fixtures/glass-pattern.css` is test-only and is not bundled in production.

These tests use a fake offline host and software browser input; they do not establish physical touch accuracy, sunlight legibility, Pi compositor performance or real phone/hardware operation. No deployment, reboot, service activation, merge or PR-description update was performed.
