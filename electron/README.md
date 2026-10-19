# Isolated Electron host boundary

This directory is an attachment scaffold for an existing privileged LIVI host. It does not import or install Electron, create a native window, start a socket connection, register a protocol, or integrate a compositor. Native projection, camera, audio, microphone, and touch geometry still belong to the existing LIVI host.

## Main-process use

- `headunitWindowOptions()` from `host.mjs` supplies an absolute path to `preload.cjs`, context isolation, a sandbox, disabled Node integration and webviews, and enabled web security.
- A privileged owner constructs its UI `BrowserWindow` with those options, then calls `attachHeadunitHost({ipcMain, trustedWindow, trustedUrl, controller})` before loading the UI.
- `trustedUrl` must be one exact canonical `file:///...` or `app://...` document URL. Remote hosts, credentials, queries, fragments, and noncanonical URLs are rejected. A custom `app:` scheme must already have a trusted local resource handler in the embedding host. No remote development-server exception is provided.
- `attachHeadunitHost` verifies the existing window preferences and denies new windows, renderer navigation, redirects, and webview attachment. It returns an idempotent detach function.
- The supplied controller must implement synchronous `view()`, `subscribe(listener)`, and `intent(intent)`. Keep the controller, transport, session, and persistence exclusively in the privileged process.

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
- `media(control)` accepts only play or pause.

Commands return `{accepted: true}` after synchronous controller dispatch. This is not a native-core acknowledgement or proof that a phone connected, playback started, or an action completed. Use authoritative public-view updates to observe state.

The public view includes only connected, front, phones (id/name/status), volume, route, and preferredRoute. Native state, configuration, transport handles, credentials, IPC send/invoke, and generic commands are never exposed. Controller error details are replaced by a generic error before crossing IPC.

Every incoming call rechecks the exact owning WebContents, its current main-frame identity, and both current document URLs. An in-flight main-frame navigation revokes calls until navigation commits; only the exact trusted document can then regain access. A canceled navigation may leave the bridge fail-closed until the trusted host reloads the page. Main-frame navigation, crash, destruction, and explicit detach request contact cancellation. Window destruction and process loss remove IPC handlers and the controller subscription. Renderer send failures are contained rather than thrown into controller publication.

## Verification limits

`node --test tests/boundary.test.mjs` executes the actual CommonJS preload in a Node VM with Electron replaced by an unavoidable test double. It exercises the real boundary and host modules, including a preload → main → real controller path with a simulated native session. Tests cover fixed channels, view allowlisting, event stripping, listener cleanup, malicious senders, subframes, exact URLs, malformed arguments, navigation, preferences, lifecycle cleanup, and touch cancellation.

An actual Electron/Chromium runtime, contextBridge process isolation, native compositor placement, local protocol loading, hardware touch transforms, and host-window behavior have not been executed here. These require a real host validation gate before deployment.

References: [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security), [context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation), and [WebContents navigation events](https://www.electronjs.org/docs/latest/api/web-contents).
