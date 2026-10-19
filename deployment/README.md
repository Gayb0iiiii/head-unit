# Deployment examples — NOT INSTALLED

These are disabled design examples for a future explicitly approved lab deployment. They do not register services, enable autologin, launch LIVI, change security or permissions, or alter power behavior. No current code consumes these files.

`appliance-policy.json.example` records the pure model's proposed lab timing/ownership contract. `launch-contract.json.example` records required paths/environment/identity without providing runnable paths or commands. Both remain `enabled: false` and `status: NOT_INSTALLED`.

Do not rename these to active config or create services from them until:

1. The native changes in `docs/appliance-deployment.md` exist and pass build/owner tests.
2. The target user, outer Wayland session, binaries, startup side effects and rollback are reviewed and explicitly approved.
3. One owner per process is enforced; core alone owns the shell and nested compositor.
4. The independent recovery presenter is available and its actual display is verified.
5. Service-level restart cannot reset the finite budget or recovery latch.

Automatic startup is not configured. There are deliberately no systemd units, autologin files, installer scripts, credentials, GPIO assignments, suspend/shutdown commands or sandbox-disabling flags here. Ignition/display/audio standby remains a requirement only; Raspberry Pi sleep/wake is unverified.
