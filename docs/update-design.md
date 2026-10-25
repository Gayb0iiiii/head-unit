# User-initiated head-unit updates

Status: staging source code and tests only. There is **no Update button, active-release switch, or restart mechanism** in this branch. The Orange Pi and its boot service have not been changed by this work.

## Current constraint

`deployment/orangepi-ui-launch.sh` runs `cage -s -- electron ...` directly. When Electron exits, Cage's supervised child exits and the compositor closes. Reloading only the renderer cannot update main-process code. A Settings button that pulls and exits Electron today would strand a manual session at the terminal or restart the entire boot service without a rollback health check.

## Prepared stage

`electron/update-source.mjs` is an unprivileged source-only preparer. It accepts paths and the active commit from a future trusted host supervisor, never from the renderer. It checks the exact `Gayb0iiiii/head-unit` origin and `feat/orangepi-system-ui` local branch, verifies the source and active checkout are clean, fetches only that remote branch, and requires the fetched commit to descend from the active commit. It creates a detached worktree by commit in a user-owned releases directory and runs `npm test` and `npm run build` there. There is no root action, `npm ci` (the root has no lockfile), shell interpolation, renderer-selected URL, branch, or command. Git hooks and fsmonitor are disabled for these operations. A failed stage is removed without touching the active build. No operation runs automatically at startup.

The returned `ready` result is **not activated**. It does not imply the branch is safe or the Pi can launch it. It is an input to a future reviewed supervisor.

## Required activation design

1. Keep a stable, user-owned Cage child launcher alive while Electron restarts. The manual tty launch and optional `headunit-ui.service` must use the same persistent launcher. Cage and the VT must remain active if Electron exits for an update.
2. The launcher owns a small manifest with `active`, `previous`, and `pending` commit IDs and verified release paths. It changes the active pointer atomically only after staging passes. The Electron host may request an update through a sender-validated, parked-only IPC command; the renderer supplies no command, path, URL, or commit. A single-operation lock and bounded progress events prevent overlapping fetch/build/restart requests.
3. The new Electron process must send an authenticated readiness signal after its trusted renderer is usable. If startup fails or readiness times out, the launcher rolls back to the previous tested release and restarts it. If rollback also fails, it exits so the existing service start-limit/getty recovery can operate. It keeps bounded logs and a visible failure reason on the next successful launch.
4. A user-visible Cancel action may stop fetch or build before activation. Once release activation begins, the launcher owns rollback; the UI must not claim that cancellation can undo a restart in progress.
5. Test both manual tty and service launch, power loss during each stage, absent network, dirty/diverged checkout, failed build, Electron crash before/after readiness, repeated updates, and return to Plasma. Keep SSH and physical VT recovery available. Do not enable the boot service or alter security permissions as part of this feature.

The current `motionState` can be `unknown` without a vehicle sensor. A parked-only Update action must remain unavailable until a trusted parked signal exists or an explicit user confirmation design is reviewed. A disabled button that can never work is not an acceptable release substitute.
