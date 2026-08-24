# App V7.3.3 PWA combined integration record

| Field | Value |
| --- | --- |
| Record ID | `app-v7-3-3-pwa-combined-integration-01` |
| Date first observed | `2026-08-24` |
| Last updated | `2026-08-24` |
| Status | `open` |
| Failure category | `build` / `deployment` / `runtime` |
| Owning area | `App/App-V5/Patient/` |
| Affected version / contract | `codex/app-v7-3-3-pwa-patient`; PWA V7.3.3 combined design |
| Evidence confidence | `Confirmed` |
| Data / deployment impact | GitHub branch is published and Railway source/root configuration now targets the PWA branch; the public Backend domain serves the camera-resilience patch plus PWA/API/Therapist routes. No raw media, model training, or production data changed. `JWT_SECRET` remains unset in Railway and needs a separately confirmed security update. |

## Issue summary

- **User-visible symptom or observed failure:** the newly combined PWA route initially failed
  an Expo web export; a second integration audit found that the Sit-to-Stand
  tracker had no distinct new-session total reset. The deployed iPhone Home
  Screen PWA later opened the camera privacy indicator but entered the generic
  `runtime-error` card before any landmark/ROI was rendered.
- **Expected behavior:** both experimental modules build in the PWA, preserve
  their independent count/phase contracts, retain prior completed repetitions
  across a camera source reset, and clear totals for a new session.
- **Current actual behavior:** the source-level build and focused/full Patient
  tests pass after the repairs. The iPhone video proves camera acquisition but
  not successful first-frame inference. The new camera-resilience patch is not
  yet verified on a real iPhone after deployment.
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
| E9 | 2026-08-24 ICT | Railway deployment for GitHub commit `17d4be1` | `TypeError: configs.toReversed is not a function` in Expo Metro config; Railway selected Node `18.20.8`, while `react-native@0.81.5` requires `>=20.19.4`. | Source branch and root directory were correct; the build failed before PWA output because the package declared the obsolete permissive engine `>=18`. | Railway deployment log: build exit `1`; `EBADENGINE` warnings named Node 18 and React Native 0.81.5. |
| E10 | 2026-08-24 ICT | Railway service-variable audit after successful deploy | Only `DATABASE_URL` is configured; no `JWT_SECRET` service variable exists. | The API currently falls back to its documented development JWT secret, which is functional but not safe for a production-login claim. | Railway Variables page showed one masked `DATABASE_URL` variable only; no value was read. |
| E11 | 2026-08-24 ICT | iPhone Home Screen PWA recording (`ScreenRecording_08-24-2026 24.MP4`, SHA-256 `731bfaa4…e29857`) | After tapping `เปิดกล้อง`, the dark camera surface shows `Allow camera access to continue`; the iOS green camera indicator appears; then the UI shows `กล้องหยุดทำงาน` / `เกิดข้อผิดพลาดระหว่างประมวลผลเฟรม`. No live camera image, Pose landmarks, Hand landmarks, or Bottle ROI appear. | Camera permission/stream acquisition occurred, but the first processing loop failed before a successful visual output. The raw recording remains outside Git. | Frame review at 0.25 s around the transition plus 10 fps timeline review; source evidence is the user-provided local video only. |

## Cause assessment

- **Current assessment:** two prior implementation defects were independent: a
  JSX conditional closed inside `issues.map`, and the PWA geometry counter had
  only a source-reset path that intentionally retained totals. The new iPhone
  evidence confirms `getUserMedia` progressed to camera use but did not expose
  which first-frame task threw because production collapsed Pose, Bottle, and
  Hand exceptions into one generic `runtime-error` message.
- **Confidence:** `Confirmed` for the failure boundary; **Open** for the exact
  throwing task.
- **Evidence for it:** the video has iOS's green camera indicator before the
  generic frame-processing card and shows no successful landmark/ROI output.
  `MacCamera.web.js` placed Pose, Bottle ObjectDetector, and optional Hand
  `detectForVideo()` calls under one fatal catch.
- **Unknowns / competing hypotheses:** first Pose inference, Bottle detector
  inference/local-asset resolution, optional Hand inference, or a WebKit video
  frame timing edge can be the original throw. The new stage telemetry and
  task-isolation patch need a real iPhone cycle to distinguish them.
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
| A7 | 2026-08-24 | Raise the root Node engine floor to the Expo/React Native-supported version and lock the requirement with the Railway static-hosting test. | `package.json`, `tests/backend/pwa-static.test.js`, PWA deployment design. | Make Railpack select a Node runtime that can load Expo Metro's array helpers. | `partial` | Focused test and local root build pass; the corrected commit still needs Railway deployment/public-route verification. |
| A8 | 2026-08-24 | Publish the Node-engine correction and redeploy the configured PWA branch from the Railway service root. | GitHub commit `9317b11`; Railway source `FantasticRattee/PhysioAI-Patient-Web`, branch `codex/app-v7-3-3-pwa-patient`, root `/`. | Complete the failed PWA build on a Node version compatible with Expo Metro. | `worked` | Railway marked the deployment successful. Public `/`, `/practice`, manifest, JS, detector, `/health`, and `/therapist/plan.html` checks returned `200`; detector SHA matched source. |
| A9 | 2026-08-24 | Make iPhone PWA acquisition user-gesture-owned and split required Pose from optional Bottle/Hand frame tasks. | `PwaCameraSupport.web.js`, `MacCamera.web.js`, `SitToStandCamera.web.js`, `PracticeScreen.js`, explicit camera `Permissions-Policy`, focused/unit tests. | A permission/stream handoff reaches the camera component deterministically; an optional detector failure becomes diagnostic data rather than a whole-camera crash; any required Pose failure reports its stage. | `partial` | 17 focused tests, 894 full unit tests, and local PWA export pass. No new physical iPhone camera cycle has yet been observed. |
| A10 | 2026-08-24 | Publish the camera-resilience patch and verify the active Railway build contains its public policy/bundle markers. | GitHub commit `5a46b34`; Railway active deployment. | Make the iPhone PWA patch available from the installed Home Screen origin. | `worked` | Railway marked deployment successful; public root sent `Permissions-Policy: camera=(self)`, the new JS bundle contained `camera_handoff`/`bottle_inference`, all required routes returned `200`, and EfficientDet SHA matched the source asset. |

## Current disposition

- **Safe behavior now:** the public Railway root serves the deployed camera
  patch; it provides two separate experimental routes, direct user-gesture
  camera acquisition, and isolated task diagnostics without sending raw input
  outside the browser.
- **Do not claim:** real-camera count accuracy, detector recall, PhaseNet
  performance, authenticated-production security, patient-facing approval, or
  clinical use.
- **Dependency caveat:** the release uses the existing Expo dependency tree with
  the recorded audit advisories; no `npm audit fix` or version upgrade was
  applied as part of this PWA release.
- **Smallest next evidence or action:** publish the camera patch, then open the
  installed iPhone PWA, tap `เปิดกล้อง`, and provide a recording showing the
  first stage code plus whether Pose 33/33 appears. With explicit confirmation,
  set a new strong Railway `JWT_SECRET` separately.
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
| Node engine regression test | passed after repair | 2026-08-24 `tests/backend/pwa-static.test.js` | Initial red state expected `>=20.19.4` but received `>=18`; final focused suite passed 3/3. |
| Railway deploy | passed after Node-engine correction | 2026-08-24 GitHub commit `9317b11` | Service source is `FantasticRattee/PhysioAI-Patient-Web`, branch `codex/app-v7-3-3-pwa-patient`, root `/`. |
| Public PWA route probe | passed | 2026-08-24 `https://physioai-backend-production.up.railway.app` | `/`, `/practice`, manifest, JS, EfficientDet asset, `/health`, and `/therapist/plan.html` returned `200`; detected asset SHA was `40338edf…96dbf58`. |
| Rendered PWA landing page | passed | 2026-08-24 browser DOM check | Shows the PhysioAI Thai welcome and sign-in/register controls. |
| iPhone camera evidence | failed / analyzed | 2026-08-24 user-provided PWA screen recording | Camera indicator appears, then the generic runtime-error card occurs before any successful landmark/ROI output. |
| PWA camera resilience tests | passed after repair | 2026-08-24 focused Jest | Direct stream handoff, iPhone-safe constraints, stage errors, optional-task isolation, and `Permissions-Policy: camera=(self)` are covered. |
| Deployed camera-patch probe | passed | 2026-08-24 Railway commit `5a46b34` | Root has `camera=(self)`; active JS contains the new stage markers; `/`, `/practice`, manifest, `/health`, and Therapist route returned `200`; EfficientDet SHA matched. |
| Manual reproduction | blocked | 2026-08-24 local browser inspection | Mac is locked; no unlock or camera permission was requested/accepted. |

## Change impact

- Changed files: PWA Bottle diagnostics, Pose-only Sit-to-Stand modules/camera,
  session/UI/catalog assets/tests, PWA/model contracts, and listed docs.
- Model artifact or training-data change: `no` — only checksum-verified runtime
  mirrors of an existing train-only export were added.
- App/deployment/data change: GitHub branch published; Railway PWA source/root
  configuration applied; first remote build failed at the Node 18 runtime, and
  corrected commit `9317b11` deployed successfully. Camera patch `5a46b34`
  is now the active Railway build. Existing `DATABASE_URL` remains in Railway;
  no JWT secret is configured yet.
- Rollback or follow-up needed: retain frozen native Baseline #5 / native V7.3.3
  and V6/V6.1 PWA routes; run controlled browser camera evidence.
- Related records: `2026-08-23-bottle-grab-v7-pwa-migration-mistake-record.md`,
  `2026-08-23-sit-to-stand-v7-2-native-integration-record.md`.
