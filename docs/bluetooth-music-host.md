# Bluetooth music integration — inactive by default

The repository now contains a persistent BlueZ binding, host component, read-only PipeWire monitor, conservative focus provider, authenticated preload bridge and an opt-in pairing screen. None is enabled in the default application. No system bus, Pi services, real phone or hardware audio was used during implementation.

## Composition and activation boundary

`createGlassRuntime` accepts a privileged `bluetoothOptions` object. Omitting it leaves the integration inactive. The options require `enabled: true`, a reviewed `/org/bluez/hciN` adapter, a reviewed PipeWire output node name, and an `isParked()` provider returning true from actual host evidence. This is a code composition seam; there is no renderer setting or environment switch that can enable it. Current entrypoints do not pass the opt-in.

`electron/bluetooth-runtime.mjs` owns and disposes the bus, host, PipeWire monitor and focus provider. Missing dependencies, adapters, permissions, roles or ownership evidence result in unavailable/blocked operations. Defaults do not install or configure anything. The existing unavailable Bluetooth screen and offline-audio route remain when the service is absent.

## Persistent BlueZ binding

`electron/bluez-bus.mjs` uses one application bus connection for ObjectManager, discovery, Agent1 and method calls. It subscribes before reading the snapshot, reconciles queued signals, unwraps variants, handles invalidated properties and discards old objects on unique-owner changes. Only the current BlueZ owner may invoke Agent1 or provide object signals. Pairing callbacks validate their exact signatures. Malformed/oversized state fails closed.

A fixed host allowlist permits Start/StopDiscovery, application Register/UnregisterAgent, Pair/CancelPairing, A2DP Connect/DisconnectProfile, addressed-player Play/Pause/Next/Previous and confirmed adapter-scoped RemoveDevice. It excludes generic Connect, Set, trust changes, default-agent takeover and arbitrary service/method arguments. RemoveDevice is reachable only through the separately confirmed host policy described below. Requests have bounded deadlines; a method timeout closes the owned connection rather than leaving an ambiguous discovery session attached. Normal BlueZ owner changes rebuild state; a lost client bus connection stays unavailable until host recovery rather than reconnecting silently.

The optional host dependency is isolated in `electron/bluetooth-deps/`: `dbus-next` **0.10.2**, with lockfile and an explicit `xml2js` **0.6.2** override. Installation uses `--ignore-scripts --omit=optional`; native Unix-FD support is not needed because this code does not acquire audio transport FDs. The normal `npm test` and build remain dependency-free. The dependency audit in this checkpoint reports zero known production vulnerabilities; that is not a general security guarantee or a claim that the older client is actively maintained. The separate CI job installs the exact lockfile and exercises the private bus.

Reproduce only in a development workspace:

```sh
npm --prefix electron/bluetooth-deps ci --ignore-scripts --omit=optional
npm --prefix electron/bluetooth-deps audit --omit=optional --audit-level=high
node tests/bluez-private-bus.mjs
```

That test starts a temporary private session bus and fake BlueZ service. It never opens the system bus, changes security policy or creates persistent credentials.

## Discovery, pairing and A2DP policy

`electron/bluetooth-music-host.mjs` retains adapter-scoped, bounded discovery. It registers an application-local DisplayYesNo agent only for an explicit pairing request. Confirmations carry a random token, opaque device ID and six-digit code. Confirmation, rejection, cancellation, timeout, adapter removal and owner replacement are handled. Unsupported PIN/passkey-entry and authorization modes reject explicitly; not every pairing method is implemented.

A music request requires an observed paired device advertising the remote Audio Source UUID, sink evidence and an exclusive audio lease. It uses ConnectProfile for that UUID, never all-profile Connect. Existing observed A2DP transports are not taken over. Late operations cannot activate after timeout/disposal. Focus cleanup waits for an outstanding connection and successful profile disconnect before releasing ownership. Failed cleanup keeps the lease blocked. Service loss with uncertain audio outcome is presented as uncertain and requires host recovery; it does not claim the sound stopped.

## PipeWire and focus integration

`electron/bluetooth-audio.mjs` runs only the fixed read-only `pw-dump` command, with a three-second timeout and two-megabyte output limit. It requires a live selected Audio/Sink node and observed `bluez5.roles` containing `a2dp_sink`. State expires; failed reads revoke availability. Some installed versions may not expose the role in their graph: that remains unavailable rather than assuming a role from package installation. No profiles, defaults, graph links, loopbacks, volumes or HELIX tuning are changed.

This is availability observation, **not audio routing completion**. A role and output node do not prove a working phone-to-output link. The component reports observed BlueZ transport state and keeps `audible: null`. Endpoint/link policy and actual audio acceptance still require the installed PipeWire/WirePlumber configuration and target testing.

The focus provider requires synchronized native state, the LIVI front, no active projection session and fresh `homeStatus.media.status === available` with `playing === false`. Missing, stale or unknown media state refuses focus. A core that cannot provide this evidence will leave music unavailable; absence of a playing flag is not evidence of silence. Unknown/disconnected native ownership blocks Bluetooth music, even if pairing is possible. It sends a bounded pause request through the authenticated bridge; the UI pauses its actual HTMLAudio element and acknowledges the matching token. Local playback stays gated while Bluetooth owns focus. Projection/phone-select/native-play requests wait for Bluetooth cleanup before dispatch. An external native takeover triggers revocation, but timing and physical audio overlap remain hardware acceptance gates; no JavaScript test proves zero overlap.

The privileged host must supply and update actual motion evidence. Pairing and connection start, and pairing confirmation, fail closed when `isParked()` is not true. Integration with real motion remains unimplemented; the default provider always refuses. A future enabled host must also stop/cancel active discovery/pairing when motion becomes unsafe.

## Authenticated UI boundary

The main-window/main-frame/exact-local-URL checks apply to every new channel. The renderer receives only bounded device names, opaque IDs, availability, observed transport state, confirmation and focus tokens. It gets no bus paths, addresses, raw errors, shell arguments or generic D-Bus method.

Preload methods are fixed: get/subscribe, discover/stop, pair/cancel/confirm, connect/release music, acknowledge local pause, addressed-player control, remember preference and request/confirm forget. Unknown tokens, malformed IDs, extra arguments, unfocused windows and unresponsive renderers are rejected. Blur, navigation, crash and detach cancel pairing/discovery and request music cleanup. The opt-in screen escapes names and requires explicit Confirm or Reject; it never automatically accepts a code. Calls and contacts are labelled unavailable.

## AVRCP observations and commands

The service follows `MediaControl1.Player` only for the device whose A2DP source it owns, verifies `MediaPlayer1.Device`, and requires a valid source lease. It exposes bounded title/artist/album, observed status, duration and position. Missing values and the maximum-uint32 end-position sentinel remain unknown. It does not extrapolate a clock or fabricate artwork.

Each addressed player gets an opaque token. Play/Pause/Next/Previous require the current token, owner and observed player; a changed player cannot inherit stale button requests. Commands never optimistically change playback state. A NotSupported response disables that control for the current player until ownership/player identity changes. This is error handling for the platform methods, not proof that every phone supports them. No generic MPRIS, media browsing or native-projection fallback is used.

## Remembered reconnect and pause continuity

The opt-in host uses a separate `headunit-bluetooth.json` beside its existing host preferences. It stores one private BlueZ device path, an explicit reconnect opt-in and pause intent, not pairing keys or credentials. The renderer receives only the current opaque device ID. Reads reject symlinks, oversized files and unknown schema versions; writes use a private temporary file, atomic rename and fsync. Unit tests exercise a temporary directory, not actual profile migration or physical power loss.

“Remember for startup reconnect” is an explicit user action. Enabling it does not immediately connect. On a later service start, there is at most one connection attempt within the first 60 seconds, only for the already paired remembered device when parked, sink/focus gates pass and saved playback was not paused. There is no scan, pairing, retry loop or Play command. A local audio element already playing refuses the automatic focus request without being paused. The phone itself may resume audio after connection; that behavior is a hardware acceptance gate and is stated beside the opt-in.

Explicit Pause saves pause intent before the command; if persistence fails, Pause is still sent and the failure is reported. Explicit Play records intent only after command acceptance. Disconnect/source-switch suppresses the saved resume intent. Native takeover and other active-focus revocations also save pause intent, including during a pending startup focus request. Orderly runtime disposal does not rewrite this preference. If saving fails, the error remains visible and profile cleanup still proceeds. Preference failures block automatic reconnect in the current run; they cannot establish durable state after an unsuccessful write. Actual profile continuity and power-cut durability remain unverified.

## Explicit forget

Forget requires a currently paired, disconnected device, parked state, no owned music lease and confirmed idle native audio. It first creates a 30-second confirmation token tied to that device and service generation. The UI explains that forgetting removes Bluetooth pairing for **all profiles**, not only music. Cancel/expiry has no removal effect. Confirmation rechecks the gates, clears only the matching remembered preference, and issues adapter-scoped RemoveDevice. A failure to clear the preference prevents removal. The UI follows subsequent observed device state rather than optimistically deleting the row. Connected phones must be disconnected first; this flow does not issue a generic device Disconnect.

## Independent review follow-through

The review reproduced three enabled-mode policy failures: stopping discovery during pending StartDiscovery, releasing music during pending focus acquisition, and treating stale/missing native playback as idle. Regressions now verify that stop/release remains effective across late completions and waits for cleanup, and that stale/missing playback cannot grant focus. Failed scan cleanup reports failure instead of success. The composed-runtime test covers release-before-projection while the renderer pause acknowledgement is outstanding. These are correctness/policy fixes; no remote exploit or hardware acceptance is claimed.

## Evidence and remaining gates

- Unit tests cover bus reconciliation/authentication, deadlines, component races, PipeWire observations, focus acknowledgement/revocation, composed runtime and IPC filtering.
- `tests/bluez-private-bus.mjs` exercises actual D-Bus serialization, variants, discovery, an asynchronous Agent1 confirmation, spoofed-caller rejection, AVRCP metadata/control/error responses, confirmed removal and service loss against a private fake service.
- `tests/ui-bluetooth.py` uses labelled injected host responses and a real local WAV/HTMLAudio element. It checks pairing and forget confirmation/rejection, metadata/control wiring, reconnect opt-in, missing sink/motion gates, manual pause acknowledgement, automatic-focus refusal during local playback and two viewport bounds. It does not pair a phone.
- Hardware gates remain: actual system-bus permissions, installed BlueZ/PipeWire compatibility, role visibility, endpoint/link/output behavior, source handoff, physical touch, reconnection and audio. Enabling on the Pi requires a separately reviewed deployment; no service or security/network change occurred.
- Calls, contacts, arbitrary profile management, seek, remote shuffle/repeat, artwork transfer and automatic discovery/pairing remain unimplemented. No source-channel expansion or DSP tuning is claimed.

Primary references: [BlueZ Agent](https://bluez.readthedocs.io/en/latest/agent-api/), [Device](https://bluez.readthedocs.io/en/latest/device-api/), [Media](https://bluez.readthedocs.io/en/latest/media-api/), [WirePlumber Bluetooth configuration](https://pipewire.pages.freedesktop.org/wireplumber/daemon/configuration/bluetooth.html), [dbus-next](https://github.com/dbusjs/node-dbus-next).
