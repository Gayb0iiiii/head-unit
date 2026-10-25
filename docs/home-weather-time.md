# Home weather and system time

Status: implemented on the local development branch for source and browser review. It has not been fetched or tested on the Orange Pi. This is independent of LIVI and CarPlay.

## Weather

The host asks Open-Meteo's geocoding API for **Albany, Australia** and accepts only an `Albany` result whose first administrative area is **Western Australia**. It uses the coordinates returned by that response, never hard-coded or device GPS coordinates. A city search in Settings returns up to ten labelled candidates; the renderer can select only an ID from the host's latest successful search. City text goes only to Open-Meteo when Search is pressed. Forecasts use the selected city, `current` temperature, apparent temperature, WMO weather code, day/night and 10 m wind. The forecast request asks for Celsius, km/h and Unix timestamps. Unknown codes get no invented condition.

The host permits only the fixed HTTPS geocoding and forecast endpoints, blocks redirects, aborts each read after eight seconds, limits the body to 64 KiB, validates data and timestamps, and makes one refresh request at a time. It refreshes every 15 minutes. The host-owned JSON cache is at the Electron user-data directory and is written atomically with user-only permissions. A disk reading or failed refresh is labelled **Earlier weather** with its fetch age; it is never promoted to current before a successful refresh. If persistence fails, a selected city works for this session and the UI says so. The renderer receives only the city label and ID, weather values, timestamps, and a save-error bit, not coordinates or arbitrary URLs.

The Home weather card links to [Open-Meteo](https://open-meteo.com/) next to readings and credits [GeoNames](https://www.geonames.org/) for location data. The links use fixed host-owned external destinations; they may fail if no browser is installed on the Pi. Open-Meteo's public API and attribution terms must be reviewed before commercial distribution. The cloud environment's direct live API request was blocked by its network proxy, so tests use explicitly labelled response fixtures and a Pi live fetch remains an acceptance gate.

## Clock

The displayed clock reads the host's wall clock. When timedated status is available, it formats in the reported `Timezone` and separately shows `NTP` and `NTPSynchronized`; it never treats an eight-hour timezone difference as failed synchronization. The Pi was reported synchronized with NTP enabled while its timezone was `Etc/UTC`; the user was asked to set `Australia/Perth` manually on the Pi. The UI does not change that setting automatically.

Settings offers fixed Perth/UTC timezone choices, automatic time on/off, and a validated local date/time input. These invoke only `org.freedesktop.timedate1` `SetTimezone`, `SetNTP`, and `SetTime` with `interactive=true`, using normal OS authorization. Manual time first turns NTP off explicitly, then sets an absolute time; if setting fails, it tries to restore the prior automatic-time state and reports partial failure. A successful command still requires a status and wall-clock reread before the UI says it succeeded. No sudo, setuid helper, blanket polkit rule, daemon replacement, or Pi system change is included. If Cage cannot present a polkit agent, these controls fail closed and report authorization unavailable.

## Acceptance on the Pi

Check `timedatectl show -p Timezone -p CanNTP -p NTP -p NTPSynchronized`, then verify the Home hour and date after the user's timezone change. With authorization deliberately available, test automatic-time toggle and manual setting only while parked; confirm the OS result with `timedatectl` after each action, including denial and partial failure. For weather, verify the live Albany, WA geocode result, forecast, linked attribution, cache after an offline restart, city search/selection, and clock-skew behavior. Browser fixture screenshots must cover loading, current, stale and unavailable weather at the TK1560's 1920×1080 profile plus compact sizes before using the Pi as visual proof.
