# Head-unit development

Read README.md and docs/verification.md first. This repository is an exploratory head-unit shell and control adapter, not a validated CarPlay appliance.

- Use Node 24. Run `npm test` and `npm run build` after changes. No npm dependencies are required for these checks.
- Preserve LIVI version pins, GPL notices, command allowlists and private host boundaries.
- Never claim model tests prove native projection, audio, Bluetooth, touchscreen or vehicle behavior.
- Do not launch native LIVI casually: startup can modify services, udev and network configuration. Read docs/runtime-validation-gate.md and docs/native-build-plan.md.
- Keep vehicle instrumentation independent from the head unit; prioritize phones, media and CarPlay.
- Preserve user choices, intentional pause and manual phone selection across reconnects.
- Missing sensor/device data must be unavailable, never invented.
- Keep changes reversible; work on development branches and use draft pull requests. Do not deploy, flash hardware, alter security or publish publicly without authorization.
- The original v4 demo is not included. Its integration remains blocked pending authorized file access.
