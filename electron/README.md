# Isolated Electron host boundary

This directory contains attachment modules plus an explicit Electron application entry point. Attachment imports do not launch Electron; executing the application entry point imports Electron and creates its main window after readiness. It does not install Electron, start LIVI, register a protocol or integrate native video planes. Native projection, camera, audio, microphone, and touch geometry still belong to the existing LIVI host. The explicit `glass-runtime.mjs` composition connects only to a local `core.sock` after its owner calls `start()`; it never launches LIVI.

## Main-process use

- `headunitWindowOptions()` from `host.mjs` supplies an absolute path to `preload.cjs`, context isolation, a sandbox, disabled Node integration and webviews, and enabled web security.
- A privileged owner constructs its UI `BrowserWindow` with those options, then calls `attachHeadunitHost({ipcMain, trustedWindow, trustedUrl, controller})` before loading the UI.
- `trustedUrl` must be one exact canonical `file:///...` or `app://...` document URL. Remote hosts, credentials, queries, fragments, and noncanonical URLs are rejected. A custom `app:` scheme must already have a trusted local resource handler in the embedding host. No remote development-server exception is provided.
- `attachHeadunitHost` verifies the existing window preferences and denies new windows, renderer navigation, redirects, and webview attachment. It returns an idempotent detach function.
- The supplied controller must implement synchronous `view()`, `subscribe(listener)`, and `intent(intent)`. Keep the controller, transport, session, and persistence exclusively in the privileged process.
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

The future application entrypoint must opt into this attachment and wire its actual quit path. Injected-stream coverage does not validate Electron exit, SIGKILL handling in the native owner, compositor shutdown or physical input release. SIGTERM/single-instance/application ownership and native readiness remain separate integration work.

If a stream was destroyed with an error before attachment, Node can still have that terminal error queued. The watcher keeps a temporary error drain until the terminal error/close event, then removes it. Only when destruction has already completed does it also schedule an unreferenced next-turn cleanup; asynchronous destruction retains the drain until completion. This avoids an uncaught shutdown error without leaving a persistent listener or invoking quit twice.


## Explicit application entry point

`electron/package.json` selects `main.mjs`, which passes the real Electron app/BrowserWindow/ipcMain into the tested `application.mjs` owner. On an authorized suitable host, an installed Electron executable can open the `electron/` directory after `npm run build`. It requires an explicit absolute `LIVI_CORE_SOCKET` ending in `core.sock` and loads only the local `dist/index.html`. It does not discover or launch an engine. Preferences use this application's separate userData directory. Sandbox-disabling and web-security-disabling launch flags are rejected. No insecure launch fallback exists.

The application takes a single-instance lock before creating a window. Second-launch events deliberately do not restore, show, focus or issue any command to the existing window. A duplicate supervised launch (`LIVI_LIFELINE=1`) exits unsuccessfully: the pinned native supervisor interprets a successful UI exit as a request to stop core. A duplicate standalone launch exits normally. Lock contention is still a startup failure, not a supported way to share one UI across concurrent supervisors; the native supervisor retains its bounded retry policy. No lock is forcibly removed.

The application wires the parent lifeline to its quit path, disposes before quitting on SIGTERM/SIGINT or normal closure, and exits unsuccessfully after renderer crash or failed page load. Startup/teardown races suppress late window creation/show. It never restarts native services or sends a native Quit/Restart action. Compositor mode selects the window preset and Wayland flag, but does not claim app-ID/plane/fullscreen/secondary-window acceptance. `desktopName` retains the pinned identity hint; actual packaged Wayland identity is not proven by metadata.

This runnable main-window shell is not yet a complete replacement for all upstream Electron responsibilities. Secondary windows, camera/video integration and verified native health/input-death handling remain required before appliance use. All application lifecycle results here use injected Electron objects, with a real local runtime/socket seam test. Actual Electron startup and OS signal behavior remain unverified in this sandbox-blocked environment.

### Main compositor sizing

Linux application startup explicitly sets `dev.f-io.livi.desktop` before readiness. In compositor mode, the main preset leaves width/height unspecified so native output layout owns the target resolution. Only inherited `LIVI_KIOSK=1` requests fullscreen, after the pinned 400ms ready-to-show delay using the display size observed then. The attached windowed resize reflow follows pinned LIVI's debounce/nudge/restore behavior and cancels outstanding work on shutdown, close or fullscreen transitions; it cannot restore an old size over a later resize. This is injected source-level coverage, not observed compositor behavior.

Secondary `cluster`/`aux` windows are not opened by this entrypoint. They require role-specific state/views/reporting instead of loading the main page repeatedly. Camera planes remain native. Config-driven kiosk changes, zoom and saved desktop bounds are also pending a narrow privileged config observer; the renderer receives no new config or window-control capabilities.

### Privileged config subscription

`createGlassRuntime()` returns `subscribeWindowConfig(listener)` for the trusted main-process application only. It emits detached, deduplicated window-only projections and invalidates them on resync/disconnect. Invalid fields stay null. It never exposes raw core config, telemetry, credentials or instrumentation content; no preload method or renderer IPC channel was added.

The application uses this subscription for compositor main-window zoom and kiosk changes. Config-driven dimensions/bounds are not applied in compositor mode. Startup uses the existing settle delay; asynchronous fullscreen reversals apply only the latest valid changed choice after acknowledgment, with no retry of rejected geometry/transition. Disposal removes the subscription and cancels deferred work. Secondary active/size/bounds/kiosk observations are available privately as a prerequisite for isolated role windows; such windows are still not created. RealDash is unchanged and independent.
