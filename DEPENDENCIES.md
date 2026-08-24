# App-V5 dependency and change-impact map

Updated: 2026-08-21 · scope: Patient native camera controls and their current V5 contracts.

Use this file before changing a shared runtime, model adapter, data contract, or user-visible
flow. It is the App-V5 change-impact map read by the `impact-check` workflow; update the affected
row in the same change. App-V5 is still an unpromoted MotionNet successor and shares no release
authority with App-V4.1.

## Artifact inventory

| Area | Canonical current artifact | Status / relationship |
|---|---|---|
| Patient native camera | `Patient/src/pose/NativeCameraView.js`, `cameraCapabilities.js`, `components/CameraControls.js` | **Live V5 implementation**; permission gate, VisionCamera device/lens selection, and overlay controls. |
| Native pose lane | `Patient/src/pose/PoseCamera.js` | **Live**; MediaPipe Pose + GPU delegate; consumes shared presenter. |
| Native Bottle Grab lane | `Patient/src/pose/BottleGrabCamera.js` | **Live experimental**; Pose+Hand same-timestamp join + CPU delegate; consumes shared presenter. |
| Browser Bottle Grab lane | `Patient/src/pose/MacCamera.web.js` | **Separate live web preview**; MacBook `getUserMedia`, Baseline #4; no native lens controls. |
| Patient Web/PWA shell | `Patient/App.js`, `Patient/src/components/BackButton.js`, `Patient/public/` | **Live development shell**; browser history, mobile viewport, manifest, and responsive phone layout. No offline inference claim. |
| PWA V7.3.3 release | `Patient/src/{pose/MacCamera.web.js,pose/SitToStandCamera.web.js,pose/usePractice.js,core/api.js,core/session.js,ai/bottleGrab/**,ai/sitToStand/**}`, `Patient/assets/models/{efficientdet_lite0.tflite,sit_to_stand/**}`, `Patient/public/**`, root `package.json`/`railway.json`, `backend/server.js` | **Approved experimental PWA deployment candidate** on `codex/app-v7-3-3-pwa-patient`: Railway builds `Patient/dist`, serves it at `/`, preserves API routes, and retains Therapist at `/therapist/...`. Native Baseline #5 and V7.3.3 remain unchanged. Export/static route evidence is not real camera/model/clinical validation. |
| Practice integration | `Patient/src/screens/PracticeScreen.js` | **Live integration seam**; owns camera position/lens state and renders controls. |
| Session/model contracts | `Patient/src/pose/usePractice.js`, `Patient/src/core/session.js`, `Patient/src/ai/bottleGrab/` | **Live contracts**; native Bottle Grab remains Calibration 3 Baseline #3 and cue-only. |
| Native bridge/build | `Patient/vendor/react-native-mediapipe/`, `Patient/metro.config.js`, `Patient/app.json` | **Live build surface**; do not edit vendor bridge for lens UI unless API parity requires it. |
| Native Patient migration | `Patient/native-ios/` SwiftUI navigation, fixture auth/catalog/session, Keychain/API auth seam, native camera/MediaPipe practice, static compatibility adapter, Live Assist polling, and native tests | **23/23 simulator/numeric XCTest checks passed** for the local native lane, including fixture/UI contracts, source-generation/handedness guards, full-cycle policy, and frozen PhaseNet V2 numeric parity. The HUD layout fix is simulator-verified; signed RATTTZQ build/install remains historical packaging evidence, not physical sidecar validation. Full-parity shell/camera/API seams are implemented, while live cloud plan/session verification and physical camera/TTS/lens/FPS gates remain pending. The native PhaseNet V2 sidecar is developer-only; Expo/PWA stays as rollback until promotion. |
| Camera tests | `tests/patient/camera-capabilities.test.js`, `camera-runtime.test.js` | **Live focused coverage**; hardware behavior still needs RATTTZQ verification. |
| V5 context/specs | `docs/PROJECT_CONTEXT.md`, `docs/specs/2026-08-20-patient-camera-controls-design.md` | **Live documentation**; design is approved for implementation. |
| Diagrams / exported figures | none in App-V5 | No App-V5 draw.io source or embedded camera figure was found; root architecture diagrams are not modified by this Patient-only change. |
| Stable release | `../App-V4.1/` | **Separate baseline**; do not change or sync automatically from this V5 work. |

## Impact matrix

| If you change … | Code files | Diagrams to update + re-export | Doc sections to edit | Also-sync / contract ripple |
|---|---|---|---|---|
| Camera permission, position, or rear-lens policy | `Patient/src/pose/cameraCapabilities.js`, `NativeCameraView.js`, `CameraControls.js`, `PracticeScreen.js`; `tests/patient/camera-capabilities.test.js`, `camera-runtime.test.js` | None in App-V5 | `docs/specs/2026-08-20-patient-camera-controls-design.md`; `Patient/README.md`; root `README.md`; `docs/PROJECT_CONTEXT.md`; permission mistake record | Verify permission request/Settings fallback, front/back mirroring, and ViewCoordinator mapping; do not invent unavailable hardware lenses; manual RATTTZQ test required. |
| MediaPipe camera presenter callbacks | `NativeCameraView.js`, `PoseCamera.js`, `BottleGrabCamera.js`; vendored `mediapipe` only if source/compiled bridge changes | None | camera design spec; affected runtime mistake record | Preserve 33-landmark shape, frame processor, device/layout/orientation callbacks, and Metro peer-resolution guard. Run Patient tests plus a native dev build. |
| Bottle Grab camera/lens lifecycle | `BottleGrabCamera.js`, `usePractice.js`, `session.js`, `ai/bottleGrab/Calibration3DeviceAdapter.js` | None | `docs/specs/2026-08-19-bottle-grab-calibration-3-device-preview.md`; Calibration 3 model-workspace record if model behavior changes | Keep model ID/version, native Calibration 3 source SHA, anatomical-left/unmirrored input, fail-closed join, cue-only/no score/rep contract. Never edit frozen model baseline in place. |
| Browser camera behavior | `MacCamera.web.js`, web adapter and web tests | None | `docs/specs/2026-08-19-bottle-grab-baseline-4-mac-camera-preview.md`; Patient README | Keep browser-only Baseline #4 separate from native controls and Calibration 3; do not add fake browser lens buttons. |
| Patient web navigation/PWA shell | `Patient/App.js`, `Patient/src/components/BackButton.js`, Patient screens, `Patient/public/index.html`, `manifest.webmanifest`, `icon.svg`; `tests/patient/web-navigation.test.js` | None | `docs/specs/2026-08-20-patient-web-pwa-navigation-design.md`; Patient README; root README; `docs/PROJECT_CONTEXT.md` | Keep browser history/back behavior and safe-area/responsive layout aligned; deployment/HTTPS and offline caching are separate decisions. |
| Exercise catalog or side semantics | `Patient/src/core/exercises.js`, Therapist catalog mirror, session/model adapters, tests | Any root architecture/flow diagram that depicts catalog flow (outside this focused map) | PROJECT_CONTEXT, transition spec, exercise/model provenance | Sync Patient + Therapist catalog IDs and side; verify report/model authority before changing contracts. |
| API/auth/storage/schema | `backend/prisma/schema.prisma`, `backend/server.js`, `Patient/src/core/api.js`/`store.js`, Therapist shared API/store, backend tests | Root architecture diagrams if API/data flow changes | root context, README, deployment docs | Update schema, routes, both clients, tests, and deployment env together. Not touched by camera controls. |
| Full native Patient migration | `Patient/native-ios/` SwiftUI target, native API/auth/store/catalog/session modules, native tests; existing Expo/PWA remains rollback | None in App-V5 for this Patient-only migration | migration design; simulator acceptance record; RATTTZQ device handoff; `Patient/native-ios/README.md`; `Patient/README.md`; `docs/PROJECT_CONTEXT.md`; native camera controls mistake record | Preserve backend JSON/JWT contracts, current catalog scope (`bottle_grab` only), Calibration 3 cue-only boundary, and App-V4.1 separation. Simulator gates and signed physical build/install are recorded; the latest launch retry requires an unlocked RATTTZQ, and real camera/TTS/lens/FPS behavior still needs manual device validation. |
| Native Bottle Grab PhaseNet V2 full-cycle sidecar | `Patient/native-ios/PhysioAINative/{NativeBottleGrabEngine,NativeBottleGrabPhaseSupport,NativePhaseNetV2Runtime,MediaPipePipeline,CameraSession,NativeFixtureProvider,NativePracticeView}.swift`, `Resources/Models/phasenet_v2_browser_*`, and `NativeTests/{NativeFixtureTests,NativeBottleGrabFullCycleTests,NativePhaseNetV2ParityTests}.swift` | None in App-V5 | native README; PROJECT_CONTEXT; [`2026-08-21-bottle-grab-native-phasenet-v2-full-cycle-sidecar-mistake-record.md`](docs/mistake_records/2026-08-21-bottle-grab-native-phasenet-v2-full-cycle-sidecar-mistake-record.md) | Preserve frozen Baselines #1–#4 and PhaseNet V2 provenance; 23/23 simulator/numeric checks are not physical-device or clinical evidence. No score, correctness, contact/lift truth, persisted rep, Therapist, backend, or App-V4.1 change. The setup is a 14-anchor proxy (not all 33) and `numHands = 1`; require later manual front/rear validation. |

## Internal code graph

```text
PracticeScreen
  ├─ PoseCamera ─────────┐
  └─ BottleGrabCamera ───┼─> NativeCameraView ─> VisionCamera CameraDevice/zoom
                         └─> MediaPipe usePoseDetection → ViewCoordinator → onLandmarks
PracticeScreen onLandmarks → BoundaryBoxGate/Skeleton → usePractice.onPoseResult
usePractice → session.js → Calibration 3 adapter (Bottle Grab native) / baseline scoring (legacy)
PracticeScreen (web Bottle Grab) → MacCamera.web.js → Baseline #4 browser adapter
```

High fan-in hubs are `PracticeScreen.js`, `usePractice.js`, `session.js`, `core/exercises.js`,
`core/i18n.js`, `core/theme.js`, and the MediaPipe Metro/vendor bridge. Camera UI work should not
silently change any of these hubs' model, score, rep, or data contracts.

## Data-contract ripple

- Camera input remains on-device; no API route, Prisma model, session payload, or therapist contract
  changes are implied by front/back/lens selection.
- The native detector still emits BlazePose's 33 normalized landmarks and the existing Bottle Grab
  hand frame. ViewCoordinator maps preview pixels for Skeleton/BoundaryBox only.
- Camera capability metadata is UI/controller state (`position`, `deviceId`, available lens IDs and
  zoom). It is not exported as model evidence or used to relabel an exercise.
- A native Swift camera/lens switch must start a new source generation, clear the Bottle Grab
  same-timestamp join buffer, and fail closed until a new synchronized stream is available;
  detector handedness is normalized from the actual input mirroring. Calibration 3 remains
  experimental cue-only in Expo/PWA, while the Swift PhaseNet V2 sidecar remains developer-only.

## Known sync debts and verification gaps

- Real lens availability, sustained FPS, thermal behavior, and model quality are not verified by
  Jest or iOS Simulator; manual testing on RATTTZQ is required.
- Native PhaseNet V2 simulator/numeric parity is not physical-camera evidence. Its setup guard is a
  14-anchor full-body proxy rather than all 33 BlazePose landmarks, and `numHands = 1` does not
  support two-hand selection.
- VisionCamera's logical multi-camera selection can differ by iPhone model and OS. The UI hides
  unsupported presets but does not claim every iPhone has `0.5×` or telephoto.
- App-V5 has no native camera screenshot/diagram export. If a report or architecture diagram later
  embeds this flow, record the source path and re-export target here.
- App-V5 remains unpromoted; App-V4.1 remains the stable application and must be left unchanged.
