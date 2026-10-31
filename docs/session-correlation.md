# Session correlation and cross-session aggregator decision

## Implemented read-only correlation

`electron/session-correlation.mjs` accepts an already-authenticated process instance (for example, from owned-child IPC), then verifies Linux process identity and exact logind session properties. Its default reader invokes only bounded `loginctl show-session` with a validated session ID and fixed properties, including Leader. It does not activate a session or request authorization changes.

It requires matching UID, local seat0/user session, positive VT and leader, non-remote online/active state, and actual process cgroup membership. It reads and rechecks both reporter and leader identities and the session properties. PID replacement, parent/session changes, foreign ownership, missing permissions, duplicate/malformed properties or inconsistent observations return null. Calls have an overall bounded deadline and AbortSignal; cancellation prevents subsequent probes/results. The default loginctl child receives cancellation and has its own timeout/output cap. Outstanding read-only /proc work may finish after cancellation, but cannot publish a result.

The returned common `instance` is the verified session leader's process-instance digest; `processInstance` separately retains the authenticated reporter's identity. Two independently verified members of one session can therefore share a session instance without pretending their per-process digests are equal. This is evidence of observed membership, **not** role authorization, readiness or an atomic guarantee against a process dying immediately afterward. Coordinator activation/readback must still revalidate. Correlation must preserve the original readiness timestamp, never stamp an old reply anew.

Seven tests cover shared leader identity, changed reporter/leader, remote/foreign/missing/ambiguous evidence, session reassignment, bounded failures, cancellation and malformed identifiers. These use fake logind replies; the production reader has not been run against the Pi. The earlier process-identity tests still exercise actual Linux /proc.

## Aggregator evaluation: not implemented or enabled

The existing optional `dbus-next` dependency can support a future per-user-bus transport. D-Bus provides connection credentials such as Unix UID/PID, but unsupported credentials can be omitted: [D-Bus specification](https://dbus.freedesktop.org/doc/dbus-specification.html#bus-messages-get-connection-credentials). Credentials must come from the trusted bus daemon for a pinned unique connection name and be rechecked against /proc. Merely owning a well-known name or claiming a role is insufficient.

The current repository lacks a trusted cross-session registration source binding **which exact current process** is permitted to report each role. Both systemd-started sessions are independently owned, and the existing logind census proves membership/process presence, not authority to assert renderer or desktop readiness. A same-UID sender can be a different application in the same session. Granting it readiness authority based only on its UID, claimed PID/role, filename, or bus name would weaken the boundary. The owned-child proof remains valid only inside its owning parent's established channel; no authenticated relay to a common boot owner is wired.

A robust aggregator therefore remains blocked on:

1. A reviewed boot/session owner that registers role reporters from actual owned launches or equivalently verified service ownership, with process-start identity and revocation. No automatic trust-on-first-name or persistent shared secret is introduced.
2. Real desktop readiness semantics and a trusted main-process renderer lifecycle binding, not process-existence or constant-true tests.
3. A cross-session transport using verified daemon credentials and strict expected-sender response matching. Existing `bluez-bus.mjs` demonstrates explicit sender matching; a generic promise reply-serial match alone is insufficient for this proposed security boundary. Actual user-bus topology/access across the Pi's sessions is unverified.
4. Owner-loss, restart, bounded query/cleanup and replay tests composed with the correlator, plus actual logind activation authorization and physical acceptance.

No bus connection or public endpoint was added by this milestone. This is a precise dependency gap, not a tool denial or claim that authenticated aggregation is impossible. Joint boot enablement remains blocked; no live services or permissions changed.

## Independent readiness freshness correction

The owned-child transport previously timestamped readiness after a delayed identity read, incorrectly making an old reply look new. It now uses conservative **probe-start monotonic time** and rejects evidence older than two seconds (or clock rollback) after identity validation. Deferred-identity tests reproduce the prior >2100ms-to-new conversion and verify preserved timestamps. The coordinator's freshness gate remains unchanged.

Verification: **691 full-suite tests**, **36 focused boot/evidence/correlation tests**, production build and Unix-socket fixture pass. Logs and pre-fix failures are under `evidence/session-correlation/`. All modules remain inactive; no physical VT, logind authorization, HDMI hotplug or power-loss result is claimed.
