#!/bin/sh
# Select the DRM device with a connected output. A test may supply fixture roots.
set -eu
sysroot=${1:-/sys/class/drm}
devroot=${2:-/dev/dri}
requested=${HEADUNIT_DRM_CARD:-}
if [ -n "$requested" ]; then
  case "$requested" in /dev/dri/card[0-9]*) ;; *) echo 'HEADUNIT_DRM_CARD must be /dev/dri/cardN' >&2; exit 1;; esac
  case "${requested#/dev/dri/card}" in *[!0-9]*|'') echo 'HEADUNIT_DRM_CARD must be /dev/dri/cardN' >&2; exit 1;; esac
fi
found=''
for status in "$sysroot"/card*-*/status; do
  [ -f "$status" ] || continue
  [ "$(cat "$status")" = connected ] || continue
  connector=${status%/status}
  connector=${connector##*/}
  case "$connector" in *-Writeback-*) continue;; esac
  card=${connector%%-*}
  case "$card" in card[0-9]*) ;; *) continue;; esac
  case "${card#card}" in *[!0-9]*|'') continue;; esac
  device="$devroot/$card"
  [ -e "$device" ] || continue
  if [ -n "$requested" ]; then
    [ "/dev/dri/$card" = "$requested" ] && { printf '%s\n' "$requested"; exit 0; }
  elif [ -z "$found" ]; then found=$device
  elif [ "$found" != "$device" ]; then
    echo 'Multiple DRM cards have connected outputs; set HEADUNIT_DRM_CARD' >&2
    exit 1
  fi
done
if [ -n "$requested" ]; then echo 'Requested DRM card has no connected output' >&2; exit 1; fi
if [ -z "$found" ]; then echo 'No DRM card has a connected output' >&2; exit 1; fi
printf '%s\n' "$found"
