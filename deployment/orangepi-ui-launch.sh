#!/bin/sh
# Minimal local UI-only session. Never starts LIVI or changes host power.
set -eu
repo=${HEADUNIT_ROOT:-/home/cruiser/head-unit}
electron=${HEADUNIT_ELECTRON:-/opt/headunit-electron-44.7.2/electron}
node_binary=${HEADUNIT_NODE:-$(command -v node || true)}
case "$repo:$electron" in /*:/*) ;; *) echo 'Absolute repository and Electron paths required' >&2; exit 1;; esac
case "$node_binary" in /*) ;; *) echo 'An absolute Node executable is required' >&2; exit 1;; esac
if [ "$(id -un)" != cruiser ]; then echo 'Run as cruiser' >&2; exit 1; fi
if [ "$(uname -m)" != aarch64 ]; then echo 'ARM64 host required' >&2; exit 1; fi
if [ ! -f "$repo/dist/production.html" ] || [ ! -f "$repo/electron/kiosk/package.json" ]; then
  echo 'Build missing: run npm run build in HEADUNIT_ROOT' >&2; exit 1
fi
if [ ! -x "$electron" ]; then echo "Electron binary missing: $electron" >&2; exit 1; fi
if [ ! -x "$node_binary" ]; then echo "Node executable missing: $node_binary" >&2; exit 1; fi
if ! command -v cage >/dev/null 2>&1; then echo 'Cage Wayland compositor missing' >&2; exit 1; fi
card=$("$repo/deployment/select-drm-card.sh")
if [ ! -c "$card" ]; then echo "DRM display device missing: $card" >&2; exit 1; fi
export WLR_DRM_DEVICES=$card
export HEADUNIT_SESSION=1
export HEADUNIT_ROOT=$repo
export HEADUNIT_ELECTRON=$electron
if [ -z "${XDG_RUNTIME_DIR:-}" ] || [ ! -d "$XDG_RUNTIME_DIR" ]; then
  echo 'A PAM/logind runtime directory is required' >&2; exit 1
fi
unset LIVI_KIOSK LIVI_COMPOSITOR LIVI_UI_CMD LIVI_LIFELINE HEADUNIT_SECONDARY_WINDOWS
if [ "${HEADUNIT_DEBUG:-}" = 1 ]; then
  printf 'Headunit: starting Cage on %s with Electron %s\n' "$card" "$electron" >&2
  exec cage -D -s -- "$node_binary" "$repo/deployment/electron-supervisor.mjs"
fi
exec cage -s -- "$node_binary" "$repo/deployment/electron-supervisor.mjs"
