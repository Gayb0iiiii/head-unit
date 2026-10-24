# Secure visual QA gate in the saved cloud workspace

Status on 2026-10-24: visual QA of the latest wallpaper, scale, and metrics revision is blocked in this executor. Earlier production screenshots in `evidence/` were captured in headless Chromium before that revision and do not validate its final rendering or Electron's real runtime. Do not treat them as final acceptance.

Read-only diagnosis:

- The available browser is Debian Chromium 154 at `/usr/bin/chromium`. Its `/usr/lib/chromium/chrome-sandbox` is mode 4755 but owned by `nobody:nogroup`, rather than root. A sandboxed Playwright launch aborts before navigation with Chromium's `setuid_sandbox_host.cc:172` fatal: the helper must be owned by root and mode 4755.
- This executor runs as unprivileged `agent`, with `NoNewPrivs: 1`, effective capabilities 0 and seccomp enabled. `unshare -Ur true` fails because `/proc/self/uid_map` is read-only. These constraints block the ordinary unprivileged user-namespace fallback; simply replacing or changing the ownership of the helper is not established as sufficient under `NoNewPrivs`.
- No Firefox, Google Chrome, Playwright browser install, or callable browser/CUA tool was found. `/opt/codex/browser-runtime/cloud-shared-files.md` describes a shared directory and browser API, but this task exposes no such browser API. Do not publish a local preview externally solely to reach a browser without approval.

The minimal supported resolution is a separate executor with an operational, normally sandboxed Chromium/Playwright or Electron session and the same source checkout. An administrator could instead repair the browser helper and container sandbox policy, but that is a security/environment change requiring review; no such change was made. Installing a new browser package alone does not prove its sandbox can run under this container policy.

After a secure browser is available, run `python3 tests/ui-production.py` with its default sandbox setting, inspect screenshots at 1920×1080, 1280×720, 1024×600 and 800×480 for Home and all five destinations in day and night themes, with default/busy imported wallpaper and 90/100/115% scale. Test keyboard focus, 200% text, reduced motion, debug-overlay on/off and repeated navigation. Then launch the real Electron build under a graphical session to verify native menu removal, sandbox, resize and hardware acceleration. The Pi's prior visible UI trial and Mesa/Panthor log remain separate evidence; touchscreen, final panel, actual device services and desktop handoff are not verified.
