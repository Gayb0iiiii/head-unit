# Phone capabilities and extraction backlog

User-requested goal: saved phones with tap-select, Add pairing flow, Remove/forget, saved reconnect preference, distinct wired/wireless CarPlay and Bluetooth-only choices, contacts, and separate call/music phone roles. This checkpoint implements safe policy/controller scaffolding, not physical Bluetooth services.

## What the pinned engine actually exposes

LIVI protocol 8 supplies selectDevice, connectDevice, forgetDevice and nextDevice. Device protocol is CarPlay/Android Auto, not a standalone Bluetooth profile role. No scan/pair, per-phone wireless mode, dial/answer/hangup or PBAP contact action exists in the core action contract.

There is partial HFP service-level connection/call-state handling and real CVSD 8kHz SCO call-audio bridging tied to Android Auto. There is AVRCP passthrough/MPRIS integration. These pieces do not establish a complete independent Bluetooth phone/music application.

Primary pinned sources: [core messages](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/crates/livi-core-proto/src/message.rs), [HFP](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/crates/livi-runtime/src/hfp.rs), [SCO](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/crates/livi-runtime/src/sco.rs).

## Required implementation gates

- Add: numeric pairing confirmation, cancellation, timeout, permission-denial handling. Do not copy automatic confirmation behavior into the new UI.
- Remove: explicit device selection/confirmation, native unpair, terminate relevant sessions, clear that device's contact cache and stored priority. The preview disables removal because no native registry is attached.
- Per-phone mode: a policy model plus gates at inbound handover and automatic reconnect, not only a UI checkbox. Wireless CarPlay uses Bluetooth handover and Wi-Fi; its global enable flag is not per-phone permission. Wired choice must remain distinct.
- Bluetooth-only music: verify A2DP sink and PipeWire routing, remote BlueZ MediaPlayer1 AVRCP controls/metadata, and avoid a generic connect-all-profiles action that can wake projection.
- Calls: decide one HFP owner, integrate caller/call state and answer/hangup, then validate SCO audio and focus. Do not make LIVI and PipeWire compete for the profile.
- Contacts: dedicated obexd/PBAP transfer service, phone permission, cancellation/denial, completed-transfer validation, minimal local cache, deletion on forget. No contacts were accessed.
- Split roles: capability-gated arbitration model keeps music/projection phone distinct from call phone, ducks only supported audio, and restores route/volume only if the user has not changed them during the call. Native call-control effects must stay disabled until a backend provides them.

Platform references: [WirePlumber Bluetooth](https://pipewire.pages.freedesktop.org/wireplumber/daemon/configuration/bluetooth.html), [BlueZ remote media player](https://github.com/bluez/bluez/blob/master/doc/org.bluez.MediaPlayer.rst), [BlueZ PBAP](https://github.com/bluez/bluez/blob/master/doc/org.bluez.obex.PhonebookAccess.rst).

## UI truthfulness

The Phones preview shows saved demo phones and disabled Add/Remove capability controls with reasons. It does not fake pairing, contact access, phone battery/signal, Bluetooth-only metadata, or a live CarPlay stream. Home uses unavailable labels for the planned separate temperature sensors and excludes vehicle/aux battery readings and detailed gauges.

No engine code has been deleted. Full dependency/build evidence is required before extraction or removal, especially shared authentication, session management, projection planes, audio/microphone, touch, reconnection and cluster paths.
