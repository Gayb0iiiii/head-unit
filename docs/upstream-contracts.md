# LIVI integration contracts

Verified read-only on 2026-10-19 UTC using connected GitHub file/branch APIs. No installation, hardware access, external writes, or publication was performed.

## Pin and scope

- Upstream: https://github.com/f-io/LIVI
- Current main: `4bcd1335c2daedba40640e6dc432cd2ed7acfaa4`, same as requested baseline; commit “feat(cp): car maker themes and dashboard layouts”, committed 2026-10-17 02:47:44Z.
- `package.json`: version **9.5.0**, license **GPL-3.0-or-later**.
- Control protocol: **8**, generated `src/main/shared/core/contract.ts`; `MAX_FRAME = 16777216`.
- Every source link below is pinned to that commit. Treat future main as potentially incompatible.
- Verification link: https://github.com/f-io/LIVI/commit/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4

## Architectural correction

LIVI 9.5.0's UI control is **not a WebSocket protocol**. The primary contract is a same-user Unix domain socket with framed JSON. Port 4000 is a separate **Socket.IO telemetry** service, not a general phone/projection command channel. A browser-only page cannot open the Unix socket or receive projection media from it.

Native GStreamer and the compositor own video/audio/mic. The renderer requests which native plane is shown and uses transparent regions over projection. On macOS the video addon registers native window handles and serves `compositor.ctrl` / `ui-planes.sock`. Do not label a browser/mock iframe as a working native phone video path.

Sources:
- [Server and UID check](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/bin/livi-core/src/server.rs)
- [Projection UI](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/src/renderer/src/components/pages/projection/Projection.tsx)
- [macOS native video](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/src/main/video.ts)

## Launch and lifetime

`resources.rs`:
- `LIVI_NO_UI=1` wins and prevents core from launching a UI. Other values do not.
- Nonempty `LIVI_UI_CMD` replaces the normal UI with `/bin/sh -c <command>`.
- `LIVI_UI_ARGS` is whitespace-split and appended only to the normal Exec path; ignored for Shell.
- `LIVI_RESOURCES` selects installed resource layout. Else `LIVI_ROOT`, ancestor repo discovery, then current directory.
- Optional binary overrides: `LIVI_HELPER_BIN`, `LIVI_GST_HOST_BIN`, `LIVI_COMPOSITOR_BIN`.
- Core supplies `LIVI_CORE_SOCKET` to the child. Under its compositor: `WAYLAND_DISPLAY`, `XDG_SESSION_TYPE=wayland`, `LIVI_COMPOSITOR=1`, optional `LIVI_RENDER_NODE`, removes `DISPLAY`.
- Default Exec gets `--ozone-platform=wayland`; a Shell replacement must choose its own toolkit flags.
- Clean UI exit quits core. Crash retries use 1 second delay, 5 restart allowance, counter reset after 30 seconds stable runtime. Shutdown gets 5 seconds grace.
- `LIVI_NO_UI=1` by itself does not give a browser a video integration.

[resources.rs](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/bin/livi-core/src/resources.rs), [ui.rs](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/bin/livi-core/src/ui.rs)

## Socket and exact messages

Socket selection in `CoreLink`: explicit `LIVI_CORE_SOCKET`, else `$XDG_RUNTIME_DIR/livi/core.sock`, else `<OS temp>/livi-<uid>/core.sock`. Core server checks `peer_cred.uid == core.uid`. A separate bridge must run as the same user.

Frames: 4-byte unsigned little-endian **UTF-8 body byte count**, then compact JSON bytes. Max 16 MiB body. Buffer split/coalesced chunks. Oversize prefix is fatal before body arrival. A well-framed malformed JSON body is consumed/skipped and subsequent frames continue.

```json
{"type":"hello","protocol":8,"client":"headunit-prototype"}
{"type":"welcome","protocol":8,"version":"9.5.0","rev":0,"state":{}}
{"type":"refused","reason":"core speaks protocol 8, not 7"}
{"type":"action","id":7,"action":{"kind":"setConfig","patch":{"huVolume":0.5}}}
{"type":"reply","id":7}
{"type":"reply","id":7,"error":"rejected: ..."}
{"type":"patch","rev":1,"ops":[{"op":"set","path":["config","huVolume"],"value":0.5}]}
{"type":"resync"}
{"type":"path","path":"/custom"}
{"type":"input","input":{"kind":"key","code":"KeyV","down":true}}
{"type":"input","input":{"kind":"pointer","screen":"main","points":[{"id":0,"x":0.25,"y":0.5,"phase":"down"}]}}
{"type":"spectrum","on":true}
{"type":"linkSpeed","on":true}
{"type":"camera","found":true}
{"type":"spectrum","bands":[0.25,1]}
{"type":"openPage","path":"/media"}
```

The empty `state` above is illustrative only; a real welcome has the complete State. First message must be hello; mismatched protocol or first-message type gets refused and connection closes. Ignore/refuse incompatible versions rather than trying arbitrary command variants.

Reply means core accepted/queued an action; many actions dispatch asynchronously and it does **not** prove the phone connected, the session switched, or settings renegotiated. Await authoritative state for those outcomes. IDs are u32 on Rust side.

[message.rs](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/crates/livi-core-proto/src/message.rs), [frame.rs](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/crates/livi-core-proto/src/frame.rs), [contract.ts](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/src/main/shared/core/contract.ts)

### Revision reducer and reconnection

- Accept welcome as full snapshot and revision reset.
- Patch only if a state exists and `msg.rev === previousRev + 1`; else send resync.
- Ops are `{op:"set",path:string[],value:unknown}` or `{op:"remove",path:string[]}`.
- Descend objects only. Arrays and scalars replace whole; array-index patching is not supported.
- Set empty path replaces root. Remove empty path fails. Missing/non-object parent fails; removing missing key fails.
- Apply immutably/atomically; any failure → resync, keep previous state/revision.
- Official CoreLink reconnect delay 500ms. Refused stops reconnect permanently.
- On disconnect reject pending actions; input is dropped, never replayed.
- On welcome replay only latest UI path, per-screen show preferences, enabled spectrum/link-speed subscriptions, last camera availability. Do not replay arbitrary commands such as forget/restart/media.
- Official session does not clear old state on disconnect; a safer scaffold should mark it stale and disable controls. No timeout is built into official action waits; a bridge can add bounded waits without claiming upstream provides them.

[link.ts](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/src/main/shared/core/link.ts), [session.ts](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/src/main/shared/core/session.ts), [patch.ts](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/src/main/shared/core/patch.ts)

## State and actions a head unit needs

State top-level: `front, sessions, nowPlaying, navigation, system, devices, telemetry, update, cluster, dab, config`.

- `front`: `{main,cluster,aux}`; values `"livi"|"projection"|"cluster"|"camera"`.
- `sessions`: `{active:"carplay"|"androidauto"|null, position:number,total:number}`. Position is 1-based, zero if no active session. Active is a protocol, not a device ID.
- `devices[]`: `id`, optional `name,model,protocol,lastTransport,batteryLevel,batteryCharging,signalStrength,carrierName,session`; status `"active"|"available"|"offline"`. Session is 1-based.
- `system.audioSinks/audioSources`: `{id,name,isDefault,offline}[]`. Empty audio device ID means system default.
- `system` also contains interface/adapter lists, dongle state, link speed, Wi-Fi options, display modes.
- Derive active device from `devices[].status === "active"`, not from sessions.active.
- Official `isStreaming` is derived as `sessions.active !== null`; it is not a decoder-frame-arrival health signal.

Actions:
- Show projection: `{kind:"show",screen:"main",front:"projection"}`. Return to UI: front `"livi"`. Show reports desire; core may override for call/Siri/reverse.
- Switch existing phone: `{kind:"selectDevice",id}`; next: `{kind:"nextDevice"}`. Existing sessions hand over rather than reconnect.
- Selecting a remembered absent phone may wake it via Bluetooth. `connectDevice` calls the paired-device connection helper (paired phone path wakes Android Auto; other devices use connect-full).
- Forget: `{kind:"forgetDevice",id}` removes registry entry, ends its session after grace, disconnects/removes Bluetooth pairing. This is destructive, not merely hide/deselect.
- No generic `pairDevice`, scan QR, Bluetooth PIN, or browser pairing wizard action exists in this UI protocol. Setup uses wireless flags, native Bluetooth/AP components and phone-side pairing.
- Media: `{kind:"media",control:"playPause"|"play"|"pause"|"next"|"prev"}`; CarPlay-only seek `{kind:"seek",positionMs}`.
- Settings: `{kind:"setConfig",patch}`; `{kind:"applySettings"}` restarts helper and drops CarPlay sessions for renegotiation. It is disruptive, not a harmless save.
- Lifecycle: `quit`, `restart`. Also DAB, update, cluster-layout and dongle-radio actions exist; do not expose them unintentionally through a wide-open bridge.
- Wireless: `wirelessAaEnabled` and `wirelessCpEnabled` default false; `autoConn` defaults true. Set correct adapters/interfaces/country/AP config. CarPlay requires valid MFi hardware (board coprocessor or LIVI Link); AA does not. Wired AA supports one device; other documented transports support multiple.
- Core may automatically select another remaining session when active one disconnects.

[projection.rs](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/bin/livi-core/src/projection.rs), [devices.rs](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/bin/livi-core/src/devices.rs), [README](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/README.md)

## Touch, audio and mic ownership

- Pointer x/y are 0..1 fractions of actual picture/content rectangle, not whole browser dimensions. IDs are u32, mouse slot 0. Phase `down|move|up|cancel`.
- Only main-screen pointer input is processed currently, only while core front is projection.
- Coalesce moves per animation frame; down/up/cancel immediate. Full multitouch frames include active contacts. Release/cancel on lost capture and use last valid coordinates if release occurs outside picture.
- Core clamps coordinates and maps Android Auto crop; CarPlay turns up/cancel into touch-down false.
- Keys use KeyboardEvent.code and current config bindings. Default assistant KeyV, home KeyH, cycle session KeyS, accept KeyA, reject KeyR. Do not hard-code if bindings changed.
- Native GStreamer captures and uplinks mic; there is no mic PCM upload or browser getUserMedia requirement in the control contract. UI can choose `audioInputDevice` / label. Audio output selection uses `audioOutputDevice` / label.
- Volume fields 0..1: `huVolume,audioVolume,navVolume,voiceAssistantVolume,callVolume,systemSoundsVolume`; also `disableAudioOutput,huVolumeLinkSystem,samplingFrequency` (0 = 44.1kHz, 1 = 48kHz), `visualAudioDelayMs`.
- Native phone events control microphone lifetime and call/Siri focus; do not invent a `mic:start` WebSocket command.

[Touch hook](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/src/renderer/src/components/pages/projection/hooks/useProjectionTouch.ts), [audio schema](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/src/renderer/src/routes/schemas/audioSchema.ts), [CarPlay media](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/bin/livi-core/src/carplay.rs), [AA media](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/bin/livi-core/src/android_auto.rs)

## Return-to-home / useFollowFront

`useFollowFront(): void`; it returns no callback, route, or boolean. It watches store `front.main` and sessions.active.
- Core projection → route `/`; camera → `/camera`.
- Preserve prior route then navigate with replace.
- When projection gives control back and phone is still active: prior route or `/media`.
- If phone is no longer active: does not navigate away from projection on that transition.
- Return from camera only if core opened camera and a prior route is known; a manually opened camera stays.
- Explicit user navigation outside core pages clears remembered back route.
- Core already restores focus after call/Siri and puts reverse camera above those. Parent UI must follow core and also report its own shown front/path; avoid loops or synthetic Home during calls.

[useFollowFront.ts](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/src/renderer/src/hooks/useFollowFront.ts)

## Config and custom iframe integration

Paths: Linux `$XDG_CONFIG_HOME/LIVI/config.json` (fallback ~/.config), backup `$XDG_DATA_HOME/LIVI/config.json` (fallback ~/.local/share). macOS ~/Library/Application Support/LIVI/config.json, backup subfolder. Prefer runtime setConfig, which validates and atomically saves, then broadcasts.

setConfig is shallow except `bindings` object merge; nested per-screen objects should include all needed screens. Null removes a field before deserialization/defaults. Unknown non-null settings rejected. Changed Wi-Fi passphrase must be 8..63 characters. Negotiation-sensitive settings may await apply/idle.

A low-risk wrapper option retains stock LIVI and configures:
```json
{"custom":{"main":true,"cluster":false,"aux":false},"customUrl":"http://127.0.0.1:<port>/","startPage":"/custom"}
```
This adds a custom tab/home page, not a new native projection pipeline.

`Custom.tsx` calls `window.app.customPageUrl()`, renders returned URL in an iframe, remounts when URL or dark/light key changes, hides until load. No documented postMessage bridge is provided.
- customUrl uses a loopback proxy with dynamic port; else local userData/custom/index.html at app://index.html/custom/index.html.
- Local custom/icon.svg supplies tab icon; custom/livi-theme.css is generated theme CSS.
- Proxy target parsing preserves target **origin**, not configured path/query. Serve at origin root or inspect/extend upstream intentionally.
- Proxy forwards HTTP and Upgrade/WebSocket, adds COEP/CORP, rewrites same-origin redirects. This websocket forwarding is generic transport for the custom site, not a LIVI control API.
- Current upstream HTTPS proxy sets rejectUnauthorized:false. Prefer trusted loopback origin in prototype; do not use this behavior to bypass certificate/security warnings.
- Electron preload exports window.core bridge to its main renderer; no supported iframe API is defined. Do not assume a remote iframe can call parent.core cross-origin. A separate minimal same-user bridge or intentional native UI integration is required for control.

[Custom.tsx](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/src/renderer/src/components/pages/custom/Custom.tsx), [CustomProxy.ts](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/src/main/services/custom/CustomProxy.ts), [appProtocol.ts](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/src/main/protocol/appProtocol.ts), [preload](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/src/preload/index.ts)

## Telemetry and status are separate

- Port 4000 binds [::] or 0.0.0.0; permissive CORS; no auth seen in this server. Do not expose broadly.
- Socket.IO namespace /, events telemetry:push (object patch) and telemetry:update (snapshot, including initial state).
- HTTP POST /telemetry JSON object → 204 accepted, malformed/non-object → 400.
- Fields gps, can, climate, tirePressure merge shallowly per block; other fields replace. Missing ts gets current Unix ms; legacy turn → turnSignal.
- A changed path emits openPage once; volume influences huVolume. This does not grant phone-control actions.
- userData/state/status.json is wrapped as `{version:1,timestamp:<UTC ISO milliseconds>,payload:<status>}`. Its payload gives ui.path, projection.active ("cp"|"aa"|null), projection.streaming, projection.phoneType, audio.{media,speech,system}.playing, phone.active, voiceAssistant.active, nav.announcing.
- status projection.streaming is active-session-derived, not frame health.

[telemetry.rs](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/bin/livi-core/src/telemetry.rs), [status_file.rs](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/bin/livi-core/src/status_file.rs)

## Test checklist for the no-network scaffold

1. Encode UTF-8 byte length, little-endian; exact max allowed, greater rejected.
2. Decoder: split header, split multibyte body, many frames in chunk, trailing partial frame; malformed JSON then valid frame; oversized prefix.
3. Welcome initializes/replaces snapshot and revision.
4. Patch before welcome, gap/duplicate/out-of-order rev, invalid operation path → resync without state mutation.
5. Whole-array replacement, root set, root-remove error, missing-parent error, absent-key remove error, unchanged subtree identity.
6. Replies correlate by id, error rejects, unknown id ignored; disconnected actions reject.
7. Disconnect marks stale; inputs/actions not replayed; only latest path/show/subscriptions replay after welcome.
8. UI mock/live state visibly distinct; do not imply hardware success from local state/action acceptance.
9. Switch/forget/apply waits for observed state and handles disconnect; do not claim pair/switch based only on reply.
10. Projection touch canceled when view hides; reconnect cannot replay old held touch.

Official existing test sources: src/main/shared/core/__tests__/{wire,patch,session,link}.test.ts, plus Rust frame.rs/patch.rs inline tests. Read-only copies are under /workspace/shared/livi-upstream-readonly/ for inspection, not a vendored implementation.

## License implications (engineering guidance, not legal advice)

LIVI explicitly uses GPL-3.0-or-later. A private local prototype need not be published. If distributing LIVI or a modified derivative, retain notices/license, mark changes, and satisfy corresponding-source requirements; installation information may matter for covered consumer devices. A separate process/socket boundary is not automatically a copyleft exemption: the FSF considers both communication mechanism and how tightly the programs interact. A custom iframe does not by itself settle that question. Review the actual distributed architecture with qualified counsel before shipping proprietary integration. Avoid copying GPL implementation into an otherwise differently licensed prototype without an intentional licensing decision.

Sources: [LIVI license](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/LICENSE), [GNU GPLv3](https://www.gnu.org/licenses/gpl.en.html), [private changes FAQ](https://www.gnu.org/licenses/gpl-faq.en.html#GPLRequireSourcePostedPublic), [aggregation FAQ](https://www.gnu.org/licenses/gpl-faq.en.html#MereAggregation).

## Unverified hardware work

No live phone pairing/switching, audio/mic loopback, native rendering, reverse-camera transitions, hardware MFi, compositor startup, or on-device reconnect was executed. Those require a suitable host, real adapters/phones and explicit hardware/integration scope.


## Home metadata projection

The bounded Home slice rechecked the pinned NowPlaying and DeviceView Rust schemas and active-session publication behavior. See [home-status.md](home-status.md) for exact fields, source hashes, local observation expiry and ownership checks. SignalStrength exists but its shared CP/AA scale is not established by this audit; the shell does not invent signal bars. Playback controls use existing explicit play/pause actions, with an additional renderer-to-host owner check that is not added to the native wire protocol.
