#!/bin/sh
# Minimal local UI-only session. Never starts LIVI or changes host power.
set -eu
repo=${HEADUNIT_ROOT:-/home/cruiser/head-unit}
electron=${HEADUNIT_ELECTRON:-/usr/bin/electron}
case "$repo:$electron" in /*:/*) ;; *) echo 'Absolute repository and Electron paths required' >&2; exit 1;; esac
if [ "$(id -un)" != cruiser ]; then echo 'Run as cruiser' >&2; exit 1; fi
if [ "$(uname -m)" != aarch64 ]; then echo 'ARM64 host required' >&2; exit 1; fi
if [ ! -f "$repo/dist/production.html" ] || [ ! -f "$repo/electron/kiosk/package.json" ]; then
  echo 'Build missing: run npm run build in HEADUNIT_ROOT' >&2; exit 1
fi
if [ ! -x "$electron" ]; then echo "Electron binary missing: $electron" >&2; exit 1; fi
if ! command -v cage >/dev/null 2>&1; then echo 'Cage Wayland compositor missing' >&2; exit 1; fi
if [ ! -e /dev/dri/card0 ]; then echo 'DRM display device /dev/dri/card0 missing' >&2; exit 1; fi
if [ -z "${XDG_RUNTIME_DIR:-}" ] || [ ! -d "$XDG_RUNTIME_DIR" ]; then
  echo 'A PAM/logind runtime directory is required' >&2; exit 1
fi
unset LIVI_KIOSK LIVI_COMPOSITOR LIVI_UI_CMD LIVI_LIFELINE HEADUNIT_SECONDARY_WINDOWS
exec cage -s -- "$electron" "$repo/electron/kiosk"
