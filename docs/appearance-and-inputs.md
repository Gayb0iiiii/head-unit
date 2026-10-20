# Appearance and input policy

The user selected automatic headlight-driven day/night with a manual override in Settings. src/appearance.mjs implements and tests the decision policy: explicit day/night wins; auto follows a verified boolean headlight signal; unavailable/invalid signal stays marked unavailable and preserves the last valid appearance (night fallback on first startup).

Settings now offers 56px-minimum Auto, Day and Night buttons in both preview and native shell mode. The selected preference and last resolved appearance persist alongside wallpaper, glass strength and dock side. Invalid stored values fall back to Auto/Night; unavailable storage keeps the change for this session and displays the existing save warning. Known motion locks manual appearance editing, consistent with other personalization controls. Keyboard focus stays on the selected control.

Day uses pale coastal glass with dark ink text; Night retains the existing dark palette. Native projection/cluster backgrounds remain transparent in either mode; camera ownership uses an opaque unavailable surface until capture is implemented. Wallpaper remains independent. Theme selection sends no native phone/media/vehicle command and does not change the phone's CarPlay interface.

Auto has no connected headlight provider yet. It explicitly reports that the signal is unavailable and retains the last selected/resolved mode, falling back to Night on first startup. The model's strict boolean/null provider seam is tested but deliberately not connected to an invented IPC field or fake toggle. Future integration must mark a lost/disconnected signal unavailable. Only the preference/last mode is persisted, never headlight availability. The v4 vehicle-service contract is still required for live automation. No headlight signal, physical brightness or day-mode visual QA is claimed.

Steering-wheel buttons are planned, but every function must also remain touch-accessible. Volume may be in a quick panel/menu because steering-wheel volume is expected to be primary. No wheel hardware, wiring, button codes or input map has been selected; do not hard-code one or treat touch UI as optional.

Playback standard is preserve the last observed state: previously playing may resume on verified return; intentional pause remains paused. Existing controller tests cover this, including stale synchronous state and phone-side pause. The preview never plays real audio.

## Confirmed brightness distinction

A manual brightness slider belongs in Settings, with future automatic physical-panel brightness based on cabin ambient/daylight sensing. No panel, sensor or brightness-control backend is chosen. This is separate from the confirmed headlight-driven day/night theme. A CSS overlay does not implement actual panel brightness; no brightness implementation is claimed here.
