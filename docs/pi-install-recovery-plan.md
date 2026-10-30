# Staged Pi installation and recovery plan

**Not deployed or reboot-tested.** Read-only Pi inspection reported by the parent task found an unsupervised Electron preview, no headunit-ui unit, no display manager, no running local Plasma/Cage, and a remote LXQt TigerVNC desktop with no local seat/VT. HDMI is disconnected. TigerVNC is enabled but has `Restart=no`. These facts explain why a preview cannot offer the supervised updater or a local desktop handoff. Browser fixtures cannot validate the board's display, logind permissions or power recovery.

## Preserve access first

Keep the existing LXQt/TigerVNC desktop and SSH installed, enabled and accessible. Do not replace packages, default targets, SSH settings, VNC ports or authentication. Record the actual VNC unit name and `systemctl cat` output; only after review, add a reversible service drop-in with `Restart=on-failure` and `RestartSec=5`. Test its restart in a maintenance window. Do not guess its instance name or enable another VNC server. This repository does not own VNC or SSH.

## Stage a local desktop and supervised UI

The new `deployment/headunit-desktop.service.example` keeps a separate local Plasma session on tty2. It is independent of the UI unit: restarting Electron, Cage or the UI does not stop Plasma. It requires installed, verified `/usr/bin/dbus-run-session` and `/usr/bin/startplasma-wayland`, logind/PAM and an available VT2. The existing UI template owns tty1. Both use bounded retries and getty fallback rather than an unbounded crash loop. The outer UI service restarts the Cage/Node owner; the Node supervisor restarts Electron, rolls back unsuccessful candidates and stops after repeated failure. Electron now exits on a reported unresponsive renderer, as well as renderer death. This does not detect every GPU or kernel hang, and no board hardware watchdog is configured.

Before installation, attach HDMI and a keyboard, confirm Ctrl+Alt+F1/F2 and SSH recovery, verify Node and Electron paths, and run the manual local session trial in `deployment/orangepi-system-ui.md`. Check logind identities using `docs/desktop-session-handoff.md`. Do not treat the existing remote LXQt session as a local Plasma session. Do not run a second UI alongside the current preview: stop only the identified preview after preserving access.

After separate deployment authorization and successful manual trials, install the reviewed two unit templates under `/etc/systemd/system/`, and the reviewed environment example as `/etc/default/headunit-ui`. Run `systemd-analyze verify` against the installed units, `systemctl daemon-reload`, then stage manual starts only. Do not jointly enable these templates at boot until the foreground/readiness gate below is implemented and accepted. These changes create persistent local login sessions and must be reviewed on the actual Pi; this audit did not execute them. Keep the existing remote desktop. If either unit fails, inspect its journal and getty fallback; do not repeatedly reset its failure budget without fixing the cause.

Install `deployment/return-to-headunit.desktop.example` as `~/.local/share/applications/return-to-headunit.desktop` for cruiser after verifying its absolute Node and checkout paths. It appears as **Return to Head Unit** in Plasma's application launcher; pin it to the dock or desktop through Plasma. Test the shortcut before relying on it. Exit to Desktop remains capability-gated and never exits to a blank terminal; it switches only to a verified live same-user local Plasma session. Both sessions remain running.

## Update channel and recovery

Set `HEADUNIT_UPDATE_BRANCH` in the reviewed host environment to the exact reviewed checkout branch. The default remains `feat/orangepi-system-ui`; do not silently switch an installed vehicle to an unmerged draft. The current reported `codex/weather-pi-network` checkout needs a deliberate matching host configuration if approved for deployment. The renderer cannot change this setting. Origin is fixed to Gayb0iiiii/head-unit; both literal and effective Git URL, clean trees and fast-forward ancestry remain mandatory. An unsupervised preview correctly reports updates unavailable.

Once running through Cage's Node supervisor, Settings → Update → parked confirmation checks the configured channel, builds/tests a detached release, activates only the tested SHA and retains the previous build on failed readiness. Cancellation is available before activation. The release manifest now fsyncs its temporary file and containing directory before reporting success; interrupted candidate reconciliation is exercised with real child processes. This improves filesystem ordering, but does not certify the SD/eMMC device, power supply or power-loss behavior. Failed updates leave the previous UI running; inspect logs instead of bypassing checks or cleaning the user's checkout.

## Acceptance and rollback

On the Pi, verify two-way desktop switching, shortcut, wheel and physical touch, update/current/cancel/offline/failure outcomes, an Electron crash, Cage restart, and cold boot with the desktop and SSH preserved. Verify the enabled units with `systemctl is-enabled`, active units with `systemctl is-active`, and new-boot journals. With HDMI absent, only headless process behavior can be checked; physical screen acceptance remains pending. Test a controlled reboot before any deliberate loss of power; electrical testing needs a suitable protected supply and backup. Do not equate a clean reboot with power-cut durability.

Rollback: disable/stop only the new headunit-ui and headunit-desktop units, start their getty recovery sessions, remove the installed shortcut and reviewed VNC restart drop-in if added, and daemon-reload. Preserve desktop packages, SSH, VNC data, user audio and release state. Use `systemctl reset-failed` only after the underlying failure is corrected. No native LIVI engine, Bluetooth, camera, vehicle/cluster or HELIX service is installed by these templates. Weather/time/updater are hosted in Electron and follow its lifecycle; cluster instrumentation stays independent.

### Deterministic recovery additions

If a recorded active release is unavailable, startup may recover only to the manifest's recorded previous commit after checking its exact Git SHA and built entry file. It never chooses an arbitrary checkout or directory, and preserves the manifest if neither release verifies. Recovery is reported through the existing failed-update state. A malformed manifest still fails closed.

Supervisor startup is idempotent. Shutdown prevents a late asynchronous child launch or release verification from creating a new owner/activation. Owned children receive SIGTERM and then SIGKILL after ten seconds if they refuse to exit; a real-child test verifies escalation with a shortened test deadline. Activation remains locked after acknowledgement until the old process exits. An interrupted pending write remains recoverable to the recorded active release on next boot. These are process/filesystem checks, not hardware-watchdog or power-cut acceptance.


## Connected-display and foreground gate (independent review)

The old `ConditionPathExistsGlob=/dev/dri/card*` checked only device existence, not a connected display. It did not make disconnected HDMI skip-safe. The UI template now removes that condition: the launcher rejects missing, ambiguous or invalid selected display devices with exit 78; `RestartPreventExitStatus=78` prevents a display-less restart loop while retaining failure state and the existing `OnFailure=getty@tty1.service` recovery request. Do **not** add 78 to `SuccessExitStatus`. This is deliberately a failed start, not a harmless condition skip. Service conflicts can stop a getty as part of startup, so an ExecCondition that merely skips the compositor is not by itself a proven terminal-restoration strategy. Recovery activation must be checked on the target systemd/logind installation.

Fixtures execute the actual launcher with temporary identity/architecture/compositor stubs and check that rejected display selection or a missing character device exits 78 without launching Cage. Separate real selector fixtures reject disconnected, unknown and writeback-only outputs. These do not start systemd, switch a VT or establish that getty is visible. A hot-unplug after successful preflight remains a runtime/compositor failure, covered only by the existing bounded restart policy until hardware testing establishes its behavior. Reconnecting a display after exit 78 requires an explicit reviewed service start; no auto-hotplug handler is added.

**Joint boot enablement remains blocked.** Both sample services still declare `WantedBy=multi-user.target`; neither declaration orders them or chooses the final foreground session. Adding `After=headunit-desktop.service` with `Type=simple` would order process launch only, not verify Plasma readiness, and could still leave the wrong VT visible. No automatic foreground activation is implemented or claimed. Do not copy a blind `chvt`, guessed session ID, sleep delay or broad privilege grant into these templates.

Required acceptance before joint enablement:

1. Attach HDMI/keyboard, preserve SSH and remote LXQt, and verify local tty1/tty2 recovery. Inspect the real DRM connector and selected card; with HDMI absent, do not start local Plasma or enable either display service.
2. Manually start and verify Plasma: same cruiser UID, local seat0, correct VT, live KWin and Plasma with its socket. Independently verify Cage/Electron and the trusted renderer are ready.
3. Implement/review a bounded boot coordinator that waits for those observed identities/readiness, explicitly activates the verified head-unit session, and reads back the active session. Its failure policy must retain the verified desktop or restore a usable getty; it must not stop SSH/VNC or guess a destination. The existing authenticated handoff is an interface reference, not a boot coordinator.
4. Validate cold boot, either service failing, absent HDMI, display reconnect and Exit/Return. Prove which session is foreground after each case before enabling the pair. A permanent desktop remains the product goal; the present templates alone do not fulfill deterministic foreground ownership.

Reference semantics: [systemd.service](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html) documents restart suppression and Type=simple; [systemd.unit](https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html) documents conditions, conflicts, ordering and failure dependencies. Actual Pi service execution remains untested; no unit was installed or changed by this audit.

### Coordinator implementation checkpoint

A bounded inactive coordinator component now exists; see [boot-coordinator.md](boot-coordinator.md) for the executable policy, required discovery/readiness/activation contract and tests. It is not wired into launchers or units. The instance-bound authenticated readiness providers and actual logind authorization remain missing, so the joint boot gate above is unchanged. Fake-session results are not physical foreground or power-loss acceptance.

### Source checkout failure during recorded-release recovery

Source verification failure is now treated as an unavailable candidate inside recorded-SHA resolution: a git rev-parse error, invalid source SHA, directory build or symlink build cannot prevent checking a valid recorded previous staged release. Only that exact previous commit with a verified directory, regular production build and matching Git HEAD may be selected. Recovery still requires successfully persisting the corrected release record before returning success.

This exception does not cover source/state root validation, manifest parsing/trust checks, recovery writes or first-boot initialization. A malformed manifest, symlinked state/root, invalid previous release or write failure remains fatal. A completely unavailable source root still fails the earlier root validation; this patch does not remove that boundary. Tests include an actual temporary Git previous release with a non-repository source, invalid/symlink builds, a wrong previous candidate, unprivileged write denial, untrusted manifest and first-boot source failure. No live release record or Pi checkout was altered.
