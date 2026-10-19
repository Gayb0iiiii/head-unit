# Preserve LIVI's engine: pinned native build and verification plan

Status: source audit complete; every build, install, test, packaging, probe and runtime command below is **UNEXECUTED**. No upstream script or native executable was run. This plan keeps the original engine and replaces/adapts only its presentation boundary; it does not treat the JavaScript prototype or its fake sockets as proof that native CarPlay/Android Auto works.

## 1. Audited source and conclusion

- Upstream: `https://github.com/f-io/LIVI`.
- Complete checkout audited: `/workspace/shared/livi-upstream-pinned`.
- Commit: `4bcd1335c2daedba40640e6dc432cd2ed7acfaa4`.
- Git tree: `6ba67543ebeb593cd6423b96786acff834de2857`.
- Commit date: `2026-10-17T04:47:44+02:00`; source epoch `1792205264`.
- App version: `9.5.0`; native workspace crates are generally `0.1.0` and must not be confused with the app version.
- The checkout has 46 workspace members, one Cargo lockfile, no Git submodules/gitlinks, and no Git LFS pointer dependencies. The complete acquisition was verified separately; this audit additionally read the manifests/lockfiles/scripts and found a clean upstream worktree afterward.

**Smallest full Linux head-unit engine build:** Cargo packages `livi-core`, `livi-helperd`, `gst-video-host`, `livi-compositor`. Their static Linux workspace dependency closure contains 33 local crates. Build these original packages with the existing lockfile before extending the UI further.

`livi-core` plus `livi-helperd` is a useful earlier compilation checkpoint, but omits the real media host/compositor and is not a working head unit. No Node package installation is necessary to compile the native packages directly. The original Electron UI and AppImage packaging are separate stages.

Primary evidence: [workspace](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/Cargo.toml), [native builder](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/scripts/build-native.mjs), [CI build](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/.github/workflows/build.yml).

## 2. Original component boundaries and artifacts

| Cargo package | Produced artifact | Original role | Upstream staged location |
| --- | --- | --- | --- |
| `livi-core` | `livi-core` | Authoritative state/config, phone sessions, media supervision, protocol-8 Unix socket, vehicle and system services | `native/livi-helperd/build/Release/livi-core` |
| `livi-helperd` | `livi-helperd` | USB, iAP2, radio/bootstrap and privileged host integration | `native/livi-helperd/build/Release/livi-helperd` |
| `gst-video-host` | `livi-gst-host` | Real video/audio/microphone, codecs and stream processes | `native/livi-gst-video/build/Release/livi-gst-host` |
| `livi-compositor` | `livi-compositor` | Linux nested Wayland compositor, native projection planes and Electron surface | `out/compositor/livi-compositor` |
| `gst-video-addon` (macOS only) | `libgst_video_addon.dylib`, copied as `gst_video.node` | N-API/Cocoa native video view | `native/livi-gst-video/build/Release/gst_video.node` |

The names `gst-video-host` and `livi-gst-host` are intentionally different. `livi-crypto-node` is a Rust dependency of media crates, despite its historical name; the Linux build does not separately copy a crypto `.node` file.

On Linux, `scripts/after-pack.mjs` renames Electron to `livi-ui` and replaces its launcher with a script that starts core. Core starts the UI/helper/media/compositor. On macOS, the app starts core and the package's media binaries receive bundled-GStreamer rpaths. A replacement renderer must preserve these engine responsibilities and authoritative state, rather than owning phone connections or playback independently.

### Cargo target selection

- Linux x64: native x86_64 Linux runner; normal GNU target is `x86_64-unknown-linux-gnu`.
- Linux arm64: native aarch64 Linux runner; normal GNU target is `aarch64-unknown-linux-gnu`.
- macOS arm64: `aarch64-apple-darwin`.
- macOS Intel from an arm64 Mac: `x86_64-apple-darwin`; native script installs this target and passes `--target`.
- The upstream `--arch=arm64`/`--arch=x64` script **does not cross-compile on Linux**. It chooses a cross target only on macOS. Do not run the arm64 script on this x64 executor and label its result an ARM binary.
- `native/.cargo/config.toml` defines `riscv32gc-unknown-linux-gnu` with the Andes `riscv32-linux-gcc` linker and static flags. This is for LIVI Link firmware, not the head unit.
- Upstream CI additionally checks `livid` on `armv7-unknown-linux-musleabihf`; that firmware target is outside the minimal build.

## 3. Toolchain and dependency pins

| Item | Exact evidence at this commit | Meaning |
| --- | --- | --- |
| Rust | `beta-2026-10-03`, minimal profile, `clippy` and `rustfmt`; comment identifies `1.100.0-beta.3` | Use the date channel, not moving `beta`/`stable` |
| Rust edition/resolver | Edition `2024`, resolver `3` | Workspace settings |
| Cargo lock | Format `4`; 567 package entries: 46 local and 521 crates.io registry entries, all 521 with checksums | No Git-sourced crates; registry sources are not vendored |
| Node | `24.x` in README/CI; no exact patch pinned upstream | Choose and record an exact patch for reproducibility |
| pnpm | `12.11.2` in `packageManager` and lock | Do not substitute the installed 11.x wrapper |
| pnpm lock | Format `9.0`, **two YAML documents**: package-manager lock (15 entries), app lock (553 entries) | Keep both documents intact |
| Electron | `44.7.2` resolved | Electron binary download is separate from JS package integrity |
| React / React DOM | `19.3.1` / `19.3.1` resolved | Original UI baseline |
| TypeScript / Vite / Vitest | `7.0.2` / `8.3.4` / `5.0.5` resolved | Original UI/tooling baseline |
| electron-builder | `26.15.3` resolved | Packaging, separate from native compilation |
| AppImage toolset | `1.0.2` in `electron-builder.yml` | Additional packaging tool download/cache |
| GStreamer runtime asset label | `1.28.8` for linux-x64, linux-arm64, macos-arm64 | Already tracked binaries, not headers |

Important Rust lock resolutions: `gstreamer 0.25.4`, `gstreamer-app 0.25.2`, `glib 0.22.10`, `glib-sys 0.22.9`, `aws-lc-rs 1.18.2`, `aws-lc-sys 0.46.0`, `smithay 0.7.0`, `smithay-client-toolkit 0.21.1`, `wayland-client 0.31.15`, `wayland-server 0.31.14`, `tokio 1.53.3`, `nusb 0.2.8`, `openssl-sys 0.9.117`, `prost 0.14.4`, `prost-build 0.14.4`, `protox 0.10.0`, `cc 1.8.0`, `cmake 0.1.58`, `pkg-config 0.3.34`. Both `libc 1.0.0-alpha.5` (workspace API) and transitive `libc 0.2.190` are locked; do not force-unify them.

The original manifests use version ranges in places. The lockfiles, not those ranges alone, establish exact resolution. Cargo's full platform/feature resolution was not executed; Appendix A is a static local-manifest graph.

Sources: [toolchain](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/rust-toolchain.toml), [Cargo lock](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/Cargo.lock), [package manifest](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/package.json), [pnpm lock](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/pnpm-lock.yaml).

## 4. System prerequisites, separated from runtime access

### Linux compile prerequisites

The exact package names in upstream Ubuntu-24.04 CI are:

`build-essential pkg-config libudev1 ca-certificates libssl-dev libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev cmake libwayland-dev libxkbcommon-dev`

Git and the pinned Rust toolchain are also required. `libssl-dev` is important: Linux `livi-cp` links OpenSSL; the macOS manifest additionally enables vendored OpenSSL. CMake is needed by native crypto dependencies, including AWS-LC. The selected media crates explicitly enable GStreamer `v1_24` features, so development libraries must satisfy GStreamer >=1.24, plus the transitive GLib requirements of the locked crates. Establish exact system-library minimums from the fetched locked crate metadata before choosing a build image; they were not available for inspection here.

GStreamer runtime binaries in `assets/gstreamer` contain no `.pc` files or include directories. They do **not** replace the development packages. CI compiles Linux on Ubuntu 24.04 against system development libraries, then packages the tracked runtime bundle. Preserve and test that compile/runtime ABI combination; do not assume identical versions.

The macOS build workflow requires pkg-config and the GStreamer 1.28.8 universal **runtime and development** framework packages under `/Library/Frameworks/GStreamer.framework/Versions/1.0`, plus Xcode/Command Line Tools for C/C++/Objective-C++ and the Apple SDK. The README's short “Node/pnpm/Rust only” sentence is less complete than the actual workflow/build.rs. Apple framework downloads and installations require a separately approved machine/setup stage.

No separate `protoc` executable is required by the checked-in Android Auto build script: it uses Rust `protox::compile` on 25 tracked `.proto` files and `prost_build::compile_fds`. The macOS addon build.rs uses `cc`, pkg-config and napi-build to compile the tracked `gst_video_mac.mm` with C++17 and macOS minimum 11.0, linking Cocoa and QuartzCore.

### Runtime prerequisites, not necessary for a compile-only check

README's Linux native CarPlay/wireless-AA runtime package names:

`bluez libspa-0.2-bluetooth hostapd dnsmasq-base iw rfkill avahi-daemon avahi-utils pulseaudio-utils`

AppImage integration may additionally need `fuse3`. Real operation also requires the intended display/Wayland/EGL/DRM stack, audio services/devices, USB or radio hardware, applicable MFi/i2c/gpio access, and service permissions. These must be tested on the selected host/hardware, not inferred from compilation. Fedora equivalents and package naming differences are documented in upstream README; do not transplant Debian package names into another distribution.

### What is actually present in this executor (read-only checks, 2026-10-19)

| Check | Observation |
| --- | --- |
| OS / CPU | Debian 13.6 (trixie), x86_64 |
| Node | `v24.19.0` |
| pnpm wrapper package metadata | `11.25.0`, not required `12.11.2`; wrapper was read, not invoked |
| Corepack | Executable found on PATH; package-manager preparation was not run |
| Rust tools | `cargo`, `rustup`, `rustc` not found on PATH |
| C/C++ / make | GCC/G++ `14.2.0`, GNU Make `4.4.1` |
| pkg-config | `1.8.1`; OpenSSL reports `3.5.7` |
| CMake / Ninja / protoc | Not found on PATH; protoc is not a requirement for this graph |
| Development package metadata | pkg-config cannot resolve GStreamer, GStreamer app/video, GLib/GIO, Wayland client/server, xkbcommon, libudev, libdrm or EGL |
| Debian package database | `dpkg-query` reports no packages even for libc6/pkg-config, so package-level status is unreliable here; use the direct tool/header observations above |
| Dependency/build output directories | No upstream node_modules, .pnpm-store, native/target, staged native builds or out directory |
| Bundled source assets | Complete GStreamer runtime asset directories and LIVI Link firmware files exist; none were executed |

**Current blocker:** this executor cannot perform the pinned native build without approved toolchain/development-dependency provisioning. Network reachability and dependency download success have not been tested. No setup/install request is implied by this document.

## 5. External assets and excluded build paths

1. **GStreamer bundles are in the pinned Git tree:** linux-x64, linux-arm64 and macos-arm64, approximately 536 MiB total on disk. Preserve symlinks and file modes. `version.txt` says 1.28.8, while both Linux `packages.txt` files record `gst-plugins-bad1.0 1.28.7-2` alongside the main/base/good/libav 1.28.8-1 packages. Do not describe every bundled component as exactly 1.28.8.
2. **Asset rebuild is a separate, non-reproducible-by-default pipeline:** `.github/workflows/gstreamer-assets.yml` uses moving `debian:stable-slim`, resolves latest stable macOS GStreamer, and `build-backport-linux.sh` pulls current Debian `forky` sources. It adds apt sources, installs/builds packages and runs ldconfig. Do not run it as part of this head-unit build. If rebuilding assets is later necessary, pin container digests, apt snapshot/source versions, source checksums and patch series first. macOS patch/faad scripts fetch GStreamer source and faad2 (default 2.11.4); capture their hashes as well.
3. **No submodule init is needed.** Cargo needs 521 locked registry packages; npm needs the pinned package manager and app packages. These are not all vendored in this source checkout. Registry checksums do not by themselves attest separately downloaded Electron/packaging binaries; retain their published checksum evidence in the build record.
4. **Core compile-time assets:** CarPlay includes tracked `src/main/shared/assets/icon-{120,180,256}.b64`; preserve the full repository layout when building native code.
5. **LIVI Link is an independent optional firmware/provisioning product:** excluded packages include `livid`, `livi-link-provision-cli`, `livi-link-provision`, `mkbootimg-v821b`, `imx6ul-uboot`, `livi-btd`, `livi-accessoryd`, `livi-mdns`, `livi-web`, `livi-wifid`, and their board toolchains. The host's `livi-link-host` crate remains part of the original engine, so existing dongle support is preserved without rebuilding/flashing firmware.
6. **Avoid blindly building the whole workspace first:** `livi-link-provision/build.rs` writes empty placeholders when embedded firmware/bindshell assets are missing. The selected engine build excludes that script. Whole-workspace tests are a separate parity stage in a disposable checkout with all expected assets and no unnoticed generated stubs. Native `usb-probe` is a hardware utility, not a required head-unit build target or safe automatic smoke test.

## 6. Reproducible build sequence (all commands UNEXECUTED)

Execute only after the user approves a suitable build environment and the toolchain/package provisioning needed there. Use a writable build copy/worktree at the exact commit, retaining the audited checkout unchanged. This document does not install anything, adjust networking/security, or grant native runtime/hardware access.

### Stage A: provision and record inputs

Choose an arch-native Linux build environment matching the selected target; Ubuntu 24.04 is the upstream CI baseline. Pin its image digest and apt snapshot, record exact installed package versions, and install the prerequisites listed above through the environment's approved process. Install Rust `beta-2026-10-03` with clippy/rustfmt. For UI work, select Node `24.19.0` or another explicit tested 24.x patch and pnpm `12.11.2`; record any deviation.

In the commands below, `SOURCE` is the approved writable copy at the pinned commit; `BUILD_ROOT` is a dedicated build-output directory on that same approved machine. Neither variable refers to a deployment or publication destination.

UNEXECUTED preflight after provisioning:

```sh
cd "$SOURCE"
test "$(git rev-parse HEAD)" = 4bcd1335c2daedba40640e6dc432cd2ed7acfaa4
git status --porcelain
rustc +beta-2026-10-03 --version --verbose
cargo +beta-2026-10-03 --version
pkg-config --modversion openssl gstreamer-1.0 gstreamer-app-1.0 gstreamer-video-1.0 glib-2.0 wayland-client wayland-server xkbcommon
```

Pass only with the expected architecture/toolchain, resolvable development libraries, complete assets, and no unexpected source edits. A bare successful `cargo metadata --no-deps` would not prove native compilation.

### Stage B: fetch locked dependencies, then compile the engine

Network/dependency-fetch stage, UNEXECUTED:

```sh
cd "$SOURCE"
cargo +beta-2026-10-03 fetch --manifest-path native/Cargo.toml --locked --target x86_64-unknown-linux-gnu
```

For a native arm64 GNU builder substitute `aarch64-unknown-linux-gnu`. Fetch may include more dependencies than the four selected packages because the workspace lock covers more packages. Do not update/regenerate Cargo.lock to make an error disappear; report the exact missing version/source first.

Compile-only stage, UNEXECUTED:

```sh
cd "$SOURCE"
export CARGO_TARGET_DIR="$BUILD_ROOT/cargo-target"
export CARGO_INCREMENTAL=0
export LIVI_VERSION=9.5.0
export LIVI_BUILD_DATE='2026-10-17 02:47 UTC'
export SOURCE_DATE_EPOCH=1792205264
cargo +beta-2026-10-03 build --manifest-path native/Cargo.toml --release --frozen \
  -p livi-core -p livi-helperd -p gst-video-host -p livi-compositor
```

`--frozen` combines locked resolution and offline operation after the explicit fetch. The build executes dependency build scripts/native compiler tools, which is why it is deferred. Explicit package selection compiles their transitive graph but does not build the firmware/provisioning executables.

Expected `$CARGO_TARGET_DIR/release` outputs: `livi-core`, `livi-helperd`, `livi-gst-host`, `livi-compositor`. Inspect them with `file`, `readelf`/`objdump` and hashes; inspect dynamic dependencies without executing binaries (`readelf -d`, not an untrusted executable or bundled loader). Save compiler versions, build logs, environment allowlist, lockfile hashes and artifact SHA-256s.

Compile-time metadata is deliberately fixed. `scripts/build-native.mjs` otherwise inserts the current wall-clock build date, and only uses `--locked` when `CI` is set. Source/lock pins alone do not promise byte-identical builds: image/toolchain paths, system libraries, linker, generated archives and packaging timestamps must also be fixed and compared in a second independent build.

### Stage C: stage the original engine in its expected layout

To use the existing script after a successful direct build, the equivalent reviewed operation is UNEXECUTED:

```sh
cd "$SOURCE"
CI=1 CARGO_NET_OFFLINE=true LIVI_VERSION=9.5.0 \
LIVI_BUILD_DATE='2026-10-17 02:47 UTC' SOURCE_DATE_EPOCH=1792205264 \
CARGO_TARGET_DIR="$BUILD_ROOT/cargo-target" \
node scripts/build-native.mjs --arch=x64
```

This invokes Cargo again, discovers the target directory with Cargo metadata and copies the four artifacts to the locations in section 2. Use `--arch=arm64` only on an ARM Linux host. For macOS, the same script selects the addon and no compositor, with Apple target setup and framework prerequisites approved in advance.

Do not run `pnpm run install:clean`: it deletes pnpm-lock.yaml and resolves anew. Do not run release workflows: they upload/publish and may modify branches/tags.

### Stage D: compile test harnesses, then run reviewed tests in isolation

UNEXECUTED compile-only test preparation:

```sh
cd "$SOURCE"
cargo +beta-2026-10-03 fmt --manifest-path native/Cargo.toml --all --check
cargo +beta-2026-10-03 clippy --manifest-path native/Cargo.toml --frozen \
  -p livi-core -p livi-helperd -p gst-video-host -p livi-compositor --all-targets -- -D warnings
cargo +beta-2026-10-03 test --manifest-path native/Cargo.toml --frozen --no-run \
  -p livi-core -p livi-helperd -p gst-video-host -p livi-compositor
```

Then, only in an approved test sandbox with no host device/network/service access and a reviewed test inventory, run the selected real-source tests and relevant dependency-library suites (protocol framing/state, iAP2/AA/CP codecs, media command/plane/lifeline handling). `cargo test` without `--no-run` executes native code; it is not covered by this audit. Selected top-level tests do not automatically execute every dependency's unit tests, so add explicit packages from Appendix A. Record exact test names/counts, skipped cases and fixtures. For full upstream parity, CI's commands are `cargo clippy --workspace --all-targets --locked -- -D warnings` and `cargo test --workspace --locked`; first review the excluded firmware build-script effects above.

### Stage E: original UI baseline and packaging, optional to engine compilation

After approved Node dependency provisioning, UNEXECUTED:

```sh
cd "$SOURCE"
node --version
pnpm --version # must be 12.11.2
HUSKY=0 pnpm install --frozen-lockfile --ignore-scripts
pnpm run lint:check
pnpm run typecheck
pnpm run test:main
pnpm run test:renderer
pnpm run build:app
```

`--ignore-scripts` matches upstream typecheck CI; it does not install the Electron executable and may leave other lifecycle-generated artifacts unavailable. Before runtime/packaging, explicitly review/authorize the original permitted dependency builds (`electron`, `electron-winstaller`, `esbuild` in pnpm-workspace.yaml), root postinstall schema sync, and required downloads. Do not silently enable arbitrary install scripts. The normal upstream build workflow uses `HUSKY=0 pnpm install --frozen-lockfile` once those steps are approved.

Packaging command after that approval, UNEXECUTED:

```sh
CI=1 LIVI_VERSION=9.5.0 LIVI_BUILD_DATE='2026-10-17 02:47 UTC' \
SOURCE_DATE_EPOCH=1792205264 pnpm run build:linux:x64
```

That command runs native build, Vite and electron-builder with `--publish never`; it is not merely a UI build. Verify original UI functionality as the native baseline before integrating the redesigned renderer. Keep publication disabled.

## 7. Runtime verification requires a separate approved lab

**Do not launch `livi-core` as a casual readiness check.** Its startup writes state/logs/pairing identity, binds a Unix socket and other listeners, starts helper/media/network-related tasks, writes a WirePlumber config and requests a user-service restart, and attempts udev/privileged setup. `LIVI_NO_UI=1` only disables the UI; it does not disable these engine behaviors. `--help` is not a supported dry-run API. The installer scripts alter host services/permissions/network configuration and are outside this plan's authorization.

Evidence: [core main](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/bin/livi-core/src/main.rs), [host setup](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/bin/livi-core/src/host_setup.rs), [udev setup](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/bin/livi-core/src/udev_rule.rs), [services](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/bin/livi-core/src/services.rs).

A suitable first lab is a disposable VM/container prepared by its owner: dedicated non-root user, no passwordless elevation, no host D-Bus/systemd/PipeWire/Wayland sockets, no USB/i2c/gpio/DRM device passthrough, and externally enforced network isolation. Isolated HOME/XDG paths are necessary but are **not** a security boundary. Any later real-device pass needs explicit host/hardware authorization and configuration review.

Only after that separate lab approval, a runtime launch plan is UNEXECUTED:

```sh
# LAB_* must be dedicated paths inside the approved isolated lab.
cd "$SOURCE"
env HOME="$LAB_HOME" XDG_CONFIG_HOME="$LAB_CONFIG" XDG_DATA_HOME="$LAB_DATA" \
  XDG_RUNTIME_DIR="$LAB_RUNTIME" LIVI_ROOT="$SOURCE" LIVI_NO_UI=1 \
  "$SOURCE/native/livi-helperd/build/Release/livi-core"
```

Set `LIVI_ROOT` explicitly: the source's auto-detection currently checks `native/livi-helperd/Cargo.toml`, while this checkout's workspace manifest is `native/Cargo.toml`; do not rely on finding the repository from an arbitrary working directory. This flag selects resources, not a new engine implementation.

Verification sequence:

1. Observe startup/teardown and all expected/denied external-service attempts. Confirm socket at `$LAB_RUNTIME/livi/core.sock`, private runtime directory, single-instance locking and bounded child lifetime.
2. Use a read-only client: send protocol-8 hello, validate welcome/state/revision; do not send actions automatically. Test stale/rejected protocol handling, restart, resync and no replay against the real core.
3. After native-execution approval, `livi-gst-host --probe` can validate codec JSON (`h264`, `h265`, `vp9`, `av1`). It loads GStreamer/plugins and may probe decoder capabilities; it is not a passive file check. Run only in the same lab with the intended bundle and isolated registry cache. A decoder availability report is not proof of actual playback.
4. In a subsequently approved display/audio lab, run real media fixtures and compositor planes. Validate codec decode, audio/mic pipelines, fullscreen/hidden transitions, held-touch cancellation and child cleanup. No phone pairing or radio/AP changes belong in the first isolation stage.
5. On the explicitly approved target head unit with appropriate devices/services, test original UI + unchanged engine first, then the redesigned UI using the same engine. Cover CarPlay/AA connection, Home without disconnecting, navigation return, remembered settings, intentional pause/no surprise playback, phone switching, call audio, projection/camera ownership, USB/radio disconnect/reconnect and graceful shutdown.
6. Capture evidence separately for compile, native tests, isolated core/socket, real media/display and physical-phone integration. Stop and report the exact blocker at each gate; do not replace a failing native component with a simulated success.

## 8. Acceptance and remaining decisions

The next authorized implementation milestone should be an unchanged-engine native build and isolated verification record, followed by a thin renderer integration. Before execution, choose the actual deployment OS/architecture and approve the build environment/dependency provisioning. Runtime host changes/hardware access remain separate decisions. No installation, build, unit-test execution, upstream script, native probe, runtime connection, firmware operation, security/network change or publication was performed during this source audit.

A successful native build has **not** been established. Byte-for-byte reproducibility has **not** been established. Original UI/native compatibility and real phone/media operation have **not** been established. The source graph, exact locks, missing prerequisites and safe staged verification path are established by this audit.

## Appendix A. Static Linux engine workspace graph

This is the recursive normal/build dependency closure for the four selected Linux packages, read from all 46 manifests. Platform-specific Linux dependencies are included; test-only and macOS-only edges are excluded. This does not replace a later frozen Cargo metadata/tree check. All listed crates remain intact.

| Local package | Local direct dependencies on Linux | Manifest |
| --- | --- | --- |
| `gst-video-host` | `livi-audio-player`, `livi-audio-stream`, `livi-audio-uplink`, `livi-host-proto`, `livi-screen-stream`, `livi-video-fanout`, `livi-video-nal`, `livi-video-player` | `native/livi-gst-video/rust/host/Cargo.toml` |
| `iap2-csm` | None | `native/livi-helperd/crates/iap2-csm/Cargo.toml` |
| `iap2-link` | None | `native/livi-helperd/crates/iap2-link/Cargo.toml` |
| `iap2-mfi` | `livi-net` | `native/livi-helperd/crates/iap2-mfi/Cargo.toml` |
| `iap2-usbmux` | None | `native/livi-helperd/crates/iap2-usbmux/Cargo.toml` |
| `iap2-wired` | `iap2-usbmux` | `native/livi-helperd/crates/iap2-wired/Cargo.toml` |
| `livi-aa` | `livi-aa-proto`, `livi-host-proto`, `livi-session-io`, `livi-wifi` | `native/livi-helperd/crates/livi-aa/Cargo.toml` |
| `livi-aa-proto` | None | `native/livi-helperd/crates/livi-aa-proto/Cargo.toml` |
| `livi-aa-stack` | `livi-aa-proto`, `livi-core-proto`, `livi-session-io`, `livi-wifi` | `native/livi-helperd/crates/livi-aa-stack/Cargo.toml` |
| `livi-audio-player` | `livi-audio-stream`, `livi-audio-uplink`, `livi-host-proto` | `native/livi-gst-video/rust/audioplayer/Cargo.toml` |
| `livi-audio-stream` | `livi-crypto-node` | `native/livi-gst-video/rust/audio/Cargo.toml` |
| `livi-audio-uplink` | `livi-crypto-node` | `native/livi-gst-video/rust/mic/Cargo.toml` |
| `livi-compositor` | None | `native/livi-compositor/rust/Cargo.toml` |
| `livi-core` | `livi-aa-stack`, `livi-core-proto`, `livi-cp`, `livi-dab`, `livi-host-proto`, `livi-link-host`, `livi-media`, `livi-rtlsdr`, `livi-wifi` | `native/livi-helperd/bin/livi-core/Cargo.toml` |
| `livi-core-proto` | None | `native/livi-helperd/crates/livi-core-proto/Cargo.toml` |
| `livi-cp` | None | `native/livi-helperd/crates/livi-cp/Cargo.toml` |
| `livi-crypto-node` | None | `native/livi-crypto/rust/Cargo.toml` |
| `livi-dab` | None | `native/livi-helperd/crates/livi-dab/Cargo.toml` |
| `livi-helperd` | `iap2-csm`, `iap2-link`, `iap2-mfi`, `iap2-usbmux`, `iap2-wired`, `livi-aa`, `livi-link-host`, `livi-net`, `livi-runtime`, `livi-wifi` | `native/livi-helperd/bin/livi-helperd/Cargo.toml` |
| `livi-hfp` | None | `native/livi-helperd/crates/livi-hfp/Cargo.toml` |
| `livi-host-proto` | None | `native/livi-host-proto/rust/Cargo.toml` |
| `livi-link-host` | `livi-net`, `livi-wifi` | `native/livi-helperd/crates/livi-link-host/Cargo.toml` |
| `livi-media` | `livi-core-proto`, `livi-host-proto` | `native/livi-helperd/crates/livi-media/Cargo.toml` |
| `livi-net` | None | `native/livi-helperd/crates/livi-net/Cargo.toml` |
| `livi-rtlsdr` | None | `native/livi-helperd/crates/livi-rtlsdr/Cargo.toml` |
| `livi-runtime` | `iap2-csm`, `iap2-link`, `iap2-mfi`, `livi-hfp`, `livi-host-proto`, `livi-wifi` | `native/livi-helperd/crates/livi-runtime/Cargo.toml` |
| `livi-screen-stream` | `livi-crypto-node`, `livi-video-nal` | `native/livi-gst-video/rust/screen/Cargo.toml` |
| `livi-session-io` | None | `native/livi-helperd/crates/livi-session-io/Cargo.toml` |
| `livi-video-codec` | None | `native/livi-gst-video/rust/codec/Cargo.toml` |
| `livi-video-fanout` | `livi-video-nal` | `native/livi-gst-video/rust/fanout/Cargo.toml` |
| `livi-video-nal` | None | `native/livi-gst-video/rust/nal/Cargo.toml` |
| `livi-video-player` | `livi-host-proto`, `livi-video-codec` | `native/livi-gst-video/rust/player/Cargo.toml` |
| `livi-wifi` | None | `native/livi-helperd/crates/livi-wifi/Cargo.toml` |

Other workspace packages outside this Linux build selection (not deleted): `gst-video-addon`, `imx6ul-uboot`, `livi-accessoryd`, `livi-bt-host`, `livi-btd`, `livi-link-provision`, `livi-link-provision-cli`, `livi-mdns`, `livi-web`, `livi-wifid`, `livid`, `mkbootimg-v821b`, `usb-probe`. `livi-bt-host` is used by the macOS helper; `gst-video-addon` is built for macOS. The others are firmware/provisioning/hardware-utility paths.

## Appendix B. Exact direct JavaScript package resolutions

For the optional original Electron baseline, these are app-lock versions (peer-resolution suffixes are omitted from this display only; the full lockfile remains authoritative). Package categories follow the original manifest.

| Package | Category | Resolved version |
| --- | --- | --- |
| `@base-ui/react` | dependencies | `1.9.0` |
| `@emotion/react` | dependencies | `11.14.0` |
| `@emotion/styled` | dependencies | `11.14.1` |
| `@fontsource/roboto` | dependencies | `5.3.0` |
| `@mui/icons-material` | dependencies | `9.5.0` |
| `@mui/material` | dependencies | `9.5.0` |
| `@mui/system` | dependencies | `9.5.0` |
| `i18next` | dependencies | `26.4.6` |
| `react-i18next` | dependencies | `17.0.17` |
| `react-router` | dependencies | `8.4.0` |
| `zustand` | dependencies | `5.0.15` |
| `@biomejs/biome` | devDependencies | `2.5.15` |
| `@testing-library/jest-dom` | devDependencies | `7.0.1` |
| `@testing-library/react` | devDependencies | `16.3.3` |
| `@types/node` | devDependencies | `26.6.5` |
| `@types/react` | devDependencies | `19.3.0` |
| `@types/react-dom` | devDependencies | `19.3.0` |
| `@vitejs/plugin-react` | devDependencies | `6.1.2` |
| `@vitest/coverage-v8` | devDependencies | `5.0.5` |
| `electron` | devDependencies | `44.7.2` |
| `electron-builder` | devDependencies | `26.15.3` |
| `husky` | devDependencies | `9.1.7` |
| `jsdom` | devDependencies | `30.1.3` |
| `lint-staged` | devDependencies | `17.6.0` |
| `react` | devDependencies | `19.3.1` |
| `react-dom` | devDependencies | `19.3.1` |
| `typescript` | devDependencies | `7.0.2` |
| `vite` | devDependencies | `8.3.4` |
| `vite-plugin-electron` | devDependencies | `1.1.2` |
| `vitest` | devDependencies | `5.0.5` |

## Appendix C. Audited input SHA-256s

| Path | SHA-256 |
| --- | --- |
| `rust-toolchain.toml` | `2e60e0cc11a08e5fcd0a556357d4367af6f5ee74baf0598332f732c9189de072` |
| `native/Cargo.toml` | `f82683b3914968a283aa88bb5e4476a04d44f7184ad41ec66e6dbfc65ba4a2e0` |
| `native/Cargo.lock` | `58b6ce35b222ed056a5e88c100bb9c5729bd2dd6a311d48cae32c1ed550ed8b5` |
| `package.json` | `9bbc14f35e814dc5fe6d215fca3038c9c22161e9075037ecfca4e07f0b0a008a` |
| `pnpm-lock.yaml` | `9d42c0bfcd70ff49a3efdd758051c84503fb0e688bf4964a9679b78bf5c4f164` |
| `scripts/build-native.mjs` | `5c170c8877e8f4a665c7703059ee1bbe8c09a36f981fcd0b76e7b9c84e956b79` |
| `electron-builder.yml` | `d954f0e10d5c6d00f48712b82f9050e0da01d816b14886cb7e0d1bc03e73ccdd` |
