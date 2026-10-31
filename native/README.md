# Pinned native input patch

This directory maintains a small local patch series, not a separate upstream fork. The base is **f-io/LIVI `4bcd1335c2daedba40640e6dc432cd2ed7acfaa4`**, protocol 8. Upstream's GPL-3.0 license and notices remain applicable; retain its `LICENSE` with any source or binary distribution. The patch, exact before/after file SHA-256 values, upstream tree and compiler identity are recorded in `manifest.json`. No changes are pushed to f-io/LIVI.

## Reproduce the checked source build

Use a separate, clean checkout/worktree at the pin. The sparse source needs `native`, `src/main/shared/assets` (embedded icons), and `scripts/livi-link/common` (embedded hostapd configuration **text**, never installed or executed here). Root files, including LICENSE and rust-toolchain.toml, must also be present. A full pinned checkout works too. The old `/workspace/shared/livi-upstream-pinned` path is not present in the current saved environment; `/workspace/livi-native-work` is the isolated sparse worktree used for this increment.

Required: Python 3.9+, Git, architecture-native x86_64 or aarch64 Linux, C/C++ compiler/linker and OpenSSL development headers/pkg-config. Use the pinned Rust **beta-2026-10-03**, which reports **1.100.0-beta.3**, commit `7bbda45cb1ec0a378d91959646a8fa904be3192a`. Do not substitute another compiler to make the guard pass. No JavaScript dependencies or native services are needed for this target.

The current environment installed rustc, rust-std, cargo and rustfmt under `/workspace/native-tools/rust-beta-2026-10-03` from the official `https://static.rust-lang.org/dist/2026-10-03/channel-rust-beta.toml` archives, verifying each SHA-256 listed in `manifest.json`. Their installer used that local prefix and `--disable-ldconfig`; no system Rust, shell startup, library cache, service or security configuration was changed. Cargo downloads use `/workspace/native-tools/cargo-home`, with build output in `/workspace/native-tools/target`. CI uses the same date-pinned toolchain through its existing rustup installation.

From this head-unit repository, with the pinned rustc/cargo on PATH:

```sh
python3 scripts/native-check.py apply /path/to/clean/pinned-livi
python3 scripts/native-check.py compile /path/to/clean/pinned-livi
python3 scripts/native-check.py test /path/to/clean/pinned-livi
```

`apply` refuses an incorrect HEAD, dirty/unrelated work, mismatched originals or a changed patch checksum. It checks before applying and never resets/stashes/cleans existing work. Running it twice deliberately fails; use `check` for an already patched tree. `check` and subsequent stages verify every patched file hash and reject unrelated edits. Do not edit the build copy after verification and assume it still represents this patch.

`compile` builds the **livi-core binary** and compiles core/AA-stack test harnesses with the original Cargo lockfile. It permits ordinary locked registry downloads and compiler/build scripts for those selected dependencies; it does not run the binary, upstream launcher, packaging or firmware provisioning. `test` is frozen/offline and executes only the reviewed `owned_input` test prefix. It fails if dependencies were not fetched by compilation. Actual Rust tests run, including private Unix-pair fixtures and protobuf encoding; they are not a JavaScript reimplementation. Temporary core rigs also attempt paging against their nonexistent temporary helper socket; no real helper socket or host service is used.

The CI `native-input` job applies this exact patch to a separate pinned checkout, builds core, then runs that reviewed subset. Full core/AA test harnesses are compiled, but unreviewed native test suites are not automatically executed: some upstream paths can involve host facilities. The separate full-engine job below provisions the helper, GStreamer host and compositor dependencies. All four release binaries and 40 restricted tests passed at `f0645c6` in CI run 39452496034. See `docs/native-build-plan.md` for the historical source audit.

## Ownership and cleanup policy

- Authenticated connections receive an internal monotonically allocated ID, unrelated to the supplied display name. A RAII guard puts disconnect on the **same FIFO channel** as input, including EOF, write/read errors and task abort. Wire protocol and UID authentication are unchanged.
- One connection owns a held input sequence. Other connections cannot overwrite/release it. Ownership is scoped to the original native session and front; session/front change, disconnect, goodbye and actor drop retire it. Stale moves/releases cannot create a new hold; a fresh press is needed.
- CarPlay uses two fixed HID slots. The patch preserves slot assignment across reorder/compaction, emits a release before reusing a slot, and cancels an over-capacity sequence instead of emitting unsupported contacts. IDs are bounded to 0–9; AA has at most ten contacts. Malformed/duplicate/nonfinite batches do not partially dispatch.
- Android Auto tracks accepted contacts beside the session's fixed advertised geometry. Unknown moves/releases and invalid initial presses are ignored. Terminal coordinates use a valid current position or the last accepted position if outside the picture/cut-outs. Multi-contact transitions are serialized through the real encoder so all held contacts receive an Up sequence.
- Held knob/select/PTT semantics are explicit; PTT key-up uses the press-time binding. Select expiry belongs to the actor/lease, so retired timers cannot release replacement holds. No renderer privileges, device/control API or readiness protocol is added.

These are best-effort native command emissions. A dead transport, process, helper or phone can still prevent delivery. No test proves physical touch/key/PTT release, correct calibration or vehicle readiness. Projection touch remains disabled in the shell. Native engine startup, actual phone/media/compositor validation and secure Electron acceptance remain separate gates.

## Full engine compilation, without startup

The `native-engine` CI job provisions the development packages listed in
`ubuntu24-build-packages.txt` from the Ubuntu 24.04 runner's configured repositories.
It does not change apt sources or install a native service. This separate build
includes `livi-core`, `livi-helperd`, `livi-gst-host` and `livi-compositor` release
binaries for the pinned compiler's `x86_64-unknown-linux-gnu` target. It does not
build firmware, package an appliance, probe GStreamer or execute those binaries.

On an authorized Ubuntu 24.04 build host, provisioning is:

```sh
sudo apt-get update
xargs -a native/ubuntu24-build-packages.txt sudo apt-get install --yes --no-install-recommends
```

With the pinned compiler and the already verified/applied source:

```sh
python3 scripts/native-check.py engine-compile /path/to/pinned-livi
python3 scripts/native-check.py engine-test /path/to/pinned-livi
```

Preflight requires CMake and discoverable development libraries, including
GStreamer >=1.24 and GLib/GIO >=2.56. Cargo fetch uses the unchanged lockfile;
compilation and tests are frozen. The test selection is deliberately restricted:
NAL parsing, codec descriptions, compositor panel/rank arithmetic and in-memory
spectrum calculations. These tests do not start pipelines or a compositor loop.
The separate `native-input` job retains input disconnect/ownership regressions.

`native-evidence/engine-build.json` records compiler identity, lock/license hashes,
Cargo license metadata (including unspecified licenses), installed system package
versions, direct package copyright hashes, fixed build metadata, runner image and
static ELF inspection/hash/size for each binary. Build success is only recorded
after all four artifacts and patched source pass checks. A failed preflight clears
previous artifact evidence. CI retains the report for 14 days; it does not upload
binaries. Workspace license inventory includes packages outside the selected
build; it is not distribution clearance. Upstream GPL notices remain intact.

This is a repeatable pinned source/toolchain recipe, **not a byte-for-byte
reproducibility claim**: runner images and Ubuntu packages receive updates. The
report records actual inputs so differences can be investigated. Hardware target
acceptance and distribution obligations remain separate. The [ARM64 build path](../docs/arm64-build.md) adds a native CI target without treating compilation as Pi acceptance.

In the saved Debian coding environment, a direct full build stops at missing
`glib-2.0.pc`; guarded preflight stops at missing CMake. Read-only apt simulation
cannot locate the development packages and reports an unreadable apt configuration
file. No local apt install, source change or privilege/security workaround was
performed. The separately provisioned CI job is the full-build verification path;
its exact commit/job result, not this recipe alone, establishes a passing build.

## Native ARM64 path

Pass `--target aarch64-unknown-linux-gnu` to compile/test and engine-compile/engine-test on a native ARM64 Linux builder. The default remains x86_64. The compiler must report the selected host and the same pinned release/commit; an x86 compiler cannot claim ARM output. All four engine ELF headers must match the selected 64-bit little-endian machine before build success is recorded. The manifest's official archive hashes document the earlier x86 installation only; they are not ARM archive hashes. CI obtains the date-pinned official ARM compiler with rustup and validates its identity. See [current capability and limitations](../docs/arm64-build.md).
