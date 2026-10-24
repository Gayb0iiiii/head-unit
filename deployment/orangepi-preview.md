# Orange Pi 5 Plus: UI-only system screen

Status: **prepared, not installed or hardware tested**. This is the smallest display milestone for Armbian Minimal. Cage provides one Wayland kiosk session; Electron loads `dist/index.html` as the fullscreen system screen. The preview has **no native preload, core socket, LIVI process, CarPlay, audio, or vehicle data**. Its music panel says demo/simulated and unavailable sensors remain unavailable. This path does not set `LIVI_KIOSK` or give a UI service host power ownership. A later real LIVI build and compositor integration needs a separate ARM64 recipe and hardware validation.

## Target checks before installing anything

On the Orange Pi, attached to a real display and keyboard or with working SSH:

```sh
uname -m                         # must be aarch64
cat /etc/os-release               # inspect actual Armbian/Ubuntu release
node --version                    # target has Node 22.22.2; see repository's Node 24 check requirement
ls -l /dev/dri /dev/tty1
loginctl seat-status seat0
apt-cache policy cage electron
command -v cage
command -v electron
```

Do not assume the Ubuntu `electron` package exists on this release, or that an x86_64 Electron binary works on ARM64. Select a trusted **ARM64** Electron binary and set `HEADUNIT_ELECTRON` in `/etc/default/headunit-preview` if its path differs from `/usr/bin/electron`. Check `file "$HEADUNIT_ELECTRON"`, `electron --version`, and secure sandbox startup before enabling the service. Do not use `--no-sandbox`, `--disable-setuid-sandbox`, or `--disable-web-security`. If Chromium reports a misconfigured SUID sandbox helper, stop and repair it through the package's documented installation method or an administrator-reviewed user-namespace setup; do not bypass the sandbox. Cage must be built with a working logind/libseat DRM backend. The service's PAM session is intended to provide the seat and `XDG_RUNTIME_DIR`; verify it on this image. Graphics, touch, and sandbox support cannot be certified from this x86_64 cloud workspace.

## Stage and try from a console

Keep SSH available as the maintenance path. Review `deployment/orangepi-ui-launch.sh` and `deployment/headunit-preview.service.example` before running. Copy this checkout to `/home/cruiser/head-unit` and ensure `cruiser` owns it. On the Pi use Node 24 for the repository checks (Node 22 on the target is not the tested requirement); the static output can also be built on a Node 24 development host and copied with the source. No native-check script is needed for this UI-only milestone.

```sh
cd /home/cruiser/head-unit
npm test
npm run build
test -f dist/index.html
chmod +x deployment/orangepi-ui-launch.sh
```

From a **local tty1 login as cruiser**, stop any other graphical session and run `deployment/orangepi-ui-launch.sh`. This starts Cage and Electron only for that login. Cage's `-s` permits switching to another tty for maintenance; SSH is also available. Stop the process from that tty or SSH. The script verifies user, architecture, build, Electron path, Cage, DRM and runtime directory before launch. It removes inherited LIVI variables. Confirm the fullscreen Home UI is visible, check the demo labels, keyboard/touch response, display rotation and the sandbox. These observations remain pending.

## Boot install after the manual display test

The commands below change persistent boot behavior and require the operator's approval on the Pi. Keep an SSH session open while testing. The example takes tty1 from getty while running, uses a PAM/logind seat, restarts exits at most three times per minute, and asks systemd to restore tty1 getty on start-limit failure. It does not autologin or install a full desktop.

```sh
sudo install -m 0644 deployment/headunit-preview.service.example /etc/systemd/system/headunit-preview.service
# Optional if Electron is elsewhere; create/edit with the verified ARM64 path:
# sudoedit /etc/default/headunit-preview
# HEADUNIT_ELECTRON=/absolute/path/to/verified/arm64/electron
sudo systemctl daemon-reload
sudo systemctl enable --now headunit-preview.service
systemctl status headunit-preview.service
journalctl -b -u headunit-preview.service --no-pager
```

Check a cold boot only after the manual test works. If the unit exits repeatedly, the start limit stops the loop; `systemctl status` and the journal show why. A process restart cannot preserve UI state or prove projection readiness. Browser preferences persisted under Electron's user data may survive; confirm on hardware.

## Rollback and maintenance

Via SSH or another tty:

```sh
sudo systemctl disable --now headunit-preview.service
sudo systemctl start getty@tty1.service
sudo rm /etc/systemd/system/headunit-preview.service
sudo systemctl daemon-reload
```

If the display is unusable and SSH is unavailable, add `systemd.mask=headunit-preview.service` to the kernel command line for one boot using the board's bootloader console. This prevents the unit from starting; then restore getty and remove the temporary mask. Verify the board's bootloader editing procedure before relying on this fallback. Do not remove the source tree until the unit is disabled.

## Native readiness boundary

The PR's `scripts/native-check.py` and `native/manifest.json` pin an **x86_64** Rust compiler host. That script must not be used as an ARM64 compile recipe. The pinned upstream tree contains ARM64 assets, but those are not an assembled, tested Orange Pi appliance. Real LIVI requires an ARM64 toolchain/package audit, patched core and full engine build, native compositor and secure shell integration, peripheral checks, and explicit review of upstream startup side effects. Keep the UI-only service disabled before trying any separate live-engine launch; do not run two shell owners. `LIVI_KIOSK=1` additionally changes native power semantics and is outside this stage.
