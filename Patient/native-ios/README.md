# PhysioAI Native iOS Patient target

This directory contains the approved **bridge-free native iOS Patient lane**
for App-V5. It is a SwiftUI/XcodeGen target; the camera and MediaPipe path is
Swift + AVFoundation + MediaPipe Tasks Vision, with no React Native, Expo,
JSI, Metro, or VisionCamera runtime.

The migration was deliberately **Simulator-first**. The existing Expo Patient
app and Patient Web/PWA remain intact as rollback/comparison lanes. Therapist
remains the web dashboard. The simulator gates have now passed, and the signed
Debug target has also been built, installed, and launched on RATTTZQ. Physical
camera/runtime validation is still a separate gate; see the device handoff
record linked below.

## Current simulator scope

- Native navigation: Welcome → Login/Register → Home/catalog → Bottle Grab →
  Practice → Summary.
- The current development catalog exposes `bottle_grab` only.
- The shell keeps the React Native catalog contract: therapist-plan IDs that are
  not exposed in the current catalog are ignored rather than silently mapped to
  Bottle Grab. A small native static-angle adapter is retained for those legacy
  plan IDs so the native engine boundary is explicit, but it is not a catalog
  promotion.
- Fixture mode provides deterministic Patient 1 data and Pose + Hand frames so
  the whole flow is testable without a simulator camera.
- Practice keeps the exact Calibration 3 Baseline #3 adapter as a tentative,
  cue-only development path. Separately, the native target contains a frozen
  **PhaseNet V2 full-cycle sidecar**: after setup QC, it consumes a causal
  30 × 20, 15 Hz pose-plus-hand window and requires two stable predictions in
  this exact order: `start_or_rest → reach → preshape → grasp → release →
  return → start_or_rest`. It increments a visible development-cycle value
  only on the final `return → start_or_rest` transition. That value is not a
  model score, form class, correctness decision, bottle-contact truth,
  persisted session rep, or clinical decision. The Expo and web Calibration 3
  adapters remain cue-only/no-rep paths.
- Before the PhaseNet sidecar samples, setup QC requires a high-confidence,
  associated anatomical-left hand and a **14-anchor full-body proxy**. This is
  intentionally not a claim that all 33 BlazePose landmarks or a clinical
  posture assessment are available. The Hand Landmarker is currently
  configured with `numHands = 1`; two-hand selection remains a limitation.
- Camera/lens replacement starts a new capture-source generation, clears
  pending joins, and drops delayed callbacks from the prior generation.
  Detector handedness is normalized from the actual mirrored/unmirrored input
  contract before the anatomical-left gate. Unit coverage exercises those
  guards; physical front/rear camera validation remains a separate gate.
- The deterministic fixture still produces `Pose 33/33`, `Hand 21/21`, frame
  count, and detector-latency diagnostics for tests/logging. Those diagnostics
  are intentionally not painted over the parity UI; the active Simulator
  surface now matches the React Native practice HUD. Real camera, lens, FPS,
  thermal, and physical-device TTS checks remain device-only evidence.
- Practice now has the same ready → camera permission → positioning → countdown
  → active state boundary as the current Patient flow. Standard, Audio-Only,
  and Visual-Only presenters are native surfaces; Live Assist polling is
  enabled only for a cloud-authenticated run.
- On a physical iPhone, the live camera starts on the rear camera. The lens
  picker is generated from the devices reported by `AVCaptureDevice`, including
  the `constituentDevices` of a logical Triple Camera: rear physical options
  (for example the device-reported ultra-wide, wide, and telephoto options)
  replace the capture input; iOS's `displayVideoZoomFactorMultiplier` supplies
  the user-facing zoom label when available. There is no fabricated `Max …×` lens item; two-finger
  pinch uses the active format's system-recommended zoom range (with the raw
  AVFoundation maximum only as an internal fallback). If a requested device
  cannot be added, the previous input is retained.
- The active HUD keeps the score/cue content in its own row and places the
  camera-switch/lens controls in a second trailing row. This prevents Thai
  accuracy text from collapsing into one-character columns on narrow iPhone
  widths. The physical controls also emit DEBUG selection/reconfiguration
  traces; a visible menu alone is not proof that the hardware input changed.

## Generate, test, build, and run the Simulator

Run from this directory. XcodeGen regeneration is followed by CocoaPods
installation because regeneration recreates the user project.

```bash
xcodegen generate
/opt/homebrew/bin/pod install

SIMULATOR_UDID="8B7F6780-6769-4387-AC5D-B0964E33E4C9"
xcodebuild -workspace PhysioAINative.xcworkspace \
  -scheme PhysioAINative \
  -destination "platform=iOS Simulator,id=$SIMULATOR_UDID" \
  -derivedDataPath build/native-full-sim test

xcrun simctl install "$SIMULATOR_UDID" \
  build/native-full-sim/Build/Products/Debug-iphonesimulator/PhysioAINative.app
xcrun simctl launch "$SIMULATOR_UDID" com.rattee.physioai.native \
  --args --native-fixture-home
```

The current local simulator is an iPhone 17 Pro running iOS 26.5. If its UDID
changes, list devices with `xcrun simctl list devices` and substitute the
booted Simulator UDID. The unified XCTest run passed **23/23
simulator/numeric checks**: catalog/fixture flow, rear-camera and lens-policy
semantics, source-generation and handedness normalization, the 14-anchor
setup gate, stale-gap rejection, full-cycle ordering, and frozen feature/runtime
golden values. This establishes deterministic simulator and numerical parity
only; a fixture cannot prove physical lens switching, optical zoom, camera
quality, sustained inference, or TTS.

## Deterministic route checks

The launch arguments below make route screenshots and cold-launch checks
repeatable:

```text
--native-fixture-login
--native-fixture-register
--native-fixture-welcome
--native-fixture-home
--native-fixture-practice
--native-fixture-practice --native-fixture-active
--native-fixture-summary
```

For Practice, the Simulator uses a local fixture provider instead of asking
for camera permission. This is intentional: an iOS Simulator cannot prove
real camera quality or lens availability. A clean reboot was used during the
acceptance check so a stale permission alert could not be mistaken for a
current runtime requirement.

## Cloud API boundary

The native auth client is compatible with the existing Express routes
`POST /auth/login` and `POST /auth/register`, and stores a cloud JWT in the
native Keychain. The same API client now has `/plans` read, `/sessions` read/
write, and Live Assist correction seams. The generated target defaults to the
same Railway backend as the current Patient build; override the
`PHYSIOAI_API_BASE_URL` build setting (or the `native.apiBaseURL` UserDefaults
key) for local/staging runs. Fixture mode deliberately avoids the network.
The simulator acceptance uses the deterministic local catalog/session fixture
rather than a live database.

## Native runtime boundaries

- `CameraSession` owns `AVCaptureSession` and discards late frames instead of
  queueing them. It starts on the rear camera, keeps camera replacement inside
  one session transaction, restores the previous input if the requested device
  cannot be added, and advances a capture-source generation so delayed results
  from an old input cannot enter a new PhaseNet window.
- `MediaPipePipeline` loads the bundled Pose Lite and Hand task assets and
  joins same-timestamp live-stream callbacks on a CPU delegate for the first
  native lane. Pending Pose/Hand joins are source-generation scoped and cleared
  after a camera/lens swap; callbacks without a current join fail closed. It
  normalizes detector handedness from the input's actual mirroring before the
  anatomical-left contract is evaluated.
- `NativeBottleGrabEngine` keeps the Calibration 3 cue adapter separate from
  the frozen PhaseNet V2 full-cycle sidecar. The sidecar bundles a raw Float32
  weight file plus source contract, checks a 30 × 20 causal window at 15 Hz,
  and exposes only developer instrumentation after the full six-phase order.
  It remains separate from score/form/correctness outputs and does not promote
  Calibration 3, Baseline #4, or the PhaseNet source artifact.
- `NativeStaticExerciseEngine` is a compatibility adapter for legacy
  therapist-plan IDs. It uses the existing angle/comparator contract and is
  not used by the current Bottle Grab catalog item.
- `NativeLiveAssistController` polls the existing cloud correction endpoints;
  a therapist correction is presented as guidance and never changes the local
  model output or score.
- `AVSpeechSynthesizer` speaks the current cue in Standard/Audio-Only and is
  silent in Visual-Only. A speech failure must not stop capture.
- Missing assets, missing/unsynchronised Pose + Hand input, wrong-side input,
  and low confidence fail closed.

## Bundled model hashes

| Asset | SHA-256 |
| --- | --- |
| `pose_landmarker_lite.task` | `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` |
| `pose_landmarker_full.task` | `5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1` |
| `hand_landmarker.task` | `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1` |
| `phasenet_v2_browser_weights.f32` | `b522a4e5f705594ccdfc400d24b11cc87677f39961698f95a63dfddcb1e1fd43` |
| `phasenet_v2_browser_runtime.contract.json` | `6270c54c3750ad42138ffe5e94b30b8c6165a284873d3a9368aa9aa4e3f05ab6` |

## Physical-device handoff

The signed Debug target was rebuilt and installed on **RATTTZQ** (iPhone 17 Pro,
iOS 26.6) on 2026-08-21. `devicectl` launched `com.rattee.physioai.native`,
and a process check confirmed that the native process remained running. The
console launch command waits for the foreground app to terminate, so a timeout
there is expected while the app remains open. See the historical [RATTTZQ device handoff record](../../docs/specs/2026-08-20-native-ios-ratttzq-device-build-handoff.md)
and the current [full-parity implementation checkpoint](../../docs/specs/2026-08-21-native-ios-ratttzq-full-parity-build.md).

The device gate is **partially complete**. The latest signed Debug build,
install, and foreground launch on RATTTZQ are evidenced; the `--console`
command returned only because it waits for the app to terminate while the
process remained running. Camera permission, front/back switching,
hardware-reported lens options, successful `AVCaptureDeviceInput` replacement,
sustained inference latency/FPS, dropped frames, thermal behavior, and
audible TTS still require an unlocked in-app manual run. Build, installation,
or menu visibility alone is not runtime/model evidence.
The current default-camera/lens implementation and its simulator/device
evidence are recorded in the [camera default/lens design](../../docs/specs/2026-08-21-native-camera-default-lens-design.md).
The prior open HUD/lens validation record is [native camera controls layout and lens selection](../../docs/mistake_records/2026-08-21-native-camera-controls-layout-lens-selection-mistake-record.md).
The full-cycle sidecar's simulator/numeric boundary and remaining physical
evidence gap are recorded in the [PhaseNet V2 full-cycle sidecar mistake record](../../docs/mistake_records/2026-08-21-bottle-grab-native-phasenet-v2-full-cycle-sidecar-mistake-record.md).
The earlier [rep-counter mistake record](../../docs/mistake_records/2026-08-21-bottle-grab-native-rep-counter-mistake-record.md)
is retained as historical context, and the [native zoom-control mistake record](../../docs/mistake_records/2026-08-21-native-zoom-control-mistake-record.md)
tracks the separate lens issue.

## Rollback

The native lane is isolated under `Patient/native-ios/`. Disabling this target
leaves the Expo mobile app, MacBook-camera web preview, backend, Therapist web,
Calibration 3 source, and Baseline #4 source unchanged. App-V4.1 is a separate
stable application baseline and is intentionally untouched.
