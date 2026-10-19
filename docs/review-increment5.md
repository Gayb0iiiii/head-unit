# Independent review: increment 5

Reviewed 2026-10-19 against `/workspace/shared/livi-headunit-prototype-checkpoint-v4-preserved.zip` (delivered Library version 3). Scope: source provenance and native build/shell plans; controller startup/dropout routing; the narrow main-process notice field. This is a source and portable-test review, not native, visual, touchscreen, or hardware validation.

## Outcome

No outstanding blocking implementation finding in the reviewed changes. Two review findings were corrected before sign-off:

1. **Superseding a pending projection exit (functional race).** Home followed immediately by CarPlay, before the native exit acknowledgment, formerly emitted only `show(livi)` because the controller still observed projection. It also retained the intentional-exit flag, suppressing a subsequent dropout notice. The revised controller emits one fresh `show(projection)` for the newer intent when an exit is pending, then clears that flag. The regression covers lost-session acknowledgment and a subsequent Settings choice. An independent assertion also exercised a late exit acknowledgment followed by the newer projection acknowledgment: the controller returns to projection, without a command replay loop.
2. **Stock versus redesigned navigation policy (documentation).** The shell integration plan formerly instructed preserving stock `useFollowFront` disconnect behavior while the new product policy requires Home on projection loss. Section 3 now explicitly identifies stock behavior as reference and the redesigned policy as an intentional override, preserving native attention/safety and secondary-window ownership.

The final wording also correctly distinguishes startup fallback without a notice from an observed projection dropout with a reconnect notice.

## Routing and boundary checks

- Unavailable saved projection falls back to Home while retaining the saved preference. Explicit manual CarPlay navigation without an active session still opens Phones.
- An authoritative `projection -> livi` transition without an active session yields Home and the fixed `projection-reconnecting` notice unless a deliberate exit is pending.
- Later manual navigation clears the notice and wins over subsequent ordinary state updates. A deliberate Settings exit racing a dropout does not get replaced by Home.
- Native camera/cluster overrides retain precedence. The controller waits for native front authority rather than forcing projection visibility locally.
- Main-process output accepts only the fixed notice enum or null; this adds no renderer capability or native command channel.
- No changes to upstream native services, preload security settings, or launch permissions were required for these fixes.

## Source provenance

Independently checked local upstream checkout `/workspace/shared/livi-upstream-pinned`:

- Commit: `4bcd1335c2daedba40640e6dc432cd2ed7acfaa4`
- Tree: `6ba67543ebeb593cd6423b96786acff834de2857`
- 1,924 tracked files; no gitlink entries in the tracked index.
- `git fsck --full` completed successfully; `git status --porcelain` was empty, including after this review.

The provenance evidence correctly distinguishes a complete tracked tree at a shallow pinned commit from a complete repository history. An unsigned commit/tree identity does not constitute publisher signature verification. This review does not claim exhaustive functional inspection of all 1,924 files.

## Native plan checks

Representative script and source checks substantiate the plans:

- Package scripts and `scripts/build-native.mjs`: Linux native package selection, target-directory discovery, output copies, environment overrides, and the CI-only automatic `--locked` behavior.
- `pnpm-workspace.yaml`: allowed lifecycle builds; ignoring scripts is not presented as a complete runnable Electron installation.
- `scripts/after-pack.mjs`: packaging changes and launcher behavior are disclosed.
- Core `main.rs` and `host_setup.rs`: normal startup can prepare host audio, write WirePlumber configuration and restart the user WirePlumber service; startup is not a harmless environment probe.
- Provisioning build script: missing asset placeholders can modify source; the proposed limited build excludes that package.
- Resource discovery: the obsolete development-root marker and explicit `LIVI_ROOT` workaround are documented without silently modifying upstream.
- Native shell map separates the outer compositor/native projection planes from the Electron shell and explains role identity, focus, lifeline, safety arbitration, and secondary ownership. Appliance kiosk shutdown/reboot effects and upstream security-sensitive launch flags are disclosed as source behavior, not recommended workarounds.

The documentation labels native dependency installation, compilation, native tests, composition and hardware gates unexecuted/open. Portable preview tests do not close those gates. No native core, installer, system configuration, or device pairing action was executed for this audit.

## Verification

Fresh final code verification:

- `node --test --test-reporter=tap tests/*.test.mjs`: **219 passed, 0 failed, 0 skipped**.
- `npm run build`: **passed**, producing static/self-contained previews and checking adapter syntax. Existing npm unknown `http-proxy` environment warning is nonfatal.
- Independent in-memory race assertion: **passed** for Home -> CarPlay -> late Home acknowledgment -> latest CarPlay acknowledgment; exactly two show commands.

Reviewed code hashes (SHA-256):

- `src/controller.mjs`: `13fe4b40a56e4c174074b9917e688b455d3354ffa0b1cc5a44a84b5c78657944`
- `electron/main-boundary.mjs`: `94cfa3b83d82ea1d496fe6f8e7ae082cf23042dc7c9ae6ab65fd819e323f3abb`

Remaining validation: actual browser/desktop composition, native compile and launch in an authorized capable environment, phone/video/audio/microphone/touch behavior, and hardware interruption/reconnection testing.
