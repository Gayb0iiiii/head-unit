# Separate phone roles: isolated policy model

`src/phone-arbitration.mjs` is a pure, in-memory desired-state reducer. It has no imports, transport access, timers, persistence, device discovery, pairing, contact access, dial/answer/hang-up commands, or real audio/UI actions. It is deliberately **not wired into the controller, Electron boundary, or preview**. Its effect names are policy descriptions, not LIVI protocol commands, and must never be forwarded to `CoreSession.action`.

The pinned LIVI 9.5.0/protocol 8 contract at `4bcd1335c2daedba40640e6dc432cd2ed7acfaa4` does not establish a complete independent Bluetooth phone/HFP API. See [the verified upstream contract](upstream-contracts.md). This model does not make independent phone operation available on that backend. Real integration needs an independently verified provider, event adapter, and hardware validation.

## Contract

`createPhoneArbitrationState(options)` accepts:

- `roles`: independent `projectionPhoneId`, `musicPhoneId`, `callPhoneId` assignments. IDs are opaque nonempty strings of at most 256 characters; unassigned roles default to null. Roles may share one phone, but a call never changes any assignment.
- `connectedPhoneIds`: verified connected phone IDs, default empty. Availability alone is not a connection.
- `route`, `musicVolume`, `playback`: initial desired context, default `home`, `0.5`, `paused`. Volume must be finite 0–1; playback is `playing` or `paused`. Invalid initial context throws.
- `capabilities`: `independentSources`, `hfpCallControls`, `musicDucking`. Each defaults false and must be the literal boolean `true`. **All three are required** for any call-arbitration effect, including restoration. Do not infer these capabilities from projection support, device count, or a usable volume setting.

`reducePhoneArbitration(state, event)` returns a new `{ state, effects, unsupported, ignored }`. Neither input is mutated. `state.desired` records proposals, never hardware acknowledgements. `activeCall` records the accepted provider observation even when arbitration is unsupported. `unsupported` lists missing capabilities, or `concurrentCall` for an unsupported overlapping call. `ignored` contains an explanation such as `invalid-event`, `stale-sequence`, `retired-call`, or `unassigned-call-phone`; otherwise null. Invalid events cannot change history or produce effects.

Events:

- `{ type: 'call', phoneId, callId, phase, sequence }`, where phase is `ringing`, `active`, or `ended` and sequence is a nonnegative safe integer.
- `{ type: 'manual-route', route }`, `{ type: 'manual-volume', volume }`, `{ type: 'manual-playback', playback }` describe explicit user changes already selected by the caller. They propose no device actions.
- `{ type: 'phone-available', phoneId, transport }`, where transport is `wired` or `wireless`, only records availability. A second wired phone waits for manual selection while wireless CarPlay continues. Repeated reports are idempotent. Reporting the same phone on a wire does not infer a wireless-to-wired handover.
- `{ type: 'disconnect', phoneId }` removes that phone's connection/availability and ends its call if present. It does not select a replacement phone.

## Call policy

For a supported call on the assigned call phone:

1. Capture route, music volume, and manual-change counters once. Propose `present-call-controls` for this phone/call. Projection and music roles remain unchanged.
2. If the assigned music phone is connected and playing, propose `set-music-volume` at 25% of the captured volume (`reason: 'call-duck'`). Already muted or paused music requires no volume change. The model never pauses, plays, or resumes media.
3. Repeated events do not compound ducking or replace the snapshot. An active call cannot regress to ringing. A second concurrent call is reported unsupported rather than taking over the first.
4. On end or call-phone disconnect, propose `dismiss-call-controls`; independently restore the prior route and volume only if the corresponding manual-change counter is unchanged. A same-valued manual edit still relinquishes automatic ownership. Music disconnect invalidates its volume restoration. Deliberate pause remains paused.

`present-call-controls` is only a desired presentation of call state, not a declaration that usable native call buttons exist. `dismiss-call-controls` removes the ended call's presentation without itself navigating. `restore-route` and `set-music-volume` are also declarative. All effects require a separate, authorized, capability-aware adapter and authoritative reconciliation before a live UI may claim success.

## Lifecycle and limits

The provider must preserve **strictly increasing sequence numbers per phone across all call IDs for this model's lifetime**. A sequence applies to the provider event, not delivery time; never renumber an old event when replaying it. Call IDs must identify distinct call instances. Original stale events are rejected by sequence, while the latest 64 completed call IDs additionally guard against recent erroneous resurrection with a newer sequence. An evicted old ID with a fabricated newer sequence cannot be distinguished from a new call; the provider contract remains essential.

Create a fresh model from authoritative context after provider/session reset, connection epoch changes, role reassignment, or capability changes. Do not replay prior desired effects or pending calls. Roles are fixed within one model lifetime; this model does not implement manual source selection itself. Capabilities are also rechecked before emitting update/end effects, but revocation cannot undo a previously applied external action. Reconcile actual route/audio explicitly after failure or revocation.

Only a single call is modeled; call waiting, conferences, emergency call behavior, volume acknowledgements, Bluetooth pairing, contacts, native focus precedence (including reverse camera), native core auto-selection suppression, and physical phone/audio behavior remain outside this isolated model. No browser or hardware test is implied by its passing unit tests.

## Verification

`node --test tests/phone-arbitration.test.mjs` exercises capability denial, separate-role behavior, restore ownership, deliberate pause, repeated/stale/regressive calls, disconnects, bounded history, malformed events, and wired availability. Tests were written and observed failing before implementation; run `npm test` for the complete repository suite.
