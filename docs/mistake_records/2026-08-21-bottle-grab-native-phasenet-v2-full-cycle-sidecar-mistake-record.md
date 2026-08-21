# Native Bottle Grab used a reach/return heuristic instead of the frozen PhaseNet V2 full cycle

| Field | Value |
| --- | --- |
| Record ID | `bottle-grab-native-phasenet-v2-full-cycle-sidecar-01` |
| Date observed | `2026-08-21` |
| Status | `resolved for simulator/numeric parity; physical-device validation open` |
| Failure layer | `ui_or_segmentation` + `capture_qc` + `documentation_or_claim` |
| Owning area | `App/App-V5/Patient/native-ios/` |
| Affected version / contract | `PhysioAINative` developer-only PhaseNet V2 full-cycle sidecar |
| Evidence confidence | `Confirmed` for the simulator/numeric scope; `Open` for physical-camera behavior |
| Data / deployment impact | `none`; no training data, frozen Baselines #1–#4, backend, or deployment changed |

## What was observed

- **User-visible symptom:** The earlier native development counter could not represent the requested
  no-lift Bottle Grab sequence reliably because it reduced the action to wrist reach and return.
- **Expected behavior:** A developer-only counter should require the frozen phase order
  `start_or_rest → reach → preshape → grasp → release → return → start_or_rest`, rather than infer
  bottle contact or a completed cycle from geometric reach alone.
- **Evidence available:** Native source, frozen Float32/runtime contract, deterministic fixtures,
  feature/runtime golden files, and a successful 23/23 XCTest run on the iPhone 17 Pro Simulator.
- **Reproduction state:** `reproduced` for the old heuristic/contract mismatch in source; no new
  physical-device camera run was performed for this sidecar change.

## Scope and interpretation boundary

PhaseNet V2 is phase-only. A completed developer cycle does **not** prove bottle contact, secure
grip, release of a real object, lift, form quality, correctness, adherence, a persisted session rep,
or a clinical result. It does not change the exact Calibration 3 Baseline #3 cue-only contract in
Expo/native React Native, the Baseline #4 web/PWA cue-only lane, or frozen Baselines #1–#4.

## Cause assessment

- **Current assessment:** The prior reach/return state machine did not preserve the frozen six-phase
  model contract, so it could not safely represent the requested full no-lift Bottle Grab cycle.
- **Evidence for it:** `NativeBottleGrabFullCyclePolicy` now enforces the frozen order and two stable
  predictions per phase; the count changes only at final `return → start_or_rest`. The runtime loads
  the copied `phasenet_v2_browser_weights.f32` and checks its SHA-256 before inference.
- **Unknowns / competing hypotheses:** Physical MediaPipe quality, detector latency, camera/lens
  behavior, front/rear handedness in real capture, TTS, and model performance have not been
  validated by this simulator/numeric result.

## Approaches and outcomes

| Date | Change or proposal | Layer addressed | Result | Evidence / limitation |
| --- | --- | --- | --- | --- |
| 2026-08-21 | Replace the reach/return heuristic with a frozen PhaseNet V2 30 × 20, 15 Hz phase-only sidecar; require two stable predictions through the complete six-phase order | `ui_or_segmentation` | `worked` | Full-cycle and skipped-phase XCTest coverage passes; the visible value remains developer-only. |
| 2026-08-21 | Copy frozen Float32 weights, runtime contract, and browser golden fixtures; validate source SHA and native numeric output/feature parity | `pipeline_or_data` | `worked` | Runtime/adapter golden tests pass; this proves numerical parity, not model accuracy. |
| 2026-08-21 | Add capture-source-generation reset/drop guards and normalize detector handedness from the actual mirrored/unmirrored input | `capture_qc` | `worked` | Unit coverage passes; physical front/rear validation is still pending. |
| 2026-08-21 | Require a 14-selected-anchor full-body proxy and associated anatomical-left hand before sampling | `capture_qc` | `partial` | It blocks incomplete setup in tests, but it is not all 33 BlazePose landmarks. `numHands = 1` also leaves two-hand selection unsupported. |

## Current disposition

- **Safe behavior now:** The bridge-free native Simulator can demonstrate source-scoped, fail-closed,
  phase-order instrumentation with frozen model/resource and numeric-parity checks.
- **Do not claim:** Do not call this clinical validation, a physical-device performance result, a
  Bottle Grab contact/lift detector, a treatment/adherence rep, or a replacement for Calibration 3,
  Baseline #4, or the established Baselines #1–#4.
- **Smallest next step:** Perform a controlled, frame-reviewed front and rear camera run on an
  unlocked physical iPhone; compare phase/cycle boundaries, false/missed cycles, hand side,
  source/lens changes, latency/FPS, and TTS against a versioned observation log.
- **Requires new data / model / review?:** Physical replay/observation and, before any broader
  claim, appropriate labelled evaluation and review. No threshold tuning from this record.

## Validation

| Check | Result | Notes |
| --- | --- | --- |
| Unified native XCTest | `passed` | **23/23 simulator/numeric checks** at 2026-08-21 20:03; includes fixture flow, source-generation reset, handedness normalization, setup QC, full-cycle policy, and frozen golden parity. |
| Frozen resource verification | `passed` | Weight SHA-256 `b522a4e5f705594ccdfc400d24b11cc87677f39961698f95a63dfddcb1e1fd43`; contract SHA-256 `6270c54c3750ad42138ffe5e94b30b8c6165a284873d3a9368aa9aa4e3f05ab6`. |
| Source provenance | `recorded` | Model ID `bottlegrab_posehand_phasenet_v2_same_lineage_video_expansion_train_only`; frozen browser-source SHA-256 `020927a826c2d6e30efc791fe6b7b3ef95dd185bf6d25328617e7d7a1bbc7367`. |
| Simulator fixture | `passed` | Scripted 15 Hz Pose+Hand fixtures exercise the shell and policy; they are deliberately not model-performance evidence. |
| Physical-device camera | `not_attempted` | No front/rear live camera, lens, TTS, latency, FPS, thermal, or accuracy evidence was added by this change. |

## Change impact

- Changed files: native sidecar source/resources/tests and the App-V5 documents named in this handoff.
- Model artifact or training-data change: `no`; frozen resources were copied byte-for-byte, and no
  Baseline #1–#4 artifact was modified.
- App/deployment change: `local native simulator development sidecar only`; no backend, Therapist,
  Expo/PWA Calibration 3, web Baseline #4, App-V4.1, or production deployment change.
- Related records: [earlier native rep-counter record](2026-08-21-bottle-grab-native-rep-counter-mistake-record.md)
  (historical heuristic), [native task-bundle packaging record](2026-08-20-native-ios-task-bundle-packaging-mistake-record.md),
  and [native camera controls/lens record](2026-08-21-native-camera-controls-layout-lens-selection-mistake-record.md).
