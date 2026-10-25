# Optional Plasma desktop handoff

Status: the branch contains an unprivileged, fail-closed handoff provider and a desktop-side return command. Neither has been run on the Orange Pi. The user has manually opened Plasma after leaving LXQt, but a simultaneous head-unit and Plasma session, the provider's process evidence, and logind activation in both directions still need a local trial. The head-unit stays the intended boot interface. This change does not install a desktop, configure a display manager, enable autologin, change a default target, or grant new privileges.

## Behavior

The Cage/head-unit session remains running on its local VT. The Settings button becomes available only when the host sees exactly one other same-user, same-seat, local logind session on a different VT with live `kwin_wayland` and `plasmashell` processes and a user-owned Wayland socket. It accepts `Type=tty`, as a desktop started from a tty may retain that type. It refuses remote, other-user, missing, closing, and ambiguous sessions. The renderer supplies no session ID or command. On click, the host re-discovers the target, calls fixed-argument `loginctl activate`, and reports success only when logind marks the target active. Failure leaves the head-unit process alive. The button can remain disabled if `/proc` metadata is unavailable; that is a safe diagnostic result, not proof Plasma failed.

The launch script marks its Cage process with `HEADUNIT_SESSION=1`. From Plasma, `deployment/return-to-headunit.mjs` similarly finds a live marked Cage session on the same local seat, activates it, and verifies the active state. It never starts or stops Cage, Electron, Plasma, or LIVI. Session IDs and PIDs are discovered anew; tty1/tty2 are expected for the current manual setup, not hard-coded destinations. The Pi's `loginctl activate` authorization and Cage pause/resume behavior are unverified. No `LIVI_KIOSK` power ownership is enabled.

## Read-only Pi checks before relying on the button

Run these as `cruiser` while the head-unit is on one local VT and Plasma is open on another. Run the second command once in each session; keep the outputs separate. These commands do not change settings.

```sh
loginctl list-sessions
loginctl show-session "$XDG_SESSION_ID" -p Id -p User -p Seat -p VTNr -p State -p Remote -p Class -p Type -p Active
pgrep -a -u cruiser -x cage
pgrep -a -u cruiser -x kwin_wayland
pgrep -a -u cruiser -x plasmashell
```

The button needs `XDG_SESSION_ID` in the Cage process and Plasma process environments. If it stays disabled despite both desktops being visible, inspect only these non-secret fields for the three process names, without printing whole environments:

```sh
for headunit_pid in $(pgrep -u cruiser -x cage) $(pgrep -u cruiser -x kwin_wayland) $(pgrep -u cruiser -x plasmashell); do
  printf 'PID %s: ' "$headunit_pid"
  tr '\0' '\n' <"/proc/$headunit_pid/environ" | grep -E '^(XDG_SESSION_ID|WAYLAND_DISPLAY|HEADUNIT_SESSION)=' | tr '\n' ' '
  printf '\n'
done
```

The host also requires the Plasma `WAYLAND_DISPLAY` to resolve to a socket owned by `cruiser` under `/run/user/1000/`. If any field is missing, keep the button disabled and review the actual session setup. Do not add a sudo, polkit, or setuid exemption to force activation.

## Staged manual round trip

Use the existing local `cruiser` console sessions and keep SSH or another recovery login available. Launch the head-unit manually with `deployment/orangepi-ui-launch.sh` on its local VT and Plasma manually on the other VT. Do not enable the boot service for this test. First confirm the physical keyboard can move between them with Ctrl+Alt+F1 and Ctrl+Alt+F2. Then try Settings → Exit to Desktop. From a Plasma terminal, run:

```sh
node /home/cruiser/head-unit/deployment/return-to-headunit.mjs
```

Only after that command is verified locally, an optional Plasma launcher can call the same fixed command. Use the absolute Node path returned by `command -v node`; do not assume a desktop launcher inherits the interactive shell's `PATH`. The launcher must be installed in `cruiser`'s user application directory, not as a system service. Test its click and the return path before calling the feature ready.

Keep Ctrl+Alt+F1/F2 and SSH as maintenance paths. If activation fails, the command exits unsuccessfully and leaves both sessions running. If Plasma crashes, return to the head-unit VT manually. If Cage crashes, its existing supervised recovery policy applies only if that service was separately enabled. Rollback for this optional feature is to remove the desktop launcher and use the previous branch; no desktop package removal or host security change is required.

## Hardware acceptance still required

Verify repeated switches, screen lock, a crashed desktop, Cage pause/resume, keyboard/mouse/touch mapping, return launcher, and head-unit default boot on the actual Orange Pi and TK1560. The source tests use labelled session fixtures; they do not prove logind authorization, compositor survival, or a real two-way switch on the Pi.
