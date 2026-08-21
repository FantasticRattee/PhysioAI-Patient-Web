# PhysioAI — Patient App (React Native / Expo)

Cross-platform Expo app (Android + iOS, and **web** via react-native-web) — the rebuild of the
V1 patient side. **Round 1 = Practice mode** (Welcome / login → Home exercise list → live
practice → session summary). Audio-Only and Visual-Only are selectable presentation modes in
Practice.

> **App‑V5 transition status:** the current development catalog exposes only `bottle_grab`.
> A bridge-free SwiftUI native iOS target is now the approved migration lane; this Expo app and
> the web/PWA lane remain unchanged rollback/comparison paths until simulator and later physical
> device gates pass.
> The Expo iPhone build uses Calibration 3 Baseline #3. The web build has a separate, development-only
> MacBook-camera lane that uses Rule-Wrap Hybrid Baseline #4. Both emit tentative cues only — not
> score/form/rep decisions — and neither is patient-facing approved or a V5 promotion. The bridge-free
> Swift target has a separate frozen PhaseNet V2 full-cycle sidecar for simulator/numeric development
> instrumentation; it does not alter either cue-only contract. The retained exercise library still
> contains the other legacy IDs, but they are not currently exposed in the catalog.

The rule-based AI pipeline follows the existing BlazePose 33-landmark contract, with the
from-scratch per-frame static MLP form-fault classifier wired in on top. Native inference runs
**on-device**; the MacBook preview runs locally in the browser. No camera video is uploaded.

iOS bundle id: `com.rattee.physioai` · Android package: `com.physioai.patient` · Expo SDK 54.

## Architecture (1 file ≈ 1 responsibility)
```
App.js                      navigation root + browser history linking (Welcome → Login/Register → Home → Practice)
index.js                    Expo entry (registerRootComponent)
src/
├─ ai/                      ← current pure-JS baseline (rules + per-frame static MLP)
│   landmarks.js              BlazePose 33-landmark schema
│   JointAngleCalculator.js   landmarks → 12 joint angles (atan2)
│   PoseComparator.js         live vs reference → pose-score component + per-joint delta/status[12]
│   FormScorer.js             rule-based 4-class form classifier (fallback)
│   NNExerciseClassifier.js   static MLP → form-fault flags (overrides cue+formClass, 3 exercises)
│   models/                   bundled static per-exercise MLP weights (JSON)
│   FeedbackGenerator.js      delta → bilingual cue
│   CameraSetupGate.js        visibility[33] → good / needs-adjust (heuristic)
│   BoundaryBoxGate.js        key landmarks 95% in-frame check
│   ExerciseRecognition.js    nearest-reference exercise match (k=1)
│   MultiJointMotion.js       deterministic rest→target transition/rep scoring (not MotionNet)
│   SyntheticPose.js          demo-mode pose generator (no camera)
├─ core/
│   session.js                per-frame controller (V1 runner's brain, framework-free)
│   exercises.js              exercise library
│   i18n.js                   TH/EN strings (AsyncStorage-backed)
│   api.js                    cloud API client (fetch + JWT bearer)
│   auth.js                   register / login / session (cloud JWT or dev mock)
│   store.js                  persistence (cloud API + AsyncStorage)
│   tts.js                    Thai TTS (expo-speech)
│   accessibilityMode.js       Audio/Visual presentation policy; no scoring changes
│   theme.js                  design tokens
├─ pose/
│   usePractice.js            React hook: session loop + demo feed + TTS + logging
│   PoseCamera.js             native MediaPipe camera → 33 landmarks (live mode)
│   BottleGrabCamera.js       experimental same-timestamp pose + hand camera lane
│   NativeCameraView.js       shared VisionCamera device/lens presenter
│   cameraCapabilities.js     hardware-reported lens policy (pure/testable)
│   MacCamera.web.js          browser-only MacBook webcam + Tasks Vision WASM (web preview)
native-ios/                    separate SwiftUI + AVFoundation + native MediaPipe preview target
├─ components/                BackButton.js, Skeleton.js (SVG overlay), ScoreRing.js,
│                             CameraControls.js, BoundaryBoxOverlay.js, Logo.js
└─ screens/                   WelcomeScreen.js, LoginScreen.js, RegisterScreen.js,
                              HomeScreen.js, PracticeScreen.js
```

`src/ai/bottleGrab/` contains the source-pinned PhaseNet V2 adapter, the Calibration 3
Baseline #3 device-preview adapter, and the Baseline #4 Rule-Wrap Hybrid adapter, copied source
bundles, policy, and provenance contracts. The native
MediaPipe bridge is tracked under `vendor/react-native-mediapipe/`; `npm install` runs the
`postinstall` overlay so CocoaPods and Metro receive the hand-landmarker bridge reproducibly.

## Setup
```bash
cd App/App-V5/Patient
npm install
# align native package versions to your Expo SDK (54):
npx expo install react-native-svg @react-native-async-storage/async-storage expo-speech \
  react-native-screens react-native-safe-area-context react-native-vision-camera react-native-worklets-core
npm install @react-navigation/native @react-navigation/native-stack react-native-mediapipe
```

The last dependency is the upstream package name; the tracked `postinstall` step overlays the
reviewed Bottle Grab bridge from `vendor/react-native-mediapipe/` before a native build. The
overlay excludes generated peer `node_modules`, and Metro pins MediaPipe's React peers to the
Patient runtime so the camera hook cannot load a second React dispatcher.

To point the app at the cloud backend (Express + Prisma + PostgreSQL on Railway, JWT auth):
```bash
EXPO_PUBLIC_API_BASE=https://physioai-backend-production.up.railway.app npx expo start --dev-client
```
`EXPO_PUBLIC_API_BASE` is read at bundle time (every `EXPO_PUBLIC_*` is baked into the build) and
is required for production builds. The repo's `.env` already points at the always-on Railway
backend; for local dev swap it to `http://<your-Mac-LAN-IP>:3000` with `node server.js` running.
Local demo/mock storage is enabled only in development when the API base is blank, or explicitly
with `EXPO_PUBLIC_ENABLE_DEMO=true`.

## Run

### A) Demo mode — fastest, no native pose (try Expo Go / web first)
```bash
EXPO_PUBLIC_ENABLE_DEMO=true npx expo start --go   # or: npm run go
```
Open in Expo Go (or the web build) → pick an exercise → **Demo mode**. A synthetic pose drives
the full current baseline (angles → comparator → static MLP when available, otherwise
`FormScorer` → feedback → rep counting → TTS),
so you can test the whole flow + UI without a camera or a custom build.

### B) Live on-device pose — needs an Expo *dev build*
`react-native-mediapipe` is a native module → **Expo Go can't run it**. Build a dev client:
```bash
npx expo prebuild
npx expo run:android      # needs Android Studio
npx expo run:ios          # needs Xcode (macOS)
```
Then on the Practice screen choose **Start camera**.

For a connected physical iPhone, keep Metro reachable on the same Wi‑Fi and use the native build
already installed for the development bundle:
```bash
npm start -- --lan
# Build/install with Xcode or the devicectl commands shown by `npx expo run:ios`.
```
The iPhone must have Developer Mode enabled and the development team trusted under
**Settings → General → VPN & Device Management**. Bottle Grab is a development measurement
lane, not a clinical feature. During any native live exercise, the overlay exposes a front/back
switch and derives lens choices from the selected iOS `CameraDevice` at runtime. It exposes the
reported physical ultra-wide/wide/tele devices and a runtime **Max** zoom preset when available;
labels are calculated from `minZoom`, `neutralZoom`, and `maxZoom`, so the app never promises a
hard-coded `14×` or `24×` value that may not apply to a particular capture format. Switching
position or lens replaces the preview stream and clears the Bottle Grab pose/hand join buffer.
iOS Simulator cannot verify real lens availability or camera quality, so verify the controls and
sustained inference on RATTTZQ. `NativeCameraView` requests iOS camera permission before mounting
VisionCamera and provides an **Allow camera** action or a Settings shortcut if access was previously
denied.

### C) Bridge-free native iOS Patient lane (Simulator first, then RATTTZQ build)

The approved migration target is the separate SwiftUI project under `native-ios/`. It owns the
Patient shell, fixture auth/catalog/session flow, native AVFoundation camera seam, native
MediaPipe Pose + Hand pipeline, and local AVSpeechSynthesizer presentation layer. It has no Expo,
React Native, JSI, Metro, or VisionCamera runtime. The current catalog remains Bottle Grab only.
Its Calibration 3 adapter remains cue-only/experimental; a separate frozen PhaseNet V2 sidecar
can show a developer full-cycle value only after the six-phase order is confirmed twice. Neither
path emits a score, form/correctness decision, persisted rep, or clinical decision.

The simulator acceptance gates passed. The signed Debug target was then built,
installed, and launched on RATTTZQ; the Expo/PWA lane remains the rollback path:

```bash
cd App/App-V5/Patient/native-ios
xcodegen generate
/opt/homebrew/bin/pod install
SIMULATOR_UDID="8B7F6780-6769-4387-AC5D-B0964E33E4C9"
xcodebuild -workspace PhysioAINative.xcworkspace -scheme PhysioAINative \
  -destination "platform=iOS Simulator,id=$SIMULATOR_UDID" \
  -derivedDataPath build/native-full-sim test
xcrun simctl install "$SIMULATOR_UDID" \
  build/native-full-sim/Build/Products/Debug-iphonesimulator/PhysioAINative.app
xcrun simctl launch "$SIMULATOR_UDID" com.rattee.physioai.native \
  --args --native-fixture-home
```

Use `--native-fixture-login`, `--native-fixture-register`, `--native-fixture-practice`, or
`--native-fixture-summary` for deterministic route checks. Simulator Practice uses local
Pose+Hand fixtures and therefore does not prove real camera quality, lens availability, sustained
FPS, thermal behavior, or physical-device TTS. Build/install/launch success is not runtime
evidence. The current native XCTest run passed **23/23 simulator/numeric checks**, including
source-generation, handedness, setup-QC, full-cycle, and golden-runtime coverage. See the
[native iOS README](native-ios/README.md), the [migration design](../docs/specs/2026-08-20-native-ios-patient-app-migration-design.md),
[full-parity design](../docs/specs/2026-08-20-native-ios-full-parity-design.md),
the [simulator acceptance record](../docs/specs/2026-08-20-native-ios-patient-simulator-acceptance.md),
and the [RATTTZQ device handoff](../docs/specs/2026-08-20-native-ios-ratttzq-device-build-handoff.md),
plus the current [full-parity build checkpoint](../docs/specs/2026-08-21-native-ios-ratttzq-full-parity-build.md).

The first native packaging failure and its verified fix are recorded in the
[native task-bundle record](../docs/mistake_records/2026-08-20-native-ios-task-bundle-packaging-mistake-record.md).
The later PhaseNet V2 sidecar boundary is recorded in the
[full-cycle sidecar mistake record](../docs/mistake_records/2026-08-21-bottle-grab-native-phasenet-v2-full-cycle-sidecar-mistake-record.md).

### D) MacBook-camera web preview — Baseline #4

Use this route when you want to exercise Bottle Grab from the Mac camera without an iOS
Simulator camera. It runs MediaPipe Tasks Vision in the browser and keeps frames/landmarks local:

```bash
npx expo start --web
```

Open the Expo web URL on the same Mac, allow camera access, choose Bottle Grab, then choose
**Start camera**. The browser downloads the WASM/task bootstrap assets from their CDN on first
load; inference remains local. Keep the video unmirrored. If the browser has no
`getUserMedia`, permission is denied, or model loading fails, the preview fails closed and emits
no Baseline #4 cue. Native iPhone selection remains Baseline #3. See the
[Baseline #4 MacBook-camera preview spec](../docs/specs/2026-08-19-bottle-grab-baseline-4-mac-camera-preview.md).

The web lane is PWA-ready for phone browsers: it ships a mobile viewport/manifest shell, a shared
back control on every navigable flow (including Home), browser-history linking, and a bounded responsive layout for
wide previews. Add to Home Screen requires HTTPS in deployment. This is not offline inference;
bundle/WASM/task assets and cloud auth/API metadata still need network delivery, while camera frames
and inference remain local. See [the Patient Web/PWA navigation design](../docs/specs/2026-08-20-patient-web-pwa-navigation-design.md).

## Live pose native build and manual verification
`src/pose/PoseCamera.js` targets `react-native-mediapipe ~0.5.x`. If your installed version's
API differs, adjust the two marked spots (the `usePoseDetection` call and `normalizeResults`) —
keep the normalized output as 33 × `{ x, y, z, visibility }` in BlazePose order and everything
downstream works unchanged. `NativeCameraView.js` owns VisionCamera device selection and zoom;
`BottleGrabCamera.js` joins same-frame Pose and Hand Landmarker output. `viewPoints.js` converts
normalized MediaPipe points through the native ViewCoordinator before drawing them. Bottle Grab
renders the 21-point hand topology instead of treating a hand-only frame as a 33-point body
skeleton, preventing finger landmarks from being stretched across a body overlay. The native
Debug bundle now contains `pose_landmarker_lite.task`, `pose_landmarker_full.task`, and
`hand_landmarker.task`; their hashes match the source assets and the signed app passes
`codesign --verify`. See the [model import audit](../docs/mistake_records/2026-08-20-bottle-grab-ios-model-import-audit.md).
Interactive camera inference and audio still require observation on the target phone after this
rebuild. The Bottle Grab TTS path uses a separate Expo Speech audio session
(`useApplicationAudioSession: false`) so the iOS silent/ringer state does not silently suppress
the cue; see the [hand overlay record](../docs/mistake_records/2026-08-20-bottle-grab-hand-overlay-coordinate-mistake-record.md)
and [TTS record](../docs/mistake_records/2026-08-20-bottle-grab-tts-silent-mode-mistake-record.md).

## On-device AI: current baseline

Two explainable layers run **on-device** (no video leaves the phone). The **rule-based pipeline**
carries the numeric result and is the fallback:
BlazePose 33 landmarks → `JointAngleCalculator` (12 joint angles) → `PoseComparator`
(tolerance 15°, elbows/back/neck 12°) → `FormScorer` (4-class) → `FeedbackGenerator` → TTS,
gated by `CameraSetupGate` and `BoundaryBoxGate` (95% in-frame). `PoseComparator` (rule-based) owns
the pose-score component plus per-joint delta/status[12]; `session.js` combines that with
`MultiJointMotion` for the final score. `FormScorer` (rule-based 4-class) is the fallback form
classifier for exercises the static MLP doesn't cover.

On top of that, a **static neural network built from scratch** (pure NumPy training, hand-written
forward pass + backprop, no TensorFlow/PyTorch and no AI API) is **wired in**. It is **multi-label**
(sigmoid + binary-cross-entropy), one small (~20 KB) MLP `[12→24→16→N]` per exercise (N = fault-flag count: 6 for `overhead_ceiling_reach`, 5 for `lateral_arm_raise` / `cross_body_shoulder_stretch`), trained under
`models/AI_Models/NN_ExerciseClassifier/` and bundled into the app at `src/ai/models/*.json`;
`src/ai/NNExerciseClassifier.js` runs the JS forward pass. It covers the **3 bundled baseline
exercises** — `overhead_ceiling_reach` (6 flags), `lateral_arm_raise` (5), `cross_body_shoulder_stretch`
(5). In `src/core/session.js` pushFrame, when `nnHasModel(exercise.id)` the NN **overrides** the
form-fault `cue` + `formClass`; it does not own the numeric score or rep counter.
`PoseComparator` supplies per-joint deltas/status and the pose-score component, while `session.js`
combines 60% tracked pose score with 40% deterministic `MultiJointMotion` score.

## V5 target: MotionNet

The V5 goal is to replace per-frame fault classification for the three current assignable
`CATALOG_IDS` with accepted temporal models. Built-in extras and custom exercises are outside this
initial replacement scope. The newest available draft integration candidate is
**LateralRaise MotionNet V3.1** for
`lateral_arm_raise_right_temporal_v3_1`: anatomical right arm, front camera, unmirrored. The current
app's `lateral_arm_raise` uses `left_shoulder` / `left_arm`, so the candidate cannot be enabled under
that catalog ID without an explicit side/ID contract and verified feature mapping.

V3.1 consumes 30 frames × 30 temporal features. Its Keras heads produce exercise phase, hold
quality, and supported-fault probabilities (`undershoot`, `overshoot`, `elbow_bent`). A separate
Capture-QC plus thresholded repetition policy derives `pass`, `warn`, `uncertain`, or
`cannot_assess`; the neural network does not directly output that final decision. Hold quality and
fault outputs are trained for the hold phase only and must be ignored outside it.

This candidate is still experimental and train-only: it has no group-disjoint validation or
selected thresholds, and its locked evaluation remains unopened. This Patient app has no MotionNet
artifact, temporal sequence buffer, feature adapter, or inference runtime. The static MLP/rule path
therefore remains the baseline/fallback for all exercises, including lateral raise, until the
[V5 transition acceptance gates](../docs/specs/2026-07-24-motionnet-v5-transition.md) pass.
The first integration may replace only the static fault/cue branch; deterministic
`MultiJointMotion` scoring and rep counting stay unchanged unless separately approved.

### Experimental Bottle Grab device lane

The `bottle_grab` catalog item is the only current catalog entry and is a deliberate exception
for direct camera instrumentation. Its native `BottleGrabCamera` joins BlazePose with the bundled
MediaPipe Hand Landmarker on the same timestamp. PhaseNet V2 supplies auxiliary phase context;
native Calibration 3 Baseline #3 consumes the derived measurement window. Browser `MacCamera.web.js`
uses the MacBook webcam and the exact copied Baseline #4 Rule-Wrap Hybrid source/policy to gate a
view-aware finger cue on top of the same Calibration 3 parent.

The Expo/web model lanes remain train-only and one-sided (`left`). They do not emit a form score,
`formClass`, quality/correctness decision, repetition decision, bottle-contact truth, or rep
completion. The bridge-free native target separately validates a frozen PhaseNet V2 30 × 20,
15 Hz sidecar against simulator/numeric fixtures: it requires two stable predictions through
`start_or_rest → reach → preshape → grasp → release → return → start_or_rest` before increasing a
developer-only cycle value. Its source-generation and actual-input-handedness guards are unit
covered, but physical front/rear validation is pending. The setup condition is a **14-anchor
full-body proxy**, not all 33 landmarks, and `numHands = 1` leaves two-hand selection unsupported.
The Patient presentation may speak a tentative Calibration 3 cue in Standard/Audio-Only mode and
remains silent in Visual-Only. Missing or unsynchronised pose/hand input, low confidence, timestamp
gaps, and runtime/asset errors reset/fail-closed the window. These lanes make no accuracy or
clinical claim and must not be mistaken for a promoted replacement of the retained legacy baseline.

## Notes / honesty
- **Device build verified (2026-08-17):** the iOS native build, code signature, bundled
  `pose_landmarker_lite.task` and `hand_landmarker.task`, Metro bundle, install, and dev-client
  launch were verified on the connected RATTTZQ iPhone. Manual camera-quality, sustained-FPS,
  battery/thermal, and model-accuracy measurements still require an interactive test session.
- **Camera runtime fix verified (2026-08-19):** the Bottle Grab dev bundle now uses the Patient
  React runtime for all vendored MediaPipe peer imports; duplicate React 18 dependencies are
  excluded, and the previous invalid-hook redbox no longer appears during dev-client launch.
  A separate native Metal/GPU abort was then reproduced on RATTTZQ while the camera started;
  switching to CPU did not stop the app exit, and three new reports now point to an uncaught
  Worklets exception in the VisionCamera frame processor. The next device preview includes
  an async detector-handle guard. An iOS 26.5 Release simulator now mounts Bottle Grab
  successfully through three navigation/open-camera loops, but reports `no device`; this is
  only a bounded mount check, not evidence that real camera frames or RATTTZQ are fixed.
  Physical-device verification remains required.
  See the [native Metal/GPU crash record](../docs/mistake_records/2026-08-19-bottle-grab-camera-metal-gpu-crash-mistake-record.md).
  See also the [Worklets exception record](../docs/mistake_records/2026-08-19-bottle-grab-camera-worklet-exception-mistake-record.md).
- **Camera readiness/layout fix (2026-08-20):** the native bridge is now loaded after mount with
  bounded retries, and the live screen gates controls, skeleton, positioning, and HUD on one
  cameraStatus-ready state. A single opaque Retry surface replaces the previous fallback/HUD
  overlap. Real-device preview and sustained frame processing remain pending.
  See the [fallback/overlap mistake record](../docs/mistake_records/2026-08-20-bottle-grab-camera-module-fallback-overlap-mistake-record.md).
- **Duplicate native-view fix (2026-08-20):** the RATTTZQ redbox was traced to Metro bundling
  VisionCamera and Worklets through both source and CommonJS entries; the same `CameraView` was
  therefore registered twice. `Patient/metro.config.js` now resolves both peers to one CommonJS
  entry. Patient unit tests, a fresh export/source-map check, native reinstall, physical launch,
  and a three-cycle simulator open/retry loop pass without the duplicate-view redbox. The physical
  Bottle Grab camera-open interaction remains the final manual check because iPhone Mirroring did
  not accept remote taps in this session.
  See the [duplicate-view registration record](../docs/mistake_records/2026-08-20-bottle-grab-camera-duplicate-view-registration-mistake-record.md).
- Pinned versions are best-effort — run `npx expo install` to reconcile with your Expo SDK.
- After moving/renaming the project folder, run `cd ios && pod install` so iOS autolinking
  paths point to the current project location.
- Auth is cloud JWT against the Railway backend (`POST /auth/register|login`); a local mock
  account store is available only in dev/demo mode, never silently in production.
- References (therapist-captured target poses) are read from the cloud API (`GET /references`)
  for the logged-in patient. When absent, practice falls back to exercise-default target angles
  (same as V1).
- Everything in the AI pipeline runs on the capture device or local browser (pose, scoring, TTS);
  only account, plan, reference, and session metadata sync to the cloud API. No video is ever uploaded.
