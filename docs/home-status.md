# Home status and media contract

This slice presents core observations; it does not validate real phones, audio or native composition. The renderer is still a simulation without the trusted preload. With preload it uses only the bounded public Home status, retains manual navigation and never changes the active phone for a media command. Inside/outside temperatures remain unavailable, and no engine gauges are added to Home.

## Verified upstream source

Research pin remains f-io/LIVI `4bcd1335c2daedba40640e6dc432cd2ed7acfaa4`. The following files were fetched from that exact commit before implementation:

- [state.rs](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/crates/livi-core-proto/src/state.rs): camelCase `nowPlaying` has nullable title, artist, album, app, durationMs, elapsedMs, playing and artwork. DeviceView has optional batteryLevel, batteryCharging, signalStrength and carrierName. No source/sample timestamp exists for these fields.
- [message.rs](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/crates/livi-core-proto/src/message.rs): `media` supports explicit `play` and `pause`; the bridge still does not expose toggle, next, previous or seek.
- [projection.rs](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/bin/livi-core/src/projection.rs): publish copies the active session's NowPlaying and devices in one update; tests verify that metadata follows the selected session and clears at session end. HFP battery handling labels its value as percent; AA status forwards the percentage into DeviceView.
- [devices.rs](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/bin/livi-core/src/devices.rs): optional status values are retained in the device registry, and tests use battery values such as 80.0. Thus a welcome snapshot is an observation of core state, not proof of a fresh physical reading.

SHA-256s: state.rs `c3c2578b126f085caa24628a01414913f01a8f58bf333acb231752ff127510fe`; message.rs `1394e11c86f0947c47af190172a04ee3d960f6e605b6e7d8154d05ca0f0e163d`; projection.rs `75ee8cafc48134596e75f5463bc13f05e007d96b0e72ab7b9374b058586652b0`; devices.rs `a4c2acc174d62738dcf4e63f65b36c766ea8e5a134ea0ec65c1b455b5a614b11`.

The signalStrength field exists, but a consistent CP/AA scale was not established from the inspected sources. Signal remains explicitly unavailable rather than inventing bars or a percentage. Plain Bluetooth calls/contacts are not inferred from these fields.

## Narrow public data and freshness

`homeStatus.phone` contains status, phoneId, batteryPercent, charging, signalLevel (always null for now) and freshForMs. `homeStatus.media` contains status, phoneId, title, artist, playing and freshForMs. Status is available, unavailable, stale or disconnected. Titles/artists are bounded strings and HTML-escaped when rendered; percentages must be finite 0–100 and playback/charging must be actual booleans. No artwork, carrier name, credentials, telemetry, arbitrary properties or raw native errors cross either view filter.

A conservative **30-second local observation window** starts on a welcome or a relevant core patch. This is a shell policy, not a phone timestamp or upstream heartbeat guarantee. Unrelated config updates, transport publication, clock ticks and reads do not renew it. Expired displayed data is cleared and controls disabled; unchanged/paused metadata can expire until the core supplies another relevant update. The renderer schedules expiry even if no new views arrive. Source-side age and actual update cadence remain unknown.

Only one unambiguous active device owns media. Missing session state, DAB ownership, disconnect and owner changes invalidate it. After an owner change, only media fields actually observed for that owner become visible; a partial playing update cannot relabel the previous phone's title/artist. No title or playback state is fabricated when unavailable.

The clock refreshes its own DOM node at wall-clock minute boundaries, without rerendering or stealing focus from Home/Settings controls. Its scheduler is injectable for deterministic tests and is stopped on page unload.

## Explicit media commands

The preload uses `media(control, phoneId)`. Main validates the fixed arguments, active owner, observation availability and pending selection before emitting the existing LIVI action. The phone ID is an IPC ownership check, not an invented native protocol field. Reply completion is correlated in the privileged session; renderer errors are generic. A late completion from an older command or previous navigation/owner cannot overwrite the current UI result.

Playback display remains authoritative rather than optimistic. Explicit pause preserves the user's no-resume intent even if the native command fails. A newer pause is not undone by an older play result, and no command changes navigation or selects another phone.

## Validation boundary

Node tests exercise filtering, malformed data, owner changes, partial updates, stale expiry, command rejection and sequence handling through the actual controller/session/transport/IPC/preload with a fake socket. A separate real Unix-socket fixture covers metadata and explicit pause. Browser scenarios are included but sandboxed Chromium/Electron startup remains blocked in this environment; the new Home layout and controls have no visual/runtime pass here. No hardware service or native engine is launched.

### Explicit pause and recovery

A shell Pause sets a separate no-resume intent before sending the command. Neither synchronous transport publication, playback snapshots nor action replies clear it: protocol-8 playback state has no causal command identifier, so even a later paused snapshot cannot acknowledge a particular Pause. A rejected Pause still leaves automatic recovery disarmed while the UI continues to show actual observed playback and command failure. Only a newer explicit shell Play clears this intent during the controller lifetime. This conservatively means phone-side playback alone does not re-enable automatic resume after a shell Pause. The saved resume preference remains false while the intent is held.
