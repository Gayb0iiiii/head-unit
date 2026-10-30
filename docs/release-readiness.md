# Release-supervisor readiness query

The release supervisor now exposes an explicit host-only `probeReadiness({signal})` method. It is not called automatically by the launcher and is not exposed through renderer IPC, a public endpoint or a boot service. The boot coordinator and cross-session aggregator remain inactive/unimplemented respectively. This integration does not install or activate anything.

## Composition and lifecycle

A query is permitted only for the current owned child after its existing release-ready message, outside pending update activation. The query creates the owned-child challenge probe, obtains fresh identity-bound readiness, and passes the process identity into the read-only logind session correlator. It verifies the correlated process/session fields match the probe and returns only `{sessionId, instance, ready, observedAt}`. `observedAt` is the original monotonic probe-start time; correlation never renews it. Evidence older than two seconds, clock rollback, missing/false readiness, missing session evidence or mismatched correlation returns null.

The first successful query pins the child's session ID and session-leader instance. A later successful correlation with a different binding permanently revokes that child's readiness. New release children start with no inherited binding. Every new completed-query cycle obtains a fresh challenge and correlation; only concurrent requests for the same child share one pending query. A caller's abort cancels its shared query, so callers must not assume independent cancellation while coalesced.

Exit, error, disconnect and supervisor disposal revoke readiness immediately, before queued release lifecycle handling. Pending queries are cancelled; a late probe handle is disposed without use, and a late reply/correlation cannot publish readiness for a replaced child. A pending activation invalidates the query result. Readiness-query failures do not stop a child, save release state, change acknowledgements, promote candidates or affect rollback decisions.

The wrapper has an overall bounded deadline (default four seconds, maximum five), per-operation deadlines and cancellation for correlation. Its listeners and timers are removed on settlement, and its probe is disposed. Already-running bounded identity reads may finish after cancellation but cannot publish a result. Missing permissions or an unavailable logind session returns null; no permission exemption or session is invented.

Returned data is a short-lived **snapshot**, not a remotely revocable object. Consumers must query again before activation, obey the original two-second age and revalidate identity/readback. Retaining an old plain object cannot establish continued readiness after a later exit. The coordinator already requires fresh discovery; no snapshot cache or cross-session relay is added here.

## Verification

724 Node tests pass, including 40 focused release-supervisor/readiness/correlation tests; production build and the encoded Unix-socket fixture pass. Eleven new composed supervisor tests exercise real probe/correlator modules with injected child/process/logind evidence: timestamp preservation, delayed stale evidence, reassignment, exit/disconnect/disposal, replacement, pending activation, bounded failures, late-handle cleanup, repeated queries and changed session-leader binding. Existing release acknowledgement, candidate health, failed launch and rollback tests remain passing. Evidence: `evidence/supervisor-readiness/`.

These composed tests do not launch Electron or exercise actual logind/VT activation. The full suite retains the separate real Node-child inherited-IPC test; that does not prove Pi session topology.

## Remaining gates and scope

The owning supervisor can now perform this query in code, but no launcher or aggregator invokes it. Trusted cross-session reporter registration/aggregation and a real desktop readiness source remain missing. The actual Pi's session topology, process/leader identities, permission visibility and activation authorization need target verification. Do not infer them from fake-session fixtures or same UID.

Persistent desktop and return shortcut installation, foreground selection/readback, HDMI hotplug, physical display/touch/audio/phone behavior and controlled reboot/power-loss remain acceptance gates. The user's separate approval to install a test build does not cause deployment here; this thread performs code work only, and reboot still requires separate confirmation. No Pi services, security/network settings, credentials or release data were changed.
