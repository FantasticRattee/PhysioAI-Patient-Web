# PhysioAI App-V5 — Project Context

Updated: 2026-08-21
Scope: the `App/App-V5` MotionNet development successor. App‑V4.1 remains the stable application baseline until V5 is explicitly promoted.

## Purpose

This file is the durable, repo-scoped context for contributors and Codex. Keep it concise, update it when an architectural decision changes, and never place credentials or patient data here. The implementation and its tests remain the source of truth.

## System at a glance

```text
Patient (Expo / React Native) ──┐
                                ├── Express API + Prisma + PostgreSQL (Railway)
Therapist (static ES modules) ──┘                 │
                                                   └── serves Therapist static files
```

- `backend/` — shared Express API, JWT/bcrypt authentication, Prisma schema, and the Node host for the Therapist web app.
- `Patient/` — Expo SDK 54 React Native app for mobile and web. Its live pose pipeline runs on-device;
  the current development catalog exposes only Bottle Grab, with native Calibration 3 Baseline #3
  and a separate browser-only MacBook-camera/Rule-Wrap Hybrid Baseline #4 preview lane. Native
  live routes share `pose/NativeCameraView.js`: the selected front/back position and rear lens
  presets come from VisionCamera's reported hardware capabilities; unavailable lenses are hidden.
  Native camera permission is requested before the preview is mounted, with an actionable Settings
  fallback after denial. Camera position/lens changes replace the native preview and do not change
  model, score, rep, or Calibration 3 contracts.
  `Patient/native-ios/` is the approved bridge-free SwiftUI/XcodeGen Patient migration lane. It
  uses AVFoundation + native MediaPipe Tasks Vision + a developer-only frozen PhaseNet V2 Bottle
  Grab full-cycle sidecar. The current implementation is Simulator-first; this Expo app and the PWA lane remain
  rollback/comparison paths until native acceptance and a later physical-device gate pass.
  The web lane includes a mobile/PWA shell with browser-history linking, a shared back control,
  safe-area viewport metadata, and a phone-width responsive layout. It remains online-only for
  bundle/WASM/API delivery; camera frames and inference remain local.
- `Therapist/` — vanilla-JS ES-module web console for catalog-based plan building, session/dashboard review, and dataset recording. `therapist/capture.html` is retained as a dormant legacy reference-authoring module and is intentionally outside the normal care flow.
- `tests/` — isolated Jest projects for Patient, Therapist, and backend integration; it is not shipped with either app.

Read [README.md](../README.md) for setup/deploy details, [HANDOVER.md](../HANDOVER.md) for inherited V4.1 operational history, [Theme.md](../Theme.md) for visual tokens, [the Design 4 specification](specs/2026-07-11-design4-visual-theme.md) for the visual boundary, [the V5 MotionNet transition specification](specs/2026-07-24-motionnet-v5-transition.md) for model migration status and acceptance gates, the [Patient live camera controls design](specs/2026-08-20-patient-camera-controls-design.md), the [native iOS full-parity design](specs/2026-08-20-native-ios-full-parity-design.md), the [Patient Web/PWA navigation design](specs/2026-08-20-patient-web-pwa-navigation-design.md), and [Bottle Grab Baseline #4 MacBook-camera spec](specs/2026-08-19-bottle-grab-baseline-4-mac-camera-preview.md) for camera behavior and browser-only dev lanes.

## Runtime and deployment

Run backend plus Therapist together:

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

This serves the API and Therapist pages on the same origin (normally `http://localhost:3000`). `Therapist/shared/core/api.js` uses an explicit `window.PHYSIOAI_API_BASE` override when set, otherwise same-origin for HTTP(S) pages; do not reintroduce a hard-coded local port.

Patient uses `EXPO_PUBLIC_API_BASE` at bundle time and falls back to local/demo storage only under its documented development conditions. Run the rollback/comparison lane with `cd Patient && npm install`, then `npx expo run:ios`, `npm start`, or `npx expo start --web` as appropriate. The existing Expo native route uses the tracked `vendor/react-native-mediapipe/` bridge; the approved `Patient/native-ios/` migration uses no React Native bridge. For the native lane, run `xcodegen generate`, `/opt/homebrew/bin/pod install`, then the Simulator-first `xcodebuild ... test` command in [`Patient/native-ios/README.md`](../Patient/native-ios/README.md). The PWA Bottle Grab route uses `MacCamera.web.js` plus MediaPipe Tasks Vision WASM, the generic EfficientDet-Lite0 bottle detector, Pose proximity counting, Baseline #4 cue rules, optional Hand comments, and PhaseNet V2 context; V7.3.3 adds local detector diagnostics without changing count authority. The PWA Sit-to-Stand route uses `SitToStandCamera.web.js`, Pose Full only, a 30×30 feature/QC adapter, a geometry-owned count, and separate causal-TCN phase/comment context. Both routes remain experimental source/bundle integrations; a real browser-camera/person-in-frame run remains a separate gate. Run `postinstall` before Expo CocoaPods/native builds; never treat native and PWA lanes as the same runtime evidence.

Railway is the primary deployment pattern inherited from V4.1. The explicitly
approved V7.3.3 PWA release branch is `codex/app-v7-3-3-pwa-patient`.
[railway.json](../railway.json) expects the App-V5 repository root, runs root
`npm run build` to export `Patient/dist`, then runs `cd backend && npm run
start`; Express serves the PWA at `/`, preserves the API endpoints, and keeps
the Therapist console at `/therapist/...`. The root PWA route is intentional:
Expo web exports reference root-absolute assets. `npm run start` includes
`prisma db push`, so treat deployment/schema changes deliberately. This
authorization is PWA-hosting only; it does not promote or alter the native iOS
lanes, frozen model baselines, or clinical status. Vercel files are an
alternative serverless path, not the active default.

## Data and trust boundaries

- Backend environment: `DATABASE_URL` and `JWT_SECRET` are secrets. Keep them in `backend/.env` or deployed environment variables only.
- Auth uses JWT Bearer tokens. Therapist tokens live in browser localStorage; Patient tokens use AsyncStorage.
- Logged-in cloud data is authoritative. Local storage supports cache/demo behavior and is not a replacement for backend records.
- No raw camera video should leave the capture device/browser. The optional LLM summary sends only de-identified aggregates and is inactive without configuration.

### Live Assist MVP boundary

- Dashboard → Patient → Live Assist sends an allowlisted structured correction through authenticated REST; the Patient Practice screen polls every 2 seconds while an actual live exercise is open.
- The Patient receives only joint/action plus a server-generated bilingual cue. Standard and Audio-Only speak that text locally with Expo TTS; Visual-Only shows text and a direction symbol without speech.
- Therapist verdict and optional clinical note remain Therapist-only, are excluded from every Patient response, and are held only in the short-lived correction log. Do not enter identifying data in the note.
- A correction is acknowledged only when it reaches the active Patient presentation surface. Safety/camera setup is higher priority, queued corrections are presented one at a time, and failed acknowledgements retry during the session.
- API reachability is not Patient presence. Active-room pairing/heartbeat and real Push-to-talk/WebRTC voice are **Future Implementation**. The current Push-to-talk control is UI simulation only and never requests microphone access or transports audio.

## Pose, form, and feedback pipeline

### Current executable baseline

```text
MediaPipe BlazePose (33 landmarks)
  → JointAngleCalculator (12 canonical joint angles)
  → PoseComparator (reference vs live; pose-score component, delta, status)
  → MultiJointMotion (deterministic motion score + rep state)
  → session.js (60% pose + 40% motion final score)
  → Form feedback / rep-motion logic / session snapshot
```

`PoseComparator` is deterministic and explainable: it supplies per-joint deltas/status and the
pose-score component. Patient `session.js` owns the final deterministic score by combining 60%
tracked pose score with 40% `MultiJointMotion` score. The copied Patient runtime also contains the
from-scratch static MLP, a separate per-exercise multi-label form-fault classifier. It consumes one
current 12-angle vector, not the therapist reference directly, and has bundled models for:

- `overhead_ceiling_reach`
- `lateral_arm_raise`
- `cross_body_shoulder_stretch`

For those exercises, the Patient MLP supplies the form label and cue; comparator metrics remain available. Other exercises use the rule-based `FormScorer` fallback. `MultiJointMotion.js` is deterministic transition/rep-quality logic, not a neural model. Do not reconnect the superseded single-label `Therapist/shared/ai/nn_model.json`.

The Therapist tree has matching static model files and a matching classifier module, but
`therapist/capture.html` still calls the older one-argument API and reads obsolete output fields.
The resulting error is caught without surfacing a classification. Treat Therapist capture
classification as a known integration defect until its adapter and direct tests are fixed.

### V5 target

V5 is the MotionNet development successor. The retained legacy exercise library still contains
three established static-MLP/rule exercises, while the current development catalog intentionally
exposes only `bottle_grab` for the Calibration 3 device preview. Built-in extras and custom
exercises remain outside this preview; Bottle Grab is not for production assignment or clinical
decisions. The newest
available draft integration candidate is **LateralRaise MotionNet V3.1** for experiment ID
`lateral_arm_raise_right_temporal_v3_1`:

- Input: front-camera, unmirrored anatomical-right sequence of 30 frames × 30 temporal features,
  derived from MediaPipe VIDEO-mode landmarks.
- Compatibility gap: the current app catalog's `lateral_arm_raise` uses `left_shoulder` and
  `left_arm`. A side/ID product decision and verified feature mapping are required before V3.1 can
  be connected; it is not a drop-in replacement.
- Model heads: phase (`rest`, `raise`, `hold`, `lower`), hold quality, and supported-fault
  probabilities for `undershoot`, `overshoot`, and `elbow_bent`.
- Downstream policy: Capture-QC plus thresholded model outputs derive repetition decision
  (`pass`, `warn`, `uncertain`, `cannot_assess`); this is not a direct neural-network head.
- Phase boundary: hold quality and fault targets are supervised only during `hold`; the runtime
  must ignore them outside that phase.
- Current evidence state: experimental train-only candidate; no group-disjoint validation or
  selected thresholds; locked evaluation remains unopened; no app runtime adapter or bundled
  artifact.
- Known unsupported fault: `torso_lean`.

### Native iOS migration status (2026-08-21)

The native target now contains the SwiftUI Patient shell, fixture auth/catalog/practice/summary
flow, native Keychain/API auth seam, deterministic Pose+Hand fixture provider, frozen PhaseNet V2
full-cycle sidecar, legacy static-angle compatibility adapter, native Live Assist polling seam,
local TTS presentation, and a native XCTest target. Simulator build, install, cold-launch, and
visual route checks passed on the iPhone 17 Pro iOS 26.5 Simulator for Welcome, Login, Home,
Practice setup, Active, and Summary; the unified XCTest run passed **23/23 simulator/numeric
checks**, including source-generation/handedness guards, setup QC, full-cycle order, and golden
feature/runtime parity. The latest checkpoint also captured active-route and inline-lens-panel
screenshots without HUD overlap. The native renderer now follows the React Native
visual contract (tokens, vector logo/wordmark, strings, spacing, catalog glyphs, practice HUD, and
summary hierarchy); the claim is source/layout parity, not a pixel-diff guarantee.
The Home wordmark is now centered independently of its edge controls. The practice HUD now keeps
accuracy/cue text in a full-width row and places camera controls on a separate row, fixing the
one-character Thai wrapping seen on RATTTZQ. The native physical-camera lane starts on the rear
camera and builds its lens menu from `AVCaptureDevice` discovery; physical rear lens changes
replace the capture input transactionally and reset stale Pose+Hand joins. DEBUG traces now cover
menu request, device resolution, input acceptance, and rollback. The Simulator cannot verify
those hardware behaviors.
The Simulator fixture reports 33 Pose points, 21 Hand points, and a deterministic 4 ms diagnostic
latency. The signed Debug target has subsequently built, installed, and foreground-launched on
RATTTZQ; the `--console` command waits for the app to terminate, so its timeout is not a launch
failure. This is still only a packaging/launch gate until an unlocked manual run proves camera
quality, physical lenses, sustained FPS, thermal
behavior, physical-device TTS, and live cloud plan/session verification. See the
[approved full-parity design](specs/2026-08-20-native-ios-full-parity-design.md) for the required
1:1 React Native behavior contract and phased implementation gates, the
[native parity matrix](specs/2026-08-21-native-ios-parity-matrix.md), plus the
[native migration design](specs/2026-08-20-native-ios-patient-app-migration-design.md),
[native target README](../Patient/native-ios/README.md), and
[simulator acceptance record](specs/2026-08-20-native-ios-patient-simulator-acceptance.md), plus the
[RATTTZQ device handoff](specs/2026-08-20-native-ios-ratttzq-device-build-handoff.md).
The latest simulator/device implementation checkpoint is recorded in
[the 2026-08-21 full-parity build record](specs/2026-08-21-native-ios-ratttzq-full-parity-build.md),
and the current camera default/lens implementation is specified in
[the native camera default/lens design](specs/2026-08-21-native-camera-default-lens-design.md). The
latest native sidecar boundary is recorded in the [PhaseNet V2 full-cycle sidecar mistake record](mistake_records/2026-08-21-bottle-grab-native-phasenet-v2-full-cycle-sidecar-mistake-record.md);
the [earlier rep-counter mistake record](mistake_records/2026-08-21-bottle-grab-native-rep-counter-mistake-record.md)
and [native zoom-control mistake record](mistake_records/2026-08-21-native-zoom-control-mistake-record.md)
remain historical/separate evidence.

### Experimental Bottle Grab device previews (2026-08-19)

Patient catalog ID `bottle_grab` is the only current catalog item and is visible/selectable for
local development testing only; that visibility is not approval for treatment or clinical
decisions. The native iOS build bundles MediaPipe Hand Landmarker beside BlazePose and joins
same-timestamp Pose+Hand callbacks. The exact Calibration 3 Baseline #3 source
(`1.9.0-dev-calibration-3`) is called through the Expo App adapter after an in-memory rest
reference and a 15 Hz rolling window are available. The web build uses
`MacCamera.web.js` and the exact copied Rule-Wrap Hybrid Baseline #4 engine/policy after browser
`getUserMedia` is available; this is a separate local development route, not an iOS Simulator
camera bridge.

These are real-camera measurement lanes authorized only for local development testing, not model
promotions. The web/Expo adapters emit tentative cues plus provenance only: no score, `formClass`,
pass/warn correctness decision, repetition decision, bottle-contact truth, or rep count. The native
Swift lane separately bundles a frozen PhaseNet V2 30 × 20, 15 Hz sidecar. It only advances a
developer-visible cycle value after two stable predictions complete `start_or_rest → reach →
preshape → grasp → release → return → start_or_rest`; it does not alter the Calibration 3 output,
score, form class, correctness, bottle-contact truth, or clinical contract. A capture-source
generation gate drops prior camera/lens callbacks and handedness is normalized from the actual
input mirroring before the anatomical-left gate. Setup uses a **14-anchor full-body proxy**, not
all 33 landmarks, and `numHands = 1` remains a two-hand limitation. Those guards have
simulator/unit coverage, but physical front/rear camera validation is still pending. The model
contracts remain presentation-neutral; the Patient app may speak a cue in Standard/Audio-Only and
stays silent in Visual-Only. Missing, unsynchronised, wrong-side, or low-confidence Pose+Hand input
fails closed. The session remains `experimentalOnly`; deterministic score/rep logic is unchanged in
the web/Expo lane, and the native sidecar is explicitly non-clinical instrumentation. See the
[Calibration 3 device-preview spec](specs/2026-08-19-bottle-grab-calibration-3-device-preview.md),
[Baseline #4 MacBook-camera spec](specs/2026-08-19-bottle-grab-baseline-4-mac-camera-preview.md), the
[camera invalid-hook mistake record](mistake_records/2026-08-19-bottle-grab-camera-invalid-hook-mistake-record.md),
and the [native Metal/GPU crash record](mistake_records/2026-08-19-bottle-grab-camera-metal-gpu-crash-mistake-record.md).
The subsequent CPU-device crash is tracked separately in the [Worklets exception record](mistake_records/2026-08-19-bottle-grab-camera-worklet-exception-mistake-record.md).
The async detector-handle guard now passes a bounded iOS 26.5 Release-simulator mount loop
(three Bottle Grab open/close cycles; simulator reports `no device`), but this does not
replace real-frame verification on RATTTZQ.

The 2026-08-20 physical screenshots exposed two separate defects. The old route could render the
MediaPipe fallback, live HUD, positioning card, and camera controls together; the current source
lazy-loads the native bridge and gates all secondary surfaces on `cameraStatus === ready` (see the
[fallback/overlap mistake record](mistake_records/2026-08-20-bottle-grab-camera-module-fallback-overlap-mistake-record.md)).
The later RATTTZQ redbox showed that Metro bundled VisionCamera and Worklets through both their
source and CommonJS entries, registering `CameraView` twice. `metro.config.js` now canonicalizes
those native peers to one CommonJS entry; the [duplicate-view registration record](mistake_records/2026-08-20-bottle-grab-camera-duplicate-view-registration-mistake-record.md)
remains open until the rebuilt app passes a real-device camera-open check.

The supplied 2026-08-20 RATTTZQ screenshot confirms that the rebuilt route now mounts a live
preview, but it also exposes a separate overlay-quality defect: a hand-only frame was drawn with
the 33-point body skeleton, producing lines across the fingers and palm. Bottle Grab now maps
normalized points through `viewPoints.js` and renders the 21-point MediaPipe Hand Landmarker
topology via `HandSkeleton`; the body skeleton is suppressed for this hand-only preview. In the
Expo/VisionCamera rollback lane, camera presets are derived from iOS
`minZoom`/`neutralZoom`/`maxZoom` and physical devices at runtime, including a reported Max zoom
rather than a hard-coded marketing multiplier. The separate bridge-free native lane intentionally
does not expose that raw Max value as a lens choice; its pinch range follows the active format's
system recommendation. TTS now requests a
separate Expo Speech audio session (`useApplicationAudioSession: false`). The signed Debug app's
Pose Lite, Pose Full, and Hand task assets match their source hashes; therefore the current model
import audit is resolved, while the new hand-overlay and TTS records remain open until the next
physical build is checked for correct points and audible cues. The simulator/numeric-only native
sidecar is tracked in the [PhaseNet V2 full-cycle record](mistake_records/2026-08-21-bottle-grab-native-phasenet-v2-full-cycle-sidecar-mistake-record.md);
the [rep-counter record](mistake_records/2026-08-21-bottle-grab-native-rep-counter-mistake-record.md)
and [zoom-control record](mistake_records/2026-08-21-native-zoom-control-mistake-record.md)
remain historical/separate evidence.

Until an exercise-specific MotionNet passes the transition specification's acceptance gates, its
current static MLP/rule path remains the declared baseline. MotionNet must not replace
`PoseComparator`, the deterministic final score/rep path, camera/boundary safety gates, or privacy
boundaries in the first integration. Replacing `MultiJointMotion` or rep counting requires a
separate behavior decision.

When changing the 12-angle contract, exercise IDs, comparator tolerances, or model JSON, update equivalent Patient and Therapist modules plus their tests. Boundary/camera gating and multi-joint rep tracking are safety-sensitive behavior—do not change them under a purely visual task.

## UX and design decisions

- Design 4 is an approved visual reference, not a separate functional spec. Preserve existing routes, data, bilingual TH/EN behavior, camera flow, and accessibility while applying its warm clinical theme.
- The visual sources of truth are `Therapist/shared/assets/theme.css` (web) and `Patient/src/core/theme.js` (mobile). They currently have intentional/known token differences; choose a canonical direction before attempting a full cross-platform token sync.
- The active Therapist 3D mark is `Therapist/shared/logo3d.js`, mounted from `Therapist/index.html`. It is direct Three.js with high-DPI rendering, an SVG fallback, and a satin surface. `brand-3d/` is an unmounted R3F/Vite prototype and must stay separate unless an integration is explicitly approved.

## Verification

```bash
cd tests
npm install
npm run test:patient       # Patient logic
npm run test:therapist     # Therapist/shared logic
npm run test:unit          # both fast unit suites
npm run test:backend       # Railway Postgres integration; intentional use only
```

Backend tests contact the real Railway Postgres environment, create only `@physioai-test.invalid` users, and clean up afterward. Do not make them the default quick check when database/network access is not intended. Live camera, native TTS, browser rendering, and configured external summaries still require manual verification.

## Maintenance protocol

1. Change the active source and tests first.
2. Update the MotionNet transition spec and model provenance when an integration/evidence state changes.
3. Update this context only when its statements become stale.
4. Record durable contributor rules in `AGENTS.md`, not in global Codex memory alone.
5. Keep project decisions versioned in this repository so they travel with the code.
