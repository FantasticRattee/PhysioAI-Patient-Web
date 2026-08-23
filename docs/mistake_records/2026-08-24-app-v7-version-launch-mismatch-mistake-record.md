# App V7 version/launch-profile mismatch

| Field | Value |
| --- | --- |
| Record ID | `app-v7-version-launch-001` |
| Date first observed | `2026-08-24` |
| Last updated | `2026-08-24` |
| Status | `resolved` |
| Failure category | `build` / `runtime` |
| Owning area | `App/App-V5/Patient/native-ios/` |

## Issue summary

The device was expected to run Real V7.0.0, but the user saw V6.1 in the
running app. The installed bundle metadata was V7.0.0; the Real V7 artifact
still used the historical opt-in launch flag, so launching without that flag
fell back to the V6.1 runtime path.

## Evidence log

| Event | Observation | Evidence |
| --- | --- | --- |
| E1 | User reported that the iPhone showed V6.1 instead of the requested V7.0.0. | User report |
| E2 | `devicectl device info apps` showed `PhysioAI App V7 Baseline 5 Experimental`, bundle `com.rattee.physioai.native`, version `7.0.0`. | Device metadata |
| E3 | The Real V7 source contract retains `--native-app-v7-bottle-detector` as the historical V7 activation flag. | V7 design/README and runtime source |
| E4 | Relaunching with `--native-app-v7-bottle-detector` succeeded. Device metadata remained V7.0.0. | `devicectl` install/launch output |
| E5 | A parallel four-branch build was intentionally stopped before its install phase because all variants reuse one bundle identifier; the four builds themselves completed successfully. | Branch build logs; no version claim was made from the interrupted install race |

## Cause and fix

**Confirmed:** Bundle identity and runtime activation were two separate
controls. Installing the V7 bundle alone did not select the V7 engine in the
historical artifact; the launch flag was also required.

The new local branch scripts now always pass the V7 detector flag. The four
version-isolated worktrees also make the compile profile and catalog explicit,
so a future build does not require manually removing another version's files.
Because the four local apps intentionally reuse one bundle identifier, their
install scripts must be run one at a time when testing on the same device.

## Validation

- Real V7.0.0 installed and launched on iPhone 12 mini with the correct flag.
- Version/profile tests: V7 `57`, V7.1 `64`, V7.2 `69`, V7.3 `71` selected
  tests; all passed with zero failures.
- Each worktree has a clean local commit and its own `build_and_install.sh`.

## Boundary

This resolves version/launch selection only. It does not prove physical
camera continuity, detector recall, repetition accuracy, TTS audibility, or
clinical readiness.
