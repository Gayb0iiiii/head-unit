# Standalone Bluetooth and native projection: integration boundary

Repository audit, 2026-10-30. This is an implementation map, not a deployment instruction or a claim that phones work on the Pi. No device, pairing registry, audio graph, host networking or service configuration was changed.

## Current path and corrected gate

`electron/application.mjs` → `electron/glass-runtime.mjs` → `src/transport.mjs` → `src/session.mjs` connects to the explicitly configured local `LIVI_CORE_SOCKET`. It does not launch the engine. `src/controller.mjs` turns synchronized protocol-8 state into the allowlisted view; `electron/main-boundary.mjs` and `electron/preload.cjs` authenticate and narrow renderer operations. `src/native-model.mjs` waits for successful phone selection, the observed selected owner, and a recognized projection session before requesting projection. Configured geometry comes from `src/picture.mjs`; it is not measured frame readiness.

The previous controller treated any truthy `sessions.active` value as projection-ready. It now accepts only the pinned protocol's `carplay` and `androidauto` values, and only while the session is synchronized. Unknown values cannot trigger manual or saved-route projection activation. Existing tests using invented `cp` or object session values now use real wire values; a separate invalid-object integration regression verifies rejection through the real session/controller/IPC/preload chain. The `projectionReady` API name is retained for compatibility, but denotes **recognized active session**, not compositor, decoded-video, audio or physical readiness.

Pinned contract: [State / Sessions / Protocol](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/crates/livi-core-proto/src/state.rs), [actions](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/crates/livi-core-proto/src/message.rs).

## Standalone Bluetooth: separate host implementation required

The current preload has no Bluetooth scanning, pairing, trust, forget, remote player or call API. LIVI's `selectDevice` / `connectDevice` select projection devices; they must not be repurposed as Bluetooth-only connect. The UI therefore continues to show Bluetooth unavailable and offers imported offline music.

A future backend needs the following explicitly separate responsibilities:

| Host interface | Required observations and behavior | Renderer exposure |
| --- | --- | --- |
| BlueZ object discovery | Subscribe to `org.freedesktop.DBus.ObjectManager` and Properties changes; rebuild state on `org.bluez` owner loss/replacement. Distinguish adapter absent, powered off, unavailable bus and unsupported service. | Bounded availability and known-device records with opaque IDs; no caller-supplied bus paths or generic D-Bus methods. |
| Pairing | Own an explicit `org.bluez.Agent1` flow; show numeric confirmation, handle rejection/cancel/timeout and removal during a prompt. Do not silently trust or confirm. Discovery is a parked, user-started, bounded operation. | Dedicated start/cancel/confirm operations bound to the current prompt, device and service generation. No enabled Add button before the backend exists. |
| Music connection | Own the A2DP sink path with PipeWire/WirePlumber. Resolve the remote profile from observed UUIDs and use a reviewed profile-specific request. A successful call alone does not prove an active stream or audible output. | Connecting/connected/streaming/error states based on observation. Generic `Device1.Connect()` is unsuitable for a Bluetooth-only promise because it connects multiple eligible profiles. |
| Playback | Observe remote `org.bluez.MediaPlayer1`, its owning device, metadata and control availability. Clear stale state on object/service loss. Reject controls if the owner changed while a request was pending. | Explicit supported controls for the observed player; unknown position, duration or play state remains unknown. No fallback to LIVI projection controls. |
| Audio ownership | Choose one owner for Bluetooth media, projection and local playback; distinguish requested focus from observed routing. Preserve deliberate pause and never auto-resume after service loss. | Availability follows the actual owner. Existing local pause-on-phone-navigation remains conservative until a tested host arbiter supplies stronger ownership evidence. |
| Forget | Explicitly confirmed, device-scoped removal; clear only that device's project preferences/cache after successful removal. | No delete action wired to filesystem cleanup or a generic command. |

BlueZ's [Device API](https://bluez.readthedocs.io/en/latest/device-api/) distinguishes `Connect`, `ConnectProfile`, pairing and disconnection. Profile ownership and output acceptance must additionally be verified against the installed BlueZ/PipeWire versions. Calls and contacts remain separate HFP and OBEX/PBAP implementations; partial upstream call support does not provide a complete standalone phone app. See [phones backlog](phones-backlog.md).

A host implementation needs an explicitly selected D-Bus client and tests against an isolated fake bus before being enabled. The repository currently has no such client or service. Adding shell commands or inventing successful responses would not close this integration gap. Initial acceptance must cover service restarts, adapter removal, rejected pairing, canceled prompts, two phones, profile rejection and switching away while an operation is pending, without changing unrelated device configuration.

## Native CarPlay: what software checks can and cannot establish

The existing pinned native build compiles core/helper/GStreamer-host/compositor and runs only reviewed test subsets in CI; see [native README](../native/README.md). This is x86_64 build evidence. It is not ARM64 execution, MFi acceptance or a live stream. No upstream binary was launched as a probe: startup can write identity/configuration and change services or networking.

Remaining sequence before enabling the actual path:

1. Build the pinned engine and dependencies for the intended ARM64 environment; preserve lockfiles, compiler/patch checksums and GPL notices.
2. On a separately authorized target installation, verify MFi/USB and the chosen wired/wireless transport, audio output/microphone, local desktop recovery and real display seat. Wireless provisioning must preserve existing SSH/network access and requires an explicit reviewed change plan.
3. Validate the original native UI with the unchanged engine, then the custom window identity, compositor video planes, transparency, secondary outputs and shutdown ownership. A session and configured rectangle alone cannot demonstrate a visible frame.
4. Validate physical geometry before enabling projection touch. Keep the shell's projection input disabled until calibration, cancellation, focus loss and disconnect tests pass on the actual panel.
5. Verify phone switching, intentional pause, calls, navigation prompts, local-audio handoff and reconnect without concurrent HFP owners or unintended audio routing. Keep HELIX tuning unchanged; stereo output is not ten independent source channels.

No credentials or commercial service tokens are needed for the software tests in this increment. Actual authentication hardware/phone permissions are target prerequisites, not values to fabricate. No installation, service enablement, network changes, reboot, merge or deployment is authorized by this document. The administrator-denied file-origin profile test remains blocked and was not retried.

## Deferred visual work from independent review

The 800×480 library still needs a composition pass: wide artwork is cropped and tile metadata/actions are not initially visible. Portrait needs a clearer internal-scroll cue, and navigation/title height should be reconsidered on short displays. Improved 480×800 control clearance and 1920 scaling do not prove physical touch suitability. These remain separate from the native integration work above.

## Follow-through: host component now implemented

The subsequent [Bluetooth music host component](bluetooth-music-host.md) implements discovery, numeric confirmation pairing and profile-specific connection policy with mocked service tests. The persistent D-Bus binding, actual PipeWire/focus provider and authenticated UI integration are still absent. This advances the component implementation; it does not change the unavailable installation state described above.

The later persistent-integration checkpoint now supplies the bus adapter, read-only PipeWire monitor, conservative focus provider and authenticated UI seam. They remain opt-in and inactive in default entrypoints. See the current [Bluetooth integration document](bluetooth-music-host.md) for tested interfaces and remaining target/routing gates; earlier statements about missing bindings describe the prior checkpoint.
