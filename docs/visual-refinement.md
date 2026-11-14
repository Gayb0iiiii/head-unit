# Head-unit visual refinement, 14 November 2026

## Direction

Keep the existing HZJ105 layout, shared Audio-derived navigation and familiar phone/media destinations. Treat the UI UX Pro Max repository as a design reference, not a dependency or installer. Its useful general principles here are clear hierarchy, consistent controls and actionable empty states. Existing in-car constraints take precedence over decorative trends.

Retain the app's day/night tokens, system typography and opaque reading surfaces. Keep glass bounded to the existing app bar. Do not import remote fonts, add animation, new telemetry or an Apps launcher. The visual emphasis belongs to the media content, not disconnected placeholders.

## First focused pass

The disconnected Now Playing panel now groups the local-audio and phone-selection destinations together. A quieter 56px symbol replaces the large decorative tile in this state. Short supporting text explains the two audio choices, and buttons share consistent sizing with a secondary phone action. The existing 56px minimum target and focus treatment remain in force; controls wrap rather than compress. Portrait idle panels can grow with their content.

Native projection, protocol adapters, audio ownership and device configuration are unchanged. This branch is based on `codex/protocol11-adapter` at `4e83ade`, preserving the previous glass, HZJ105, local-audio and pointer-forwarding changes rather than restarting from old main.

## Verification and limits

Node 24.22.1: 736/736 tests passed, including a new regression test observed failing before implementation. Production build and syntax checks passed; git diff whitespace checks passed. The offline media panel exposes both destinations without fabricating playback controls.

Only existing tracked baseline images were reviewed, including `evidence/design-skill/home-night-800x480.png`. Fresh Chromium screenshots could not run: sandbox-enabled launch fails creating the process singleton socket with `Operation not permitted`, including an elevated attempt. The separate cloud browser cannot reach this checkout's localhost server. No sandbox protections were disabled. Consequently this is a draft implementation, **not a visually accepted redesign**.

Before merge, compare day/night Home at 800×480, 1280×720 and 480×800, including 90%/115% scale, large text, long unavailable messages, keyboard focus and touch scrolling. Check button wrapping and panel bounds. Native Electron and physical Orange Pi display/touch remain separate hardware acceptance gates. No deployment or vehicle changes were performed.
