# App V7.3.3 Patient PWA — Bottle Diagnostics + Sit-to-Stand

Status: **deployed experimental PWA; static hosting verified**
Date: 2026-08-24
Working branch: `codex/app-v7-3-3-pwa-patient`
Supersedes: no native/model baseline; this is a new PWA comparison lane.

## Decision

The Patient PWA will carry two explicitly separate experimental exercise
modules under an App V7.3.3 PWA identity:

1. **Bottle Grab V7.3.3 PWA diagnostics** — preserve the existing local
   EfficientDet-Lite0 + Pose-proximity counter authority, then surface the
   detector evidence needed to compare a browser run against the native
   V7.3.3 diagnostic lane.
2. **Sit-to-Stand Pose-only PWA** — introduce a separate full-body
   pose-only browser module.  Its geometry counter owns physical repetitions;
   the causal PhaseNet V1 export supplies phase context to the fixed reference
   comment layer.  It does not reuse Bottle Grab's Hand, bottle detector, or
   counter.

This is an experimental PWA integration and deployment candidate. It is
authorized to publish from this branch to the existing Railway service after
release checks, but it does **not** promote the App-V5 successor, validate
either model, authorize patient-facing use, or modify any frozen native/model
baseline.

Deployment result (2026-08-24): commit `9317b11` is deployed to
`https://physioai-backend-production.up.railway.app/`. The root PWA, browser
history route, manifest, exported JS, EfficientDet asset, API health endpoint,
and Therapist static route are verified. This proves hosting integration only;
real browser-camera/person-in-frame behavior remains a separate gate.

## Preserved baselines and rollback

- Native `NativeBottleGrabV7AIModule` **Baseline #5** remains unmodified.
- Native App V7.3.3 remains the source for native diagnostics, not the PWA.
- Bottle Grab Baseline #4 rules, V7 detector thresholds, and count ownership
  remain intact unless a focused PWA test proves an accidental regression.
- The existing local native branch and model contracts remain rollback points.
- This working branch is intentionally separate.  The pre-existing dirty
  worktree is not staged, reset, or reinterpreted as a clean snapshot.

## Bottle Grab V7.3.3 PWA contract

```text
local camera frame
  -> MediaPipe Pose (required) + Hand (optional) + EfficientDet-Lite0
  -> raw detector aggregate + selector decision
  -> Bottle Detector Diagnostics V7.3.3
  -> Pose-proximity repetition counter (sole count authority)
  -> Baseline #4 cue/PhaseNet context
  -> fixed UI/TTS comment policy
```

The PWA must retain and show, independently:

- detector status: `detector_waiting`, `bottle_detected`, `bottle_missing`,
  `bottle_ambiguous`, `bottle_stale`, `source_changed`, or `detector_error`;
- raw returned candidates, accepted bottle candidates, top returned label and
  score, selected-ROI age, selector/rejection reason, and source generation;
- counter stage and counter reason;
- an ROI outline only for an accepted, fresh (`<= 350 ms`) ROI.

Hand and PhaseNet context remain optional.  Their absence must not be shown as
a hard setup failure and must not increment, suppress, or erase a
Pose-proximity count.  Existing label allowlist, score threshold `0.35`,
ambiguity margin, ROI margin, 350-ms freshness, and counter transition
thresholds are retained.

## Sit-to-Stand PWA contract

```text
local front/unmirrored full-body camera frame
  -> MediaPipe Pose Full only
  -> full-body Capture-QC + 30-feature normalized temporal window
  -> Geometry First repetition tracker (sole count authority)
  || causal TCN PhaseNet V1 (phase context only)
  -> front normal-reference decision and fixed comment
```

- Input is a finite `30 x 30` Float32 feature window using the model-owned
  `pelvis_torso_scale_view_relative.v1` contract.
- Browser code must load only a browser-specific copy of the versioned model
  export and verify its declared contract/provenance in tests.  Native F32
  runtime code is not silently reused as a web deployment claim.
- Pose QC must require the declared full-body front-view evidence.  Missing or
  non-finite evidence returns `cannot_assess`, never an invented comment.
- The geometry tracker decides a completed physical cycle.  PhaseNet may
  provide phase context but cannot add/remove repetitions.
- On a completed repetition the reference/comment layer emits at most its
  declared fixed tentative cue; it is not an LLM or clinical recommendation.

## Product/UI behavior

- Add `sit_to_stand` to the local PWA experimental catalog with clear Thai and
  English labels, instructions, camera framing, and status wording.
- Route Bottle Grab to its Bottle-specific web camera; route Sit-to-Stand to
  a dedicated pose-only web camera.  Neither route may implicitly activate
  the other exercise's detector or tracking policy.
- Both cards must be visibly labelled `Experimental` and distinguish setup/QC
  status from a movement comment.
- Do not change backend APIs or native iOS code as part of the exercise-module
  decision. The approved release work may add static PWA serving without
  changing API contracts or Therapist routes.

## Approved Railway deployment boundary

The Railway service is intentionally a single same-origin service:

```text
Railway root URL       -> Patient Expo PWA (`Patient/dist`)
Railway `/health` etc. -> Express/Prisma API
Railway `/therapist/`  -> existing Therapist static console
```

The root path is required because Expo's production export references
`/_expo/...` and `/assets/...` with root-absolute URLs. Mounting this export
under `/patient/` would break those assets unless the export topology changed.
At build time Railway runs the root `npm run build`, which installs the
backend and Patient packages and exports `Patient/dist`. The root package must
declare Node `>=20.19.4`, because Expo SDK 54/React Native 0.81 uses platform
APIs absent from Railway's older Node 18 image. Express serves that directory
plus HTML history fallback while leaving API and Therapist paths unaffected. In
a deployed browser build `API_BASE` uses an explicit
`EXPO_PUBLIC_API_BASE` when one is baked in, otherwise it uses the same
serving origin. Camera frames and inference remain local to the browser.

## Test and verification gates

Before handoff, run:

1. focused Jest tests for the new Bottle diagnostics lifecycle and preserved
   Bottle counter behavior;
2. focused Jest tests for Sit-to-Stand feature/QC, geometry counting,
   PhaseNet/export contract, comments, catalog and camera dispatch;
3. the Patient test suite and web bundle/export check;
4. an actual rendered PWA visual pass for both exercise entry paths.

Passing automated checks and static route checks establishes source/bundle and
hosting integration only. A later real-person/camera run remains required to
claim detector recall, stable counts, on-device latency, model performance, or
patient-facing readiness.

## Ownership and documentation

- App implementation and PWA UX: `App/App-V5/Patient/`.
- App design/context and branch matrix: `App/App-V5/docs/`.
- Sit-to-Stand model provenance, browser export contract, and model status:
  `models/.../sit_to_stand_pose_only_v1/`.
- Bottle Grab model artifacts and native Baseline #5: unchanged.

Any implementation change must update its source test, the appropriate
app/model index, and the final CRUD handoff packet.
