# Adapter review

Date: 2026-10-19

## Result

No unresolved high-severity defect was found in the reviewed scaffold. Four concrete adapter defects found during review have been corrected and covered by regression tests. This is a source/unit-test review, not a production-readiness or hardware certification.

The final `npm test` run passed **24 tests, 0 failures**. The suite includes a static-preview build and syntax checks. No browser or live LIVI session was exercised.

## Scope and reference

- Reviewed `src/session.mjs`, `src/transport.mjs`, `src/protocol.mjs`, `src/view.mjs`, the mock UI/model, build script, and their tests.
- Compared message types, framing, device fields, patch semantics, and server behavior with the supplied LIVI source snapshot pinned to `4bcd1335c2daedba40640e6dc432cd2ed7acfaa4` (9.5.0, protocol 8).
- The control contract is a little-endian 32-bit byte length followed by JSON over a Unix socket. The upstream server enforces same-UID clients. This adapter does not create an HTTP or WebSocket control listener.
- The original v4 baseline was unavailable for review. This separate scaffold had no Git history available, so baseline/differential and regression claims about v4 are excluded.

## Findings resolved

1. **Mutable action validation (medium).** The action object was validated before cloning. An enumerable getter could change `kind` between validation and transmission, allowing `restart` to escape the intended allowlist. The adapter now clones once, validates that snapshot, and sends the same snapshot. This was a JavaScript API invariant failure; no remote exploit was demonstrated, and JSON alone cannot carry getters.
2. **Unbounded pending writes (medium).** The transport ignored `socket.write(false)` and the session had no in-flight limit. A stalled peer could accumulate commands. The session now permits at most 32 pending commands, and transport refuses additional writes until the current socket drains. Rejected sends remove their pending ID. Reconnection does not replay actions.
3. **Missing patch value (medium).** A `set` operation without `value` silently wrote `undefined` and advanced the revision. Such operations now trigger resynchronization without adopting the partial state.
4. **Lost refusal reason (low).** The protocol's `refused` message was ignored, obscuring handshake incompatibility. It now disables the session and preserves the reason through close.

## Checks performed

- Existing and added tests: fragmented/coalesced frames, UTF-8 byte lengths, invalid JSON/size handling, protocol mismatch, action allowlisting and replies, atomic patch failure, revision-gap resynchronization, prototype-path rejection, disconnect cleanup, and no action replay.
- Independently reproduced the original four defects; re-read their corrections and reran the complete final suite.
- Injected late `connect`, `data`, `error`, and `close` events from a replaced socket after a new welcome. The new connection, revision, state, and error remained unchanged.
- Confirmed the browser imports only the mock model. Core controls and vehicle commands are not reachable from the preview. Appearance storage accepts only its fixed palette.
- Compared the public-view fields to the supplied device contract. The allowlisted view omits raw configuration, telemetry, carrier data, and other unrelated core state.

## Remaining limits and integration requirements

- **Live socket untested:** fake EventEmitter sockets were used. Actual Unix permissions, peer ownership, partial I/O under load, a running core's replies, and real reconnect timing still need integration tests on the authorized LIVI host. The client's absolute `core.sock` path check is not server authentication; configure a trusted runtime directory.
- **Browser QA unrun:** navigation, keyboard focus, responsive layout, browser history/dismissal behavior, and screenshots have not been visually verified. The provided browser test script was not run because browser execution was blocked.
- **Hardware untested:** no CarPlay/Android Auto session, MFi path, compositor, microphone, speakers, audio focus, touch forwarding, phone switching, or independent vehicle service was exercised.
- **Recovery is bounded but manual:** there is no reply/handshake/resync timeout, automatic reconnect policy, or retry backoff. A connected but unresponsive core can leave the adapter waiting until an explicit reconnect. Do not automatically replay possibly executed commands.
- **Input/renderer boundary remains future work:** the state check is shallow rather than a complete schema validator. The public view is not yet wired into the mock UI. When wiring it, render phone names and IDs as text, preserve the action allowlist in the trusted process, and keep raw core state out of the renderer.
- **Load testing remains:** the decoder caps frames at 16 MiB but copies accumulated fragments. Large-frame fragmentation and sustained telemetry were not benchmarked on the target head unit.

These gaps prevent describing this scaffold as integrated, hardware-tested, or ready for deployment.
