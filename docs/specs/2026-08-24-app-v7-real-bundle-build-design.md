# App V7 — Real Baseline #5 device build

Status: **approved and installed locally; experimental; not patient-facing**  
Date: 2026-08-24  
Owner: `App/App-V5/Patient/native-ios/`

## Decision

For a physical counter comparison, “Real V7” means the V7 Bottle Grab
Baseline #5 app itself, not the V7 counter embedded in the V7.3 combined
wrapper.

## Runtime boundary

The Real V7 bundle contains:

- `NativeBottleGrabV7AIModule`;
- MediaPipe Pose Full and the optional Hand sidecar;
- the generic EfficientDet-Lite0 bottle detector asset;
- the V7 Pose-proximity repetition counter;
- optional Hand finger observations; and
- PhaseNet V2 as phase context only.

It does not expose Sit-to-Stand, the V7.2 module, the V7.3 combined manifest,
or the V7.1 speech-comment coordinator. The V7 counter contract remains the
frozen outside → inside → outside proximity state machine; this build does not
change its thresholds or output authority.

## Bundle identity

```text
bundleId: com.rattee.physioai.native
version: 7.0.0
displayName: PhysioAI App V7 Baseline 5 Experimental
artifact: Patient/native-ios/build/baseline5-iphone12/Build/Products/Debug-iphoneos/PhysioAINative.app
```

The same bundle identifier is used intentionally so installing Real V7
replaces the V7.3 app on the test iPhone. V7.3 source and build outputs remain
available for rollback/reinstall; no GitHub push or deployment is involved.

## Verification evidence

- `Info.plist` reports version `7.0.0` and display name `PhysioAI App V7
  Baseline 5 Experimental`.
- The app bundle contains `bottle_grab_v7_ai_module.manifest.json`,
  `efficientdet_lite0.manifest.json`, and the V7 PhaseNet contract/weights.
- The app bundle contains no Sit-to-Stand assets and no
  `native_v7_3_combined_ai_bundle.manifest.json`.
- Code-signature verification passed with the local Apple Development
  identity.
- `devicectl` installation and launch passed on the paired iPhone 12 mini on
  2026-08-24.

## Physical test gate

This proves package identity, signing, installation, and launch only. It does
not prove detector recall, camera continuity, or live repetition accuracy.
For the next run, keep the shoulder, elbow, and wrist inside the frame; hold
the hand outside the bottle until baseline/countdown completes; then perform
one outside → inside → outside cycle.

