# Differential review: local updater branch

Baseline: published production commit `bc2f98fe8f7ef8449cb116b45c25ddd537fe7897`. Reviewed local `feat/headunit-updater` changes through the final worktree diff. The changed launcher, privileged IPC boundary, update source, release store and supervisor are high-risk because they start processes, run fetched repository code and switch the visible UI. Renderer markup and tests are lower risk. Review is focused on this diff, not a general audit of LIVI or the host OS.

## Trust boundary and blast radius

- `deployment/orangepi-ui-launch.sh` is used by both the manual tty route and the optional systemd service. Its former `cage -- electron` invocation was introduced at `ea2f72b1`; it now runs a persistent, same-user Node supervisor under Cage. It retains the ARM64, cruiser, DRM, sandboxed Electron path and logind checks and still clears `LIVI_KIOSK`. The extra Node path is resolved to an absolute executable before launch.
- `startHeadunitApplication` has two runtime callers (`electron/kiosk-main.mjs`, `electron/main.mjs`). The updater is available only to a supervised child with fixed absolute source/release/active paths, a 40-character commit and a process IPC channel. The original Electron sandbox/context isolation settings are unchanged.
- `attachHeadunitBoundary` is called by `electron/host.mjs`. All new channels use its existing page, sender, main-frame, canonical URL and exact-argument authentication. The renderer can supply only `true` for the parked acknowledgement; it cannot supply a URL, branch, command, release path or SHA. Trusted-renderer compromise could trigger an update, but only from the fixed source and branch.
- `prepareHeadunitUpdate` has one production caller (`electron/update-host.mjs`). It accepts no renderer parameters. It pins the literal and effective origin (including Git URL rewrites) and branch, checks clean source/active worktrees and ancestry, disables Git hooks/fsmonitor, and executes fixed `git`, `npm test`, and `npm run build` argument arrays without a shell. Commands have isolated process groups for bounded cancellation and timeout. A release is not activated if any check fails.

## Concrete attack and failure checks

1. A different window, remote navigation or subframe invoking `headunit:request-update` is rejected before it reaches the update service (`tests/boundary.test.mjs`). Extra arguments, `false`, URL strings and paths are rejected. No raw Git output crosses IPC.
2. A changed origin, wrong branch, dirty checkout or diverged fetched commit cannot reach worktree creation (`tests/update-source.test.mjs`). A failed or cancelled build removes only its disposable staging worktree; a completed release is retested before reuse.
3. A symlinked release path, mismatched commit or missing production build is not launched (`tests/release-store.test.mjs`). A malformed manifest fails closed. A pending manifest selects the previous active release on restart.
4. Concurrent update clicks and cancellation do not activate twice (`tests/update-service.test.mjs`). The supervisor rejects pre-ready, invalid and concurrent activations (`tests/release-supervisor.test.mjs`). The old UI survives staging errors; candidate failure during readiness or the health window rolls back.
5. A real Node child-process fixture verifies the IPC handoff, Wayland environment inheritance, persistent supervisor process and interrupted switch recovery (`tests/electron-supervisor.test.mjs`). This is a process fixture, not Cage/Electron/Pi hardware validation.

No confirmed privilege escalation, renderer-selected process execution or sandbox bypass was found in the reviewed diff. The relevant risk remains repository supply chain: after a user requests an update, a new commit from the approved branch can run its own test/build scripts with cruiser privileges. The updater deliberately does not accept a different repository, but repository writers remain trusted. The 10-second candidate health period detects early crashes only. It cannot prove visible pixels, touch, audio, WayVNC access or later stability.

## Verification and remaining gates

Fresh `npm test`: 516 passed, 0 failed after final code changes; `npm run build`, `sh -n deployment/orangepi-ui-launch.sh`, `node --check deployment/electron-supervisor.mjs`, and `git diff --check` passed. Native Pi, Cage, Electron, display and WayVNC switching were not run. The source branch currently published on GitHub does not contain this updater. No service, credentials, security policy or boot behavior on the Pi was changed.
