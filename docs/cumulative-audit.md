# Cumulative draft PR audit — 2026-10-20

Baseline: `main` and `develop` both at `8b8104b4b446280d3d46bec75ba1f9ae1e1a4fcd`.
Reviewed PR head: `f0645c61fe1319d1c7a8aaa07448b157c6c2fcb3`, plus the bounded correction below.
This is a source/security integration review, not a runtime or appliance certification.

## Findings and disposition

No critical/high-severity concrete defect was found in the reviewed cumulative changes.
One low-severity integration regression was reproduced: native Home layout editing
survived explicit navigation, disconnect or native-front takeover, leaving app
controls disabled on return. The native override omitted the preview model's exit
behavior. `src/native-model.mjs` now ends editing on explicit navigation and
authoritative departure; same-route observations retain editing. Eight regression
cases failed before the two-line fix and pass after it. A different reviewer checked
the fix and its callers; no additional commands, privileges or state persistence
were introduced.

Current documentation was also corrected where older text contradicted implemented
secondary ownership, kiosk configuration, unavailable camera presentation or the
completed native build. Historical dated verification sections remain historical.

## Coverage and trust boundaries

The cumulative diff spans 75 files before this audit correction. Three independent
reviews covered host/security/lifecycle, native patch/build and UI/state/capability
claims. Root review covered the cumulative history, build/browser harness changes,
documentation and original requirement/backlog boundaries. High-risk paths received
caller/history and test review; low-risk styling/docs received a focused consistency
review. This is not an assertion that every possible runtime interleaving was proven.

- Main IPC retains baseline sender, main-frame and exact-document authentication.
  Application → runtime → host → boundary/controller is the production ownership
  chain. Main controls remain unavailable to secondary windows.
- The compositor helper has two production callers (main and secondary). Runtime
  alone constructs the secondary owner. Leases are revoked before destruction;
  late loads/closes/replies cannot operate on replacements. Secondary permission,
  navigation and read-only IPC constraints remain intact.
- Transport is the sole production constructor of CoreSession. Handshake/revision,
  resync, bounded reconnect, no replay, explicit pause and manual selection behavior
  retain tests across the real controller/transport composition.
- Native input has one authenticated InputPeer entry into the projection actor.
  All five patched native files were reviewed through CP/AA dispatch and the AA
  accepted-contact ledger. UID/protocol checks remain unchanged; retirement,
  select timers, PTT binding and sequential releases are regression-tested.
- Build guards reject dirty/wrong source and patch drift, preserve original locks,
  force the selected target and clear stale success reports. No native executable
  or upstream startup/provisioning script is run by the verification workflow.
- Public views retain bounded metadata and unavailable/stale handling. Picture
  configuration is not frame readiness or calibration. Cameras remain unavailable;
  RealDash/instrumentation remains separate. No readiness protocol was invented.

## Evidence

- Post-fix aggregate: **398 Node tests passed**, including **12 Python guards**;
  static build and **1 real Unix-socket fixture** passed.
- Independent review reruns: **141 host tests**, **12 Python guards**, **21 native
  ownership/AA regressions**; post-fix independent native/model/bridge subset
  **58 passed**. Subsets overlap the aggregate and are not additive coverage.
- At reviewed head `f0645c6`, [CI run 39452496034](https://github.com/Gayb0iiiii/head-unit/actions/runs/39452496034)
  passed all three jobs. Four x86_64 release binaries compiled; **40 restricted
  media/compositor tests** and **21 input tests** passed. The audit correction does
  not modify native code or provisioning. Its exact-head CI result is reported in
  the handoff after the push, rather than inferred from this earlier run.
- [Retained build report](https://github.com/Gayb0iiiii/head-unit/actions/runs/39452496034/artifacts/12278074355)
  uploaded successfully. The coding environment's proxy denied local download;
  this audit did not retry it. Package/license inventory is not distribution
  clearance, and moving Ubuntu packages prevent a byte-reproducibility claim.
- Local logs: `/workspace/setup-evidence/cumulative-audit-tests.txt`,
  `/tmp/native-layout-red.txt`, `/tmp/native-layout-green.txt`,
  `/tmp/audit-host-tests.txt`. No sandbox-disabled browser run was used.

## Remaining meaningful work

The next acceptance step is a compatible secure Electron/browser host, then
explicitly authorized isolated native embedding. Verify actual app identity,
secondary planes, transparent composition, process isolation/exit and responsive
visual behavior there. Current tests inject Electron and cannot establish these.

Design choices still precede readiness/health supervision, camera capture ownership,
headlight/motion providers, Bluetooth-only calls/contacts and master-volume/DSP
integration. Saved desktop bounds application/persistence is unimplemented; the
current compositor mode intentionally leaves geometry to the native owner. No
standalone desktop-persistence requirement was added by this PR.

Authorized v4 baseline access is required for its separate vehicle-service
contracts. Physical CarPlay/AA pairing, display/touch calibration, audio/microphone,
reverse signals and ignition/power-loss recovery require the chosen hardware.
Projection touch remains disabled. No speculative feature is justified merely to
fill these gaps. Merge, deployment, native startup and security changes remain
outside this source-work increment.
