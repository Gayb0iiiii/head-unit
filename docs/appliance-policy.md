# Pure appliance lifecycle policy

Status: **model and fake-owner tests only**. `src/appliance-lifecycle.mjs` neither launches a process nor opens a socket, sends a signal, changes a system service, or controls machine power. It is not installed or connected to LIVI. Native startup, fullscreen, crash/freeze recovery and actual screen presentation remain unverified. See [appliance deployment design](appliance-deployment.md) for the required native work and stationary-lab acceptance plan.

## Responsibilities and ownership

The model coordinates this dependency order:

1. `outerWayland`: the intended outer display is responsive.
2. `engine`: a fresh protocol-8 engine handshake and inner-compositor readiness have both been observed.
3. `shell`: the compositor has observed app ID `dev.f-io.livi`, main role and fullscreen for this shell generation.

An `alive` event only records process liveness. It cannot satisfy readiness or extend a startup/health deadline. Correct model readiness fields are assertions from a trusted future owner, not evidence obtained by this module. Main-role readiness alone does not validate active cluster/aux windows, document identity, snapshot application, hardware projection, or visible pixels. Production must add/aggregate those observations before declaring readiness.

The sole effect owners are:

| Component/effect | Owner label | Intended integration |
| --- | --- | --- |
| Outer Wayland and engine | `appliance` | Future explicitly approved outer manager |
| Shell start/stop/fullscreen/health/input revocation | `core-ui-supervisor` | Patched core-owned `UiSupervisor`, never a second external shell launcher |
| Presentation request | `appliance-presenter` | Independent native presenter, initially proposed inside the nested compositor |

Stock LIVI already owns its nested compositor and UI child. Its current UI restart budget is five retries with a one-second delay and a 30-second stable reset; normal UI exit, spawn failure and exhausted retries quit core. Therefore engine-preserving shell recovery in this model requires an intentional native behavior change. The model's three-retry lifetime budget does not describe the stock implementation. Strict handshake-before-shell ordering also needs a native start gate. Source details are in the deployment design.

Do not connect an external observer to `compositor.ctrl`: the upstream compositor replaces its single control client, so a second client would displace core. Route inner-display and presentation observations through the core owner.

## API

`new ApplianceLifecycle(options)` accepts an injected clock with `now()` and optional timing parameters below. The clock must return finite monotonic millisecond values. The default is `performance.now()`. No timers are scheduled internally.

- `start()`: explicitly begins an idle/stopped lifecycle. A future boot integration may call it after its own authorization/provisioning checks. Calling it while starting, running, recovering or latched does nothing.
- `handle(event)`: validates one owner event, advances deadlines before handling it, and returns whether the event was accepted. Unknown types, fields and component names throw. A ready/heartbeat arriving at its deadline cannot revive the timed-out generation.
- `tick()`: advances due deadlines using injected time and returns a detached snapshot. Repeating at the same time is idempotent. Backward/nonfinite clock values throw rather than silently extend deadlines.
- `stop()`: cancels automatic retry and pending operational effects, clears presentation intent, and requests reverse-order shutdown. Startup and heartbeat deadlines cannot turn deliberate shutdown into an automatic restart. Stop still requires owner observations.
- `retryRecovery()`: explicit operator reset of a latched recovery state. Resets budgets and resumes from the first missing dependency, while preserving healthy ancestors. Returns false if any old child is stopping or cannot be confirmed stopped.
- `snapshot()`: detached state, component generations/phases, deadlines, budgets and requested/confirmed presentation. It contains no core config, commands, phone identifiers or session data.
- `takeEffects()`: returns detached currently valid effects once, draining the queue. Superseded starts, probe tokens, stop modes and presentation requests are discarded. It does not apply effects.
- `isEffectCurrent(effect)`: validates the fixed effect shape and current generation/phase/token. Future adapters must call `tick()` and re-check immediately before applying a previously drained asynchronous effect. This predicate is neither process authentication nor a permission grant.

Snapshots include status `idle`, `starting`, `running`, `recovering`, `recovery`, `stopping` or `stopped`. Component phases additionally distinguish `failed` while waiting for dependent shutdown, `backoff`, and `blocked` when stop could not be confirmed. Failure budgets count accepted failures; the initial attempt plus `maxRetries` additional attempts are allowed. Duplicate events for the same failure do not consume additional attempts.

## Proposed local owner events

These are **not protocol-8 wire messages**. Protocol 8 has no ping, renderer-ready or heartbeat message. Only a future trusted native adapter may construct these events; do not expose `handle()` as a renderer IPC capability.

All component events require exactly `type`, `component` and positive integer `generation`, plus the fields specified below:

| Type | Extra fields | Meaning |
| --- | --- | --- |
| `alive` | None | Owned process exists; no readiness/health guarantee |
| `ready`, outer Wayland | None | Owner validated the intended display's fresh round trip |
| `ready`, engine | `protocol: 8`, `compositorReady: true` | Fresh engine response and core-owned inner display ready |
| `ready`, shell | `appId: 'dev.f-io.livi'`, `fullscreen: true`, `role: 'main'` | Observed correct main surface; other production gates remain above |
| `heartbeat` | Positive integer `probeId` | Current generation answered the outstanding challenge |
| `failed` | None | Current owned component fault, process may still exist |
| `refused` | None | Terminal incompatibility/refusal; cleanup then latch |
| `exited`, `stopped` | None | Owner observed this exact child absent/reaped; a signal request is insufficient |

A separate presenter event has exactly `type: 'presented'`, `owner: 'appliance-presenter'`, and `presentationId`. It confirms only the current requested presentation token. A stale token is ignored. A future owner must not emit this on merely accepting a command; actual native presentation observation is required. Even that observation is weaker than physical monitor/pixel evidence.

A current-generation event from a stopped/retired child, a stale generation, an old probe response or an old presentation token cannot restore readiness. One matching response consumes a probe token, so duplicates cannot extend its deadline repeatedly.

## Fixed effect vocabulary

Component effects contain `type`, `owner`, `component` and `generation`. There are no executable strings, arbitrary arguments, PIDs, paths, host commands, power actions or user intents.

| Type | Additional fixed/validated data | Owner obligation |
| --- | --- | --- |
| `start` | None | Start at most one reviewed owned resource for this generation |
| `fullscreen` | Fixed app ID and main role | Request fullscreen through the core-owned shell/compositor path; later observe it |
| `probe` | `probeId` | Issue a fresh bounded challenge to the correct owner/child |
| `stop` | `mode: 'graceful'` or `'force'` | Request bounded termination of the held owned child, not an arbitrary PID |
| `revoke-input` | Shell generation | Native release of that generation's contacts/PTT and input ownership |

`present` contains `owner: 'appliance-presenter'`, `screen: 'boot'`, `'shell'` or `'recovery'`, a fixed policy reason or null, `presentationId`, and `confirmed: false`. Any failure immediately invalidates the prior operational presentation and requests recovery presentation, including during retry backoff. The latch also requests recovery. A broken shell cannot render its own fallback. If the compositor/display is unavailable, presentation may remain unconfirmed indefinitely while the control state is latched; this model does not pretend it showed a picture.

The adapter must preserve at-most-once application of drained effects using an owner-side ledger, reject obsolete effects with `isEffectCurrent()`, and retain exact process/child handles. A drained effect becoming stale never authorizes replay against a replacement child. Applying the same still-current `start` twice is forbidden even though its predicate remains true while startup is pending. Queue drainage and the predicate do not substitute for adapter deduplication.

If a start was cancelled before it was applied, the later stop request must be answered with a generation-specific observation that no child exists. If it was already applied, stop/reap that owned generation. Do not infer absence merely because no `alive` event arrived. For shell shutdown, observed-stop completion must also ensure native input revocation has completed before permitting a replacement. The model emits that requirement; it cannot verify native contact/PTT release.

## Deadlines, health and bounded retry

Defaults are initial **unmeasured lab parameters**, not appliance timing guarantees:

| Option | Default |
| --- | --- |
| `startupTimeoutMs.outerWayland` | 10000ms |
| `startupTimeoutMs.engine` | 15000ms |
| `startupTimeoutMs.shell` | 10000ms |
| `heartbeatIntervalMs` | 1000ms |
| `heartbeatTimeoutMs` | 5000ms |
| `stopTimeoutMs` | 3000ms |
| `forceStopTimeoutMs` | 2000ms |
| `maxRetries` | 3 additional attempts per component/lifecycle |
| `retryInitialMs` | 500ms |
| `retryMaxMs` | 4000ms |

Durations are positive safe integers capped at one hour; retries range from zero to ten. The initial delay must not exceed the cap. Backoff is `min(cap, initial * 2^(failures - 1))`, giving 500/1000/2000ms with the default budget. Retry delay begins only after dependent teardown and confirmed stop, not at the original fault.

After readiness, a probe becomes due at the configured interval. Its response deadline starts when `tick()` actually emits it, not at an old scheduled time. A late scheduler therefore receives a full response window and cannot immediately mark a newly challenged healthy component hung. Once emitted, an unanswered probe expires normally even if the next tick is late. The host still needs a reliable scheduler; this model cannot detect its own frozen event loop while it is not being called.

The engine response must establish fresh authoritative control progress, not merely an open socket or the presence/absence of state patches. Idle state streams are normal. Shell health must cover a round trip through the current required renderer document(s) as well as Electron main; a main-process timer is insufficient. Neither proves GPU output or every native projection task is responsive. See deployment design for proposed private owner-channel framing and protocol-8 resync/welcome constraints.

Ready and heartbeat responses never reset failure budgets. Recovery is finite across repeated apparently successful restarts. An explicit stopped→start lifecycle or operator `retryRecovery()` may reset them. A production service must not evade the latch by restarting the manager forever; restart-surviving budgets are required before deployment.

## Failure ordering and recovery latch

- Shell crash: revoke its input generation, request independent recovery presentation, and retry only shell after observed exit/backoff. Healthy engine and outer-display generations remain unchanged.
- Shell freeze: revoke input, request graceful stop, wait for observed termination, then retry shell. If the grace deadline expires, request force stop once; if absence remains unconfirmed after the force deadline, latch `stop-unconfirmed`. No duplicate shell is started.
- Engine failure/freeze: stop owned shell first, then stop/confirm engine, retain healthy outer display, and retry engine within its own budget. Shell restart waits for a new engine/inner-display readiness event.
- Outer-display failure: stop shell then engine before replacing the display. No engine-preservation claim applies to this failure domain.
- Incompatible engine protocol or explicit refusal: clean up the failed dependency and its descendants, then latch without automatic retries.
- Retry exhaustion: retain healthy ancestors, latch `retry-exhausted`, and wait for an explicit operator reset. `start()`, ready events, heartbeats and repeated ticks do not clear it.
- Manual stop: reverse-order observed shutdown, no retry and no user action replay. If absence cannot be confirmed, recovery records that fact even though automatic operation remains disabled.

Healthy ancestors continue health checks during child recovery; a real parent failure supersedes the narrower incident. Failed components awaiting child termination cannot consume additional budget from repeated failure reports. Restart of any component never restores queued touches, media actions, device switches or previous probe replies. This module has no action queue at all; future integration must maintain that separation.

## Ignition and actual power

No ignition input or power effect is accepted. A two-second time passage by itself does not request shutdown or restart, and the fake-time test covers it under the default health window. This does **not** establish tolerance of voltage loss, a hardware reset, or a two-second renderer freeze.

Real 1–2 second ignition/cranking dips, sustained-off display/audio behavior, hysteresis and wake capability need a separate narrowly specified target/hardware policy. Software cannot preserve a session after physical power loss without suitable hardware. No debounce threshold, Raspberry Pi suspend support, host shutdown, GPIO command or power cut is implemented here. Intentional standby must later be distinguished from unresponsiveness rather than triggering a crash loop.

## Verification scope

Run `node --test tests/appliance-lifecycle.test.mjs` (or `npm run test:appliance`) for injected-clock/fake-owner checks. The fake owner records effects, returns generation-tagged observations and simulates exit/readiness/health; it never launches/signals anything. Tests cover dependency order, true-vs-claimed readiness, finite retry/backoff, hung-shell and engine recovery, reverse teardown, refusal, stop escalation, stale event/effect cancellation, recovery presentation tokens, clock boundaries and no power/action vocabulary.

The complete repository test suite and static build also run without the native engine. Actual boot, native ownership, fullscreen geometry, renderer/main freeze detection, shell-only restart with unchanged core PID/session, input revocation, stop/reap behavior and independent recovery pixels require the future approved runtime and staged acceptance tests. Pure-policy success is not evidence that those real tests passed.
