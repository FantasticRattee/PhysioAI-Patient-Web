# PhysioAI App-V5

ระบบกายภาพบำบัดอัจฉริยะสำหรับผู้พิการทางร่างกาย — AI physiotherapy for physically-disabled people. Local pose analysis (on-device native; browser-local web preview with MediaPipe BlazePose), a Patient mobile/web app, a Therapist web console, and a shared API backed by Express + Prisma + PostgreSQL on Railway.

> **V5 status:** this repository is the MotionNet development successor to App‑V4.1. For the
> current local test, the catalog is intentionally narrowed to **Bottle Grab only**. Native
> iPhone testing keeps Calibration 3 Baseline #3 (`1.9.0-dev-calibration-3`); the Patient web
> lane can use the separate Baseline #4 Rule-Wrap Hybrid adapter with a MacBook camera. Both
> lanes emit tentative development cues only; neither is validated, approved for patient-facing
> treatment, or a V5 promotion. App‑V4.1 remains the stable application until V5 is promoted.

## Structure

```
App-V5/
├── backend/     API service — Express + Prisma + PostgreSQL (Railway), JWT/bcrypt auth.
│                Shared by BOTH apps. ONE Railway service that also serves the
│                Therapist web with a MediaPipe-WASM-friendly CSP.
│                  server.js · prisma/schema.prisma · api/index.js (Vercel fn) · vercel.json
├── Patient/     Mobile + web rollback lane — Expo / React Native (SDK 54, react-native-web).
│                Native MediaPipe pose pipeline plus a browser-only MacCamera.web.js dev lane.
│                iOS bundle id com.rattee.physioai.
│   └── native-ios/  Approved native Patient migration — SwiftUI + AVFoundation + native
│                   MediaPipe, no React Native bridge; generated with XcodeGen/CocoaPods.
├── Therapist/   Web console (static) — vanilla-JS ES modules. capture / plan / dashboard /
│                record / live-assist.
│                  index.html · therapist/ · shared/ (shared/ai = pose engine)
├── docs/        Project context, transition specifications, and dated mistake records.
├── tests/       Isolated Jest suite — backend (supertest + Railway DB) + Patient + Therapist.
├── HANDOVER.md
└── Theme.md
```

> The API used to live inside `Therapist/`; it was extracted to `backend/` so the shared
> service is obvious and the Therapist folder is pure front-end. The inherited Railway
> configuration uses the repo root (Root Directory blank) so `backend/` and `Therapist/` are both
> in the container; this is configuration documentation, not authorization to deploy V5.

## Run locally

**Backend + Therapist web (one Node process):**
```bash
cd backend
cp .env.example .env               # fill in DATABASE_URL (Railway Postgres) + JWT_SECRET
npm install                        # runs `prisma generate` via postinstall
npm run dev                        # node server.js → serves the API + the Therapist web on :3000
# open http://localhost:3000/therapist/dashboard.html
```
The Node server serves `../Therapist` with a MediaPipe-WASM-friendly CSP (`'wasm-unsafe-eval'`,
`worker-src blob:`), so the pose model loads. If you run Node on another local port (for example
`:3001`), open that same URL: the Therapist web uses its serving origin for API calls. A static
dev server such as VS Code Live Server must set `window.PHYSIOAI_API_BASE` to the backend URL
before the app modules load.
`npm start` does the same but first runs `prisma db push` to sync the schema, then `node server.js`
— this is what the inherited Railway configuration would run after an approved V5 deployment.

**Patient mobile/web (Expo):**
```bash
cd Patient
cp .env.example .env               # set EXPO_PUBLIC_API_BASE to the backend URL
npm install                        # also syncs the tracked MediaPipe Bottle Grab bridge
npx expo run:ios                   # native dev build  (or: npm start → expo start --dev-client)
npx expo start --web               # MacBook-camera web preview (Baseline #4 for Bottle Grab)
```
The Patient web build includes a mobile/PWA shell: browser Back follows the in-app stack, screens
use safe-area and phone-width constraints, and the exported single-page web build includes a manifest for
Add to Home Screen over HTTPS. It is not an offline build; JavaScript/WASM/task assets and cloud
auth/API metadata still need network delivery, while camera frames and inference stay local. See
the [Patient Web/PWA navigation design](docs/specs/2026-08-20-patient-web-pwa-navigation-design.md).
`EXPO_PUBLIC_*` values are baked in at bundle time. Leaving `EXPO_PUBLIC_API_BASE` blank in dev
enables local demo/mock storage; set `EXPO_PUBLIC_ENABLE_DEMO=true` only when a build should
intentionally allow guest/demo mode.
The Patient `postinstall` script overlays the reviewed `vendor/react-native-mediapipe/` package
into `node_modules` so the native hand-landmarker bridge is reproducible; generated peer
dependencies are excluded and Metro resolves MediaPipe's React peers to the Patient runtime.
Run it before `pod install` or `npx expo run:ios` after a clean checkout.

For the approved bridge-free iOS Patient migration, use `Patient/native-ios/`. The migration was
Simulator-first: the Expo app and PWA remain intact as rollback/comparison lanes. The simulator
gates have passed, and a signed Debug build has been installed and launched on RATTTZQ; the device
runtime gates remain separate:

```bash
cd Patient/native-ios
xcodegen generate
xcrun simctl list devices | head
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

The target runs MediaPipe Pose + Hand in Swift, preserves the tentative Calibration 3
development-cue boundary, and separately bundles a frozen **PhaseNet V2 full-cycle sidecar**.
The sidecar uses a causal 30 × 20 window at 15 Hz and advances developer instrumentation only
after two stable predictions complete `start_or_rest → reach → preshape → grasp → release →
return → start_or_rest`. It emits no score, form class, correctness, bottle-contact truth,
persisted session rep, or clinical decision. The native XCTest run passed **23/23
simulator/numeric checks**, including source-generation and handedness guards, full-cycle order,
and frozen feature/runtime golden values. That result is distinct from physical
camera/FPS/TTS validation. See the [native iOS README](Patient/native-ios/README.md), the
[approved migration design](docs/specs/2026-08-20-native-ios-patient-app-migration-design.md),
[approved full-parity design](docs/specs/2026-08-20-native-ios-full-parity-design.md),
[native parity matrix](docs/specs/2026-08-21-native-ios-parity-matrix.md),
the [simulator acceptance record](docs/specs/2026-08-20-native-ios-patient-simulator-acceptance.md),
and the [RATTTZQ device handoff](docs/specs/2026-08-20-native-ios-ratttzq-device-build-handoff.md),
plus the current [full-parity build checkpoint](docs/specs/2026-08-21-native-ios-ratttzq-full-parity-build.md).
The Expo/React Native rollback lane still uses `Patient/src/pose/NativeCameraView.js`: its Practice overlay can
switch front/back and reads `minZoom`, `neutralZoom`, `maxZoom`, and `physicalDevices` from the
selected CameraDevice at runtime. It shows an available ultra-wide preset (normally `0.5×`), the
wide preset (`1×`), a reported telephoto preset, and a runtime Max zoom preset when supported; it
never claims a fixed `14×` or `24×` limit. A simulator may show no real lens options. The native
controller does not change Calibration 3, model weights, scoring, or the separate MacBook web
camera lane. Bottle Grab now draws the 21-point Hand Landmarker overlay rather than the body-only
BlazePose skeleton when the exercise is hand-first, and pose/hand coordinates share one
ViewCoordinator transform. TTS requests a separate Expo Speech audio session for Standard and
Audio-Only cues; Visual-Only remains silent. See the [hand-overlay record](docs/mistake_records/2026-08-20-bottle-grab-hand-overlay-coordinate-mistake-record.md),
[TTS record](docs/mistake_records/2026-08-20-bottle-grab-tts-silent-mode-mistake-record.md), and
[iOS model-import audit](docs/mistake_records/2026-08-20-bottle-grab-ios-model-import-audit.md).

A 2026-08-20 RATTTZQ redbox exposed duplicate VisionCamera/Worklets bundle entries; Metro now
canonicalizes those native peers to one CommonJS entry. The supplied post-fix screenshot confirms
that the preview can mount; the new overlay and audio changes still need to be installed and
checked on the phone.

## Database (Prisma + PostgreSQL on Railway)

```bash
cd backend
npm run db:push                    # prisma db push — syncs schema.prisma to the DB (no migrations)
npm run studio                     # optional: open Prisma Studio
```
The schema (`prisma/schema.prisma`) defines `User`, `Plan`, `Reference`, `Session`, and
`TherapistPatient` (the therapist↔patient link). `Plan` / `Reference` / `Session` keep a JSON
`data` blob so API responses match the app contract 1:1. Use the Railway **public** URL when
running `db:push` from your machine, and the **internal** URL when deployed on Railway.

## Deployment configuration (inherited; V5 not promoted)

> These instructions describe the configuration copied from V4.1. App‑V5 still shares V4.1's
> GitHub origin and is not the promoted application; do not push or deploy it as V5 until its
> repository destination and promotion are explicitly approved.

- **Railway pattern — one service:** deployment from the repo root uses `railway.json` to build and run
  `cd backend && npm run start`, which runs `prisma db push` then `node server.js`. The single
  service serves the API *and* the Therapist web (`WEB_DIR` overrides the web path). Point
  `EXPO_PUBLIC_API_BASE` (Patient) at this URL. The Therapist web resolves its API base
  automatically (same-origin when served by this service); override it with
  `window.PHYSIOAI_API_BASE` for a custom/cloud setup — there is no hard-coded URL in the code.
- **Vercel (alternative) — serverless:** `backend/vercel.json` → `api/index.js` runs the same
  Express app as a function. Set CORS and point clients' API base at the function URL.

## Env vars (backend)

`DATABASE_URL` (Railway Postgres) and `JWT_SECRET` — see `backend/.env.example`. Optional:
`JWT_EXPIRES` (default `30d`), `PORT` (default `3000`), `WEB_DIR`.

> `JWT_SECRET` has a dev fallback (`dev-secret-change-me`) and the server logs a warning when it
> is in use — **always set a long random `JWT_SECRET` in production.** Secrets live only in env and
> are never committed (`.env` is gitignored).

## AI / models

### Current executable baseline

The current Patient pipeline runs 100% **on-device** (no video leaves the device): MediaPipe
BlazePose (33 landmarks) → `JointAngleCalculator` (12 joint angles) → rule-based `PoseComparator`
(pose-score component + per-joint deltas/status) → deterministic `MultiJointMotion` → form
judgment → feedback → Thai/English TTS, gated by camera setup and a 95% boundary-box check.
`Patient/src/core/session.js` computes the current final deterministic score as 60% tracked pose
score + 40% motion score. `MultiJointMotion.js` is not MotionNet.

Patient form judgment currently uses the bundled from-scratch static MLP for
`overhead_ceiling_reach`, `lateral_arm_raise`, and `cross_body_shoulder_stretch`; exercises without
a model use the rule-based `FormScorer`. Each baseline MLP consumes one 12-angle frame and uses a
small `[12→24→16→N]` multi-label network (sigmoid + BCE). In
`Patient/src/core/session.js`, its result can override `cue` and `formClass`, while
the comparator/motion path continues to own numeric scoring and repetition logic.

Equivalent static model assets and classifier code exist under `Therapist/shared/ai/`, but the
current capture page still calls the older classifier signature and expects the older result shape.
That adapter mismatch is silently caught, so Therapist capture classification must **not** be
described as working until the runtime call is repaired and tested.

### V5 target: MotionNet development successor

V5 aims to replace the per-frame static classifier for the **three established assignable catalog
exercises** with accepted temporal models. This scope does not yet include every built-in extra or
custom exercise. The newest available draft integration candidate is
**LateralRaise MotionNet V3.1** for the
anatomical-right experiment ID `lateral_arm_raise_right_temporal_v3_1`. The current app catalog's
`lateral_arm_raise` is left-sided, so V3.1 is not a drop-in replacement; side behavior and ID mapping
require an explicit product/model decision first. It consumes 30 frames × 30 temporal features. Its
Keras heads output phase, hold quality, and supported-fault probabilities; a separate conservative
policy would combine those outputs with Capture-QC to decide `pass`, `warn`, `uncertain`, or
`cannot_assess`. Hold quality and fault outputs are supervised for the hold phase only and must not
drive corrections outside that phase. The artifact is an experimental train-only candidate: it has
no group-disjoint validation or selected operating thresholds, its locked evaluation remains
unopened, and no MotionNet runtime/dependency/sequence buffer exists in this app.

The `bottle_grab` item is currently the only catalog entry, solely to support local device
instrumentation; catalog visibility is not treatment approval. In the Expo iPhone lane,
`BottleGrabCamera` joins BlazePose and Hand Landmarker on the same timestamp and the exact copied
Calibration 3 Baseline #3 source evaluates a 15 Hz rolling Pose+Hand measurement window. On web,
`MacCamera.web.js` uses the MacBook webcam and MediaPipe Tasks Vision WASM, then wraps the same
parent with frozen **Baseline #4 Rule-Wrap Hybrid V1** evidence gates. Those Expo/web lanes emit
only a tentative cue with model/provenance metadata and no rep count.

The bridge-free Swift lane keeps those cue-only contracts intact but has an independent,
developer-only PhaseNet V2 full-cycle sidecar. Before it samples, a source-generation guard drops
late camera/lens callbacks, detector handedness is normalized from the actual input mirroring, and
setup requires an associated anatomical-left hand plus a **14-anchor full-body proxy**. The proxy
is not all 33 BlazePose landmarks, and `numHands = 1` remains a two-hand limitation. A complete
phase sequence can change only a visible development-cycle value; it does not make a treatment,
adherence, correctness, form, contact, lift, or clinical claim. Missing hand/pose,
wrong-handedness, timestamp gaps, profile-incomplete measurements, or load/inference errors fail
closed; raw camera frames and landmarks remain local. The Patient app may speak a Calibration 3
cue in Standard/Audio-Only mode and stays silent in Visual-Only.
See the [Calibration 3 device-preview spec](docs/specs/2026-08-19-bottle-grab-calibration-3-device-preview.md)
and the [Baseline #4 MacBook-camera preview spec](docs/specs/2026-08-19-bottle-grab-baseline-4-mac-camera-preview.md).
The current native sidecar boundary is recorded in the
[PhaseNet V2 full-cycle sidecar mistake record](docs/mistake_records/2026-08-21-bottle-grab-native-phasenet-v2-full-cycle-sidecar-mistake-record.md),
while [the earlier rep-counter record](docs/mistake_records/2026-08-21-bottle-grab-native-rep-counter-mistake-record.md)
and [zoom-control mistake record](docs/mistake_records/2026-08-21-native-zoom-control-mistake-record.md)
remain historical/separate evidence.

Every established exercise, including lateral raise, therefore remains on the static MLP/rule
baseline until its temporal model exists, is integrated, and passes the same acceptance gates. See the
[V5 MotionNet transition specification](docs/specs/2026-07-24-motionnet-v5-transition.md) for the
draft candidate, rollout order, preserved contracts, and evidence required before any document
may call MotionNet deployed or validated.

The first general V5 integration is limited to replacing the static form-fault/cue path. The
Bottle Grab lane is a measurement-only exception and does not replace that path. Existing
`MultiJointMotion` scoring and rep counting remain deterministic unless a separate behavior
decision explicitly replaces them. V3.1 also lacks current static flags for trunk/torso lean and
knee bend, so the static/rule path cannot be retired without a tested hybrid or replacement.

The optional cloud "LLM summary" path (`Therapist/shared/ai/LlmSummary.js`,
Anthropic Messages shape) ships **inert** and falls back to the on-device template
(`shared/ai/summary.js`); enabling it sends only de-identified aggregates, never PII.

## Tests

```bash
cd tests
npm install
npm test                           # unit (Patient + Therapist) then backend integration
```
An isolated Jest harness (not part of any app build or the Railway deploy): backend API tests via
supertest against the real Railway DB, the Patient AI pipeline in node, and the Therapist shared
modules under jsdom. Run a single project with `npm run test:patient`, `npm run test:therapist`,
or `npm run test:backend`.
