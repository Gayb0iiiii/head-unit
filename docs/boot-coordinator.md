# Bounded boot session coordinator — inactive component

`electron/boot-coordinator.mjs` implements host-side session selection with injected discovery and activation providers. Nothing imports it from the deployed launcher, Electron entrypoints or service templates. It cannot launch/stop services, invoke a shell, select a renderer-supplied destination, install policy or change SSH/VNC. **Joint boot enablement remains blocked.** This is executable/tested coordination logic, not a completed production boot integration.

## Selection and fallback

One instance owns one boot selection. Concurrent `run()` calls share one promise; completion is retained. It never monitors the seat afterward or steals focus from a later manual Desktop switch. A new boot owner must create a new coordinator; merely restarting Electron must not automatically reactivate the head-unit VT.

Discovery must establish a connected display and exactly one eligible same-user local seat0 session per role, on different positive VTs. The UI requires a matching Cage/headunit process. Desktop requires matching KWin plus Plasma with verified Wayland socket evidence. Remote sessions, foreign UIDs, ambiguous roles, missing/future/older-than-two-second readiness and mismatched process instances are rejected. Process presence alone is insufficient.

The coordinator waits for both roles, re-discovers immediately before activation and checks identity/instance/VT again. It selects the head-unit only with an available verified desktop fallback. An already exclusively active target needs no activation. An acknowledged activation succeeds only after fresh discovery confirms that the same ready instance is the sole active seat0 session.

After readiness exhaustion or explicit activation rejection, it attempts only a freshly verified desktop. No verified target yields `recovery-required` without service operations: SSH, remote desktop and existing TTY recovery are left alone. Missing display causes no local activation. An activation exception, timeout, malformed acknowledgement or unobserved activation is **uncertain**: it does not issue a competing fallback activation, since the first request might still complete. The production owner must surface this outcome and retain recovery access; it must not label it successful boot.

Every discovery/activation call has a deadline and AbortSignal; polling is finite and cancellation settles pending coordinator calls. Defaults: 40 readiness attempts, 250ms poll delay, 2s per provider call, at most three readbacks after activation. All configured counts/durations are bounded. The conservative operation budget is `(attempts + 10) * callMs + (attempts + 3) * pollMs`, plus event-loop scheduling overhead. A timed-out provider may still have external effects if it ignores cancellation; late completion is ignored and no second activation is attempted. Disposal cannot undo an already sent logind call.

## Required production provider contract (not implemented)

`discover(signal)` must return one bounded coherent observation:

- `displayConnected`: verified local display availability, not merely existence of `/dev/dri/card*`.
- `sessions`: existing parsed logind identities plus `instance`, an opaque token tied to the current boot/session/process-start identity. Do not use a reusable session ID or PID alone.
- `processes`: owner/session-verified Cage/KWin/Plasma observations with the same instance token. The existing process census does **not** yet supply this token.
- `readiness.headunit` / `readiness.desktop`: `{sessionId, instance, ready, observedAt}`, where observedAt uses the coordinator's monotonic clock. The provider must independently establish readiness, expire it on process loss and never refresh a stale claim simply because discovery ran.

Head-unit readiness must originate from the owned supervisor/Electron lifecycle, with the renderer readiness acknowledgement tied to the current child and verified logind session. The existing child ready message/commit check is useful input but is not a complete cross-session proof. Desktop readiness requires a reviewed provider beyond the mere presence of KWin/Plasma; physical pixels remain separately unprovable by these messages. Transport for these observations must be authenticated, owner-only and lifecycle-bound; do not create a writable public ready file or renderer-controlled flag.

`activate(id, {instance, signal})` must revalidate that exact target, call only the bounded logind activation interface, honor cancellation where possible and return `{accepted:true}` only after the call completes. `{accepted:false}` means definite rejection with no pending activation; uncertain results must reject or omit a definitive acknowledgement. This function is privileged host wiring, never renderer input. Existing manual handoff uses loginctl with normal authorization; no broader policy exemption is added here.

Remaining integration decisions: which persistent same-user boot owner gathers both session readiness sources; secure readiness transport and process-start tokens; actual logind authorization from that owner; coordinated per-service failure behavior/getty restoration; display hotplug policy; and foreground readback on the real Pi. None can be inferred from `After=` or `WantedBy=`.

## Verification and acceptance

Twelve tests exercise the real coordinator with fake logind/session snapshots: simultaneous startup, delayed renderer readiness, verified desktop fallback, no display, stale/remote/ambiguous/malformed proofs, process replacement, explicit rejection, hung discovery, uncertain and late activation, competing active sessions, disposal and no readiness. No system bus, compositor, login session or VT is touched. Full suite: 667 tests; production build and Unix-socket fixture pass. Evidence: `evidence/boot-coordinator/`.

Before enabling the pair, implement/review the providers above, retain SSH and remote LXQt, attach HDMI/keyboard, and complete the [installation preconditions](pi-install-recovery-plan.md#connected-display-and-foreground-gate-independent-review). Test cold boot, delayed and failed sessions, absent display/reconnect, both manual switch directions, service restart and controlled reboot. Actual physical VT, touch, GPU hangs and power-loss durability remain unvalidated. Do not install/enable the templates on the basis of these fake-session tests.

### Readiness transport implementation follow-up

The [owned-child readiness transport and Linux process evidence](boot-readiness.md) now implement bounded challenge/reply over inherited IPC and per-process identity verification. They are inactive and do not yet provide the cross-session correlator/aggregation or desktop readiness required above. Per-process digests must not be substituted for a verified common session instance. Joint boot enablement stays blocked. The coordinator's additional review cases now cover future timestamps, foreign UID, already-active target, malformed activation acknowledgement and disposal during activation/readback.
