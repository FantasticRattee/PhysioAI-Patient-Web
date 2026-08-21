# App‑V5 MotionNet transition

## Status

V5's MotionNet-successor direction was confirmed on 2026-07-24. General MotionNet replacement
runtime work remains unapproved. On 2026-08-21, a separate native-iOS Bottle Grab PhaseNet V2
full-cycle sidecar was bundled and passed 23/23 simulator/numeric checks. It is still a local,
developer-only experiment: it has no physical-device performance evidence and does not change the
promotion or clinical-validation status.

App‑V5 is the MotionNet development successor to App‑V4.1. The initial target is temporal-model
coverage for the three established catalog IDs: `overhead_ceiling_reach`,
`lateral_arm_raise`, and `cross_body_shoulder_stretch`. Built-in extras and custom exercises are
outside this first replacement scope. Each in-scope exercise must have an accepted temporal model
or an explicitly approved shared temporal model; the current lateral-raise artifact may not be
reused for unrelated exercises.

The newest available V3.1 candidate under review is anatomical-right and uses
`lateral_arm_raise_right_temporal_v3_1`. App‑V5's current `lateral_arm_raise` catalog item is
left-sided (`left_shoulder` / `left_arm`). V3.1 is therefore not a drop-in replacement for the
existing ID.

## Source of truth

Model status and provenance come from the model workspace, not from copied app documentation:

- [MotionNet V3.1 experiment README](../../../../models/AI_Models/NN_ExerciseClassifier/experiments/right_arm_temporal_v3_1/README.md)
- [Model catalog](../../../../models/AI_Models/NN_ExerciseClassifier/experiments/right_arm_temporal_v3_1/artifacts/models/MODEL_CATALOG.md)
- [Candidate manifest](../../../../models/AI_Models/NN_ExerciseClassifier/experiments/right_arm_temporal_v3_1/artifacts/models/lateralraise_motionnet_v3_1_video_seeded_numeric_candidate.manifest.json)
- [Temporal contract](../../../../models/AI_Models/NN_ExerciseClassifier/experiments/right_arm_temporal_v3_1/config/temporal_contract.v3_1.json)
- [Capture-QC implementation](../../../../models/AI_Models/NN_ExerciseClassifier/experiments/right_arm_temporal_v3/scripts/capture_qc.py)
- [Repetition-decision policy](../../../../models/AI_Models/NN_ExerciseClassifier/experiments/right_arm_temporal_v3/scripts/rep_decision.py)
- [Training summary](../../../../models/AI_Models/NN_ExerciseClassifier/experiments/right_arm_temporal_v3_1/reports/lateralraise_motionnet_v3_1_video_seeded_numeric.training_summary.md)

App source and tests decide whether a model is actually bundled and invoked. A training artifact,
report figure, or model-catalog entry alone is not deployment evidence.

## Current executable baseline

The established exercises still use the static/rule baseline. The only temporal runtime currently
present is the experimental Bottle Grab lane described below; it must not be generalized to the
other exercise IDs.

- Patient currently passes one 12-angle frame to the bundled per-exercise static MLP for
  `overhead_ceiling_reach`, `lateral_arm_raise`, and `cross_body_shoulder_stretch`.
- Exercises without a static model use the rule-based `FormScorer`.
- `PoseComparator` supplies deterministic per-joint deltas/status and the pose-score component.
- Patient `session.js` owns the current final deterministic score: 60% tracked pose score plus 40%
  `MultiJointMotion` score.
- `MultiJointMotion.js` is deterministic transition and repetition-quality logic; it is not
  MotionNet.
- Therapist contains copies of the static classifier and model JSON, but its capture page still
  uses an incompatible old call/result contract. Cross-app static-classifier parity is therefore
  not currently proven.

## Draft first integration candidate: LateralRaise MotionNet V3.1

| Property | Manifest-backed value |
| --- | --- |
| Display name | `LateralRaise MotionNet V3.1` |
| Artifact | `lateralraise_motionnet_v3_1_video_seeded_numeric_candidate.keras` |
| SHA-256 | `60886830473ea6834e7d4607374cb369c8f34b9e13b5a0c51b1edd79b38ab8be` |
| Experiment ID / scope | `lateral_arm_raise_right_temporal_v3_1`; anatomical right arm |
| Camera contract | Front camera, unmirrored coordinates |
| Landmark source | 33 MediaPipe landmarks per frame, VIDEO mode |
| Temporal input | 30 frames × 30 temporal features |
| Feature profile / padding | `right_arm_torso_temporal.v3`; repeat the first frame when padding |
| Architecture | `layernorm_causal_dilated_tcn_multihead` |
| Keras phase head | `rest`, `raise`, `hold`, `lower` |
| Keras hold-quality head | `correct`, `form_fault` |
| Keras fault head | sigmoid probabilities for `undershoot`, `overshoot`, `elbow_bent` |
| Downstream repetition policy | Capture-QC + thresholded head outputs → `pass`, `warn`, `uncertain`, `cannot_assess` |
| Unsupported fault | `torso_lean` |
| Training windows | 11,223 total: 823 accepted real-video windows at weight 1.0 plus 10,400 numeric-synthetic windows at weight 0.30 |
| Independent lineage | 7 total source lineages; the 10,400 numeric windows descend from 4 video-seed lineages |

The candidate is **experimental and train-only**. It has no group-disjoint validation or selected
operating thresholds, and its locked unseen evaluation remains unopened. It is not
comparison-eligible, app-shipped, clinically validated, or an approved deployment artifact.
Before app integration, the team must explicitly choose whether to add a right-arm catalog item,
retrain/validate for the current left-arm item, or intentionally change the catalog behavior.
Silently relabelling or mirroring the candidate under `lateral_arm_raise` is not allowed.

The large window count is not an independent-subject count. Numeric descendants remain training
augmentation from four seed lineages and cannot be used as validation or locked-evaluation
evidence.

## Target runtime boundary

The intended V5 flow is:

```text
Camera frame
  → MediaPipe VIDEO-mode landmarks
  → Capture-QC
  → MotionNet feature extractor
  → exercise/session-scoped temporal buffer
  → accepted exercise MotionNet
  → phase + hold quality + supported-fault probabilities
  → thresholded repetition-decision policy
  → output adapter / feedback policy
```

The following paths remain independent and must be preserved:

- Camera Setup Gate and Boundary Box Gate continue to block unsafe/unusable frames.
- `PoseComparator` continues to produce explainable per-joint deltas/status and the pose-score
  component; `session.js` plus `MultiJointMotion` continue to own final deterministic scoring and
  rep state.
- Raw video and raw landmark streams remain on-device.
- Existing exercise IDs, side semantics, bilingual feedback contracts, session records, and
  accessibility-mode behavior remain compatible unless a separate product decision changes them.
- Missing, incompatible, low-confidence, or unavailable MotionNet inference takes an explicit safe
  fallback; it must not silently produce an all-clear.

The output adapter must never display `torso_lean` as a V3.1 model prediction because that fault is
outside the candidate's supported label space.

### Experimental Bottle Grab lane (not a promotion)

`bottle_grab` is a left-side `pose_plus_hand` catalog entry for direct camera instrumentation.
The Expo and web lanes retain the exact Calibration 3 Baseline #3 / Baseline #4 cue-only contracts:
they emit no score, `formClass`, pass/warn decision, repetition decision, or rep count.

The bridge-free Swift target has a separate source-pinned PhaseNet V2 sidecar. It bundles the
frozen raw Float32 weights and runtime contract, consumes exactly 30 frames × 20 features at 15 Hz,
and emits only `start_or_rest`, `reach`, `preshape`, `grasp`, `release`, or `return`. Two stable
predictions are required at each phase, and a developer-only cycle advances only at
`return → start_or_rest`. The source manifest remains
`experimental_phase_status_only_not_deployable`, with `appIntegrationAuthorized=false` and
`patientFacingApproved=false`; a local developer sidecar does not promote it to a patient-facing
or deployable artifact.

The sidecar's capture contract clears its window at a camera/lens source-generation change and
normalizes detector handedness from the actual mirrored/unmirrored input before requiring the
anatomical-left hand. Setup uses a **14-anchor full-body proxy**, not all 33 BlazePose landmarks,
and the current `numHands = 1` configuration does not provide two-hand selection. Missing
pose/hand, wrong side, low confidence, source discontinuity, asset loading failure,
profile-incomplete measurements, or inference failure resets/fails the sidecar closed. The existing
deterministic pose/rule path continues to provide camera framing and diagnostic continuity. This
path is for on-device latency and capture-QC observation only; no clinical accuracy claim follows
from a successful build or run. The 23/23 simulator/numeric result does not provide physical camera,
lens, TTS, thermal, sustained-FPS, or model-performance evidence. See the
[device-preview contract](2026-08-19-bottle-grab-calibration-3-device-preview.md) and
[Calibration 3 Baseline #3 record](../../../../models/AI_Models/NN_ExerciseClassifier/experiments/bottle_grab_pose_plus_hand_v1/reports/long_run_calibration/2026-08-19-bottle-grab-calibration-3-core-baseline-3.md).

The first integration is limited to replacing the static form-fault/cue branch. MotionNet phase
and repetition-policy results may be logged or shown as advisory evidence, but they must not replace
`MultiJointMotion`, final scoring, or the rep counter without a separate behavior decision.

### Fault-coverage compatibility

| Current static lateral flag | V3.1 concept | Migration status |
| --- | --- | --- |
| `arm_low` | `undershoot` | Proposed semantic mapping; verify with labelled fixtures |
| `arm_high` | `overshoot` | Proposed semantic mapping; verify with labelled fixtures |
| `elbow_bent` | `elbow_bent` | Name matches; thresholds/semantics still require parity tests |
| `trunk_lean` | `torso_lean` | V3.1 explicitly unsupported |
| `knee_bend` | none | Missing from V3.1 |

Do not retire the static/rule path until missing fault coverage is supplied by an accepted model or
an explicit tested hybrid/rule fallback. Hold-quality and fault probabilities are supervised only
during the `hold` phase; the runtime must suppress them outside `hold`.

## Rollout sequence

### Phase 0 — preserve and measure the baseline

- Keep the current Patient static MLP/rule path executable.
- Add direct tests for static model loading, feature order, output shape, unsupported-exercise
  fallback, and Patient session integration.
- Repair and test the Therapist capture classifier adapter before claiming Patient/Therapist
  parity.

### Phase 1 — resolve side/ID and integrate an accepted lateral-raise path

- Complete V3.1 model-evidence gates before selecting a deployable artifact.
- Make an explicit product/model decision: add an anatomical-right exercise, produce an accepted
  left-arm model for the existing catalog item, or deliberately change the existing catalog
  contract. Record and test the selected ID, side, mirror, and landmark semantics.
- Implement exact 30 × 30 preprocessing parity, front-camera/mirroring normalization, buffer
  lifecycle, on-device inference, head-output mapping, Capture-QC/repetition policy, and safe
  fallback.
- Enable MotionNet only when the chosen app exercise ID explicitly matches the accepted model
  contract and passes an explicit model-availability check.
- Keep the current left-arm static MLP/rule path for the current left-arm catalog item until its
  replacement passes. If V5 adds a new right-arm item, define a tested right-arm-safe rule or model
  fallback; do not call the left-arm static MLP its fallback without verified side normalization.

### Phase 2 — expand temporal coverage

- Create and evaluate an appropriate temporal model for each remaining in-scope `CATALOG_ID`.
- Record the artifact, manifest, feature contract, label space, thresholds, and limitations for
  every exercise.
- An exercise remains on its current static MLP or rule fallback until its own evidence and runtime
  checks pass.

### Phase 3 — retire the static classifier

Remove a static model only after every affected exercise has an accepted MotionNet path, a tested
failure fallback, complete fault-coverage mapping, and a documented rollback. Do not remove
`PoseComparator`, `MultiJointMotion`, the rep counter, or the safety gates as part of classifier
retirement.

## Acceptance gates

### Model evidence

- Freeze the deployable artifact and manifest; verify the recorded SHA-256.
- Keep numeric descendants in training only. Validation and final evaluation must be video-derived.
- Enforce source-lineage/group disjointness across subject, scene, camera, source clip, trajectory,
  prompt reference, lineage, and seed-source SHA groups; never split a group across partitions.
- Freeze and hash the validation/locked-evaluation manifest before opening results. Keep locked
  evaluation unopened and unused for model selection or tuning. Comparison, safety, or deployment
  claims require a fresh frozen locked evaluation.
- Freeze and test model thresholds and the separate repetition-decision thresholds without using
  locked-evaluation outcomes.
- Report per-head and per-class metrics, confusion/error analysis, false all-clear behavior,
  `uncertain`/`cannot_assess` behavior, and relevant subgroup limitations.
- Verify preprocessing, feature order, mirroring, frame cadence, window length, label map, and
  exported inference parity against the training implementation.
- Enforce the executable V3.1 Capture-QC contract. A frame passes only when `poseDetected` is
  `true`, `dataQuality` is `usable`, metadata is front camera + unmirrored + anatomical right +
  viewer left, and every required landmark in `head`, both `hands`, both `feet`, `signal_arm`,
  `shoulders`, and `hips` has finite `x`/`y` plus `visibility` or `presence` ≥ 0.5. Any metadata
  violation hard-fails the whole window; otherwise at least 90% of frames must pass. A failed or
  insufficient window yields `cannot_assess`, which must never auto-pass or increment a valid
  repetition. Do not assume the existing region-aware camera/boundary gates are equivalent.
- Keep proof-of-concept or synthetic-heavy results labelled as such; do not claim clinical
  accuracy without suitable real labelled evidence.

### App integration

- Use an on-device runtime that can load the frozen deployable format; do not ship a training-only
  `.keras` file merely because it exists.
- Reset the temporal buffer on login/logout, exercise change, session start/end, camera restart,
  lost tracking, and safety-gate interruption where continuity is no longer valid.
- Test startup/warm-up, missing frames/features, wrong shape/version, corrupt artifact,
  low-confidence output, and runtime unavailability.
- Test app exercise ID, anatomical side, viewer side, mirroring, MediaPipe RIGHT/LEFT semantics, and
  fallback behavior before any catalog item can select the model.
- Measure latency, memory, package-size, battery/thermal behavior, and sustained frame throughput on
  supported iPhone hardware before enabling by default.
- Add deterministic fixture tests for preprocessing parity and every Keras output head; test the
  Capture-QC/thresholded repetition policy separately, plus Patient session integration and any
  Therapist surface that consumes the results.
- Suppress hold-quality and fault outputs outside `hold`; non-hold values must not create a
  corrective cue or affect repetition decisions.
- Verify Standard, Audio-Only, and Visual-Only presentations without changing scoring or safety
  decisions.

## Documentation state labels

Use these exact distinctions:

- **Current baseline:** static Patient MLP/rule path present in source and executable.
- **Candidate:** trained artifact exists in the model workspace but is not accepted or integrated.
- **Integrated:** app source loads and invokes a frozen artifact behind tested contracts.
- **Validated for the stated evaluation:** the recorded acceptance evaluation passed; this is not
  automatically clinical validation.
- **Deployed:** a named build/version containing the integrated artifact was actually released and
  verified.

Until the corresponding evidence exists, V3.1 must be described only as a candidate.
