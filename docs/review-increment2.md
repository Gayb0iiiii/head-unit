# Increment 2: privileged host and controller review

Date: 2026-10-19 UTC

## Result

The source-level findings below were corrected and the final reviewed checkpoint passed **127 Node tests, 0 failures**, plus `npm run build`. No unauthorized IPC command, raw privileged bridge, or native-state disclosure was found in the reviewed boundary.

This is a **source and simulated-contract review**, not a live Electron, LIVI, browser, vehicle, or hardware validation. The native touch-release limitation below remains an integration gate. The scaffold must not be described as a working native head unit or production-ready control boundary.

## Scope and baseline

Reviewed in depth:

- `src/controller.mjs`, `src/preferences.mjs`, and `src/view.mjs`
- `src/session.mjs` action/input/path additions and `src/transport.mjs` connection lifecycle
- `electron/host.mjs`, `electron/main-boundary.mjs`, and the actual `electron/preload.cjs`
- Relevant controller, host integration, boundary, preference, session, transport, and public-view tests
- One-hop framing dependencies and the build's syntax-check coverage

Reference: the supplied read-only LIVI snapshot and `docs/upstream-contracts.md`, pinned to [LIVI 4bcd1335c2daedba40640e6dc432cd2ed7acfaa4](https://github.com/f-io/LIVI/commit/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4), version 9.5.0, control protocol 8.

This directory is not an accessible Git checkout. The surrounding `.git` directory contains no available repository history. Git status/history/blame could not establish a differential baseline, so this report does not claim a commit-to-commit review or any comparison with the unavailable v4 demo.

The privilege-crossing surface was treated as high risk. Dependency inspection found no production construction site connecting `HeadunitController` or `CoreTransport` to the preview. `CoreSession` is consumed by the transport, `publicView` by the controller, and the main boundary by the host attachment. The test paths exercise these seams, but the preview still imports its simulation model. The separately developed phone-arbitration and appearance-policy models are outside this report's source-review scope; their tests are included in the aggregate count.

## Findings corrected during review

### 1. Explicit pause could be undone by a synchronous stale snapshot

**Priority: high; corrected in `src/controller.mjs:31–35,69`.**

Reproduction: start with saved phone A and playback active, issue explicit pause, then reconnect with A active but paused. Sending the pause synchronously published the old `playing:true` state, changing the just-saved `resume:false` back to true. The next connection consequently sent an unwanted play action.

A pending-pause latch now prevents stale publications from overriding deliberate pause. A real transport/session/controller test covers this exact sequence, rather than relying only on an action stub that never publishes.

### 2. Phone return and control-channel recovery were conflated

**Priority: medium; corrected in `src/controller.mjs:22–35`.**

A phone could leave and return while the core socket stayed healthy without triggering the intended recovery. Conversely, ordinary control-channel resynchronization rearmed playback despite no observed phone absence. Recovery now follows the remembered phone's observed absence, while resync alone does not rearm it. Another active phone blocks recovery; a newly available second wired phone does not force selection. A choice is saved only when authoritative device status becomes active, not when an action is queued or acknowledged.

### 3. Restored routes were not consistently reported to core

**Priority: medium; corrected in `src/controller.mjs:17,38–44,63`, `src/session.mjs:18`, and `src/view.mjs`.**

Startup and projection-to-Home transitions changed the local route without reporting the new UI path. Camera and cluster paths also needed inclusion in the narrow reporting allowlist. The corrected controller follows authoritative front changes, reports its current route, and exposes camera/cluster ownership truthfully. Native overlays do not replace the persisted explicit preference. Home requests the LIVI front and waits for authority without disconnecting or forgetting a phone.

A further pressure regression was corrected: a failed path write no longer marks the route as reported or prevents public-view publication. A same-session drain publication can retry the latest path; commands and touch input are not replayed.

The no-phone projection fallback also now reports `/phones` immediately before publishing that view. Its final regression verifies it cannot leave the core reporting the previous Home path until another update.

### 4. A startup camera overlay consumed projection restoration

**Priority: medium; corrected in `src/controller.mjs:42`.**

With projection saved and an active phone, an initial camera snapshot set startup restoration complete. When the camera returned control, the view stayed on Phones. Restoration is now deferred while camera/cluster owns the front; it does not send a command to dismiss that override. Tests cover this deferred transition.

### 5. Multitouch frames omitted held contacts or reordered them

**Priority: medium; corrected in `src/controller.mjs:71–77`.**

Sending a second finger originally omitted the first held contact. An initial full-frame correction then moved changed contacts to the end, causing `[0,1]` to become `[1,0]` when only finger 0 moved. The pinned CarPlay conversion drops point IDs when constructing its ordered touch vector, so preserving the established order is important. The final synthesis includes held contacts in stable order and substitutes immediate edge/move updates in place. Tests cover moves and releases of an earlier contact.

### 6. Renderer loss did not release the controller's held contacts

**Priority: medium; corrected in `electron/main-boundary.mjs:79–110`.**

Navigation, renderer crash, window destruction, and boundary detachment initially removed subscriptions/handlers without requesting touch cancellation. Trusted host lifecycle handlers now issue the narrow cancellation intent. A regression using the real controller covers all four triggers and verifies that subframe navigation does not cancel the main renderer's contact. Detached-frame send errors are also contained.

### 7. Socket pressure could discard the cancellation frame

**Priority: medium; mitigated in `src/transport.mjs:36–45,65–68,89`.**

After a down report filled the write buffer, a cancellation was previously refused like ordinary input, while the controller cleared its contacts. The transport now permits one bounded cancel-only frame, at most ten contacts, during an undrained interval. Repeated cancellation writes remain blocked, and disposal discards that generation. This is not an input replay queue or proof that the phone physically received the release; see the native gate below.

### 8. Backpressure during resync permanently stopped managed recovery

**Priority: medium; corrected in `src/transport.mjs:36–44,102–104`.**

Reproduction: accept an action with `socket.write(false)`, then receive a revision gap. The required resync write threw due to pressure, and the generic receive-error handler incorrectly classified it as terminal. A recoverable-send error now preserves managed backoff. Tests verify the accepted action is not replayed, one-shot connections do not gain retries, and malformed frames remain terminal.

### 9. Unchanged state caused repeated preference rewrites

**Priority: low; corrected in `src/controller.mjs:16`.**

One hundred identical native publications caused one hundred atomic preference replacements. The controller now saves only when the allowlisted serialized preference fields change. The file still stores only route, last successful chosen phone, and prior playback intent, using a private temporary file and atomic rename.

### 10. Action IDs could exceed the upstream u32 contract

**Priority: low; corrected in `src/session.mjs:19`.**

The monotonically increasing identifier had no upper bound. It now fails closed before exceeding `0xffffffff`; a regression verifies that no out-of-range command is sent. Recreating the session is required if this extremely long-lived limit is reached.

## Boundary and lifecycle checks

- Incoming IPC requires the exact owning WebContents, its actual current main frame, and exact canonical trusted document URL in both URL checks. Other windows, subframes, missing frames, query/hash variants, changed URLs, and in-flight main-frame navigation are denied before controller dispatch.
- The preload exports fixed methods/channels only. It exposes no generic IPC, core/session/transport object, Node API, event object, or raw command method. Returned views are allowlisted again in main. Native exception text is replaced before crossing IPC.
- The host verifies context isolation, sandboxing, disabled Node integration/webviews, enabled web security, and the expected local preload. It denies popups, navigation, redirects, and webview attachment.
- Pending actions are bounded and correlate to replies. Reply means accepted/queued, not successful phone connection or media playback. Connect, handshake/resync, and reply waits have deadlines. Managed retry is explicit, capped, generation-safe, and stops for refusal/incompatibility/corrupt frames.
- Late socket events and canceled timer callbacks cannot change a replacement session. Inputs and arbitrary actions are not queued for reconnect. Old contacts are cleared rather than replayed.
- Preference paths are supplied by trusted host code, not IPC. Files use owner-only mode and fixed fields. Browser appearance/navigation storage is a separate simulation concern.

## Verification

Final independently executed commands after the host/controller fixes:

1. `npm test`: **127 passed, 0 failed, 0 skipped**.
2. `npm run build`: exit 0. The build dynamically syntax-checks every `.mjs`/`.cjs` in `src` and `electron`, then produces the static preview.

Both npm commands emitted the environment warning about the deprecated `http-proxy` configuration key. No application test or build failure remained in that run. Concurrent work may add more tests after this report; the count here records the reviewed run rather than claiming future changes passed.

The Electron tests execute the real preload source in a Node VM with Electron replaced by a test double, plus real controller/session/transport composition with fake EventEmitter sockets. These verify observable contracts and injected failure paths. They do not establish real contextBridge process isolation or real socket delivery.

## Remaining native and deployment gates

1. **Physical touch release on native overrides or connection loss is unverified.** The pinned [projection pointer handler](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/bin/livi-core/src/projection.rs#L1614) ignores pointer messages once the native front is no longer projection. Sending a cancel after a camera transition therefore does not prove the phone received it. The reviewed [server disconnect path](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/bin/livi-core/src/server.rs#L326) logs disconnect without an explicit input-release operation. The real host/core must own and validate contact release on focus/client loss before physical deployment. Clearing a JavaScript map or closing the socket is insufficient evidence.
2. **Real Electron/runtime checks were not run.** No window, custom protocol, Chromium isolation, compositor surface, native visibility/focus, or authenticated Unix peer was exercised. Configure a trusted local runtime directory; an absolute path named `core.sock` is not server authentication. Retain an appropriately restrictive resource/CSP policy when wiring real renderer data.
3. **Browser and baseline routes stayed blocked.** No browser attempt, v4 file-access retry, or workaround was made during this review. No screenshot, responsive-layout pass, or merge with the existing vehicle service is claimed.
4. **Hardware behavior remains untested.** No real phone pairing/switching, calls/Siri/reverse arbitration, music/audio/microphone loopback, MFi adapter, touch coordinate transform, or renderer move coalescing was executed. The host follows core front authority; it does not independently identify or implement native call/Siri focus policy.
5. **Power-loss durability is not established.** Atomic rename protects against a partially written preference file, but the implementation does not fsync the file/directory. Normal reload persistence tests do not prove ignition-cut persistence.
6. **Broader protocol parity and load remain limited.** State validation is intentionally shallow; malformed JSON is rejected more strictly than upstream; large frames/deep clones and sustained traffic have not been benchmarked. The prototype does not implement every upstream side channel such as telemetry-driven `openPage` or native spectrum subscriptions.

These gates do not negate the source/test improvements, but they prevent treating the checkpoint as deployment approval.
