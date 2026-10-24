# Production head-unit UI acceptance plan

Working brief, 2026-10-24. The production UI runs as an Orange Pi system shell. The aesthetic is quiet Apple-like glass with large touch targets, a coastal palette, and no vehicle branding. It must make Home useful without LIVI or internet. The sidebar destinations, in order, are Radio, Bluetooth, CarPlay, Settings, Apps; Home remains one touch away. No simulated state enters production.

Design reference: [Apple CarPlay](https://developer.apple.com/design/human-interface-guidelines/carplay), [materials](https://developer.apple.com/design/human-interface-guidelines/materials), [layout](https://developer.apple.com/design/human-interface-guidelines/layout), and [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility). This is a custom Linux shell inspired by the guidance, not certified CarPlay UI. Glass is restrained on the navigation rail and controls; content uses stable, readable surfaces. The final display size, density, brightness, touch calibration and day/night behavior still need physical review. Pixel widths measured in Chromium are not physical touch-target certification.

## Layout and visual language

- Palette: deep water `#102738`, slate `#365c70`, sea glass `#90c5ce`, frost `#dcebed`, and warm daylight `#eef4ed`. Day and night both need legible surfaces, with wallpaper visible through glass rather than text opacity.
- Type: a single system sans family, with large clock and source information, clear 16–20 px navigation labels, and a small number of quiet secondary labels. No all-caps dashboard copy or developer explanations on Home.
- Home at landscape sizes: one large media surface, adjacent time and weather surfaces, then a compact row of source destinations. A single short connection status stays below those surfaces. Cards align to a shared grid and use the available display area. At 800×480, the same hierarchy compresses into two columns and removes redundant shortcuts already in the sidebar.
- The five sidebar destinations stay visible in the requested order. The selected route has a clear marker. Home is a separate primary control. At narrow portrait sizes the destinations become a reachable bottom strip.
- Settings groups local appearance controls first; device and diagnostic controls live below or in clearly labeled secondary sections. Unsupported services do not get fake controls.

## Behavior and truth

| Area | Acceptance |
| --- | --- |
| Home | One local clock, observed media only, weather/temperature empty state when no approved source exists; no duplicate clock or giant blank region. |
| Phone link | An initial offline state differs from a connection lost after success. Home stays navigable. A compact status communicates absence without dominating the screen. |
| Radio | Digital, AM and FM have a coherent destination, but no station, scan, tuner frequency, or playback success is invented. |
| Bluetooth | Distinct from CarPlay. No pairing or connected-device claim without a real service. |
| CarPlay | A destination exists; it does not claim connection or rendered video without the native engine. |
| Apps | Clear app navigation without fabricated installed apps or a dead tile. |
| Settings | Day/night, wallpaper, glass, dock, and Debug overlay persist, remain usable offline, and have visible focus/pressed states. |
| Debug overlay | Off by default. UI frame callback cadence and aggregate CPU are labeled accurately; GPU is unavailable absent a verified counter. Timers stop when disabled/unloaded. |
| Weather | No geolocation or network request before location/provider consent. A future source needs a timestamp, stale policy, and cancellable bounded requests. |
| Directions | No panel until an authoritative, validated native turn-by-turn feed is present; video is not parsed for directions. |

## Local acceptance matrix

Review screenshots and browser interactions at 1920×1080, 1280×720, 1024×600, 800×480, and 480×800 in both appearance modes. For each size, check Home, every sidebar destination, Settings, keyboard focus, scroll reachability, minimum touch targets, no horizontal overflow, and visual balance. Exercise route changes repeatedly, reload after saving preferences, initial offline and reconnect transitions, a rejected action, and overlay enable/disable/unload. Run the repository tests, build, and socket fixture afterward. Browser tests with a sandbox bypass are visual and behavioral evidence only; they cannot establish Electron sandbox security. Actual Pi display, touch, clock timezone, native media, and boot behavior require later hardware acceptance.

## Cloud visual and interaction review, 2026-10-24

The user-supplied Pi photo transfer is currently blocked by the Library download service; do not mark that image as visually inspected. The reported defects were reproduced from the prior UI in a local Chromium screenshot pass. The revised production build was actually rendered and visually reviewed at all five viewport sizes above, including 1920×1080 and 800×480 Home, Apps, Settings, Radio, Bluetooth and CarPlay, a portrait Home, and day appearance. Selected screenshots are in `evidence/ui-baseline-*.png`; these filenames refer to the disconnected fixture, not a hardware baseline. The fixture supplies only an offline host view and does not invent media, weather, sensors or phone data.

An automated Chromium interaction pass visited each of the six destinations twice at each viewport. It checked visible headings, page errors, horizontal overflow, and dock targets at least 48 CSS pixels in both dimensions. At 800×480 it also checked day and wallpaper persistence after reload, Debug overlay on/off and reload, Apps reordering/reset/persistence, and a collapsed settings group surviving a setting change. A separate connected fixture checked observed media, pause routing, stale cleanup, visible keyboard focus and reduced motion. The pass first exposed a browser-only `Illegal invocation` from the default clock timer binding; the connected fixture exposed the same issue in media-expiry scheduling. Both were fixed and covered by regressions. The fresh passes ended without page errors. The full Node suite reports **419 passing tests**; the static production build and the real local Unix-socket fixture pass. The browser was launched with its sandbox disabled only because this cloud Chromium sandbox helper is unavailable; none of that setting enters the product launcher. These checks do not prove Electron sandbox enforcement, GPU performance, physical touch readability, native LIVI, radio, Bluetooth, weather, or boot behavior.

The repeatable browser passes are `python3 tests/ui-production.py` and `python3 tests/ui-connected.py` after `npm run build`, with Python Playwright and Chromium installed. They default to Chromium's sandbox. This saved cloud environment required `HEADUNIT_TEST_CHROMIUM_NO_SANDBOX=1` for those **test processes only** because its Chromium sandbox helper is unavailable. This flag must not be used in the Electron launcher or Pi setup. The connected test uses explicitly named fixture phone/media data and does not establish a real connection.

Remaining product dependencies: no live radio tuner or Bluetooth pairing/audio adapter is integrated; no weather provider/location has been approved; no validated LIVI turn-by-turn metadata feed exists; no final panel/DPI has been specified. The Home clock uses the Pi's local timezone, which needs checking on hardware. These destinations communicate unavailable state rather than successful operation.
