# App V7.3.3 PWA combined integration record

| Field | Value |
| --- | --- |
| Record ID | `app-v7-3-3-pwa-combined-integration-01` |
| Date first observed | `2026-08-24` |
| Last updated | `2026-08-24` |
| Status | `open` |
| Failure category | `build` / `deployment` |
| Owning area | `App/App-V5/Patient/` |
| Affected version / contract | `codex/app-v7-3-3-pwa-patient`; PWA V7.3.3 combined design |
| Evidence confidence | `Confirmed` |
| Data / deployment impact | Local static-PWA hosting configuration changed; no raw media, model training, production data, or remote deployment changed yet. |

## Issue summary

- **User-visible symptom or observed failure:** the newly combined PWA route initially failed
  an Expo web export; a second integration audit found that the Sit-to-Stand
  tracker had no distinct new-session total reset.
- **Expected behavior:** both experimental modules build in the PWA, preserve
  their independent count/phase contracts, retain prior completed repetitions
  across a camera source reset, and clear totals for a new session.
- **Current actual behavior:** the source-level build and focused/full Patient
  tests pass after the repairs.  A real browser camera/person-in-frame run has
  not yet been performed.
- **Scope:** experimental PWA plus its static hosting seam only; Bottle Grab
  Baseline #5, native V7.3.3, model weights, training data, and API contracts
  remain unchanged.
- **Reproduction state:** `reproduced`

## Error and observation log

| Event ID | Date/time | Context / command / test | Error or observation (exact excerpt) | Expected vs actual / scope | Evidence or artifact |
| --- | --- | --- | --- | --- | --- |
| E1 | 2026-08-24 ICT | initial TDD run | `Expected ... "sit_to_stand"; Received ["bottle_grab"]` | New PWA catalog/camera route was intentionally absent before implementation. | `tests/patient/app-v733-pwa-combined.test.js` red result |
| E2 | 2026-08-24 ICT | `npx expo export --platform web` | `Unexpected token, expected "," (813:24)` in `PracticeScreen.js` | Summary JSX conditional was malformed; bundle could not be produced. | first `/tmp/physioai-v733-pwa-export-new` attempt, exit 1 |
| E3 | 2026-08-24 ICT | new geometry-reset test | `TypeError: counter.reset is not a function` | Camera-source reset correctly preserved totals, but there was no new-session reset that cleared totals. | `tests/patient/sit-to-stand-pwa.test.js` red result |
| E4 | 2026-08-24 ICT | source/bundle verification | Expo export emitted all ten Sit-to-Stand F32 assets; Patient suite passed. | Source/bundle integration is now available; real camera behavior remains unverified. | 34 Patient suites / 510 tests and `/tmp/physioai-v733-pwa-export-final2` |
| E5 | 2026-08-24 ICT | rendered PWA inspection | `The Mac is locked and automatic unlock could not unlock it.` | Source/bundle checks passed, but the browser UI cannot be visually inspected while the Mac is locked. | Computer Use read-only attempt; no unlock/permission action was taken. |
| E6 | 2026-08-24 ICT | Railway deployment audit | Current public `/`, `/index.html`, and `/therapist/plan.html` returned `404`, while `/health` returned `200`. | The inherited Railway configuration built only the backend and could not serve a Patient PWA. | Read-only route audit and `railway.json`/`backend/server.js` inspection. |
| E7 | 2026-08-24 ICT | `npm audit --omit=dev --json` in `Patient/` | `22` advisories: `8 moderate`, `13 high`, `1 critical`, including build-tool transitive packages such as `tar`, Metro, and Expo CLI. | The PWA export/build still succeeds, but dependency remediation requires a separately reviewed Expo/Metro upgrade; no automatic audit fix was applied in this deployment scope. | `/tmp/physioai-patient-audit-v733.json` (local temporary audit output only). |
| E8 | 2026-08-24 ICT | staged-tree check using `npm --prefix <temporary>/Patient ci` | `npm ci` reported `Missing: Patient@1.0.0 from lock file`; `--prefix` rewrote package-lock paths in that temporary invocation. | This is a test-harness invocation mismatch, not the Railway command: the approved Railway build uses `npm --prefix Patient install`. | Failed temporary staged-tree attempt; no source/lock file was adopted from that output. |

## Cause assessment

- **Current assessment:** two implementation defects were independent: a JSX
  conditional closed inside `issues.map`, and the PWA geometry counter had only
  a source-reset path that intentionally retained totals.
- **Confidence:** `Confirmed`
- **Evidence for it:** Metro reports the exact JSX line; a focused test proves
  the missing `reset()` API and passes after it is added.
- **Unknowns / competing hypotheses:** none for the source/build failures.
  Browser camera permission, MediaPipe tracking continuity, actual count, and
  runtime comment behavior have not been exercised.
- **Interpretation boundary:** passing unit/export checks prove neither model
  performance nor real-person camera behavior.

## Selected solutions and attempts

| Attempt ID | Date | Selected solution and rationale | Changes / commands | Expected effect | Result | Verification or limitation |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | 2026-08-24 | Add dedicated PWA catalog, camera, tracker, diagnostics, and asset provenance paths behind the approved experimental boundary. | PWA source/tests/assets/contracts only. | Expose two isolated experimental routes without altering native baseline. | `worked` | Focused tests cover core paths; physical-camera gate remains open. |
| A2 | 2026-08-24 | Move the `: null` branch outside the `issues.map` JSX callback. | `Patient/src/screens/PracticeScreen.js`; rerun Expo export. | Restore valid web bundle syntax. | `worked` | `/tmp/physioai-v733-pwa-export-try2` exported successfully. |
| A3 | 2026-08-24 | Add `reset()` to the geometry tracker and PWA tracker, retaining `resetForNewCaptureSource()` as partial reset. | `SitToStandGeometryCounter.js`, `SitToStandPwaTracker.js`, `session.js`; TDD test. | New session starts at zero while source swaps retain completed totals. | `worked` | Focused reset/session tests pass. |
| A4 | 2026-08-24 | Build the Expo PWA from the repository root and serve it at the Railway root, preserving API and Therapist routes. Root hosting is selected because the Expo export uses root-absolute assets. | `package.json`, `railway.json`, `backend/server.js`, `Patient/src/core/api.js`, export/static-route tests. | Make an isolated V7.3.3 PWA branch deployable on the existing Railway service without changing API contracts. | `partial` | Root build, local production-like route checks, and focused tests pass; GitHub push, Railway source update, and public-route verification are pending. |
| A5 | 2026-08-24 | Record the production-dependency audit result without applying an unreviewed bulk upgrade. | `npm audit --omit=dev --json` only. | Preserve a reproducible V7.3.3 build and avoid silently changing Expo/Metro/runtime compatibility while releasing the PWA branch. | `worked` | Audit findings are documented; remediation is deferred to a dependency-upgrade task. |
| A6 | 2026-08-24 | Repeat the staged-tree check with the exact release installation behavior, then independently dry-check the package lock from `Patient/`. | Fresh staged tree: `npm install` then `npm run export:web`; local `npm ci --dry-run --ignore-scripts` from `Patient/`. | Prove the staged PWA does not depend on untracked local source while distinguishing the temporary `--prefix ci` artifact from lock validity. | `worked` | Fresh staged tree exported successfully; `npm ci --dry-run` passed when run from the actual package directory. |

## Current disposition

- **Safe behavior now:** local PWA code, assets, contracts, export, and static
  hosting seam provide two separate experimental routes; no raw input leaves
  the browser.
- **Do not claim:** real-camera count accuracy, detector recall, PhaseNet
  performance, validation, deployment, patient-facing approval, or clinical use.
- **Dependency caveat:** the release uses the existing Expo dependency tree with
  the recorded audit advisories; no `npm audit fix` or version upgrade was
  applied as part of this PWA release.
- **Smallest next evidence or action:** complete the scrubbed GitHub branch
  publication, select that branch in Railway, verify its public static/API
  routes, then unlock the Mac and run controlled real browser-camera cycles.
- **Requires new data / model / dependency / review?:** no source change is
  pending; real-camera evidence and human review are still required.

## Validation

| Check | Result | Date / command | Notes |
| --- | --- | --- | --- |
| TDD integration test | passed after implementation | 2026-08-24 `app-v733-pwa-combined.test.js` | Initial red state retained in E1. |
| Sit-to-Stand reset + all golden-window parity | passed after repair | 2026-08-24 `sit-to-stand-pwa.test.js` | Initial red state retained in E3; all four model-owned windows replayed. |
| Patient automated test suite | passed | 2026-08-24 `npm run test:patient -- --runInBand` | 34 suites / 510 tests at recorded run. |
| Web export | passed | 2026-08-24 `npx expo export --platform web --output-dir /tmp/physioai-v733-pwa-export-final2` | Bundles all ten F32 assets. |
| Railway-like root build | passed | 2026-08-24 `npm run build` | Runs backend install, Patient install, and `expo export --platform web --output-dir dist`. |
| Local production-like static routes | passed | 2026-08-24 `PORT=3100 node backend/server.js` plus route probes | `/`, `/practice`, manifest, PWA bundle/detector asset, `/health`, and `/therapist/plan.html` all returned `200`; detector SHA matched its source asset. |
| Fresh staged-tree PWA export | passed | 2026-08-24 staged Git tree → `Patient npm install` → `npm run export:web` | Export succeeded with only staged vendor CommonJS bridge/source/assets; emitted EfficientDet, PhaseNet, and all Sit-to-Stand assets. |
| Package lock dry check | passed | 2026-08-24 `cd Patient && npm ci --dry-run --ignore-scripts` | Lock validates when invoked from the package directory. |
| Manual reproduction | blocked | 2026-08-24 local browser inspection | Mac is locked; no unlock or camera permission was requested/accepted. |

## Change impact

- Changed files: PWA Bottle diagnostics, Pose-only Sit-to-Stand modules/camera,
  session/UI/catalog assets/tests, PWA/model contracts, and listed docs.
- Model artifact or training-data change: `no` — only checksum-verified runtime
  mirrors of an existing train-only export were added.
- App/deployment/data change: local App-V5 PWA source and static hosting seam
  changed; remote deployment is still pending.
- Rollback or follow-up needed: retain frozen native Baseline #5 / native V7.3.3
  and V6/V6.1 PWA routes; run controlled browser camera evidence.
- Related records: `2026-08-23-bottle-grab-v7-pwa-migration-mistake-record.md`,
  `2026-08-23-sit-to-stand-v7-2-native-integration-record.md`.
