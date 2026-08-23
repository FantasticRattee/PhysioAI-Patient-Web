# App V7 local branch/build matrix

Status: **implemented locally; experimental; no GitHub push**  
Date: 2026-08-24  
Root worktree: `/Users/rattee/Developer/PhysioAI - GPT/App/App-V5/.worktrees/`

## Branches

| App version | Local branch | Worktree | Compile profile | Catalog | Speech path | Bundle identity |
| --- | --- | --- | --- | --- | --- | --- |
| V7.0.0 | `codex/app-v7-real` | `.worktrees/v7` | `REAL_V7` | Bottle Grab | legacy/direct | `PhysioAI App V7 Baseline 5 Experimental` |
| V7.1.0 | `codex/app-v7-1-real` | `.worktrees/v7-1` | `REAL_V71` | Bottle Grab | `NativeSpeechCommentCoordinator` | `PhysioAI App V7.1 TTS Fix Experimental` |
| V7.2.0 | `codex/app-v7-2-real` | `.worktrees/v7-2` | `REAL_V72` | Bottle Grab + Sit-to-Stand | legacy/direct | `PhysioAI App V7.2 Sit-to-Stand Experimental` |
| V7.3.0 | `codex/app-v7-3-real` | `.worktrees/v7-3` | `REAL_V73` | Bottle Grab + Sit-to-Stand | `NativeSpeechCommentCoordinator` | `PhysioAI App V7.3 BottleGrab TTS Upgraded + Sit-to-Stand Experimental` |

Each worktree has its own committed `project.yml`, generated Xcode project,
Info.plist, variant note, and executable `Patient/native-ios/scripts/build_and_install.sh`.
The script regenerates CocoaPods integration, builds only that worktree's
source, installs the artifact, and launches with the V7 detector flag. It does
not remove or toggle another version's files.

The branch commits are currently:

```text
codex/app-v7-real   c35da17
codex/app-v7-1-real 1eb728a
codex/app-v7-2-real 6374c72
codex/app-v7-3-real 1404163
```

## Artifact/resource separation

- V7 and V7.1 omit Sit-to-Stand and the V7.3 combined manifest.
- V7.2 includes the Sit-to-Stand module resources but omits the V7.3 combined
  manifest.
- V7.3 includes both exercise modules and the combined manifest.
- All variants retain the frozen Bottle Grab Baseline #5 detector/counter
  contract; the version profile changes catalog/presentation wiring only.

Profile/contract tests passed independently on the iPhone 17 Pro Simulator:
V7 `57`, V7.1 `64`, V7.2 `69`, and V7.3 `71` selected tests, all with zero
failures. Device Debug builds also passed for all four worktrees; V7.0.0 was
installed/launched on the iPhone 12 mini during this run.

## Device behavior

The four variants intentionally reuse bundle identifier
`com.rattee.physioai.native`, so installing one replaces the currently installed
variant on the iPhone 12 mini. The version shown by `devicectl device info apps`
is the authoritative installed identity. V7.0.0 was installed and launched on
2026-08-24 with `--native-app-v7-bottle-detector`; the other three variants have
successful generic iOS builds and signed artifacts from the same run.
Run install scripts sequentially on one device; parallel installs intentionally
race on the shared bundle identifier and are not a valid A/B procedure.

## Build commands

From any worktree:

```text
cd Patient/native-ios
./scripts/build_and_install.sh
```

For a different version, change only to that version's worktree. Do not copy or
delete source files between versions.
