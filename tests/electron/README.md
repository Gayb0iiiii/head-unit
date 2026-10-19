# Actual Electron smoke harness

This optional Linux test launches Electron 44.7.2 with the production main/runtime/preload and renderer, using a fake protocol-8 Unix socket in a private temporary directory. It never discovers or connects to an existing socket, starts LIVI, installs host services, or accesses hardware. Root Node checks remain dependency-free.

## Reproduce

Use Node 24 and a Linux environment with working Chromium sandbox support. With the repository as the current directory:

```sh
npm ci --prefix tests/electron
node tests/electron/node_modules/electron/install.js
npm run test:electron:fixture
npm run test:electron
```

The optional dependency graph is locked in this directory. The explicit install command downloads the pinned official Electron binary and checks the package's supplied checksums. If Node needs the environment's already configured proxy, run the install command with `NODE_USE_ENV_PROXY=1`. A writable npm cache can be selected with `npm --cache /workspace/npm-cache ci --prefix tests/electron`, and `electron_config_cache=/workspace/electron-cache` selects the binary cache. These options do not configure proxy servers or change network policy.

The runner uses the existing display when present; otherwise it requests Electron's headless Ozone platform. A preconfigured graphical/virtual-display runner can supply DISPLAY. It does not install a display server, adjust sandbox ownership/permissions, or retry with sandbox disabled. Both the production BrowserWindow options and `app.enableSandbox()` require sandboxing. A 45-second watchdog bounds execution; temporary profile, socket, preferences and child processes are cleaned up.

Results go into a timestamped directory under `evidence/electron-smoke/` (ignored by Git), or under `HEADUNIT_SMOKE_OUTPUT` if supplied. `result.json` distinguishes launcher failure from application checks. A pass requires a successful Electron exit **and** an explicit successful `app-result.json`; missing application output is a failure, never a skip/pass. Successful runs capture Home, rejected-selection and disconnected screenshots.

## Intended actual-runtime checks

- Actual preload startup before socket connection, then hello/welcome and authoritative Home.
- Renderer has no Node globals or raw IPC; only the frozen allowlisted bridge is exposed. CDP inspects the real preload world for sandboxed/context-isolated status without adding test APIs to production.
- Camera takeover closes diagnostics and restores Settings.
- A matching native rejection becomes a generic renderer error. Later independent phone activity cannot revive the rejected selection or request projection.
- Socket loss clears phones and renders the disconnected state.

`test:electron:fixture` separately exercises the fake peer with the real transport/controller across an actual local Unix socket. It requires no Electron dependency. This establishes fixture interoperability, not Electron coverage.

## Current saved-environment result — 2026-10-19

The package and binary installed, and the socket fixture passed. The actual Electron launch aborted before running application code with SIGTRAP:

> The SUID sandbox helper binary was found, but is not configured correctly. Rather than run without sandboxing I'm aborting now.

The package's `chrome-sandbox` is owned by agent with mode 0755; Chromium reports that the helper requires root ownership and mode 4755. No ownership, permission, kernel, credential or network policy change was made. `python3 tests/ui.py` now requests `chromium_sandbox=True` and system Chromium likewise aborts at its sandbox helper. Previous browser successes used the old sandbox-disabled test configuration and do not establish sandboxed browser coverage.

The smoke script passes syntax checks but its application assertions and screenshot path remain **unexecuted** here. No Electron screenshot was produced. Provisioning an environment that already supports secure Electron startup is the next gate; the harness must then pass before claiming main/preload/renderer integration. Even a future pass will not validate native LIVI composition, real CarPlay, audio, physical touch or Orange Pi hardware.
