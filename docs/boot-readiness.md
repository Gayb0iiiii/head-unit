# Owned-child readiness transport and process evidence

The child responder is now wired to supervised Electron lifecycle state over its existing connected parent IPC channel. Parent-side evidence/correlation and the coordinator remain unwired. This does not enable boot coordination, create sockets, change logind policy, install services, spawn production processes or create persistent credentials.

## Implemented boundary

`process-instance.mjs` reads fixed Linux `/proc/<numeric PID>/stat`, `status`, `cgroup` and the kernel boot ID. Reads are capped at 64 KiB and file handles close on every path. It validates all four UID fields, parses start ticks despite spaces/parentheses in process names, extracts only an actual cgroup session ID, and repeats stat/UID/cgroup observations to reject PID replacement, ownership changes or inconsistent snapshots. The instance digest binds boot ID, PID, start ticks, UID and cgroup. A process without a logind session returns `sessionId:null`; it never borrows an environment variable or invents a session.

`createOwnedReadiness` accepts a ChildProcess already owned by its host caller. Initial evidence must establish the expected UID and parent PID. It uses that child's inherited Node IPC channel, not a filesystem pathname or public socket. Each probe has a fresh random in-memory challenge; exact-schema replies must match it. Before returning readiness it re-reads the process identity and requires the same process instance, parent, UID and session. A changed or absent identity fails closed. No child-supplied PID, session, timestamp or instance is trusted. The host supplies the observation time. Positive readiness is never cached across probes.

`attachReadinessResponder` belongs only in the known child's trusted main process. Its injected `isReady()` must consult current lifecycle state (including renderer readiness and loss). It does not accept a renderer readiness boolean directly and does not infer readiness from process existence. Unknown fields, wrong kinds and malformed challenges are ignored; false, failed or timed-out readiness produces false. This transport proves a reply came through the owned child channel; it does **not** prove pixels, touch, compositor health or the trustworthiness of arbitrary child code.

Both sides limit concurrent work and bound asynchronous operations to configured deadlines (1–5000 ms). Parent probes clear message/lifecycle/abort listeners and timers on settlement; disposal, disconnect, exit, abort and send failure resolve unavailable. A late response cannot satisfy a subsequent challenge. A responder removes handlers on disposal; an already-running readiness check may settle only until its bounded deadline and sends nothing after disposal. No actual child is killed by these helpers. The test fixture's real Node child is separately cleaned up by the test owner.

Host dependency injection is for tests and integration; callers must not source `parentPid`, UID, the ChildProcess, clocks or evidence readers from a renderer or untrusted request. Same-user process compromise is outside this IPC trust boundary; this is not isolation against arbitrary code already running as the host owner.

## Remaining cross-session gap — boot stays blocked

The current UI supervisor owns Electron, so it can potentially attest that child's lifecycle using this private channel. The independent systemd Plasma session and UI session are not both children of a common unprivileged boot coordinator. No secure cross-session aggregation path has been implemented. A merely owner-only pathname plus caller-supplied identity is not accepted as a substitute for authenticated sender identity.

The new instance is **per process**, while the coordinator requires a consistent role/session-instance proof across Cage/Electron or KWin/Plasma. A reviewed correlator must establish current ancestry/session membership, validate the actual executable/owned launch context and map the child proof to the same session instance as process discovery. It must expire evidence on lifecycle changes and verify actual logind identities. Copying the Electron digest onto unrelated Cage/Plasma observations would be incorrect.

Missing pieces before activation:

1. Child-side lifecycle binding is implemented below. The owning supervisor still needs a reviewed query/correlation integration; the release-ready protocol remains unchanged.
2. Define and verify a real desktop readiness source, not a constant true or just the existence of plasmashell.
3. Implement/review cross-session aggregation with authenticated peer identity (for example, a reviewed Linux peer-credential transport) or a genuinely common owned parent. No dependency or privilege exemption is added here to manufacture that capability.
4. Correlate process proofs with logind session/seat/VT evidence and connected-display state; test process/session replacement end-to-end.
5. Verify the coordinator's actual logind activation authorization, explicit foreground/readback and fallback on the Pi under separate installation authorization.

No service starts a coordinator or aggregator, and boot enablement remains blocked. SSH, remote LXQt, desktop services, credentials and Pi settings are untouched.

## Verification

682 Node tests pass, including 27 focused coordinator/transport/evidence tests; production build and Unix-socket fixture pass. The focused suite includes a real unprivileged Node child exchanging challenges over inherited IPC and a read of the current Linux process; these are not systemd/Plasma/Electron/VT tests. Adversarial cases cover wrong parent/UID, PID reuse, malformed/ambiguous evidence, replay, extra fields, changed session, timeout, cancellation, send failure and listener cleanup.

Coordinator review gaps are covered: future readiness timestamps, foreign session UID, already-active target, malformed activation acknowledgement, disposal during activation and disposal during readback. Evidence is in `evidence/boot-readiness/`. No physical VT, hotplug, board reboot or power-loss validation occurred.

### Correlation and freshness follow-up

The [read-only session correlator](session-correlation.md) now maps an authenticated process proof to a separately verified common logind leader instance. It does not authorize a role reporter or relay readiness across sessions. The aggregator decision and remaining registration/desktop-readiness gates are documented there. The transport now preserves probe-start time and rejects evidence older than two seconds after identity validation, fixing the independent review's freshness defect; it never renews readiness merely because validation completed.


## Supervised Electron responder wiring

`application.mjs` attaches the responder only after single-instance ownership and only when `HEADUNIT_SUPERVISED=1` and the inherited parent IPC channel is connected. Readiness requires the existing trusted renderer acknowledgement and completed window-show step, a non-destroyed window/webContents, visibility when observable, and no shutdown/revocation. It adds no public socket, renderer IPC method, command, service or permission.

Shutdown, renderer death/unresponsiveness and webContents destruction detach the responder and suppress in-flight replies. A replacement main document after renderer acknowledgement or window show revokes the old document's proof; same-document/subframe navigation does not. Revocation is permanent for that application instance: restart is required to re-attest, rather than reusing the one-shot renderer acknowledgement. The existing release activation `ready` message, SHA, timing and one-shot behavior are unchanged and regression-tested.

Fake-Electron tests cover pre-ready, renderer-ready-before-show, ready, hidden, destroyed, late renderer callbacks, SIGTERM/before-quit/crash/unresponsive disposal, in-flight loss, navigation and unsupervised/disconnected launch. **712 tests**, **34 focused application/readiness tests**, build and Unix-socket fixture pass. Evidence: `evidence/renderer-readiness/`. The tests do not launch Electron, switch VTs or prove visible physical pixels.

Remaining acceptance gates: authenticated cross-session role registration/aggregation; a real desktop readiness source; parent-side correlation integration; actual logind authorization; persistent local desktop and Return shortcut installation; physical display/touch/audio/phone validation; foreground/readback/hotplug and controlled reboot/power-loss acceptance. Boot remains blocked, and this wiring does not satisfy those gates.


### Pre-show navigation review

The independent fake-Electron sequence (renderer acknowledgement, replacement main-document navigation before window show, then load/show) reproduced a readiness=true response based on the old acknowledgement. Revocation now starts once either the renderer has acknowledged or the window has been shown. The regression verifies legitimate initial navigation before acknowledgement remains allowed and the existing release-ready signal/timing is unchanged. This is a reproduced state-machine gap, not a demonstrated real Electron ordering or physical exploit; renderer-initiated navigation restrictions remain intact. **713 full-suite tests**, **35 focused tests**, build and socket fixture pass. Evidence: `evidence/preshow-readiness/`.
