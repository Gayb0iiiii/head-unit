# Read-only GNSS and offline location

The pinned LIVI protocol-8 state already includes `telemetry.gnss` and `telemetry.gps`. The head-unit consumes these through its existing synchronized, same-user core socket and authenticated main-window view. No HTTP telemetry listener, browser Geolocation API, serial reader, GPS daemon, new IPC command or renderer-controlled device path is added.

## Audited upstream behavior

At LIVI `4bcd1335c2daedba40640e6dc432cd2ed7acfaa4`:

- [GNSS types](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/crates/livi-core-proto/src/gnss.rs) define receiver connection/quality/mode, satellite counts, Unix-millisecond `updatedAt`, and GPS `lat`, `lng`, `fixTs`.
- [Receiver](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/bin/livi-core/src/gnss/receiver.rs) treats arriving bytes as connection evidence and drops fix state after ten silent seconds. Bytes alone do not prove a usable position.
- [NMEA decoder](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/bin/livi-core/src/gnss/nmea.rs) obtains the dated positional sample time from RMC. GGA-only data can lack that time; this UI deliberately withholds a current coordinate in that case.
- [Telemetry](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/bin/livi-core/src/telemetry.rs) merges GPS fields individually and restores last-known coordinates on startup. A new snapshot or unrelated timestamp cannot establish a fresh fix. Existing upstream persistence is not changed or deleted.
- [Native GNSS service](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/bin/livi-core/src/gnss/mod.rs) owns receiver configuration and may apply clock/timezone changes. This screen does not enable it, change its configuration, claim its device is present, or run those operations.

The upstream telemetry ingress can also accept externally supplied patches. Reading this native state does **not** authenticate satellite provenance or turn it into safety-grade vehicle data. No motion/parking decision, cluster instrumentation, navigation instruction or CarPlay location injection is derived from this card.

## Display and freshness policy

Settings shows disabled, source-disconnected, unavailable receiver, missing status, stale data, no-fix and current-fix states distinctly. Estimated/manual/simulated quality is labelled and never displayed as a current coordinate. Latitude/longitude must both be finite and in range; zero is valid, missing is not zero. Only known quality/mode values and bounded integer satellite counts cross the renderer boundary. Raw device paths, error text, satellite arrays and unrelated telemetry are stripped.

A current coordinate requires receiver `connected === true`, GPS/DGPS/PPS/RTK/RTK-float quality, 2D/3D mode, and **both** receiver and positional sample timestamps no more than ten seconds old. Missing, future, malformed or stale timestamps fail closed. The local wall clock establishes initial source age; subsequent expiry uses monotonic time, so clock rollback cannot extend the lease. Repeating a timestamp or receiving unrelated state patches does not renew it. If the host clock is wrong, valid GNSS readings may remain unavailable until coherent fresh timestamps arrive; no time correction is attempted here.

The renderer also expires the view without new host traffic and removes coordinates. The UI adds no location-history persistence, coordinate logging, weather-coordinate selection, online geocoding or map requests. It works without internet when an already configured native source supplies fresh data. This is a status/coordinate view, **not offline maps, routing, address lookup or a receiver installer**. Old upstream stored fixes are not promoted to live location; no last-known-position browsing feature is claimed.

Altitude, speed, heading and accuracy are intentionally omitted: upstream merges those fields and the current contract cannot prove their individual sample ages. Receiver acquisition and stable timestamps on the actual Pi remain hardware acceptance gates. The independent cluster and HELIX configuration are untouched.

## Evidence

Focused tests cover current/no-fix/stale/disabled/disconnected states; old/future/missing timestamps; valid zero coordinates; malformed bounds; repeated timestamps; wall-clock rollback; raw-field filtering; restored last-known data; and expiry without host messages. The Unix-socket fixture passes actual encoded telemetry through CoreTransport and the controller. The browser test uses labelled injected GNSS data, disables network access after load, checks three viewport sizes and verifies stale removal, no persistence and no external requests. None connects to a receiver or proves physical accuracy.

Local logs/screenshots are under `evidence/gnss-location/`. No Pi service, security/network configuration, native receiver settings or data files were changed.
