# Native ARM64 Linux build checkpoint

The repository now defines `native-arm64` on GitHub's `ubuntu-24.04-arm` runner, alongside the unchanged x86 native jobs. This is an architecture-native source build, **not cross-compilation**, a Pi installation, a packaged appliance or a claim that CarPlay works. [GitHub documents this standard ARM64 runner](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job).

## Exact source and compiler boundary

- Upstream LIVI: `4bcd1335c2daedba40640e6dc432cd2ed7acfaa4`, with the existing hash-verified input-ownership patch and unchanged Cargo.lock.
- Rust: `beta-2026-10-03`; required release `1.100.0-beta.3`, commit `7bbda45cb1ec0a378d91959646a8fa904be3192a`.
- ARM target and compiler host: `aarch64-unknown-linux-gnu`. Default x86 host remains `x86_64-unknown-linux-gnu`.
- Cargo fetch is locked; full engine compilation and reviewed tests are frozen. Cargo metadata records resolved crate versions and licenses. No registry versions or Rust compiler pins are relaxed for ARM.
- System development packages come from the runner's configured Ubuntu 24.04 repositories. Their **actual exact installed versions** and runner image are recorded in `engine-build.json`; their resolution is not snapshot-pinned. This is not byte-identical reproducibility or a fixed system-dependency lock claim.

The original upstream Linux builder's `--arch=arm64` alone does not create an ARM cross-build on x86. The repository instead passes an explicit target to every Cargo compile/test command and requires rustc's native host to match before any build. An environment `CARGO_BUILD_TARGET` cannot silently change that target. A compiler with a different release or commit is rejected on both architectures.

All four release outputs (`livi-core`, `livi-helperd`, `livi-gst-host`, `livi-compositor`) must have 64-bit little-endian ELF headers with machine 183 for ARM64 or 62 for x86_64. The guard reads bytes and invokes readelf for inspection; it never invokes the engine or a dynamic loader. Missing/mismatched artifacts fail the build report. Compiler, lock/license hashes, package versions, metadata and binary hashes remain recorded. Report capabilities explicitly keep engine startup, phone testing and hardware validation false.

## Commands on an authorized ARM64 builder

After the same reviewed development prerequisites and pinned compiler are available, use a separate clean checkout at the upstream pin:

```sh
python3 scripts/native-check.py apply /path/to/pinned-livi
python3 scripts/native-check.py engine-compile /path/to/pinned-livi --target aarch64-unknown-linux-gnu
python3 scripts/native-check.py engine-test /path/to/pinned-livi --target aarch64-unknown-linux-gnu
python3 scripts/native-check.py compile /path/to/pinned-livi --target aarch64-unknown-linux-gnu
python3 scripts/native-check.py test /path/to/pinned-livi --target aarch64-unknown-linux-gnu
```

`engine-test` restricts execution to reviewed NAL/codec, compositor arithmetic and in-memory spectrum tests. `compile` compiles core/input harnesses; `test` runs only the reviewed `owned_input` subset. No upstream launcher, service installer, GStreamer pipeline, phone transport, firmware utility or compositor loop is executed. The CI job retains an architecture-specific `native-arm64-evidence` report artifact, not binaries. A failed or timed-out test is not hardware readiness even if compilation succeeded.

## Current local blockers and validation

Read-only inspection of this selected workspace found x86_64 Debian 13, no rustc/rustup/cargo, ARM cross compiler, ARM emulator or CMake on PATH. pkg-config finds OpenSSL 3.5.7 but cannot resolve GStreamer, GLib, Wayland client or xkbcommon. Local ARM compilation was not attempted or claimed; no system installation or emulator setup was performed. Evidence is in `evidence/arm64-path/environment.json`.

Local regression tests cover target selection without mutating the source pin, exact compiler identity, native-host mismatch, explicit core/test target selection despite an environment override, both supported ELF machine identities and rejection before artifact inspection. These are orchestration/guard tests using synthetic fixtures; actual ARM compilation and Rust test results must come from the exact-head CI job, not these fixtures.

The chosen Ubuntu GNU ABI does not establish compatibility with every Armbian image. Actual Pi loader/library versions, GStreamer runtime packaging, GPU/Wayland support, sound, USB, motion/focus, MFi hardware where needed, phone negotiation and physical controls remain separate acceptance gates. No Pi configuration, pairing, security/network changes, engine startup, merge or deployment is included.
