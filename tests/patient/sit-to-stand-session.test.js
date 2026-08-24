import { createSession } from '../../Patient/src/core/session.js';
import { getExercise } from '../../Patient/src/core/exercises.js';
import { makePose } from '../../Patient/src/ai/SyntheticPose.js';

function makeTracker(output) {
  return {
    modelId: 'sit_to_stand_pwa_v7_3_3_experimental',
    modelVersion: '7.3.3-pwa-experimental',
    counterMode: 'parallel_geometry_counter',
    setCountingEnabled: jest.fn(),
    resetForNewCaptureSource: jest.fn(),
    push: jest.fn(() => output),
  };
}

describe('Sit-to-Stand PWA session integration', () => {
  test('uses the pose-only tracker as the experimental count authority', () => {
    const tracker = makeTracker({
      moduleId: 'sit_to_stand_pwa_v7_3_3_experimental',
      moduleVersion: '7.3.3-pwa-experimental',
      captureQC: 'pose_geometry_only',
      setupReason: null,
      featureFrameCount: 30,
      geometryStatus: 'seated_rest',
      geometryTotalReps: 2,
      geometryRepetitionCompleted: true,
      phase: 'seated_rest',
      phaseStatus: 'phase_ready',
      phaseProbabilities: [0.9, 0.05, 0.03, 0.02],
      commentStatus: 'no_named_deviation',
      cue: null,
      cueThai: null,
      commentRepetitionCount: 2,
      isTrackingReady: true,
      counterMode: 'parallel_geometry_counter',
    });
    const session = createSession({
      exercise: getExercise('sit_to_stand'),
      reference: null,
      allRefs: {},
      sitToStandTracker: tracker,
      lang: 'en',
    });

    const snapshot = session.pushFrame(makePose('right_knee', 90), 0.067, true, {
      timestampMs: 67,
      sourceGeneration: 1,
      inputIsMirrored: false,
    });

    expect(tracker.setCountingEnabled).toHaveBeenCalledWith(true);
    expect(tracker.push).toHaveBeenCalledWith(expect.objectContaining({
      sourceGeneration: 1,
      inputIsMirrored: false,
    }));
    expect(snapshot).toMatchObject({
      score: null,
      reps: 2,
      finished: false,
      experimental: expect.objectContaining({
        exerciseId: 'sit_to_stand',
        counterMode: 'parallel_geometry_counter',
        repCount: 2,
        captureQc: 'pose_geometry_only',
        sitToStand: expect.objectContaining({
          geometryStatus: 'seated_rest',
          phaseStatus: 'phase_ready',
          isTrackingReady: true,
        }),
      }),
    });
  });
});
