# Independent review: dock increment 4

Reviewed 2026-10-19 against `livi-headunit-prototype-checkpoint-v3-preserved.zip` (the preceding version-2 UI checkpoint). No blocking code findings identified within this narrow review. No implementation edits made.

## Change and boundary checks

- Source changes are limited to `src/app.mjs`, `src/model.mjs`, `src/style.css` and three related test files. Generated preview/evidence files also differ. The workspace is not a Git repository; the preserved ZIP supplied the baseline.
- Dock placement defaults to left. Saved and requested values are allowlisted to left/right; invalid saved values fall back without creating CSS or HTML injection paths.
- Saving placement retains existing wallpaper and glass strength. Failed storage writes leave a session-only preference and use the existing persistence warning.
- The model rejects dock changes during known movement, and Settings disables both controls. Unknown motion remains disclosed rather than being asserted stationary. The choice is a shell layout preference, not a native CarPlay configuration or vehicle-control command.
- The right-side grid is scoped to widths of at least 650px: aside explicitly occupies column 2 and main column 1 on the same row. The short-wide breakpoint retains the existing 82px dock width. The existing compact fixed-bottom layout is outside those selectors and does not receive the right-side column rules.
- The two selector buttons have readable names, pressed state, inherited visible keyboard focus, and minimum 48px height. Selection restores focus to the same control after rendering. DOM order deliberately remains dock then content even when the dock is visually right; actual keyboard/screen-reader experience still needs browser review.
- The whole CarPlay app tile was already a single projection button and remains so. It has no nested music/playback button. The added regression confirms projection navigation, while dashboard playback remains a separate simulation action without leaving the dashboard. This is regression coverage, not a newly implemented native playback/projection path.
- The Electron directory is byte-for-byte unchanged from the preserved checkpoint; sensor rules/units, build packer and native/phone/session/transport adapters are unchanged. No upstream engine was removed.

## Independent verification

- `node --test --test-reporter=tap tests/*.test.mjs`: **215 passed, 0 failed, 0 skipped**.
- `npm run build`: **passed**. Static and self-contained previews generated; adapter syntax checks passed. Only the existing npm unknown `http-proxy` environment-config warning was emitted.
- Reviewed all source/test differences for this increment. The five added tests cover left/right restoration, appearance preservation, invalid values, motion/storage guards, focus restoration, CSS breakpoint contracts, and separate CarPlay/music actions.

Tests use model assertions, source checks and DOM doubles. They do **not** establish actual visual placement, contrast, small-screen fit, touch accuracy, screen-reader operation, native CarPlay/audio behavior, or hardware motion handling. No browser, native host, phone, audio or vehicle hardware verification was performed.

## Frozen source identity

SHA-256 after final independent verification:

```text
0448851715fb32dff9b66a6fcb78632ae90182eebd44f5bf32e15fd697a0eb9e  src/app.mjs
95922dee141574656c113aa953519f8b2c0b7ae6b162da8ff94548fc5d5d787b  src/model.mjs
202849d9fdfbad3b73145b48b8de011bb43333a02a12c9febced1eba33a8205e  src/style.css
```
