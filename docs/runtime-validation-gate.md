# Native runtime validation gate

Audit: 2026-10-19 UTC. Read-only inspection of this prototype, the pinned upstream reference files, command availability, development metadata, runtime libraries, and visible devices. No package installation, download, service/window launch, socket probe, browser retry, sandbox change, or environment switch was performed.

## Source acquisition follow-up

After this initial audit, the complete tracked repository tree was acquired in `/workspace/shared/livi-upstream-pinned` at commit `4bcd1335c2daedba40640e6dc432cd2ed7acfaa4`, tree `6ba67543ebeb593cd6423b96786acff834de2857`. All 1,924 tracked paths are present, the worktree is clean and `git fsck --full` passes. There are no Git submodules/gitlinks or LFS pointer files. This is a shallow pinned checkout, not full history; external dependency downloads/build output remain absent. The source-incompleteness facts below describe the earlier 32-file reference directory, not the newly acquired tree. Toolchain, native execution and hardware gates remain open. See evidence/upstream-source-provenance.json and the full-source build/shell plans.

## Initial audit result

The current workspace can support portable JavaScript controller/codec development and injected-boundary tests. It does not currently contain a buildable or runnable LIVI engine. The immediate blockers are incomplete source and missing toolchain/development dependencies. Native composition and phone testing also require a permitted runtime/display and actual hardware access. More mock tests cannot close those gates.

The host is Linux x86_64, Debian 13.6 (Trixie), with Node v24.19.0, npm 11.9.0, pkg-config 1.8.1, GCC 14.2.0 and make available. This is an upstream-supported OS/architecture family; the blocker is not that Debian/x86_64 is inherently unsupported.

## Verified local facts

### 1. Upstream materialization is reference-only

`/workspace/shared/livi-upstream-readonly` contains 32 source/reference files, not a full checkout. The research pin remains `f-io/LIVI@4bcd1335c2daedba40640e6dc432cd2ed7acfaa4`, package 9.5.0, control protocol 8.

These expected paths are absent:

- `.git`, `package.json`, `pnpm-lock.yaml`, `rust-toolchain.toml`
- `native/Cargo.toml` and the rest of the complete workspace/dependency graph
- `native/livi-helperd/build/Release/livi-core`
- `native/livi-helperd/build/Release/livi-helperd`
- `native/livi-gst-video/build/Release/livi-gst-host`
- `out/compositor/livi-compositor`
- `node_modules/electron/dist/electron`
- `assets/gstreamer/linux-x64`

No Cargo.toml or package.json exists anywhere within that reference directory. There is therefore neither a complete build graph nor the native artifacts expected by upstream `resources.rs`.

The prototype's own package.json has no Electron/Rust/GStreamer dependencies or native build target. Its build script syntax-checks JavaScript and packages an allowlisted browser preview. `electron/host.mjs` attaches to a window provided by another host; it does not create a BrowserWindow or compose a native video surface. Running the prototype's build cannot produce LIVI native binaries.

### 2. Build dependencies are missing, while some runtime libraries exist

Absent from PATH: `rustc`, `cargo`, `rustup`, `cmake`, `electron`, `livi-core`, `livi-helperd`, `livi-gst-host`, `livi-compositor`, `gst-launch-1.0`, `gst-inspect-1.0`. Electron module resolution from this project returns `ERR_MODULE_NOT_FOUND`. A pnpm wrapper is on PATH; its functioning package-manager version was not invoked or verified.

`pkg-config --modversion` cannot resolve any of:

- gstreamer-1.0, gstreamer-app-1.0, gstreamer-video-1.0, gstreamer-audio-1.0, gstreamer-base-1.0
- wayland-client, wayland-server, xkbcommon, egl, glesv2, libudev

Corresponding headers checked at the standard paths are absent: `gst/gst.h`, Wayland client/server headers, xkbcommon.h, EGL/egl.h, GLES3/gl3.h and libudev.h.

This is **not** evidence that all GStreamer/graphics software is absent. `ldconfig -p` lists GStreamer, gstapp, gstvideo, gstaudio, Wayland, xkbcommon, EGL/Mesa, libudev, PulseAudio and ALSA shared runtime libraries. The system GStreamer plugin directory contains many plugins. Their versions, suitability, plugin loading and pipeline operation were not tested. Runtime `.so` files do not replace missing development headers, pkg-config metadata, Rust/CMake tooling, or pinned bundled runtime artifacts.

Upstream's pinned README requires Node 24, its pinned Rust toolchain, native build tools, GStreamer development packages, CMake, and on Linux Wayland/xkbcommon development packages. Full build provenance and the actual Rust version can only be established after the complete pinned source is materialized.

### 3. Native display and device prerequisites are not exposed

- No `DISPLAY` or `WAYLAND_DISPLAY` is set.
- `XDG_RUNTIME_DIR=/home/agent/.local/run` exists but is empty; no compositor or core socket is present there.
- No LIVI, Electron, compositor, Xorg/Xvfb, PipeWire/PulseAudio, Bluetooth, hostapd or Avahi process name was observed in the visible process list.
- `/dev/dri`, `/dev/snd`, `/dev/bus/usb`, `/sys/class/drm`, `/sys/class/bluetooth` and `/run/dbus/system_bus_socket` are absent in this execution view.
- `bluetoothd`, `hostapd`, `dnsmasq`, `iw`, `rfkill`, `avahi-daemon` and `pactl` are absent from PATH. `dbus-daemon` itself exists, but no system bus socket was observed.

These observations do not establish that the physical machine lacks every device. They establish that this task cannot currently see the required device/display interfaces. Nor do they establish that software-only rendering could never work in a separately provisioned runtime. No such provisioning or native launch was attempted here.

### 4. Permission/runtime failures are separate from dependency gaps

Existing `docs/verification.md` records prior attempts: local Chromium could not create required sockets, approved escalation failed during environment setup, and the separate cloud browser rejected file: URLs. This audit did not repeat those operations; the underlying raw launcher error output is not present in the inspected evidence directory.

Accordingly:

- The socket/browser limitation is a previously reported execution restriction, not a missing npm package diagnosis.
- Escalation setup failure does not prove the native application itself failed, nor that approval or a disabled sandbox would fix it.
- A cloud-browser file-scheme denial is not evidence that a native Linux compositor can or cannot run.
- The native Unix control socket was not created or connected in this audit. Do not broaden the prior Chromium observation into a claim that every socket operation was independently tested and denied.
- No security relaxation, alternate browser route, or environment change should be used to evade those restrictions.

## Supported next sequence

### Gate A: Complete, pinned engine source

Materialize the full source tree at the verified commit through the authorized GitHub source/repository tools, retaining upstream license/notices and verifying the checked-out commit. This is a source-access step, not authority to install or execute downloaded software. Obtain the manifests, lockfiles, Rust toolchain pin, crate sources, build scripts and required assets before claiming an engine build is possible. A handful of inspected files is insufficient.

Evidence to retain: verified commit, complete manifests/lockfiles, source-tree inventory, and provenance for any prebuilt artifact. Do not silently substitute latest main or an unrelated release for the pinned engine.

### Gate B: Suitable build and permitted native runtime

Use a deliberately selected, authorized environment with the required toolchain/development packages and a supported Electron/GStreamer/compositor setup. Establish its actual display/rendering and local-socket permissions before promising a launch. Provisioning or installing software is a separate action outside this read-only audit.

The current environment catalog offered no immediately usable alternative: no saved coding configuration was returned, the authorized attached computer was offline, and the other connected computer was not authorized for tasks. No task was created and no computer was selected. The parent must recheck availability/authorization if the user chooses another environment; the current workspace is not proof that files exist there.

The smallest meaningful native milestone is a real pinned core and real local UI connection: process starts, same-user Unix handshake reports protocol 8 and expected version, a full authoritative welcome arrives, and reconnect is observed without replaying stale commands. Keep the existing native rendering/audio architecture. Only after that should the host create its actual Electron window, load the trusted document, attach the narrow preload boundary and compose the native projection plane.

Evidence to retain: native build/test output, exact artifacts/version, real process/peer identity, handshake/revision traces without credentials, actual contextBridge isolation/navigation checks, compositor/window rendering and focus behavior. A passing fake-socket test or Node VM preload test is not this evidence.

### Gate C: Hardware validation

On the intended headunit host, verify actual display/touch devices, audio sink/mic, USB/Bluetooth/Wi-Fi, and MFi hardware where CarPlay requires it. Do not choose an Orange Pi/Pi device, adapter, DSP, camera or user computer by inference.

Validate first pairing, phone switch, disconnect/reconnect, return Home/projection, real touch cancellation, mic/call/music/navigation audio, native camera takeover where available, and restart/power recovery. Record outcomes per transport and hardware. Native launch alone does not prove these flows; UI acknowledgments are not hardware completion.

## Work that remains valid in this workspace

Portable controller/codec tests, source-level review, deterministic policy tests and complete pinned-source inspection can continue within authorization. Native implementation work should be driven by the verified engine interfaces and the next concrete runtime gate. Additional UI mock features do not substitute for a buildable engine, actual Electron execution, native composition, or physical phone tests.

Audit tools used only read operations: command resolution, version queries, file existence/listing, source reads, pkg-config metadata queries, `ldconfig -p`, visible process names, and environment-catalog read. No sockets or services were launched.

References: [pinned upstream README](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/README.md), [resource layout](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/bin/livi-core/src/resources.rs), `docs/upstream-contracts.md`, `docs/verification.md`, `electron/README.md`.
