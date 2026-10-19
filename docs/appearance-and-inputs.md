# Appearance and input policy

The user selected automatic headlight-driven day/night with a manual override in Settings. src/appearance.mjs implements and tests the decision policy: explicit day/night wins; auto follows a verified boolean headlight signal; unavailable/invalid signal stays marked unavailable and preserves the last valid appearance (night fallback on first startup).

This policy is not yet wired into the preview or native settings. The Settings selector/persistence and real headlight source need the v4 vehicle-service contract and live renderer binding. No headlight signal or day-mode visual QA is claimed. The existing preview's wallpaper setting is independent.

Steering-wheel buttons are planned, but every function must also remain touch-accessible. Volume may be in a quick panel/menu because steering-wheel volume is expected to be primary. No wheel hardware, wiring, button codes or input map has been selected; do not hard-code one or treat touch UI as optional.

Playback standard is preserve the last observed state: previously playing may resume on verified return; intentional pause remains paused. Existing controller tests cover this, including stale synchronous state and phone-side pause. The preview never plays real audio.

## Confirmed brightness distinction

A manual brightness slider belongs in Settings, with future automatic physical-panel brightness based on cabin ambient/daylight sensing. No panel, sensor or brightness-control backend is chosen. This is separate from the confirmed headlight-driven day/night theme. A CSS overlay does not implement actual panel brightness; no brightness implementation is claimed here.
