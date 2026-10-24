# Orange Pi 5 Plus system UI

Status: prepared in source, not installed or tested on hardware. This is a fullscreen **production renderer** under the single-application Cage Wayland compositor. It uses the existing sandboxed Electron preload and narrow host bridge. It never starts LIVI or creates phone, media, sensor or camera data. Without a backend it shows an honest disconnected screen; with a compatible local LIVI `core.sock` it reconnects and renders only authoritative observed state. The separate browser demo remains a development preview and is not loaded by this kiosk entrypoint. Real projection planes, touch mapping, audio, pairing and CarPlay readiness require native integration and hardware tests.

## Read-only checks on the Pi

Keep SSH and a local keyboard available. The target is Orange Pi 5 Plus 4 GB with Armbian Minimal; actual package and seat support must be checked on that image:

```sh
uname -m                            # aarch64 required
cat /etc/os-release
ls -l /dev/dri/card0 /dev/tty1
loginctl seat-status seat0
apt-cache policy cage electron
command -v cage
command -v electron
```

Select a trusted ARM64 Electron binary and inspect the underlying ELF if its command is a wrapper. Its sandbox must work as non-root `cruiser`; do not pass `--no-sandbox`, `--disable-setuid-sandbox` or `--disable-web-security`. Cage needs a working DRM/logind/libseat backend. Ubuntu 26.04 package availability, graphics and seat behavior are unverified. The existing Node 22.22.2 installation is not used by the launcher. Node 22.22.2 passed the repository build and 401 tests on this x86_64 host; that does not verify ARM64 graphics or Electron startup.

## Manual display trial before any boot change

Stage this branch at `/home/cruiser/head-unit`, owned by `cruiser`. The generated `dist` directory is gitignored; build it after checkout. Review the launcher and service template, then log in as `cruiser` on tty1:

```sh
cd /home/cruiser/head-unit
npm test
npm run build
test -f dist/production.html
test -x deployment/orangepi-ui-launch.sh
file /absolute/path/to/verified/arm64/electron
HEADUNIT_ELECTRON=/absolute/path/to/verified/arm64/electron ./deployment/orangepi-ui-launch.sh
```

The launcher checks user, ARM64 architecture, files, Cage, DRM and `XDG_RUNTIME_DIR`, clears inherited LIVI startup/power variables, then starts Cage with VT switching permitted. The production entrypoint uses `LIVI_CORE_SOCKET` if supplied, otherwise `HEADUNIT_CORE_SOCKET`, otherwise `$XDG_RUNTIME_DIR/headunit/core.sock`. The fallback path is only a connection target: it does not start a core or create the socket. A future compatible backend must actually listen there, or supply its real absolute `core.sock` path. Reconnection is managed by the existing transport; no cached phone, media or action is replayed after loss. Do not run an independently owned second UI beside the native core's UI supervisor.

During the trial, confirm the disconnected screen is visible, no sample phone/music/sensor state appears, keyboard/VT switching works, the Electron sandbox is active, and exiting the process returns tty1. When a real reviewed backend is available, separately verify socket protocol/version, authoritative state, disconnect/reconnect, window geometry, touch and peripherals. A cloud test cannot verify those.

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

A future Desktop button can switch to a separately managed Ubuntu desktop session while this head-unit session remains the boot default. That needs explicit seat/session handoff and a return path; no desktop or button is installed here.

## Native boundary

The PR's `scripts/native-check.py` and `native/manifest.json` pin an x86_64 Rust host. They are not an ARM64 build recipe. Real LIVI requires an ARM64 build and runtime audit, compositor integration and physical phone/display/audio/touch testing. `LIVI_KIOSK=1` changes native power semantics and remains unset here. A visible system UI is not evidence that CarPlay or the native engine is ready.
