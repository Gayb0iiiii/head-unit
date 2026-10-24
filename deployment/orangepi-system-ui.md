# Orange Pi 5 Plus system UI

Status: the user has observed the production UI render on the Orange Pi in a manual Cage session. Automatic boot, touch, and native features remain unverified. This is a fullscreen **production renderer** under the single-application Cage Wayland compositor. It uses the existing sandboxed Electron preload and narrow host bridge. It never starts LIVI or creates phone, media, sensor or camera data. Without a backend Home, Settings and local navigation remain available; the CarPlay destination states its dependency and no phone or media action is offered. The kiosk entrypoint removes Electron's standard menu bar. With a compatible local LIVI `core.sock` it reconnects and renders only authoritative observed state. The separate browser demo remains a development preview and is not loaded by this kiosk entrypoint. Real projection planes, touch mapping, audio, pairing and CarPlay readiness require native integration and hardware tests.

## Read-only checks on the Pi

Keep SSH and a local keyboard available. The target is Orange Pi 5 Plus 4 GB with Armbian Minimal; actual package and seat support must be checked on that image:

```sh
uname -m                            # aarch64 required
cat /etc/os-release
ls -l /dev/dri/card* /dev/tty1
loginctl seat-status seat0
apt-cache policy cage electron
command -v cage
for status in /sys/class/drm/card*-*/status; do [ -f "$status" ] && printf '%s: %s\n' "$status" "$(cat "$status")"; done
ls -l /dev/dri/by-path 2>/dev/null || true
df -h "$HOME" /opt
```

Ubuntu resolute arm64 offers Cage 0.2.1-1 but does not offer an `electron` package in the Pi's current APT indexes. Use the official Electron **44.7.2 Linux ARM64** ZIP, matching the repository's optional Electron test pin. Its official SHA-256 is `f8ecb0702b6a0b10274d2c3043dddaa22da77addcab98e7e0b1e0d4f6c2d93e9`; this was checked against the release's `SHASUMS256.txt`, and its `electron` ELF header reports AArch64. The download is about 118 MiB and expands to 301,526,864 bytes (about 288 MiB). The binary has many runtime shared-library dependencies; check missing ones on the Pi before installing packages by guesswork. Cage needs a working DRM/logind/libseat backend. Its display card is selected from connected DRM connectors; if more than one card has a connected output, set `HEADUNIT_DRM_CARD=/dev/dri/cardN` based on the connector list rather than guessing `card0`. The existing Node 22.22.2 installation is not used by the launcher. Node 22.22.2 passed the repository build and 402 tests on this x86_64 host; that does not verify ARM64 graphics or Electron startup.

## Stage the official ARM64 Electron binary

Check that `curl`, `unzip`, `sha256sum`, `file`, and `readelf` are available; install only missing basic inspection tools. Run as `cruiser`:

```sh
mkdir -p "$HOME/.cache/headunit-electron"
cd "$HOME/.cache/headunit-electron"
curl -fL https://github.com/electron/electron/releases/download/v44.7.2/electron-v44.7.2-linux-arm64.zip -o electron-v44.7.2-linux-arm64.zip
printf '%s  %s\n' f8ecb0702b6a0b10274d2c3043dddaa22da77addcab98e7e0b1e0d4f6c2d93e9 electron-v44.7.2-linux-arm64.zip | sha256sum -c -
unzip -tq electron-v44.7.2-linux-arm64.zip
```

Only after the checksum and archive checks pass, install the verified archive in a root-owned directory. This is a privileged security change because Chromium's `chrome-sandbox` helper must be root-owned with mode 4755; review and authorize it on the Pi before executing. Do not place a setuid helper in a user-writable directory and do not use sandbox-disabling flags or change AppArmor/sysctls.

```sh
sudo install -d -o root -g root -m 0755 /opt/headunit-electron-44.7.2
sudo unzip -q "$HOME/.cache/headunit-electron/electron-v44.7.2-linux-arm64.zip" -d /opt/headunit-electron-44.7.2
sudo chown -R root:root /opt/headunit-electron-44.7.2
sudo chmod 4755 /opt/headunit-electron-44.7.2/chrome-sandbox
file /opt/headunit-electron-44.7.2/electron
readelf -h /opt/headunit-electron-44.7.2/electron | grep 'Machine:.*AArch64'
stat -c '%U:%G %a %n' /opt/headunit-electron-44.7.2/chrome-sandbox
ldd /opt/headunit-electron-44.7.2/electron | grep 'not found' || true
```

If `ldd` lists missing libraries, stop and identify the owning resolute arm64 packages before the display trial. The reviewed default Electron path is `/opt/headunit-electron-44.7.2/electron`. A secure sandbox failure is a blocker; do not work around it by disabling the sandbox.

## Manual display trial before any boot change

Stage this branch at `/home/cruiser/head-unit`, owned by `cruiser`. The generated `dist` directory is gitignored; build it after checkout. Review the launcher and service template, then log in as `cruiser` on tty1:

```sh
cd /home/cruiser/head-unit
npm test
npm run build
test -f dist/production.html
test -x deployment/orangepi-ui-launch.sh
file /opt/headunit-electron-44.7.2/electron
./deployment/orangepi-ui-launch.sh
```

The launcher checks user, ARM64 architecture, files, Cage, connected DRM output and `XDG_RUNTIME_DIR`, clears inherited LIVI startup/power variables, then starts Cage with VT switching permitted. It sets `WLR_DRM_DEVICES` to the unique connected card, or accepts a validated `HEADUNIT_DRM_CARD` when selection is ambiguous. The production entrypoint uses `LIVI_CORE_SOCKET` if supplied, otherwise `HEADUNIT_CORE_SOCKET`, otherwise `$XDG_RUNTIME_DIR/headunit/core.sock`. The fallback path is only a connection target: it does not start a core or create the socket. A future compatible backend must actually listen there, or supply its real absolute `core.sock` path. Reconnection is managed by the existing transport; no cached phone, media or action is replayed after loss. Do not run an independently owned second UI beside the native core's UI supervisor.

During the trial, confirm Home and local Settings are visible, the sidebar reads Radio, Bluetooth, CarPlay, Settings, Apps in that order, and Home remains reachable. Check that the clock shows the Pi's local time; this branch does not change its timezone. Check that no sample phone/music/sensor/weather state appears, the File/Edit/View/Window menu is absent, keyboard/VT switching works, the Electron sandbox is active, and exiting the process returns tty1. In Settings, try Day/Night, wallpaper, glass strength, dock position and the Debug overlay toggle, then exit and relaunch to check persistence. With the overlay enabled, CPU may show after two samples; GPU must read unavailable until a verified counter is integrated. Verify that Home remains usable while no core socket exists and no generic failed-action alert appears. When a real reviewed backend is available, separately verify socket protocol/version, authoritative state, disconnect/reconnect, window geometry, touch and peripherals. A cloud test cannot verify those.

## Production feature inventory

This inventory describes the current source, not hardware acceptance. The production renderer has no simulated state or generated phone/media/device data. A visible UI alone does not make the following native functions operational.

| Surface | Current implementation | Remaining dependency |
| --- | --- | --- |
| Home, clock, wallpaper, Day/Night override, glass strength, dock side | Local UI and saved preferences; Home and Settings stay accessible without LIVI. The clock uses the Pi's local timezone. | Test touch, display geometry, persistence and contrast on the Pi. Auto mode needs a real headlight signal; panel brightness is separate. |
| Radio, Bluetooth, CarPlay, Settings, Apps sidebar | Five keyboard-accessible destinations in the requested order; Radio names Digital, AM and FM without pretending to tune, and Bluetooth is distinct from CarPlay. Home remains reachable. | Radio receiver/tuner service and Bluetooth pairing/audio service are absent; the CarPlay destination needs native LIVI. Additional third-party apps need an installation/launch contract. |
| Home media and weather | Now playing uses only observed native metadata, with stale/unavailable states. Weather and outdoor temperature show unavailable; no location or network request is made. | Configure a real weather provider and an agreed location/permission policy. A future adapter must cache a timestamped observation, mark stale offline data by age, bound requests, and cancel on shutdown. Starlink connectivity alone does not supply weather data. |
| Debug overlay | Off by default and saved locally. UI FPS is animation-frame callback cadence, not projected-video FPS; CPU is aggregate busy percentage across all cores measured from two `/proc/stat` samples. The authenticated IPC exposes only bounded percentages, no paths or commands, and polls only while enabled. | Check Pi CPU reading and UI FPS on-device. GPU remains unavailable until a stable, reviewed Panthor/DRM utilization counter is identified; GPU frequency is not utilization. |
| Connection diagnostics | Shows filtered status from the local bridge; initial absence is distinct from loss after a real connection | Connect a compatible native core and check actual phases. |
| App/dashboard ordering and media card | Ordering is saved when the backend supplies the relevant apps; observed media and playback state are shown only when available | A live LIVI state feed, audio path and physical playback test. Offline Home does not present empty controls as working features. |
| Phones and CarPlay | Native phone controls are bounded to observed phones and allowlisted host actions; offline CarPlay shows a dependency state with no pairing claim. | ARM64 LIVI engine, compatible `core.sock`, phone pairing/session integration, compositor video, touch, audio and microphone. Actual CarPlay connection remains a separate hardware gate. |
| Sensor units and alert rules | Preferences can be saved locally; no readings, alert evaluation or sounds run in this UI | Verified sensor providers, motion/headlight input, alert delivery and audio owner. A saved rule is not a live alert. |
| Audio/microphone, vehicle, camera, cluster | Unavailable or bounded native status screens; no fabricated readings or capture | Device selection, real media/vehicle/camera providers and their permissions; these cannot be made functional by the renderer alone. |
| Directions, Bluetooth-only music, calls, contacts, pairing/forget, maps, Desktop switch | No complete production control path exists in this renderer. Pinned LIVI state lists a top-level `navigation` field, but its turn-by-turn shape and freshness have not been validated or projected through the private host view. No directions are inferred from video. | Verify native navigation metadata and phone behavior, then add a narrow observation contract before displaying a directions panel. Other features need their respective services, permissions, privacy and UI contracts; Desktop needs a separate session and safe seat handoff. |

The next native step is an **ARM64** build and runtime audit of the pinned LIVI core, helper, GStreamer host and compositor with the maintained input patch. The existing `scripts/native-check.py` uses an x86_64 host pin and is not a Pi build recipe. Do not start the native core as a probe: it may change host services, udev and networking. Decide socket and process ownership before allowing it to run beside this kiosk shell. `LIVI_KIOSK` remains unset.

If Cage briefly opens a black display and returns to tty1, make one diagnostic retry. This enables Cage debug messages and Electron startup milestones without changing sandbox or seat settings:

```sh
cd /home/cruiser/head-unit
HEADUNIT_DEBUG=1 ./deployment/orangepi-ui-launch.sh >"$HOME/headunit-launch-debug.log" 2>&1
printf 'launcher exit=%s\n' "$?" >>"$HOME/headunit-launch-debug.log"
grep -Ei 'Headunit:|Headunit .*failed|Child process|Child exited|Cage .*running|Seat opened|FATAL|ERROR|sandbox|exit=' "$HOME/headunit-launch-debug.log" | tail -n 60
```

`Cage ... running` and `Child process created` distinguish compositor startup from an Electron child launch. `Headunit: Electron entry loaded` confirms that Electron reached this application's main module. Stop and inspect the first specific error before installing more software.

## Optional boot setup only after the manual trial succeeds

The following changes persistent boot behavior on the Pi. Keep SSH open. The service runs as `cruiser` through PAM/logind on tty1, uses bounded restart attempts, and requests getty on start-limit failure. It does not enable autologin, LIVI power ownership or a desktop environment.

```sh
sudo install -m 0644 deployment/headunit-ui.service.example /etc/systemd/system/headunit-ui.service
# If needed, set HEADUNIT_ELECTRON and/or HEADUNIT_CORE_SOCKET in /etc/default/headunit-ui.
sudo systemctl daemon-reload
sudo systemctl enable --now headunit-ui.service
systemctl status headunit-ui.service
journalctl -b -u headunit-ui.service --no-pager
```

If it fails or needs maintenance, from SSH or another tty:

```sh
sudo systemctl disable --now headunit-ui.service
sudo systemctl start getty@tty1.service
sudo rm /etc/systemd/system/headunit-ui.service
sudo systemctl daemon-reload
```

If SSH and display are both unavailable, `systemd.mask=headunit-ui.service` on a one-time boot kernel command line can suppress the service; verify the board's bootloader editing method before relying on this path. Do not remove the source until the unit is disabled.

Settings now includes a capability-gated “Exit to Desktop” control. It remains disabled until a verified second graphical session and narrow handoff provider are installed; it does not close to a terminal. The manual installation and return-path plan is in [desktop-session-handoff.md](../docs/desktop-session-handoff.md). No desktop or provider is installed on the Pi by this branch.

## Native boundary

The PR's `scripts/native-check.py` and `native/manifest.json` pin an x86_64 Rust host. They are not an ARM64 build recipe. Real LIVI requires an ARM64 build and runtime audit, compositor integration and physical phone/display/audio/touch testing. `LIVI_KIOSK=1` changes native power semantics and remains unset here. A visible system UI is not evidence that CarPlay or the native engine is ready.
