# Pinned native input patch

This directory maintains a small local patch series, not a separate upstream fork. The base is **f-io/LIVI `4bcd1335c2daedba40640e6dc432cd2ed7acfaa4`**, protocol 8. Upstream's GPL-3.0 license and notices remain applicable; retain its `LICENSE` with any source or binary distribution. The patch, exact before/after file SHA-256 values, upstream tree and compiler identity are recorded in `manifest.json`. No changes are pushed to f-io/LIVI.

## Reproduce the checked source build

Use a separate, clean checkout/worktree at the pin. The sparse source needs `native`, `src/main/shared/assets` (embedded icons), and `scripts/livi-link/common` (embedded hostapd configuration **text**, never installed or executed here). Root files, including LICENSE and rust-toolchain.toml, must also be present. A full pinned checkout works too. The old `/workspace/shared/livi-upstream-pinned` path is not present in the current saved environment; `/workspace/livi-native-work` is the isolated sparse worktree used for this increment.

Required: Python 3.9+, Git, x86_64 Linux, C/C++ compiler/linker and OpenSSL development headers/pkg-config. Use the pinned Rust **beta-2026-10-03**, which reports **1.100.0-beta.3**, commit `7bbda45cb1ec0a378d91959646a8fa904be3192a`. Do not substitute another compiler to make the guard pass. No JavaScript dependencies or native services are needed for this target.

The current environment installed rustc, rust-std, cargo and rustfmt under `/workspace/native-tools/rust-beta-2026-10-03` from the official `https://static.rust-lang.org/dist/2026-10-03/channel-rust-beta.toml` archives, verifying each SHA-256 listed in `manifest.json`. Their installer used that local prefix and `--disable-ldconfig`; no system Rust, shell startup, library cache, service or security configuration was changed. Cargo downloads use `/workspace/native-tools/cargo-home`, with build output in `/workspace/native-tools/target`. CI uses the same date-pinned toolchain through its existing rustup installation.

From this head-unit repository, with the pinned rustc/cargo on PATH:

```sh
python3 scripts/native-check.py apply /path/to/clean/pinned-livi
python3 scripts/native-check.py compile /path/to/clean/pinned-livi
python3 scripts/native-check.py test /path/to/clean/pinned-livi
```

`apply` refuses an incorrect HEAD, dirty/unrelated work, mismatched originals or a changed patch checksum. It checks before applying and never resets/stashes/cleans existing work. Running it twice deliberately fails; use `check` for an already patched tree. `check` and subsequent stages verify every patched file hash and reject unrelated edits. Do not edit the build copy after verification and assume it still represents this patch.

`compile` builds the **livi-core binary** and compiles core/AA-stack test harnesses with the original Cargo lockfile. It permits ordinary locked registry downloads and compiler/build scripts for those selected dependencies; it does not run the binary, upstream launcher, packaging or firmware provisioning. `test` is frozen/offline and executes only the reviewed `owned_input` test prefix. It fails if dependencies were not fetched by compilation. Actual Rust tests run, including private Unix-pair fixtures and protobuf encoding; they are not a JavaScript reimplementation. Temporary core rigs also attempt paging against their nonexistent temporary helper socket; no real helper socket or host service is used.

The CI `native-input` job applies this exact patch to a separate pinned checkout, builds core, then runs that reviewed subset. Full core/AA test harnesses are compiled, but unreviewed native test suites are not automatically executed: some upstream paths can involve host facilities. The full engine still needs the separate helper, GStreamer host and compositor builds and their development libraries. See `docs/native-build-plan.md`.

## Ownership and cleanup policy

- Authenticated connections receive an internal monotonically allocated ID, unrelated to the supplied display name. A RAII guard puts disconnect on the **same FIFO channel** as input, including EOF, write/read errors and task abort. Wire protocol and UID authentication are unchanged.
- One connection owns a held input sequence. Other connections cannot overwrite/release it. Ownership is scoped to the original native session and front; session/front change, disconnect, goodbye and actor drop retire it. Stale moves/releases cannot create a new hold; a fresh press is needed.
- CarPlay uses two fixed HID slots. The patch preserves slot assignment across reorder/compaction, emits a release before reusing a slot, and cancels an over-capacity sequence instead of emitting unsupported contacts. IDs are bounded to 0–9; AA has at most ten contacts. Malformed/duplicate/nonfinite batches do not partially dispatch.
- Android Auto tracks accepted contacts beside the session's fixed advertised geometry. Unknown moves/releases and invalid initial presses are ignored. Terminal coordinates use a valid current position or the last accepted position if outside the picture/cut-outs. Multi-contact transitions are serialized through the real encoder so all held contacts receive an Up sequence.
- Held knob/select/PTT semantics are explicit; PTT key-up uses the press-time binding. Select expiry belongs to the actor/lease, so retired timers cannot release replacement holds. No renderer privileges, device/control API or readiness protocol is added.

These are best-effort native command emissions. A dead transport, process, helper or phone can still prevent delivery. No test proves physical touch/key/PTT release, correct calibration or vehicle readiness. Projection touch remains disabled in the shell. Native engine startup, actual phone/media/compositor validation and secure Electron acceptance remain separate gates.
