The new HZJ105 design audit found undersized controls, broad content blur, lost Audio return position, drag-triggered playback, Bluetooth focus loss, and an Audio-specific CSS rule that let the shared app bar scroll away.

This follow-up starts from merged PR #4. It confines glass to navigation, uses opaque content, enlarges targets and spacing, reflows compact Audio layouts, keeps portrait transport visible, restores library positions by view, and preserves focus while rejecting clicks after cancelled gestures. Existing offline preferences, source ownership and hardware gates remain intact.

Validation: 729 Node tests, production build and Unix-socket fixture passed. Chromium coverage includes seven day/night screens, populated artwork at six viewports, 90/100/115% scale, wheel/touch/cancel/drag/repeat/focus flows, offline playback and restart, injected Bluetooth and system journeys, reduced-transparency/motion/contrast variants, and actual navigation pixels over patterned and white backgrounds. See docs/hzj105-design-audit.md and evidence/design-skill/ for the acceptance matrix, screenshots and logs.

No Pi configuration, deployment, reboot or merge. Physical target size, glare, real trackpad/touch, device performance and driving-state integration remain unverified. This is not a safety or certification claim.
