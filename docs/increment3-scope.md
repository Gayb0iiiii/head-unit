# Glass, layout and sensor-banner increment

## Confirmed requirements

- The wallpaper should visibly show through glass surfaces with real CSS transparency, backdrop blur and color pickup. Foreground labels/icons remain crisp. A clear-to-frosted strength setting supersedes the previous near-opaque design brief.
- App icons and dashboard tiles can be rearranged, with sensible defaults and reset. Reordering has keyboard-operable controls. A known moving state blocks editing; this preview has no motion signal and must say so rather than invent one.
- Sensor banners are user-configured in Settings. No rules are enabled by default. Users can add or edit sensor and threshold rules later. Missing and stale data are distinct from numeric threshold rules. Debounce and hysteresis limit chatter.
- Each rule may be silent or audible, and repeat or notify once until normal. Software sound intents remain capability-gated; this increment does not produce native audio. Unknown/stale gaps must not rearm a once-until-normal numeric rule.
- Units apply to our pages only, excluding CarPlay. Pressure defaults to PSI, temperature to Celsius. Thresholds retain canonical physical meaning on display-unit changes; gauge and absolute pressure are distinct sensor types.
- Banners over live CarPlay require native compositor/host integration. Browser banners do not prove that integration.
- Independent critical LEDs and cluster warnings remain untouched. These custom convenience rules are not a replacement for safety-critical monitoring.

## Evidence boundary

The independent preview has no live vehicle sensors, motion input, native compositor or phone session. Sensor snapshots in automated tests are synthetic fixtures, never presented as actual readings. Browser rendering remains unverified because the available execution/browser paths were blocked; no new workaround is attempted. The inaccessible v4 baseline is still not merged.

## Product priority

The headunit primarily serves phones, media and CarPlay. A separate dashboard will handle instrumentation later. This optional sensor/settings bridge stays bounded and does not displace projection, phone/audio integration or headunit polish. Independent cluster warnings and future CarPlay navigation/cluster links remain separate.

## Next shell increment

Dock side must be selectable left or right and persisted, with no forced right-hand-drive assumption. Implemented in the following dock-polish checkpoint with saved left/right controls, known-motion editing guard and compact-screen bottom layout retained. The CarPlay tile remains one full clickable button that requests the projection route in the preview; native projection binding is still pending. Music controls belong to a separate tile.
