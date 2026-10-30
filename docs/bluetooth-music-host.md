# Bluetooth music host component

`electron/bluetooth-music-host.mjs` implements an opt-in, dependency-injected host service. Importing it performs no I/O. It is **not attached to the application, preload or renderer**. Existing Bluetooth UI remains unavailable. No D-Bus package, service, pairing, device trust, adapter power, PipeWire configuration or network change was installed or performed.

## Implemented behavior

- Host-selected adapter only; bounded discovery acquires/releases the application's discovery session without setting power, discoverability, filters or trust.
- Numeric-comparison pairing uses an application-local `DisplayYesNo` Agent1. It does not request default-agent ownership. Confirmations contain a random request token, opaque device ID and six-digit passkey. Reject, cancel, timeout, adapter loss and service-owner replacement invalidate the prompt. Unsupported PIN entry, passkey display and authorization modes reject explicitly; this is not support for all pairing methods.
- A2DP connection requires an observed paired device advertising the remote Audio Source UUID, verified host sink availability and an exclusive revocable audio lease. It calls `Device1.ConnectProfile` for that UUID, never generic `Connect`. Existing observed A2DP transports are not taken over. It does not implement HFP, calls, contacts or AVRCP controls.
- Method completion does not claim audible playback. The public snapshot reports observed transport state independently from device connection, with `audible: null`. There is no stereo-to-multichannel processing or HELIX tuning.
- Source revocation releases only the requested A2DP profile. No global device disconnect or projection command is used. The focus provider must preserve CarPlay ownership and deliberate local pause.
- Late discovery acquisition is released after timeout/disposal. Late audio leases cannot initiate a connection. A timed-out operation blocks overlapping operations while its underlying bus request is still unresolved, avoiding ambiguous ownership. No canceled operation is automatically retried.

## Private bus adapter contract — still required

The `bluez` dependency must use **one persistent application connection** to the system bus, not one subprocess/connection per method. Agent registration and discovery ownership are connection-scoped. It must provide:

```js
watch(callback) // returns unsubscribe; callback({owner, objects})
call({destination, path, interface, member, signature, args}) // Promise
exportAgent(path, methods) // returns unexport function
```

`watch` must subscribe before taking its ObjectManager snapshot, reconcile InterfacesAdded/Removed and PropertiesChanged without gaps, unwrap D-Bus variants to plain JS values, and deliver coherent full snapshots. `owner` is BlueZ's unique bus name (for example `:1.20`), or null when unavailable. On NameOwnerChanged it must discard old objects and reject pending calls to the retired owner. It must reject calls on a bounded transport deadline. Old replies/signals must not be attributed to the replacement daemon.

`call` must preserve signatures (`os` for RegisterAgent; `o` for agent removal; `s` for ConnectProfile/DisconnectProfile). Calls address the captured unique owner, not an unverified replacement service. Errors retain their D-Bus error name privately for bounded classification. The adapter must not expose arbitrary methods, paths or arguments to the renderer.

`exportAgent` must export `org.bluez.Agent1`, dispatch its exact method signatures, authenticate calls against the current BlueZ unique owner, and map rejected Promise errors to the supplied D-Bus error name. Unauthorized senders must never cause a confirmation prompt. It must support async replies while waiting for the user's decision. The component handles only numeric comparison; it deliberately rejects unsupported agent flows.

No concrete D-Bus adapter is supplied in this checkpoint. The repository has no persistent D-Bus client dependency. Using existing one-shot command execution would fail the agent/discovery ownership requirement. Choosing and pinning a maintained client, implementing snapshot reconciliation and exercising it against an isolated test bus are the next software steps. They are not a reason to enable the UI prematurely.

## Audio and parked-state contract — still required

The host supplies an explicit `adapterPath`, `isParked()` and:

```js
audio.sinkReady() // true only from verified local A2DP sink configuration
audio.acquire(deviceId) // Promise<lease|null>
lease.valid() // current exclusive ownership
lease.onLost(callback) // returns unsubscribe
lease.release() // idempotent; no automatic resume
```

The lease provider must arbitrate with native projection and local audio, notify revocation before handing focus to another source, await the Promise returned by its onLost callback, and tolerate cleanup during shutdown. A pending profile connection must settle and its disconnect must succeed before focus is released. A cleanup timeout retains the lease and reports an error; the provider must not treat that as successful handoff. The persistent bus adapter must be shut down by its owner after service disposal. `sinkReady` must come from a real PipeWire/WirePlumber integration; it must not be hardcoded true in production. The component does not enable Bluetooth roles, register media endpoints, acquire transport audio FDs or establish the output graph. Its MediaTransport1 observation is evidence of BlueZ transport state, not proof of a valid PipeWire link or audible HELIX output.

Unknown motion fails closed for starting discovery/pairing/music connection and accepting a pairing prompt. The future host wiring must call stop/cancel when motion becomes unsafe while an operation is active. No physical motion source is assumed here.

## Tests and remaining acceptance

`tests/bluetooth-music-host.test.mjs` uses an in-memory bus and audio lease, never the system bus. It exercises scoped discovery, numeric confirm/reject, unsupported agent requests, profile UUID selection, sink/focus refusal, bounded errors, service replacement, adapter loss, cancellation/timeouts, late completion, immediate disposal and revoked leases. These tests verify component logic; they do not verify D-Bus serialization, policy authorization, actual pairing or audio.

Before enabling: implement the bus and audio providers, add authenticated main-process/preload operations with bounded arguments, add parked pairing UI, run isolated-bus integration tests, then perform separately authorized target tests with two phones and real audio. Device permissions, PipeWire role ownership, Bluetooth/CarPlay coexistence and physical reconnection remain target gates. Calls, contacts and general Bluetooth control remain unimplemented.

API references: [BlueZ Agent](https://bluez.readthedocs.io/en/latest/agent-api/), [Adapter](https://bluez.readthedocs.io/en/latest/adapter-api/), [Device](https://bluez.readthedocs.io/en/latest/device-api/), [Media](https://bluez.readthedocs.io/en/latest/media-api/). The design above distinguishes documented bus calls from project-specific ownership requirements.
