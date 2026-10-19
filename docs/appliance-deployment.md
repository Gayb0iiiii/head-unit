# Appliance startup and recovery design

Status: **DESIGN / NOT INSTALLED**. Pinned source: `f-io/LIVI@4bcd1335c2daedba40640e6dc432cd2ed7acfaa4` (9.5.0, control protocol 8). This document describes the proposed native integration and acceptance gates. The adjacent JavaScript lifecycle policy is a pure model with injected/fake effects; it is not a service manager, native watchdog or proof of an appliance booting.

No services, autologin, permissions, security settings, host-power settings or hardware configuration were changed. No LIVI/native process or installer was executed. Files in `deployment/` are inert `.example` design inputs, disabled and deliberately missing executable paths; no code currently loads them.

## Intended result and ownership

Automatic startup should reach a fullscreen main shell only after a usable outer Wayland session and a responsive, correctly versioned engine with its inner compositor. A shell crash or hang should restart only the shell, keeping the core and phone sessions alive where the native services remain healthy. Recovery must be bounded; repeated failures latch a clearly identified unavailable state rather than loop forever.

There must be exactly one restart owner for each process:

| Resource | Sole proposed owner | Boundary |
| --- | --- | --- |
| Outer Wayland session | A future, explicitly installed appliance manager/session provider | Manager verifies readiness; it must not launch a duplicate of an existing desktop session. |
| `livi-core` process | Future outer appliance manager | Owns core lifetime and engine-level bounded recovery. A display failure makes the engine's nested display invalid, so dependency teardown is ordered before retry. |
| Nested `livi-compositor` | LIVI core | Preserve native supervision. Never add an external competing compositor launcher. |
| Electron shell process, including main/cluster/aux windows | Patched core `UiSupervisor` | Sole owner of shell start, stop, retry budget and hang deadlines. A pure policy's shell effect must be delivered to this owner, not spawned by an outer script. |
| Individual Electron windows/preloads | Electron main, within the core-owned shell process | Owns window construction and reports observed health; it must not run an independent perpetual app-relaunch loop. |
| Native helper, GStreamer, projection/audio | Their existing core/native owners | Do not restart them merely because the HTML shell failed. |
| Recovery overlay | Proposed compositor-owned native presenter | Survives the shell. Core commands it using its existing exclusive compositor connection plus a deliberately added recovery command. |

The pure model can describe all lifecycle effects for testing, but a future production adapter must partition them by these owners. Do not run an outer shell supervisor with stock core UI supervision still active. Do not use `LIVI_NO_UI=1` as a shortcut without replacing display discovery, lifetime and supervision contracts deliberately.

### What upstream currently does

- Core starts helper, nested compositor and UI; UI waits for the compositor's inner-display announcement (`native/livi-helperd/bin/livi-core/src/services.rs:106-155`; `ui.rs:91-100`).
- Abnormal UI process exit retries after 1 second, at most five retries; the counter resets after 30 seconds of stable lifetime. Spawn failure, a successful UI exit, or exhausted retries quits core (`ui.rs:11-14,104-140`). This does **not** satisfy independent UI recovery after exhaustion.
- Compositor process exit quits core; core shuts down UI before compositor before helper (`services.rs:43-55,189-200`). Core lifeline EOF also stops the compositor (`native/livi-compositor/rust/src/ctrl.rs:17-41`). A compositor/engine failure is a different failure domain from a shell failure.
- Renderer-process loss currently only logs (`src/main/window/createWindow.ts:227-229`). There is no renderer/main-loop heartbeat in protocol 8 (`native/livi-helperd/crates/livi-core-proto/src/message.rs:12-75`).
- The compositor accepts a connection by replacing its one `ctrl_client` (`native/livi-compositor/rust/src/ctrl.rs:61-67`). An external watchdog must **not** connect to `compositor.ctrl` to read readiness or ping it; that would displace core.

All unqualified `ui.rs`, `services.rs`, `main.rs`, `server.rs`, `projection.rs` and `child.rs` references in this document mean `native/livi-helperd/bin/livi-core/src/<file>`.

## Ordered startup and meaningful readiness

1. **Outer Wayland ready.** Verify the intended session belongs to the approved target user, and perform a real Wayland connection/round trip against the expected display. Environment variables or a socket pathname alone are insufficient. Verify the required EGL/GLES path separately. The nested compositor calls `Connection::connect_to_env()` and expects the outer globals (`native/livi-compositor/rust/src/host.rs:198-247`). No installed/display-ready state is claimed here.
2. **Engine starting.** Launch exactly one reviewed, built core with explicit resource roots and known config/runtime paths. Hold its owned process handle and lifetime identity. Core startup has host effects, including WirePlumber configuration and possible privileged udev/Wi-Fi setup; a plain core launch is not a read-only health check. See `native-shell-integration.md` and `runtime-validation-gate.md` before authorizing a lab launch.
3. **Engine protocol and inner compositor ready.** A same-UID control connection must receive a valid protocol-8 welcome, validate expected version/pin identity, and confirm a fresh inner-display/render path announced to the core owner. `server.rs:239-269` validates UID and protocol. A valid welcome proves the control loop answered; it does not prove pairing, audio, video decode or every projection task works. Optional hardware absence should be explicit capability state rather than an endless startup wait.
4. **Shell starting.** Only the core UI owner may launch the reviewed shell command, with the inner Wayland environment, core socket and stdin lifeline inherited. Strict handshake-before-shell ordering needs a native refactor: today `main.rs:221-234` calls `Services::start`, which schedules UI before `server::serve` starts, and `ui.rs:91-100` gates only on the display. Add an explicit engine-ready gate instead of assuming process order guarantees readiness.
5. **Shell ready.** Require an observed main surface classified as the correct role/app ID, intended fullscreen state, trusted renderer document loaded, bridge initialized, current core snapshot applied, and a fresh renderer/main event-loop response. BrowserWindow existence or `ready-to-show` alone is insufficient. Add a core/compositor acknowledgement path for surface/fullscreen evidence; it is not currently in protocol 8.
6. **Operational.** Release recovery masking/input inhibition only when the required role set is ready for this spawn epoch. A connected phone is not required merely to show the home screen; actual native projection/audio availability must remain separately reported.

### Fixed display contract

- Inner UI app ID: **`dev.f-io.livi`**. Core sets `LIVI_OUTPUT_APP_ID` to it (`native/livi-helperd/crates/livi-media/src/compositor.rs:15-20`). Initial surface app ID mismatch becomes `Kind::Dialog`, preventing normal role layout/fullscreen (`native/livi-compositor/rust/src/shell.rs:132-150,337-355`). Verify actual compositor classification, not just package metadata.
- Main is the default role; secondary initial window titles must be `livi:cluster` and `livi:aux`. Renderer roles also travel as `?role=cluster`/`?role=aux`. Preserve these two separate mechanisms (`src/main/window/secondaryWindows.ts:124-180`). Required roles are main plus the configured active secondary roles; do not wait for disabled windows.
- Preserve transparent, frameless compositor windows, content sizing and per-role fullscreen. Stock main fullscreen waits 400ms for outer output geometry (`src/main/window/createWindow.ts:37-69,154-195`). A new readiness acknowledgement should observe the resulting geometry/fullscreen, not treat that delay as proof.
- `LIVI_UI_CMD` uses `/bin/sh -c`; the shell override must explicitly include Electron's `--ozone-platform=wayland`, since core only appends that flag for its built-in Exec mode. Preserve injected `WAYLAND_DISPLAY`, `LIVI_CORE_SOCKET`, `LIVI_COMPOSITOR`, optional render node and lifeline (`ui.rs:50-79`).
- Leave `LIVI_KIOSK` unset in the initial lab contract and request visual fullscreen through config. `LIVI_KIOSK=1` changes Quit/Restart into host-power semantics (`native/livi-helperd/bin/livi-core/src/power.rs:22-43`; `main.rs:87-101,245-250`). An appliance installation may intentionally require different policy, but that is a later explicit decision. Do not use core `Quit`/`Restart` actions as a watchdog's generic process restart mechanism.

## Health, retries and the latched recovery state

### Health is a proposed local contract

The lifecycle worker's readiness/heartbeat events are **proposed owner-to-policy events**, not new JSON frames supported by protocol 8. Production wiring remains to be implemented. The pure model currently identifies the main shell role and uses a logical `appliance-presenter` effect owner; production must map that presenter to the independent native path below, and add required-secondary-role/document and actual display evidence. A presenter effect owner label does not mean a second Electron launcher.

- Use monotonic time, an explicit process generation/spawn epoch, expected role and a fresh challenge identifier. Reject delayed responses from prior children/old documents. The owning supervisor timestamps receipt; the renderer cannot extend its own deadline using an arbitrary future timestamp.
- Keep separate health evidence for outer display, core control responsiveness, Electron main event loop, required renderer event loops and compositor presentation. A main-process timer does not prove its renderer is alive; a renderer timer does not prove GPU presentation or touch works.
- Core control liveness may use a dedicated same-UID read-only client and bounded fresh hello/welcome or one outstanding resync/welcome. Resync already exists (`server.rs:283`), but has no correlation nonce; serialize requests and discard the connection on timeout. Do not reuse the shell's stateful session for watchdog polling, because a welcome also replays shell intents. An idle revision stream is normal and must not be treated as a heartbeat failure.
- Add a private core-owned UI health channel, distinct from the browser's public intent bridge and existing lifeline pipe. Electron main relays bounded authenticated acknowledgements from its exact required documents. No arbitrary PID, command, path or raw IPC capability reaches the page. Explicit peer/process generation validation and framing/backpressure limits are needed.
- Native projection task health needs separate observations if it becomes a recovery trigger. A responsive core control socket can coexist with a stalled decoder or projection actor. Do not label the whole engine healthy from hello/welcome alone.

### Proposed lab defaults

These match the pure policy proposal and are **unmeasured initial test parameters**, not timing guarantees:

| Budget | Proposed value |
| --- | --- |
| Outer Wayland startup | 10 seconds |
| Engine welcome plus inner-compositor readiness | 15 seconds |
| Shell readiness | 10 seconds |
| Ready-component heartbeat grace | 5 seconds, with an adapter challenge around every 1 second |
| Owned graceful stop | 3 seconds |
| Forced-stop observation | 2 further seconds |
| Automatic retries | 3 retries per component per explicit lifecycle, after initial attempt |
| Backoff | 500ms, 1000ms, 2000ms; configured cap 4000ms |

A retry is allowed only after the previous owned child is **observed stopped**, not merely after a stop signal was requested. If stop cannot be confirmed, latch and refuse a duplicate spawn. Stop dependencies in reverse order. A successful ready/heartbeat event must not replenish retry counts; only a deliberate, authorized new lifecycle/recovery reset may reset them. An outer installed service must not silently reset these budgets through perpetual `Restart=always` behavior. Any later service-level restart policy must share a persistent/restart-surviving budget or stop after the manager latches.

### UI-only failure

1. Core detects current-shell process loss or missed health deadline.
2. Core revokes that shell generation's input ownership and releases held pointer/PTT state natively. Existing client disconnect only returns/logs (`server.rs:273-327`), and core ignores pointer input when projection is no longer front (`projection.rs:1614-1617`). Therefore whole-process death cannot rely on a JavaScript cleanup callback; a native release path must work independently of current `front` and the dead client.
3. Core requests the compositor-owned opaque recovery overlay for the failed shell surface and inhibits input from that failed shell generation. The recovery layer must not cover a healthy authoritative reverse-camera or call/Siri attention surface, and must not suppress independent critical cluster/LED warnings. Preserve native safety/attention ordering; never present an old camera frame as live. Keep preferred routes and phone sessions separate from this health gate. Do not send fake user `show` commands that alter phone/attention state merely to hide stale UI.
4. Stop/reap the owned shell generation; restart only it within the budget. Core PID/session identity should remain unchanged. A restarted shell rebuilds all active roles and obtains fresh authoritative state; never replay queued touches/media/device-switch actions.
5. Clear the overlay only after the new shell's readiness is observed. On exhausted attempts, retain engine state and recovery latch rather than killing core or looping. Retaining a process does not itself prove an uninterrupted phone session; acceptance tests must check audio/session continuity.

### Recovery screen evidence and limitations

The failed Electron shell cannot render its own fallback. The proposed minimal presenter belongs to the **nested compositor**, uses native drawing already available there, and shows a fixed neutral message such as “Display unavailable. Recovery paused.” It must not show stale vehicle values, animated dashboards or enabled touch controls. This presenter and its recovery command/acknowledgement are new native work, not delivered UI features.

`showRecovery` means only **requested**. Track presentation acknowledgement for the current generation separately. A command acknowledgement or scene construction alone still does not prove the monitor emitted a picture; real acceptance needs visible capture/observation. Keep overlay redraw/confirmation bounded. If the compositor, outer display or GPU is broken, only the latched control state and logs are reliable: no on-screen fallback can be guaranteed. If a later requirement calls for an outer-session recovery presenter after core/compositor loss, it must be a separately reviewed minimal native process with its own bounded start and visibility evidence, not another instance of the failing shell.

During UI recovery the native engine and its established audio/call session are preserved by default; audio behavior is not changed by this visual fault policy. Ignition standby is a separate requirement below. Any later change to fail-muted behavior needs an explicit product decision and call/emergency-use testing.

## Required native integration changes

| File / subsystem | Necessary change before production claims |
| --- | --- |
| `native/livi-helperd/bin/livi-core/src/ui.rs` | Replace “UI closes/exhausts → quit core” with opt-in appliance policy: explicit start/stop/readiness states, bounded restart budget, generation-safe health deadlines, stopped acknowledgement and recovery latch. Existing desktop behavior should remain selectable. |
| `native/livi-helperd/bin/livi-core/src/main.rs`, `services.rs` | Split protocol/listener readiness and native display readiness from UI launch; expose owner events internally; preserve single compositor/UI owner. Distinguish deliberate core shutdown from UI failure. |
| Core input ownership: `server.rs`, `projection.rs` | Bind input to the registered shell generation; track/revoke held contacts and PTT on channel/process death; allow safe native release independent of front changes. Keep ordinary viewers from claiming the shell role. |
| `native/livi-helperd/crates/livi-media/src/compositor.rs` | Extend the core-owned control channel with bounded recovery state and presentation/readiness acknowledgements. Do not create a second reader/client. |
| `native/livi-compositor/rust/src/{ctrl,state,render,deco,input,shell}.rs` | Add per-role recovery overlay state/drawing, input inhibition, generation-aware surface classification/fullscreen observations and a recovery acknowledgement. Keep rendering independent of Electron. Existing drawing infrastructure is in `deco.rs:1-16,115-166` and `render.rs:1-25`. |
| Electron main/preload integration | Add required-role health challenge/response, trusted-document generation checks, renderer-loss reporting, and readiness after real bridge/snapshot/layout setup. Keep privileged socket transport in main for the new sandboxed headunit preload. |
| Outer manager / eventual deployment | Implement only after approved target/toolchain/display provisioning. Own outer/core process handles, dependency teardown and finite retry budget. Define controlled stop and restart-surviving latch before any service registration. |
| Tests | Add Rust/native owner tests and real staged fault tests, alongside the pure JavaScript policy tests. Pure model success does not verify process signals, EGL, compositor presentation or phone continuity. |

Protocol-8 changes are not required merely to document the model. If health/control fields are later added to the public core protocol, change the version, generated TypeScript contract and both ends together. Prefer a narrow private owner channel for appliance control so ordinary UI clients cannot restart arbitrary processes.

## Power UX requirement: recorded only, no implementation

- Sustained ignition-off should turn the **display and audio output off**. This does not by itself mean shutting down or suspending the computer.
- Tolerate 1–2 second ignition dips and cranking without false standby or repeated boot cycles. The sustained-off threshold, hysteresis and wake timing remain to be agreed/tested against a real input source; no production debounce value is selected here.
- Desired Raspberry Pi sleep/wake behavior is recorded, but support is **unverified for the actual board, firmware and OS**. No suspend/resume promise, GPIO action, shutdown command, power-helper change or hard power cut is included.
- Keep standby policy separate from crash recovery. A legitimate display/audio-off state must not appear as a hang and trigger reboot/relaunch loops. Resume must restore intended output state safely without resurrecting stale touches or overwriting the user's stored volume.
- Never hard-cut power as a software recovery action. Hardware power supply/hold-up, ignition sensing, safe shutdown and wake support require a separate target-specific review and explicit authorization.

## Staged acceptance plan

Run only on a separately approved stationary lab target with known ownership and rollback, after source/build/runtime gates pass. Do not test faults while driving, during real calls, or on an unapproved desktop/session. Fault injection is an acceptance plan here, not executed commands.

1. **Pure model:** fake time/process/health events cover ordered startup, stale generation rejection, retries, stop confirmation, latch persistence and showRecovery intent vs confirmed display. Confirm no native launches or power effects are possible from the module itself. Report exact test result, not “appliance passed.”
2. **Native build and owner wiring:** compile the pinned native modifications, validate expected artifact identity, required role schema and permissions. Verify that only core creates shell children and no additional process opens compositor.ctrl. Exercise explicit shutdown without host power actions.
3. **Cold start/fullscreen:** real outer Wayland → core welcome+inner display → main and active secondary windows. Observe actual app IDs/roles, fullscreen geometry, alpha underlay, focus and input. Test absent optional phone/camera/secondary display without infinite waits. Record startup times against the proposed budgets; tune from evidence.
4. **Shell process crash:** fault only the owned Electron process. Verify the same core PID/epoch and native sessions persist, contacts/PTT release, independent recovery screen appears, exactly one replacement shell is created, and config/preferences/pairings survive. Confirm all active roles return without competing `show` writers.
5. **Renderer and main-loop freezes:** separately stall the current renderer and Electron main on the lab build. Verify the correct deadline fires even when one loop still runs; stop escalation is bounded, old acknowledgements cannot restore health, and no new child starts before the old child is confirmed stopped. Verify actual on-screen recovery and native session behavior.
6. **Crash loop / unkillable child simulation:** exhaust the exact budget. Verify recovery latches, no automatic reset from a stale or later heartbeat, no perpetual supervisor/service restart, and a deliberate reset is required. If a real child cannot be confirmed stopped, no duplicate is launched.
7. **Core/compositor/outer-display failures:** test each separately. Expect dependency teardown and bounded engine-level recovery, with possible session interruption. Do not apply the “engine preserved” claim to these failures. If rendering is unavailable, record latched/logged failure and explicitly mark recovery-screen presentation unavailable.
8. **Reconnection and input:** while stationary, verify crash/restart during held touch/PTT, phone switch, call/Siri/reverse interruptions, rotation/crop and fullscreen transitions. No held input, stale click, old device action or lost manual preference may replay after recovery.
9. **Standby requirements later:** after hardware capability/ignition design is approved, test 1s/2s dips, cranking, sustained off and wake. Validate display/audio state separately from machine power. Until then this remains an unimplemented requirement, not an acceptance result.

Required evidence for each real fault: pinned binary hashes/build identity; component generation/PIDs; monotonic timestamps and retry counts; requested vs observed stop/readiness/recovery state; compositor role/fullscreen logs; visible screen evidence; native phone/audio observations; and restoration/rollback outcome. Redact phone identifiers and config secrets in shared logs.
