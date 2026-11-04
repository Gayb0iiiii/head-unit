# Explicit protocol 11 adapter checkpoint

This change adds an opt-in control adapter, not a deployed LIVI engine or a claim of working CarPlay. Protocol 8 remains the default. Set `HEADUNIT_CORE_PROTOCOL=11` only in the trusted host launch environment for a reviewed protocol-11 engine. The renderer cannot choose a protocol. Unsupported values fail before window creation; wrong welcome versions close the session. No fallback negotiation, command replay or broader action permissions are added.

## Reviewed source

Protocol 11 reference: f-io/LIVI `0430a43987af49d92766a1075820141bf3903062` (2026-11-04). The project retains its separate protocol-8 native patch pin; this change does not apply that patch to v10 or claim it is compatible.

- `native/crates/livi-core-proto/src/{lib,message,state,input,frame,patch}.rs`: framed JSON, revisions, action replies, pointer input, device/session state. The adapter uses the existing bounded subset: select/connect/next device, main show, read-only state, play/pause and existing volume fields. It does not expose arbitrary configuration, native restart/update or unpair commands.
- `native/crates/livi-core/src/{resources,ui}.rs`: `LIVI_UI_CMD` still replaces the UI child. Core supplies its socket and native inner display. Clean UI-child exit stops core; repeated failures exhaust its retry budget.
- `native/crates/livi-compositor/src/{shell,projection,input}.rs`: app ID/role classification and native physical-touch ownership.
- `LIVI-LINK.md`: MFi, Wi-Fi and Bluetooth are independently selectable; support depends on the dongle chipset/firmware.

Source base: https://github.com/f-io/LIVI/tree/0430a43987af49d92766a1075820141bf3903062

## Minimal runtime plan, in dependency order

1. Preserve the active custom UI, user audio, desktop/SSH and release manifest. Inspect the running executable, launch command, active build SHA, dongle firmware and actual adapters. Do not run the upstream broad installer over the existing appliance or copy unreviewed configuration.
2. Stage exact-version ARM64 core/helper/GStreamer host/compositor artifacts and their required runtime assets separately. Do not remove shared native dependencies merely because DAB/cluster tiles are hidden. Keep native engine versioning separate from the custom UI update channel. Validate architecture, build provenance and libraries before launch.
3. Run core in the existing authorized graphical session. Use a reviewed fixed `LIVI_UI_CMD` wrapper to execute the persistent Node release supervisor, which launches the production Electron entry. Preserve `LIVI_CORE_SOCKET`, `WAYLAND_DISPLAY`, `LIVI_COMPOSITOR`, render node and lifeline. Do not start a second Cage or a second engine inside this wrapper. The supervisor, not each replaceable renderer, needs explicit parent-lifeline/shutdown ownership and bounded cleanup. Test this composition before boot enablement.
4. Use the reviewed host-selected protocol 11; verify actual hello/welcome and synchronized state. Preserve native app ID `dev.f-io.livi`, role title, transparent window and video underlay. The new compositor can route physical touches directly when the UI pixel is **exactly alpha zero** above the actual video rectangle. Glass/tint over that region blocks native touch. Do not duplicate physical touch over the JS socket. Mouse/keyboard ownership and native cancel on hide/disconnect still need separate verification.
5. Configure only observed dongle choices through the privileged configuration path. Confirm MFi succeeds, dongle Wi-Fi AP and supported Bluetooth are selected, while preserving the Pi's management connection. Some supported dongles are Wi-Fi only. This adapter deliberately does not authorize or expose configuration changes.
6. Keep multi-phone switching state-driven: available session uses selectDevice; offline remembered device uses connectDevice. A reply acknowledges a request, not a completed handover. Wait for active device state; do not steal an active session merely because another phone connects. Independent Bluetooth call/music roles are a different capability and are not implied.
7. Exercise Settings update with an actual newer custom-UI commit while the native engine stays alive. Confirm activation, renderer handshake, previous-release rollback, cancel/offline behavior and release SHA after restart. This button does not flash dongle firmware or update the native engine.

## Acceptance and evidence

Software checks: `npm test`, `npm run build`, `npm run test:electron:fixture`; explicit real local transport check: `node --test tests/protocol11-socket.mjs`. CI runs the socket check separately because some development sandboxes prohibit even private Unix socket binding. The fixture is a real Node socket, not a native LIVI process or hardware proof.

The added tests cover explicit version selection, protocol-8 compatibility, mismatch and unknown-version rejection, v11 two-phone state transitions, reply versus observed handover, revision-gap resync, bounded allowlist and pending-command retirement. The socket fixture checks actual framing/hello/welcome/reply transport. State fixtures use only the reviewed subset, not a claim to validate every upstream field.

Required device checks: native frame visible and aligned; physical touch corners/drag/multitouch/cancel; two phones connected and manually switched; disconnect/reconnect and wired/wireless transitions; music, navigation ducking, calls/mic/Siri; local audio ownership; dongle unplug recovery; UI crash/update without engine loss; desktop return and separate authorized reboot. Record each as passed, failed or not run. Session presence is not proof of decoded frames or audible output.

## Current boundaries

This adapter does not implement engine packaging, boot readiness, dongle provisioning, native dead-client input cleanup, calibration, phone-side pairing or physical testing. Current upstream socket input forwarding does not establish the old patch's per-client ownership cleanup; audit this before enabling additional UI-generated input. Do not silently apply the protocol-8 patch or claim its tests cover protocol 11. Current upstream also has a NOTICE file: preserve and review actual license/notice files for the chosen version rather than copying an old distribution statement.
