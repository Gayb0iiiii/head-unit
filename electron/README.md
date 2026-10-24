# Isolated Electron host boundary

This directory contains attachment modules plus an explicit Electron application entry point. Attachment imports do not launch Electron; executing the application entry point imports Electron and creates its main window after readiness. It does not install Electron, start LIVI, register a protocol or integrate native video planes. Native projection, audio, microphone, and touch geometry still require LIVI integration. Pinned camera content uses browser capture; this shell has no configured capture source and shows Camera unavailable. The explicit `glass-runtime.mjs` composition connects only to a local `core.sock` after its owner calls `start()`; it never launches LIVI.

## Main-process use

- `headunitWindowOptions()` from `host.mjs` supplies an absolute path to `preload.cjs`, context isolation, a sandbox, disabled Node integration and webviews, and enabled web security.
- Electron 44's `getLastWebPreferences()` omits the preload path. The host checks the effective flags there and verifies the exact main-window preload through pinned Electron 44's `_getPreloadScript()` before registering IPC. A different Electron version must revalidate this private API; missing or mismatched preload evidence fails closed.
- A privileged owner constructs its UI `BrowserWindow` with those options, then calls `attachHeadunitHost({ipcMain, trustedWindow, trustedUrl, controller})` before loading the UI.
- `trustedUrl` must be one exact canonical `file:///...` or `app://...` document URL. Remote hosts, credentials, queries, fragments, and noncanonical URLs are rejected. A custom `app:` scheme must already have a trusted local resource handler in the embedding host. No remote development-server exception is provided.
- `attachHeadunitHost` verifies the existing window preferences and denies new windows, renderer navigation, redirects, and webview attachment. It returns an idempotent detach function.
- The supplied controller must implement synchronous `view()`, `subscribe(listener)`, and `intent(intent)`. Keep the controller, transport, session, and persistence exclusively in the privileged process.
- The optional Debug overlay calls one authenticated, zero-argument `getMetrics()` channel while enabled. The main process reads fixed `/proc/stat`, `/proc/meminfo`, `/proc/net/route` and `/proc/net/dev` paths, and probes only `google.com:443` with a bounded TCP connect at most once per 10 seconds. `stopMetrics()` cancels an in-flight probe and clears deltas. The returned object contains only bounded CPU, RAM, selected default-route-interface rates and TCP connect latency. No renderer-supplied paths, hosts, commands or raw proc data cross this boundary. GPU use remains unavailable without a trustworthy whole-device counter; the existing Panthor/Mesa graphics startup is independent of metric availability.
- `createGlassRuntime({ipcMain,trustedWindow,trustedUrl,socketPath,preferencePath})` composes the concrete controller and local transport for a host-owned window. Supply absolute trusted paths and attach it before loading the page. Call `start()` only after the host has deliberately started its native engine. Call `dispose()` during host shutdown; loss of the renderer also disposes it. The `connectSocket` parameter exists for injected tests and should be omitted by a production host.
- The same `index.html` is an offline simulation without preload. With the trusted preload, its glass UI uses `window.headunit` and reflects authoritative phones and routes. No HTTP/WebSocket control endpoint is needed. `headunitWindowOptions()` now asks for a transparent window; the embedding host must still preserve LIVI's actual app ID, role/title, compositor sizing, fullscreen sequence, secondary windows, video planes, and lifecycle.

The lower-level `attachHeadunitBoundary` export is for dependency-injected tests and host composition. Use the full host attachment in an actual Electron host so navigation policy and preference verification are also installed. There is one fixed channel set and one owning window per attached boundary; dispose it before attaching a replacement.

## Renderer API

The sandbox preload exposes only the frozen `window.headunit` object:

- `getView()` returns a Promise for the public view.
- `onView(callback)` receives public views and returns an idempotent unsubscribe. It never passes the privileged IPC event to the page. Register this listener before requesting the initial `getView()` snapshot.
- `navigate(route)` accepts home, dashboard, phones, settings, audio, vehicle, or projection.
- `selectPhone(id)` requests a known phone through the controller.
- `setVolume(value)` accepts a finite number in [0, 1].
- `touch(points)` accepts 1–10 normalized contacts with exactly id, x, y, phase. IDs are integers 0–9 and phases are down, move, up, cancel. Contact-sequence validity remains enforced by the controller.
- `cancelTouch()` ends the renderer's held contacts.
- `media(control, phoneId)` accepts only explicit play or pause and the currently observed active phone ID. The host rejects a stale owner, unavailable/expired media observation or pending selection before sending the command.

Phone selection and media commands return `{accepted: true}` only after their matching native reply succeeds. A successful reply is not proof that audio played; playback presentation follows observed state. Native rejection, lost synchronization or disconnect settles that request as a generic IPC failure. Request IDs and raw errors stay privileged. Other commands still return after controller dispatch; their acceptance does not establish native completion. Phone opening waits for successful selection, the observed active device and a true `projectionReady` view flag; manual navigation or an authoritative route interruption cancels the pending opening intent.

The public view includes only connected, projectionReady, front, phones (id/name/status), volume, route, preferredRoute, the fixed reconnect notice and bounded `homeStatus` metadata. `homeStatus` carries nullable title/artist/playing, optional battery percentage/charging and local observation freshness. Signal remains unavailable because a common scale was not verified; artwork, carrier, app, album, duration and raw timestamps are not exposed. Native state, configuration, transport handles, credentials, IPC send/invoke, and generic commands are never exposed. Controller error details are replaced by a generic error before crossing IPC.

Every incoming call rechecks the exact owning WebContents, its current main-frame identity, and both current document URLs. An in-flight main-frame navigation revokes calls until navigation commits; only the exact trusted document can then regain access. A canceled navigation may leave the bridge fail-closed until the trusted host reloads the page. Main-frame navigation, crash, destruction, and explicit detach request contact cancellation. Window destruction and process loss remove IPC handlers and the controller subscription. Renderer send failures are contained rather than thrown into controller publication.

## Verification limits

`node --test tests/boundary.test.mjs` executes the actual CommonJS preload in a Node VM with Electron replaced by an unavoidable test double. It exercises the real boundary and host modules, including a preload → main → real controller path with a simulated native session, plus explicit runtime/socket composition. Tests cover fixed channels, view allowlisting, event stripping, listener cleanup, malicious senders, subframes, exact URLs, malformed arguments, navigation, preferences, lifecycle cleanup, and touch cancellation.

Chromium UI flows use an injected bridge. The optional [actual Electron smoke harness](../tests/electron/README.md) uses the production runtime/preload and a private fake Unix socket. Its launcher currently aborts at the environment sandbox-helper check, before any application assertion; the sandboxed Chromium test is blocked similarly. Earlier browser checks used sandbox-disabled startup. Actual Electron process isolation, native compositor placement, local protocol loading, hardware touch transforms, and host-window behavior remain unverified.

References: [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security), [context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation), and [WebContents navigation events](https://www.electronjs.org/docs/latest/api/web-contents).


For a future native compositor embedding, use `headunitWindowOptions({compositor:true})` before constructing the BrowserWindow. This supplies a main-role title, content sizing, no frame and a transparent background without enabling kiosk ownership. The host prevents page-title replacement. Actual Wayland app ID, planes, secondary windows and fullscreen behavior still require native integration; the preset is not an executable launcher.

Pass the actual BrowserWindow to the boundary/runtime. Touch eligibility starts from `isFocused()` and is revoked on window blur or unresponsive. These events send a best-effort cancel for tracked contacts; fresh touch is allowed only when focused and responsive again. Missing focus capability fails closed for touch. No native health protocol or acknowledgment is implied, and dead-client cleanup in LIVI remains a separate requirement. Existing page touch remains disabled until geometry is validated.

## Parent lifeline

For a core-launched UI, pass `lifeline: {onLost: () => app.quit()}` to `createGlassRuntime`. The privileged host supplies Electron's `app`; this module does not import it or quit on import. `start()` activates the watcher only when `process.env.LIVI_LIFELINE === '1'` and `fstatSync(0)` identifies FIFO/socket stdin, matching the pinned host's opt-in check. Terminal, file and `/dev/null` inputs are ignored. `env`, `input` and `stat` may be injected for tests; production should use the defaults.

Parent EOF disposes the boundary/controller/transport before calling `onLost` once. Stream close/error are treated conservatively as loss too. Already-ended pipes prevent socket connection. Repeated start is a no-op; a disposed runtime cannot restart. Manual disposal/window loss detaches the watcher without calling the parent-loss callback. The watcher never destroys stdin and pauses only when it initiated stream flow; it preserves an already-flowing stream. No messages are sent over the lifeline and no native command is replayed.

The explicit application entrypoint below opts into this attachment and wires its quit path. Injected-stream coverage does not validate Electron exit, SIGKILL handling in the native owner, compositor shutdown or physical input release. SIGTERM/single-instance/application ownership is source-tested below; actual exit and native readiness remain separate acceptance/design work.

If a stream was destroyed with an error before attachment, Node can still have that terminal error queued. The watcher keeps a temporary error drain until the terminal error/close event, then removes it. Only when destruction has already completed does it also schedule an unreferenced next-turn cleanup; asynchronous destruction retains the drain until completion. This avoids an uncaught shutdown error without leaving a persistent listener or invoking quit twice.


## Explicit application entry point

`electron/package.json` selects `main.mjs`, which passes the real Electron app/BrowserWindow/ipcMain into the tested `application.mjs` owner. On an authorized suitable host, an installed Electron executable can open the `electron/` directory after `npm run build`. It requires an explicit absolute `LIVI_CORE_SOCKET` ending in `core.sock` and loads only the local `dist/index.html`. It does not discover or launch an engine. Preferences use this application's separate userData directory. Sandbox-disabling and web-security-disabling launch flags are rejected. No insecure launch fallback exists.

The application takes a single-instance lock before creating a window. Second-launch events deliberately do not restore, show, focus or issue any command to the existing window. A duplicate supervised launch (`LIVI_LIFELINE=1`) exits unsuccessfully: the pinned native supervisor interprets a successful UI exit as a request to stop core. A duplicate standalone launch exits normally. Lock contention is still a startup failure, not a supported way to share one UI across concurrent supervisors; the native supervisor retains its bounded retry policy. No lock is forcibly removed.

The application wires the parent lifeline to its quit path, disposes before quitting on SIGTERM/SIGINT or normal closure, and exits unsuccessfully after renderer crash or failed page load. Startup/teardown races suppress late window creation/show. It never restarts native services or sends a native Quit/Restart action. Compositor mode selects the window preset and Wayland flag, but does not claim app-ID/plane/fullscreen/secondary-window acceptance. `desktopName` retains the pinned identity hint; actual packaged Wayland identity is not proven by metadata.

This runnable main-window shell is not yet a complete replacement for all upstream Electron responsibilities. The opt-in secondary owner and pinned native input cleanup patch provide source-tested portions; actual secondary output, camera/video, native health and physical input-release acceptance remain required before appliance use. All application lifecycle results here use injected Electron objects, with a real local runtime/socket seam test. Actual Electron startup and OS signal behavior remain unverified in this sandbox-blocked environment.

### Main compositor sizing

Linux application startup explicitly sets `dev.f-io.livi.desktop` before readiness. In compositor mode, the main preset leaves width/height unspecified so native output layout owns the target resolution. Inherited `LIVI_KIOSK=1` or synchronized kiosk configuration requests startup fullscreen after the pinned 400ms ready-to-show delay, using the display size observed then. The attached windowed resize reflow follows pinned LIVI's debounce/nudge/restore behavior and cancels outstanding work on shutdown, close or fullscreen transitions; it cannot restore an old size over a later resize. This is injected source-level coverage, not observed compositor behavior.

Secondary `cluster`/`aux` windows use the explicit opt-in owner described below, with separate state/views/reporting. Camera capture is unavailable; pinned upstream camera presentation uses browser capture rather than a native video plane. Config-driven kiosk and zoom use the privileged observer below; saved desktop bounds application/persistence remains unimplemented. The renderer receives no config or window-control capability.

### Privileged config subscription

`createGlassRuntime()` returns `subscribeWindowConfig(listener)` for the trusted main-process application only. It emits detached, deduplicated window-only projections and invalidates them on resync/disconnect. Invalid fields stay null. It never exposes raw core config, telemetry, credentials or instrumentation content; no preload method or renderer IPC channel was added.

The application uses this subscription for compositor main-window zoom and kiosk changes. Config-driven dimensions/bounds are not applied in compositor mode. Startup uses the existing settle delay; asynchronous fullscreen reversals apply only the latest valid changed choice after acknowledgment, with no retry of rejected geometry/transition. Disposal removes the subscription and cancels deferred work. Secondary active/size/bounds/kiosk observations remain private and feed the explicitly enabled role owner below. RealDash is unchanged and independent.

### Opt-in secondary role ownership

With both `LIVI_COMPOSITOR=1` and `HEADUNIT_SECONDARY_WINDOWS=1`, the application enables the secondary owner. Without that explicit opt-in, no secondary window or secondary IPC handler is created. A synchronized `clusterScreenActive: true` or `auxScreenActive: true` then creates that role's window. No display resolution is chosen by this owner. Each window has a host-owned `livi:<role>` title, its own nonpersistent session partition, a dedicated sandboxed preload and denied permission/popup/webview requests. It is shown without an explicit activation request. Real compositor focus/output behavior still needs acceptance.

The secondary preload exposes only `headunitSecondary.getView()`, `onView(callback)` and `shown()`. There is no role/front argument and no main navigation, phone, media, volume, touch, raw IPC or config method. The host authenticates the exact live webContents/main frame/document and derives the role from that window's current lease. The view contains only role, connection, observed front and local presentation state. `presented` means the local owner called `showInactive`; it is not native readiness or proof of displayed pixels.

`shown()` can send one `show` action for that lease's `cluster`/`aux` role and `front: livi`, only after local presentation and only while synchronized native state already reports `livi`. It waits for the native reply and reauthenticates before acknowledgment. Reports are not replayed or retried; no report can take over a known camera/cluster/projection front. An already-sent native action cannot be revoked by closing a window.

The page is a read-only status surface and becomes transparent when a known native plane owns the role. It adds no gauges or telemetry and leaves RealDash independent. It does not claim to render camera media, place native planes or calibrate touch.

Deactivation, invalid config, resync/disconnect or shutdown revokes identity before destroying windows. Late loads/closes/replies cannot affect replacement leases. User close, load failure or renderer loss suppresses reopening until the role is explicitly deactivated/reactivated or a fresh synchronized connection arrives. This local suppression deliberately does not write native active flags or saved bounds. No native process or hardware is launched by the owner itself.

The main public view may include bounded configured projection dimensions/insets while synchronized and actively presenting projection. These feed the pinned contained-picture CSS, not frame readiness or calibrated touch. Geometry is removed on takeover/disconnect. Main and secondary camera surfaces remain opaque and unavailable; device enumeration, capture and permission changes are not enabled. See [picture and camera contract](../docs/native-shell-integration.md#configured-picture-geometry-and-honest-camera-presentation--2026-10-20).
