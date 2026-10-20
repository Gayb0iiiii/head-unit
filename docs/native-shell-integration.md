# Pinned LIVI native shell integration map

## Portable glass bridge progress (2026-10-19)

The prototype page now selects its native view model only when the trusted `window.headunit` preload exists. The native model subscribes before fetching its initial view, rejects a late initial snapshot after a newer event, clears stale phones on disconnect, and sends `selectPhone(id)` without claiming success from the action reply. It requests projection after the native view reports that exact phone active; a later manual Home choice cancels that pending navigation. Phone names and IDs are escaped before insertion into the glass page. The offline page remains a simulation.

`electron/glass-runtime.mjs` is the explicit main-process composition of `CoreTransport`, `HeadunitController`, `FilePreferences`, and the existing narrow `attachHeadunitHost` boundary. Construction registers no native process or socket; `start()` opens the specified local `core.sock` with managed reconnect, and disposal stops it. The page renders a transparent projection region and does not substitute a browser video stream. Projection touch from that region is intentionally disabled until the embedding LIVI window reports and verifies the actual contained picture rectangle. The stock host's compositor, GStreamer, secondary windows, camera reporting, and audio ownership still need integration and runtime validation. A transparent BrowserWindow option alone does not establish native plane composition.

The present `/workspace` contains a clean clone of this prototype but not the previously recorded `/workspace/shared/livi-upstream-pinned` checkout. This branch was developed against the pinned source contract recorded below; no pinned engine code was edited, built or started in this environment.

Inspected 2026-10-19 UTC, read-only, against `/workspace/shared/livi-upstream-pinned` at `4bcd1335c2daedba40640e6dc432cd2ed7acfaa4` (9.5.0). All source references below are relative to that checkout and therefore to [this exact upstream commit](https://github.com/f-io/LIVI/tree/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4). No native executable, install script, build, socket probe, browser or service was launched for this map. This is a source contract and proposed edit set, not a native validation result.

## Recommendation

Retain LIVI's Rust core, helper, GStreamer host and compositor. Initially retain the upstream Electron window/lifecycle implementation as well, changing the main-window renderer and adding the prototype's narrow privileged controller bridge. Preserve stock cluster/aux windows. A separate `LIVI_UI_CMD` executable is a supported replacement seam, but it takes ownership of *all* Electron responsibilities described below, including secondary windows if those capabilities are retained. It does not replace only a home-page route.

A custom iframe is a separate, optional page feature, not a replacement for the native shell or a video surface. The core's Unix-socket protocol controls native services; port 4000's telemetry Socket.IO service is not the control transport. See `upstream-contracts.md` for the full protocol map.

## 1. Actual Linux launch chain

1. Packaged AppImage entry launches `resources/core/livi-core`; packaging renames Electron to `livi-ui`. The launcher sets `LIVI_RESOURCES` and forwards UI flags through `LIVI_UI_ARGS`. Source: `scripts/after-pack.mjs:1-18,23-28`.
2. Core takes no ordinary CLI arguments. Its only other mode is `telemetry ...`; there is no `--dry-run`, `--headless-test` or handshake-only CLI. Source: `native/livi-helperd/bin/livi-core/src/main.rs:67-76`.
3. Core loads persisted config, binds its private control socket, prepares host integration and starts services. The helper and compositor are started separately from the UI. GStreamer plane ownership, projection managers and audio remain native. Source: `native/livi-helperd/bin/livi-core/src/main.rs:138-231`; `native/livi-helperd/bin/livi-core/src/services.rs:106-184,229-297`.
4. Core starts the UI after the compositor announces its inner Wayland display. `LIVI_UI_CMD` replaces that child. A normal UI exit stops core; startup failure stops core; crashes retry after one second, up to five retries, resetting the counter after 30 seconds of stable operation. Source: `native/livi-helperd/bin/livi-core/src/ui.rs:11-14,50-140`.
5. Shutdown stops UI, then compositor, then helper. The UI is in its own process group, with a five-second SIGTERM grace period before forced termination. A pipe on stdin is the parent lifeline. Source: `native/livi-helperd/bin/livi-core/src/services.rs:189-200`; `native/livi-helperd/bin/livi-core/src/child.rs:7-32`; `native/livi-helperd/bin/livi-core/src/ui.rs:79,113-118`.

### Environment precedence and resource layout

| Setting | Exact behavior at the pin |
| --- | --- |
| `LIVI_RESOURCES` | Nonempty value selects installed layout, before any repository layout setting. |
| `LIVI_ROOT` | Nonempty value selects checkout layout when installed layout is absent. Otherwise executable-ancestor discovery, then current directory. |
| `LIVI_NO_UI=1` | Disables the UI child, even if `LIVI_UI_CMD` is present. It does **not** disable helper, compositor, audio or host setup. |
| `LIVI_UI_CMD` | Nonempty value becomes `/bin/sh -c <value>`; inherited environment remains available. Use an owned, reviewed wrapper/executable, not user-entered text. |
| `LIVI_UI_ARGS` | Whitespace-split append to built-in `Exec` mode only. Ignored for the shell override. Shell quoting is not preserved by this splitter. |
| `LIVI_HELPER_BIN`, `LIVI_GST_HOST_BIN`, `LIVI_COMPOSITOR_BIN` | Override those executable paths independently. No corresponding safe-mode behavior is implied. |
| `LIVI_NO_COMPOSITOR=1` | Skips compositor launch. This is not a substitute composition implementation. |

Sources: `native/livi-helperd/bin/livi-core/src/resources.rs:28-107`; `native/livi-helperd/crates/livi-media/src/compositor.rs:32-35`.

Repository outputs must be at:

- `native/livi-helperd/build/Release/livi-core` and `livi-helperd`
- `native/livi-gst-video/build/Release/livi-gst-host`
- `out/compositor/livi-compositor`
- UI: `node_modules/electron/dist/electron` with the checkout root as its app argument
- GStreamer bundle, when present: `assets/gstreamer/linux-x64` or `linux-arm64`; host templates: `assets/linux`

Installed resource paths are `core/livi-core`, `driver/livi-helperd`, `gst-host/livi-gst-host`, `compositor/livi-compositor`, and optional `gstreamer/<platform>`, with UI at the resources directory's sibling `livi-ui`. Source: `native/livi-helperd/bin/livi-core/src/resources.rs:70-93`; `scripts/after-pack.mjs:11-17`; `scripts/build-native.mjs:65-81`.

**Pinned discovery defect:** `resources.rs:37-40` searches for `native/livi-helperd/Cargo.toml`. That path is absent in the *complete* checkout. The actual workspace manifest is `native/Cargo.toml`, explicitly used by `scripts/build-native.mjs:35-45`. Set `LIVI_ROOT` explicitly for a future development launch; do not infer that the complete source is missing because the old marker is absent. The resource test at `resources.rs:153-160` constructs the obsolete marker and does not catch this repository-layout mismatch.

Build entry points, recorded but not run: `pnpm run build:native:x64` invokes `node scripts/build-native.mjs --arch=x64`; `pnpm run build:app` invokes `vite build`; the combined packaging command is `pnpm run build:linux:x64`. Native build uses the root workspace, release mode, packages `gst-video-host`, `livi-helperd`, `livi-core`, and Linux `livi-compositor`; it applies `--locked` only when `CI` is set. The toolchain is `beta-2026-10-03`; package manager pin is `pnpm@12.11.2`. Sources: `package.json:14-37`; `scripts/build-native.mjs:22-45,65-81`; `rust-toolchain.toml:1-5`.

A future, authorized **replacement-UI** launch has this shape, using already-built and verified absolute paths in a suitable Wayland session:

```sh
LIVI_ROOT=/absolute/path/to/pinned-checkout \
LIVI_UI_CMD='exec /absolute/path/to/replacement-ui --ozone-platform=wayland' \
/absolute/path/to/pinned-checkout/native/livi-helperd/build/Release/livi-core
```

Preconditions include `LIVI_NO_UI` unset and no conflicting `LIVI_RESOURCES`. This is a contract illustration, not a command approved for the present environment. Core appends `--ozone-platform=wayland` automatically only for built-in `Exec` UI mode, **not** for `LIVI_UI_CMD`; an Electron replacement/wrapper must supply it. `exec` avoids leaving a shell wrapper as a separate long-lived parent. Core supplies `LIVI_CORE_SOCKET`, inner `WAYLAND_DISPLAY`, `XDG_SESSION_TYPE=wayland`, `LIVI_COMPOSITOR=1`, optional `LIVI_RENDER_NODE`, and removes `DISPLAY`. Preserve those values and the stdin lifeline. Source: `native/livi-helperd/bin/livi-core/src/ui.rs:50-79`.

The pinned repository default UI command and Vite dev startup contain `--no-sandbox` (`resources.rs:90-93`; `vite.config.mts:33-37`). Those are upstream observations, not a recommended permission workaround. A sandboxed replacement must work with its own restricted preload and permitted runtime, rather than copying those flags or retrying a denied launch.

## 2. Native display and window invariants

### Outer display and native planes

- `livi-compositor` is a **nested Wayland compositor**. It requires an existing outer Wayland session with `wl_compositor`, `xdg_wm_base`, SHM and working EGL/GLES. It creates another Wayland socket for the UI and GStreamer. It does not itself replace a host DRM/KMS compositor. Sources: `native/livi-compositor/rust/src/host.rs:198-247`; `native/livi-compositor/rust/src/state.rs:182-204`.
- The upstream appliance installer uses Cage as the outer compositor: `ExecStart=$CAGE_BIN -s -- $APPIMAGE_PATH`. That installer also creates a PAM/systemd kiosk service and changes the host; this map does not authorize running it. Source: `scripts/install/headless/install.sh:150-187`.
- Core supplies `LIVI_OUTPUT_APP_ID=dev.f-io.livi`, roles `main,cluster,aux`, control socket and optional output dimensions. Windowed dimensions include a 32px native titlebar; configured kiosk omits it. Source: `native/livi-helperd/crates/livi-media/src/compositor.rs:11-29`.
- The GStreamer host is redirected to the same inner display/render node. Core owns plane claims, crop/layout and visibility. Main projection visibility follows `state.front.main === 'projection'`; cluster plane visibility follows each role's `front === 'cluster'`. Do not introduce a renderer-side second owner of compositor control commands. Sources: `native/livi-helperd/bin/livi-core/src/services.rs:301-359`; `native/livi-helperd/crates/livi-media/src/compositor.rs:105-152`.

### Identity, transparency, geometry

1. At initial surface classification, `app_id='livi-video'` marks a native video plane. Otherwise the app ID must equal `dev.f-io.livi` to be a normal UI. A mismatched application becomes a centered dialog. A title prefixed `livi:<role>` assigns its role; unrecognized/missing role defaults to main. This is an actual compositor protocol requirement, not just a cosmetic title. Source: `native/livi-compositor/rust/src/shell.rs:80-155`.
2. Preserve upstream identity metadata (`package.json:5`, `electron-builder.yml:1,32`) and verify the **actual** Wayland app ID in compositor logs for a custom packaged UI. Metadata alone is not proof of the runtime app ID. Secondary BrowserWindows start with `livi:cluster`/`livi:aux`; renderer role is also carried separately as `?role=...`. Sources: `src/main/window/secondaryWindows.ts:20-21,124-180`; `src/renderer/src/main.tsx:24-33,85-91`.
3. UI surfaces fill the role's content area below the compositor titlebar; native video uses contained/cropped geometry. Keep one UI owner per role. Sources: `native/livi-compositor/rust/src/layout.rs:18-53,81-103`.
4. Under compositor mode, stock main BrowserWindow is frameless, transparent, content-sized, fullscreenable, with transparent background. Saved desktop bounds are ignored; compositor owns size. Preserve `backgroundThrottling:false` and the projection transparency cascade. An opaque wallpaper or root background over the projection/cluster region hides the native underlay even while a phone is streaming. Sources: `src/main/window/createWindow.ts:37-69,147-155`; `src/renderer/index.html:38-50`.
5. Native video is not a DOM `<video>` or iframe. Main projection's transparent input overlay is fixed full-window, with a contained aspect-ratio stream rectangle and masked view area. A redesign that places projection in a smaller tile must deliberately coordinate native plane geometry and touch transforms; reducing the DOM rectangle alone is insufficient. Sources: `src/renderer/src/components/pages/projection/Projection.tsx:144-205`; `src/renderer/src/components/pages/projection/streamBox.ts:3-16`.

### Fullscreen, focus and lifetime

- Only compositor `Kind::Ui` surfaces can forward fullscreen requests to the appropriate outer host window. Wrong app ID also breaks this path. Source: `native/livi-compositor/rust/src/shell.rs:337-374`.
- Stock main window uses `setFullScreen(true)` inside compositor mode after a 400ms delay, so the outer monitor size has settled; outside compositor Linux uses `setKiosk(true)`. Fullscreen state is synchronized back to config; focus restoration and compositor resize nudging are explicit upstream behaviors. Sources: `src/main/window/createWindow.ts:160-195`; `src/main/window/utils.ts:114-205`.
- **`LIVI_KIOSK=1` is appliance ownership, not merely visual fullscreen.** Explicit core Quit can power off the machine; Restart can reboot through the installed power helper. For a desktop fullscreen integration, use the existing `config.kiosk.main` behavior unless appliance lifecycle is intentionally required and authorized. Use only unset/`0`/`1` for this env variable: compositor treats any non-`0` value as kiosk, while core/Electron require `1`. Sources: `native/livi-helperd/bin/livi-core/src/power.rs:22-43`; `native/livi-helperd/bin/livi-core/src/main.rs:87-101,245-250`; `native/livi-compositor/rust/src/state.rs:206-221`.
- Pointer hit testing is dialogs above UI above video. Pointer-down focuses the surface, but native video never receives keyboard focus; keys belong to UI/dialogs. Preserve UI key forwarding and native focus behavior instead of making the entire window click-through. Source: `native/livi-compositor/rust/src/input.rs:72-103,145-212`.
- Keep the Electron single-instance lock, restore/show/focus on second launch, and lifeline exit behavior. A replacement child must actually watch stdin EOF when `LIVI_LIFELINE=1`, and must stop on the supervisor's termination signal. Sources: `src/main/index.ts:26-37`; `src/main/core.ts:87-105`.

## 3. Control, routes and safe input

Core derives its server socket from `XDG_RUNTIME_DIR/livi/core.sock`, or the temporary directory's `livi-<uid>/core.sock`; it locks the same runtime directory and makes it private. `LIVI_CORE_SOCKET` is a *client override* supplied to the UI, not a server bind override. Linux config is `$XDG_CONFIG_HOME/LIVI/config.json` or `~/.config/LIVI/config.json`; backups default to `~/.local/share/LIVI/config.json`. Sources: `native/livi-helperd/bin/livi-core/src/paths.rs:13-64`; `native/livi-helperd/bin/livi-core/src/main.rs:138-143,179-183,254-257`; `src/main/shared/core/link.ts:9-18`.

The new shell should maintain one authoritative UI state/intent owner per screen:

- `show` is an action: `{type:'action', id, action:{kind:'show', screen:'main', front:'projection'}}`. Returning home requests `front:'livi'`; dashboard with the native cluster stream requests `front:'cluster'`. The route report is separate `{type:'path', path}` and is primarily status-file metadata, not a projection visibility command. Sources: `src/main/shared/core/session.ts:110-143`; `src/renderer/src/store/store.ts:43-55`.
- Core arbitrates final `front`: reverse camera wins, then call/Siri attention, then requested front, with projection requiring an active session. Its state must drive temporary route overrides. Do not continuously overwrite it with a preferred home route. Sources: `native/livi-helperd/bin/livi-core/src/projection.rs:1218-1258`; `src/renderer/src/hooks/useFollowFront.ts:7-48`.
- Treat `useFollowFront` as stock reference behavior, not an unchanged product requirement. Stock behavior restores previous routes after interruptions, uses `/media` as a fallback and does not automatically depart projection after disconnect. The redesigned main shell intentionally overrides that disconnect/startup policy: unavailable saved CarPlay returns Home at startup without a notice; an authoritative projection dropout returns Home with a small nonblocking reconnect notice. Later manual navigation wins. Preserve native safety/attention overrides, secondary-window ownership and explicit manual camera behavior. Do not persist transient overrides or continuously fight native front state. The hook returns `void`; it is not a front-state selector. The stock app calls it at `src/renderer/src/App.tsx:244`.
- On a fresh welcome, resend current route, per-screen requested front, camera presence and desired subscriptions. Reject in-flight actions on disconnect. Do not queue or replay raw pointer/key events after reconnect. Sources: `src/main/shared/core/session.ts:46-55,90-118`; `src/main/shared/core/link.ts:52-87`.
- Projection touch coordinates are normalized against the contained **picture rectangle**, not browser bounds or letterbox bars. Core clamps coordinates, performs Android Auto crop mapping, and ignores non-main pointer input and input when projection is not front. Sources: `src/renderer/src/components/pages/projection/hooks/useProjectionTouch.ts:15-32`; `native/livi-helperd/bin/livi-core/src/projection.rs:1606-1650`.
- Preserve stable contact IDs, full multi-contact frames, immediate down/up/cancel, move coalescing, pointer capture, and lost-capture/out-of-bounds release handling. Also release held input on navigation, blur, hidden page, renderer crash and host detachment. For a user-requested route/front change, cancel contacts before sending the new front where possible, because core drops pointer events after projection loses the front. The existing pointer hook cancels a pending animation frame on unmount but does not itself send every active contact's release there; the prototype controller's lifecycle cancellation should cover that gap. Source: `src/renderer/src/components/pages/projection/hooks/useProjectionTouch.ts:35-191`.
- PTT release on keyup, blur, visibility loss and cleanup is already an explicit stock requirement. Sources: `src/renderer/src/App.tsx:194-232`; `src/renderer/src/components/secondaryWindow/SecondaryAppShell.tsx:80-143`.

## 4. Optional capabilities and platform differences

Replacing the UI does not remove the native services. Hiding their tiles is not equivalent to disabling them:

- Cluster/aux windows are config-controlled (`clusterScreenActive`, `auxScreenActive`), use their own role/size/kiosk settings and update active flags on user close. Preserve existing secondary window orchestration and separate cluster visibility ownership. Sources: `src/main/window/secondaryWindows.ts:37-53,124-205,235-260`; `src/renderer/src/components/secondaryWindow/SecondaryAppShell.tsx:25-48,69-72,145-158`.
- Main phone projection and the cluster stream are distinct surfaces. Secondary stock pages support dashboard/media/camera; they do not instantiate the main touch projection page. Source: `src/renderer/src/components/secondaryWindow/SecondaryAppShell.tsx:145-158`.
- Camera availability is browser-reported to core; replacing App without equivalent detection/reporting can remove reverse-camera behavior. Do not report a camera present without a real detected/authorized source. Source: `src/renderer/src/App.tsx:234-242`; `src/renderer/src/store/store.ts:71-74`.
- Audio/microphone, phone pairing/selection, Bluetooth/HFP, optional DAB/GNSS and wireless projection stay with their native owners/configuration. Media controls and volume should use bounded core intents, not a parallel browser audio pipeline. Sources: `native/livi-helperd/bin/livi-core/src/main.rs:186-210`; `native/livi-helperd/bin/livi-core/src/services.rs:156-184,368-375`.
- macOS has a different host contract: Electron launches core after a one-second wait if no core responds, with `LIVI_NO_UI=1`, `LIVI_LIFELINE=1` and `LIVI_UI_PLANES`. Native planes are attached to Electron windows rather than a Linux compositor. Keep `startVideo()` before `startCore()` and `drawVideoIn()` registration for every role. Linux and macOS cannot share a launcher-only integration blindly. Sources: `src/main/core.ts:24-63,108-141`; `src/main/index.ts:49-64`; `src/main/window/createWindow.ts:71-72`; `src/main/window/secondaryWindows.ts:189-204`; `src/main/video.ts:1-55`.

## 5. Startup effects that require a real runtime approval gate

Even `LIVI_NO_UI=1` does not make core read-only. Before serving a normal client, startup may write logs/config/identity, bind Unix/TCP listeners, run host setup, install/update a udev rule through its privileged helper, manage Wi-Fi and start helper/compositor processes. The helper is launched with Linux sudo mode. Sources: `native/livi-helperd/bin/livi-core/src/main.rs:138-231`; `native/livi-helperd/bin/livi-core/src/services.rs:106-155`.

Concrete effects include `~/.config/wireplumber/wireplumber.conf.d/99-livi-hfp.conf` and restarting user WirePlumber (`host_setup.rs:11-47`), possible `/etc/udev/rules.d/99-LIVI.rules` install (`udev_rule.rs:5,26-54`), and `cp/identity.json` creation (`services.rs:108`). These shorthand filenames are all in `native/livi-helperd/bin/livi-core/src/`.

The useful CP/AA projection manager is initialized inside the successful CarPlay TCP-listener branch (`services.rs:167-179,229-297`). An environment that cannot create the required sockets is not a meaningful native composition test target. No all-sockets-denied claim has been freshly tested in this audit; see the distinction between missing dependencies and prior runtime restrictions in `runtime-validation-gate.md`.

## 6. Recommended minimal native integration edit set

Make these edits in a separately authorized working copy of the pinned source, preserving the provenance checkout. This is a plan only; no upstream files were edited in this audit.

| Area | Minimum proposed edit | Keep intact / acceptance condition |
| --- | --- | --- |
| Main entry | `src/main/index.ts`: attach one privileged headunit controller/session and IPC boundary before loading the main document. Reuse core configuration/lifecycle orchestration. | `startVideo` before `startCore`, identity/protocol registration, secondary window setup, shutdown ordering. |
| Main window | `src/main/window/createWindow.ts`: opt in to a separate trusted headunit document and its own sandboxed preload. Merge the prototype's safe webPreferences with compositor-aware top-level window options. | App ID, transparent/frame/content sizing, fullscreen delay, resize/focus behavior, lifecycle. `headunitWindowOptions()` alone is not a compositor window implementation. |
| Privileged bridge | Add a main-process adapter around the real pinned core transport/session; integrate the prototype `electron/host.mjs`, `main-boundary.mjs`, controller and bounded public view. Add a separate headunit preload build target. | One writer for main `show`/path; no raw socket, generic IPC, whole config or credentials exposed to the headunit page. |
| Local assets | `src/main/protocol/appProtocol.ts`, `vite.config.mts`: package/load one exact local document plus assets and preload; keep original page for secondary roles and rollback. | Exact trusted URL in host policy; no remote dev-server exception, arbitrary file handler, or guessed `app:` hostname. Current handler maps URL **pathname**, so verify the chosen URL resolves the intended output. |
| Renderer | Import the prototype layout into the main page; connect it to `window.headunit`, not the mock Headunit instance. Implement transparent projection region, current front/preferred-route arbitration, pointer rectangle and cancellation. | Preserve the behaviors in sections 2–3 and CSS transparency; do not run stock main App's `reportShown` alongside a second controller. |
| Secondary roles | Leave `src/main/window/secondaryWindows.ts`, `ClusterApp`, `AuxApp` and their existing renderer entry unchanged initially. | Headunit main IPC authorization must reject secondary frames/windows; stock secondary role reports remain independent. |
| Native core/compositor | No normal feature rewrite needed for initial shell replacement. | Explicit `LIVI_ROOT` works around discovery mismatch. A later small discovery-marker fix should change `resources.rs:39` and its test with actual workspace-layout coverage. |

**Important preload compatibility:** stock `src/preload/index.ts:5-16` creates a direct core link; `src/main/shared/core/link.ts:1` imports `node:net`. Stock BrowserWindows deliberately use `sandbox:false` (`createWindow.ts:60-67`; `secondaryWindows.ts:140-146`). The prototype's sandboxed preload cannot simply replace that setting while still using the stock direct-socket preload. Move transport/session into the privileged main process for the new headunit page, use its narrow preload, and preserve legacy secondary behavior separately until deliberately migrated. Do not weaken the prototype boundary to match the old preload.

Stock host code automatically allows media/display-capture and opens external URLs (`createWindow.ts:127-129,231-234`). Those behaviors are broader than the new narrow page needs; do not automatically copy them into the headunit page. Keep permissions and external navigation explicitly scoped to retained features and authorization.

A renderer-only reskin of the existing App is an even smaller aesthetic change, but it retains the existing broad `window.core` interface and unsandboxed preload. It must not be described as satisfying the prototype's narrow-main-process security boundary.

## 7. Evidence needed before claiming native success

1. **Source gate: met.** Complete pinned tracked source is materialized. The earlier 32-file reference directory is not the build input. Manifests/lockfiles/build scripts are now inspectable; dependency downloads and build outputs are still separate gates.
2. **Build gate: open.** Provision an authorized toolchain/dependency environment, build pinned native packages and Electron assets, verify artifact paths and protocol/version. Current environment still lacks the audited Rust/Electron/development dependencies; this document does not claim a successful build.
3. **Permitted runtime gate: open.** An outer Wayland session, working EGL/GLES/native compositor, socket/process permissions, relevant devices and a reviewed startup-effects plan are needed. Do not use browser retries or security changes to bypass prior restrictions.
4. **Desktop composition gate: open.** Capture logs confirming inner display and `app_id -> ui` role classification; verify native plane visible beneath UI, resize/fullscreen/focus, main and secondary close/reopen, controller reconnect, lifeline exit, and no duplicate UI writers. A browser screenshot of the HTML prototype proves none of these.
5. **Hardware gate: open.** Verify actual phone pairing/connect/switch/reconnect, projection video/audio/mic, portrait/landscape/crop and touch cancel, Siri/call/reverse interruption/restoration, cluster output, disconnect and power semantics on the authorized target. Hardware-dependent results must be labeled untested until exercised.

Useful pinned test starting points (not run here): `src/main/shared/core/__tests__/{wire,patch,link,session}.test.ts`; `src/main/window/__tests__/{createWindow,secondaryWindows}.test.ts`; `src/main/__tests__/video.test.ts`; `src/renderer/src/hooks/__tests__/useFollowFront.test.tsx`; `src/renderer/src/components/pages/projection/hooks/__tests__/useProjectionTouch.test.tsx`; `src/renderer/src/components/pages/projection/__tests__/streamBox.test.ts`; Rust tests in `resources.rs`, `ui.rs`, `child.rs` and `paths.rs` under `native/livi-helperd/bin/livi-core/src/`. Portable controller/boundary tests remain useful regression evidence, but do not close native composition or hardware gates.

## Local host integration increment — 2026-10-20

Re-read Git blobs from the exact pin `4bcd1335c2daedba40640e6dc432cd2ed7acfaa4`: `src/main/window/createWindow.ts`, `src/main/core.ts`, `native/livi-helperd/bin/livi-core/src/server.rs` and `projection.rs`. The sparse source object store is `/workspace/livi-schema` (use the explicit commit, not HEAD); extracted review copies are in `/workspace/setup-evidence/pinned-*.{ts,rs}`. This is source inspection, not a full native build or launch.

`headunitWindowOptions({compositor:true})` now offers the compatible local-window subset: `title: 'livi:main'`, frameless/content-sized transparent surface, transparent background, fullscreen capability and no kiosk takeover. `backgroundThrottling:false` keeps the renderer's expiry/clock work active; sandbox/context isolation remain enabled rather than copying upstream's disabled sandbox. The default preset still suits the standalone test window. `attachHeadunitHost` prevents renderer page-title updates from replacing the host-owned role title. The embedding host must select the compositor preset explicitly; no environment setting or automatic fullscreen/launch action is added.

The boundary listens to actual BrowserWindow focus/responsiveness events. Blur or unresponsive cancels all tracked contacts through the existing protocol `cancel` input, and rejects further touch commands until both focus and responsiveness return. An initially unfocused or capability-missing host is not touch-eligible. Focus alone cannot clear an unresponsive state; responsiveness alone cannot clear lost focus. Disposal removes listeners and cancels held input. These are local input eligibility guards, **not** a native readiness/health protocol. See [Electron BrowserWindow events and options](https://www.electronjs.org/docs/latest/api/browser-window).

Pinned `projection.rs` maps Cancel to released touches, but ignores pointer frames once projection is no longer front. Pinned `server.rs` logs client disconnect without synthesizing held input release. Thus cancellation is best effort: abrupt process death, broken/backpressured sockets, native front takeover or an engine freeze can prevent delivery. There is no cancel acknowledgment and no replay. Dead-client cleanup must be implemented in the native owner before claiming crash-safe input release. This increment does not forward keys/PTT or enable uncalibrated page touch.

Still required: actual Wayland app-ID verification (`dev.f-io.livi`), plane geometry/calibrated touch, retained secondary windows/camera ownership, fullscreen/resize behavior, single-instance/lifeline integration and native readiness/dead-client cleanup. Those cannot be certified by injected Electron tests. No native protocol field, process/service owner or host readiness message was invented, and no native startup occurred.

Role-title provenance was also rechecked directly in pinned [`native/livi-compositor/rust/src/shell.rs`](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-compositor/rust/src/shell.rs): `classify_on_initial_commit` reads `title.strip_prefix("livi:")` and resolves `screen_idx_by_role(role)`. It separately classifies mismatched app IDs as dialogs, so `livi:main` alone cannot establish native UI identity.

### Parent-process lifeline attachment

`createGlassRuntime` now accepts an optional privileged `lifeline` configuration, activated only by explicit `start()`. The default production check matches pinned [`src/main/core.ts`](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/src/main/core.ts): `LIVI_LIFELINE=1` and FIFO/socket fd 0; ordinary files/terminals are not parent liveness signals. The embedding application supplies `onLost: () => app.quit()`.

EOF, stream close or stream error dispose local resources first and invoke the callback once. Close/error handling is a conservative extension to the pinned EOF-only hook, not a new core protocol. An already-ended stream prevents connection. Manual disposal removes listeners and preserves borrowed stdin ownership. Runtime startup is idempotent. The helper neither creates a parent process nor installs an application entrypoint, and it cannot prove cleanup after a killed renderer/main process. Actual Electron exit and native shutdown remain acceptance gates.

### Application owner and supervisor compatibility

The actual Electron entry point is `electron/main.mjs`, selected by `electron/package.json`; `application.mjs` owns the window, runtime and cleanup. No native process is spawned. It requires the inherited explicit core socket, waits for app readiness, starts the runtime/lifeline before loading the built local page, and shows only while still active. SIGTERM/SIGINT and parent loss dispose before quit; renderer crash/load failure exit unsuccessfully. Window closure quits normally. The single-instance owner deliberately ignores activation requests from a second launch so it cannot steal touch/projection ownership.

Pinned [`src/main/index.ts`](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/src/main/index.ts) restores/focuses the first window and exits a duplicate with zero. Pinned [`ui.rs`](https://github.com/f-io/LIVI/blob/4bcd1335c2daedba40640e6dc432cd2ed7acfaa4/native/livi-helperd/bin/livi-core/src/ui.rs) treats successful child exit as core shutdown, and unsuccessful exit as a bounded restart attempt. This shell therefore exits a supervised lock loser with code 1, without touching the first window or socket. This does not make competing native supervisors supported; persistent contention remains a native startup failure. No retry loop or lock theft is introduced in the shell.

`desktopName: dev.f-io.livi.desktop` mirrors the upstream package hint, and compositor mode adds the required Wayland launch switch. Actual Wayland app ID, fullscreen transitions, native picture placement and retained secondary/camera windows remain unimplemented or unaccepted; metadata is not verification. This entry point should not replace the full native UI on a vehicle until those gaps are resolved.

### Main compositor sizing and identity — 2026-10-20

Re-read pinned `src/main/window/{createWindow,utils,secondaryWindows}.ts`, `src/main/app/init.ts`, `src/main/video.ts`, `electron-builder.yml`, and `src/renderer/src/components/secondaryWindow/SecondaryAppShell.tsx` directly from the exact Git object store. No upstream executable ran.

The application now explicitly sets Linux desktop identity to `dev.f-io.livi.desktop` before Electron readiness, matching the package hint and upstream builder identity. The installed Electron 44.7.2 API declaration documents this as the Wayland app-ID source. The actual compositor classification must still be observed; no desktop file is installed by this change.

Compositor window options omit initial width/height: Electron's provisional size is not a chosen target resolution, and the compositor owns the final geometry. `compositor-window.mjs` attaches before page load. Only explicit `LIVI_KIOSK=1` requests startup fullscreen, 400ms after ready-to-show, using the current matching display size. These timings and the windowed resize reflow (200ms debounce, one-pixel height nudge, 60ms restore) follow the pinned source. The local owner additionally cancels pending callbacks on shutdown/close/fullscreen transitions and refuses to restore obsolete bounds over an intervening resize. Restoration starts after the nudge is observed; a conflicting observation cancels the operation without retrying, bounding host-rejected geometry. It does not persist native config, force fullscreen back after a user exits it, or create a display mode. Config-driven kiosk changes/zoom and desktop bounds persistence still require a bounded privileged config observer; they are not claimed implemented.

Secondary ownership is a separate dependency, not a missing constructor call. Pinned roles are `main`, `cluster`, and `aux`; titles `livi:cluster`/`livi:aux` route windows to native screens. Their active/config/bounds lifecycle is driven by `secondaryWindows.ts`, and their renderer uses role-scoped shown-path reporting and camera/cluster/media views. Camera is content/plane ownership within a role, not a fourth window role. The current public bridge authenticates only the main window and allows main-screen intents. Loading that page into a secondary window would either fail authentication or incorrectly duplicate main-screen ownership. Implement a bounded privileged config observer, role-aware read-only views/allowed role reports and isolated secondary lifecycle before opening these windows. Retain native camera/cluster planes and do not expose raw config or copy upstream's unsandboxed preload.

See the ordered backlog in [completion-checklist.md](completion-checklist.md). Native readiness and dead-client input release remain engine work; resize callbacks are not health signals.

### Privileged window configuration observer — 2026-10-20

`electron/window-config.mjs` now projects synchronized protocol-8 `state.config` into an internal window-only view. Provenance was checked directly against pinned `native/livi-helperd/crates/livi-core-proto/src/{config,state}.rs`, `src/main/{core,constants}.ts`, `src/main/window/{applyConfig,utils}.ts` and `src/renderer/src/routes/schemas/generalSchema.ts`. The observer accepts only own data properties, strict booleans, integer window sizes within 300–4096 by 200–2160, signed 32-bit coordinates, optional valid bounds, and integer UI zoom 50–200%. These are conservative host/UI bounds; it rejects out-of-range config instead of coercing/clamping it or creating a target display. Zero default bounds remain absent.

Only `main`, `cluster` and `aux` are projected. Secondary active flags, sizes, bounds and kiosk values remain privileged; there is no camera window role. Missing/malformed fields are null, and desynchronized/disconnected state invalidates the whole projection. Unknown config, credentials, telemetry, dashboard layouts, camera sources, key bindings and device paths are never copied. Equivalent projected updates are deduplicated and each subscriber receives a detached snapshot. Disposal removes the transport observer and ignores late callbacks.

The glass runtime exposes `subscribeWindowConfig` only to its main-process owner. The preload/public view and native action allowlist are unchanged. The application attaches its compositor consumer before transport start and removes it before runtime shutdown. Main compositor geometry remains native-owned: config sizes and bounds are observed but never applied to the compositor window. Valid zoom follows the pinned `percent / 100 * min(1, actualContentHeight / 292)` calculation after readiness and resize. Invalid/absent zoom makes no new call, leaving the last actual presentation intact rather than manufacturing a fallback.

Valid startup kiosk state participates in the existing 400ms settle delay; explicit inherited `LIVI_KIOSK=1` still forces startup fullscreen. Later valid kiosk changes call Electron fullscreen, without config writes or focus/activation. While a fullscreen request is outstanding, a newer choice is retained until its acknowledgment; invalidation/disposal clears the queued choice. Reconciliation applies only a changed choice, never retries the same rejected request, and unrelated config cannot force a manually exited fullscreen window back. A request already sent to Electron cannot be revoked on disconnect; the shell sends no stale follow-up, and actual native transition behavior remains an acceptance gate.

This completes the privileged observation dependency and main compositor consumption, not secondary presentation. Role-aware authenticated secondary views/reports and create/close/reopen ownership remain to implement. RealDash remains the separate instrumentation architecture: no native telemetry/dashboard integration was introduced. Desktop bounds application/persistence, native geometry/touch, readiness and dead-client cleanup remain separate work.
