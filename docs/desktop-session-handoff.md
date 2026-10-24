# Optional desktop session and return path

Status: design and capability-gated UI only. No desktop, second graphical session, privilege rule, or handoff provider has been installed on the Orange Pi. The current Settings control correctly says “Desktop switch not set up” and stays disabled. The head-unit remains the intended boot interface on tty1.

## Session contract

Run the desktop as a **separate `cruiser` logind session on tty2**. Keep the Cage/head-unit session on tty1 alive while the desktop is foregrounded; do not exit Electron to a terminal and call that a desktop, and do not let `Restart=always` relaunch the shell over a new desktop. A narrow host provider may advertise `desktopAvailable=true` only after it has identified a live, graphical `cruiser` session on the same seat, confirmed its tty2 return path and verified that a switch to it is permitted. The zero-argument, authenticated `exitToDesktop()` IPC then requests that provider to activate the already-running session. It must report success only after the session activation is observed. Neither the renderer nor saved settings may choose a session ID, executable, shell command or destination. On failed activation the head-unit stays visible and shows a generic action error.

The desktop must have a visible “Return to Head-unit” launcher that activates the still-running tty1 session. Keep Ctrl+Alt+F1 and Ctrl+Alt+F2 plus SSH as maintenance fallbacks. If the desktop crashes, logind should return to the head-unit session or the operator should select tty1; its failure must not disable the head-unit boot service. The provider is intentionally **not wired** until both sessions and authorization have been tested on the actual Pi. This avoids a misleading enabled control and an unreviewed privileged helper.

[systemd's `loginctl activate`](https://www.freedesktop.org/software/systemd/man/latest/loginctl.html) brings an existing session to the foreground on its seat. It does not install, start or verify a desktop. Authorization for activating the other session must be checked on this Pi; do not add a blanket sudo/polkit exemption or setuid helper to make it work.

## Staged installation when ready

LXQt is the candidate desktop for a 4 GB board because it is a complete conventional desktop with fewer services than GNOME. Ubuntu's [resolute LXQt package family](https://packages.ubuntu.com/source/resolute/misc/) includes LXQt components, but the exact `lxqt-core`, Xorg and xinit candidates, dependency footprint, Xorg modesetting and available storage must be confirmed on the Pi before installation. Use tty1 or SSH, with a recovery login available. First inspect only:

```sh
apt-cache policy lxqt-core xorg xinit openbox
apt-get -s install --no-install-recommends lxqt-core xorg xinit openbox
df -h /
free -h
loginctl list-sessions
```

After reviewing the actual package simulation and authorizing package installation, install the selected packages:

```sh
sudo apt install --no-install-recommends lxqt-core xorg xinit openbox
command -v startlxqt
command -v startx
```

Do **not** install a display manager or enable autologin. Before wiring the button, manually try the desktop from a `cruiser` login on tty2 while the head-unit remains running on tty1. From that tty2 login, use a user-owned `~/.xinitrc` containing `exec startlxqt`, then run `startx -- :1 vt2`. Confirm screen, input, applications, and return to tty1 with Ctrl+Alt+F1. Confirm Ctrl+Alt+F2 returns to the desktop. On systems where tty2 has no login prompt, start `getty@tty2.service` deliberately after inspecting its status. Record the two session IDs, their seat, type and tty via `loginctl show-session`; do not hard-code IDs into the UI.

Only after that manual round trip works should a small provider and desktop return launcher be installed and the Settings control enabled. The provider needs a bounded request/confirmation timeout, no new desktop process spawn from Electron, and no `LIVI_KIOSK` power ownership. Test failed/absent desktop, session switch in both directions, screen lock, crash, reboot and boot default before treating the feature as ready. A final UI-scale/touch review is also required on the actual panel.

Rollback is to stop the desktop session on tty2 and return to tty1. The head-unit service remains the boot default; remove the optional provider/launcher to disable the Settings control. If package removal is desired later, inspect `apt-get -s purge` first because shared X11/Qt dependencies may be used by other software. No desktop package removal is needed for ordinary head-unit recovery.
