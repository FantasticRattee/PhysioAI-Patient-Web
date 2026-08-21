# Native iOS / React Native parity matrix

This matrix is the working checklist for the approved full-parity migration.
The React Native paths are the current behavior authority; the native paths are
the implementation target. “Covered” means the native route exists, not that
the physical-device gate has passed.

| Capability | React Native authority | Native target | Status |
|---|---|---|---|
| Welcome / language | `Patient/src/screens/WelcomeScreen.js`, `core/i18n.js` | `NativeWelcomeView.swift`, `NativeModels.swift` | Simulator-verified UI parity |
| Login / register / role guard | `LoginScreen.js`, `RegisterScreen.js`, `core/auth.js` | `NativeLoginView.swift`, `NativeAPIClient.swift` | Simulator-verified layout parity; cloud role gate pending |
| Home / plan / progress / extras | `HomeScreen.js`, `core/store.js` | `NativeHomeView.swift`, `NativeModels.swift` | Simulator-verified UI parity; live plan validation pending |
| Practice setup / mode choice | `PracticeScreen.js` (`ReadyView`) | `NativePracticeView.swift` | Simulator-verified ready-state parity; runtime gates pending |
| Standard / Audio-Only / Visual-Only | `PracticeScreen.js`, `core/accessibilityMode.js` | `NativePracticeView.swift`, native speech presenter | Partial — native presenters wired; physical TTS gate pending |
| Camera permission / retry / status | `NativeCameraView.js`, `cameraCapabilities.js` | `CameraSession.swift`, `CameraPreview.swift` | Implemented — physical gate pending |
| Front/back and runtime lenses | `CameraControls.js`, `cameraCapabilities.js` | `CameraSession.swift` | Implemented — hardware options/FPS gate pending |
| Pose + Hand landmarks | `PoseCamera.js`, `BottleGrabCamera.js` | `MediaPipePipeline.swift` | Implemented — physical landmark quality gate pending |
| Capture-QC / boundary / overlays | `CameraSetupGate.js`, `BoundaryBoxGate.js`, overlays | native overlay and engine | Partial — native has a tested 14-anchor full-body proxy plus associated anatomical-left-hand gate; it is not the 33-landmark RN gate and physical camera QC remains pending |
| Bottle Grab Calibration 3 | `ai/bottleGrab/Calibration3DeviceAdapter.js` | `NativeBottleGrabEngine.swift` | Cue-only boundary preserved; no native sidecar output changes Calibration 3 |
| Bottle Grab PhaseNet V2 full-cycle sidecar | No Expo/PWA equivalent; those lanes remain cue-only | `NativePhaseNetV2Runtime.swift`, `NativeBottleGrabPhaseSupport.swift` | Developer-only: 23/23 simulator/numeric checks passed; no physical-device/model-performance evidence |
| Static exercise engines | `core/session.js`, AI modules | `NativeStaticExerciseEngine.swift` | Partial — compatibility comparator adapter; parity fixtures pending |
| Session / reps / sets / summary | `usePractice.js`, `core/session.js`, `core/store.js` | `NativeModels.swift`, `NativeSummaryView.swift` | Simulator-verified hierarchy; Bottle Grab metrics intentionally blank |
| Cloud auth / plans / sessions | `core/api.js`, `core/store.js`, backend routes | `NativeAPIClient.swift` | Partial — auth/read/write seams wired; live Railway verification pending |
| Live Assist | `core/liveAssist.js`, `PracticeScreen.js` | `NativeLiveAssistController.swift` | Partial — polling/presentation/ack wired; cloud run pending |
| TTS policy | `core/tts.js`, `accessibilityMode.js` | `AVSpeechSynthesizer` | Partial — mode policy wired; physical audio gate pending |
| Logout / local reset | `core/auth.js`, `core/store.js` | Keychain/UserDefaults | Partial — native reset wired; parity test pending |

Current native catalog scope remains the same as App-V5 React Native:
`bottle_grab` is the only intentionally exposed development catalog item.
Rows marked partial or pending must be closed before calling the native lane
full parity.

## 2026-08-21 simulator visual checkpoint

Both lanes were compared against the React Native source contract on the same
iPhone 17 Pro iOS 26.5 Simulator (`8B7F6780-6769-4387-AC5D-B0964E33E4C9`).
Each native route was cold-launched after terminating the previous process:
Welcome, Login, Home, Practice setup, Active fixture (after the countdown), and
Summary. The native renderer now uses the same cream/paper tokens, vector mark
and two-colour `PhysioAI` wordmark, Thai/English strings, spacing hierarchy,
button geometry, catalog glyphs, practice HUD, and summary card hierarchy as the
React Native reference. The active screenshot uses deterministic Pose + Hand
fixture data; it is not evidence of a physical camera, lens, FPS, or TTS run.

“Simulator-verified UI parity” means the route and visual contract were checked
against the current React Native source. It does not claim identical font
rasterisation across SwiftUI and React Native, nor close the separate physical
device gates.

## 2026-08-21 PhaseNet V2 sidecar checkpoint

The bridge-free native target bundles the frozen PhaseNet V2 Float32 weights and
runtime contract as a local, phase-only developer sidecar. It accepts a causal
30 × 20 pose-plus-hand window at 15 Hz, requires two stable predictions for the
frozen order `start_or_rest → reach → preshape → grasp → release → return →
start_or_rest`, and changes a visible development-cycle value only on the final
transition. It does not establish bottle contact, secure grip, lift, form
quality, correctness, a session rep, or a clinical result.

The unified XCTest run passed **23/23 simulator/numeric checks**, including
source-generation separation after camera/lens replacement, handedness
normalization for mirrored/unmirrored inputs, stale-gap rejection, the setup
gate, full-cycle order, and golden feature/runtime parity. The setup gate uses a
**14-anchor full-body proxy** rather than all 33 BlazePose landmarks, and the
current Hand Landmarker setting is `numHands = 1`; both are explicit remaining
limitations. Source-generation and handedness guards are unit covered, but no
physical front/rear camera, lens, TTS, FPS/thermal, or model-performance result
is claimed here.
