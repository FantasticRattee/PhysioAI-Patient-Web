import { CATALOG_IDS, getCatalog, getExercise } from '../../Patient/src/core/exercises.js';
import { createSession } from '../../Patient/src/core/session.js';
import { makePose } from '../../Patient/src/ai/SyntheticPose.js';

import { evaluateBottleGrabRuleWrapHybrid } from '../../Patient/src/ai/bottleGrab/ruleWrapHybrid/bottle_grab_rule_wrap_hybrid_v1.mjs';

describe('Bottle Grab experimental catalog path', () => {
  test('coexists with the separate Pose-only Sit-to-Stand research module', () => {
    expect(CATALOG_IDS).toEqual(['bottle_grab', 'sit_to_stand']);
    expect(getCatalog()).toHaveLength(2);
    const bottle = getCatalog().find((exercise) => exercise.id === 'bottle_grab');
    expect(bottle).toMatchObject({
      id: 'bottle_grab',
      anatomicalSide: 'left',
      trackingProfile: 'pose_plus_hand',
      experimentalOnly: true,
      modelId: 'bottle_grab_model_module_v1_9_calibration_3',
      webModelId: 'bottle_grab_rule_wrap_hybrid_v1_baseline_4',
      webModelVersion: '1.9.0-dev-calibration-3-rule-wrap-hybrid-1',
      phaseModelId: 'bottlegrab_posehand_phasenet_v2_same_lineage_video_expansion_train_only',
    });
    expect(getExercise('sit_to_stand')).toMatchObject({
      trackingProfile: 'pose_only',
      experimentalOnly: true,
      counterAuthority: 'parallel_geometry_counter',
    });
  });

  test('Calibration 3 output is advisory and cannot advance score or reps', () => {
    const exercise = getExercise('bottle_grab');
    const tracker = {
      reset: jest.fn(),
      push: jest.fn(() => ({
        status: 'fault_decision_ready',
        phase: 'reach',
        probabilities: [1, 0, 0, 0, 0, 0],
        captureQc: 'can_assess',
        bufferedFrames: 30,
        modelId: 'bottle_grab_model_module_v1_9_calibration_3',
        modelVersion: '1.9.0-dev-calibration-3',
        decisionScope: 'development_fault_cue_preview',
        faultDecision: {
          primaryCueId: 'BG_REF_WRAP_FINGERS_MORE',
          messages: { en: 'Wrap your fingers more securely.', th: 'กำมือให้กระชับขึ้น' },
        },
      })),
    };
    const session = createSession({ exercise, source: 'live', bottlePhaseTracker: tracker });
    const snapshot = session.pushFrame(makePose(exercise.primaryJoint, exercise.target), 1 / 15, true, {
      boundary: { status: 'inside' },
      handFrame: {
        landmarks: Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 })),
        side: 'Left',
        score: 0.99,
        timestampMs: 1,
      },
    });

    expect(tracker.push).toHaveBeenCalledTimes(1);
    expect(snapshot.experimental).toMatchObject({
      phase: 'reach',
      modelId: 'bottle_grab_model_module_v1_9_calibration_3',
      modelVersion: '1.9.0-dev-calibration-3',
      decisionScope: 'development_fault_cue_preview',
      faultDecision: { primaryCueId: 'BG_REF_WRAP_FINGERS_MORE' },
    });
    expect(snapshot.cue).toMatchObject({
      tts: true,
      id: 'experimental:calibration3:BG_REF_WRAP_FINGERS_MORE',
    });
    expect(snapshot.score).toBeNull();
    expect(snapshot.formClass).toBeNull();
    expect(snapshot.reps).toBe(0);
    expect(snapshot.finished).toBe(false);
    expect(session.finishSummary()).toMatchObject({
      experimentalOnly: true,
      experimentalDecisionScope: 'development_fault_cue_preview',
      reps: 0,
    });
  });

  test('passes both pose and hand streams into the Calibration 3 tracker', () => {
    const exercise = getExercise('bottle_grab');
    const tracker = { reset: jest.fn(), push: jest.fn(() => ({ status: 'cannot_assess' })) };
    const pose = makePose(exercise.primaryJoint, exercise.target);
    const hand = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    createSession({ exercise, source: 'live', bottlePhaseTracker: tracker })
      .pushFrame(pose, 1 / 15, true, {
        boundary: { status: 'inside' },
        handFrame: { landmarks: hand, side: 'Left', score: 0.99, timestampMs: 9 },
      });
    expect(tracker.push).toHaveBeenCalledWith(expect.objectContaining({
      poseLandmarks: pose,
      handLandmarks: hand,
      handSide: 'Left',
      handScore: 0.99,
      timestampMs: 9,
    }));
  });

  test('Baseline #4 qualifies only from persistent corroborated finger evidence', () => {
    const evidence = {
      schema: 'physioai.bottle_grab.rule_wrap_evidence.v1',
      status: 'can_assess',
      viewProfile: 'front_anatomical_left',
      nativeUnmirrored: true,
      visibleFingerIds: ['thumb', 'index', 'middle', 'ring', 'pinky'],
      fingerEvidence: {
        thumb: { status: 'available' }, index: { status: 'available' },
        middle: { status: 'available' }, ring: { status: 'available' },
        pinky: { status: 'available' },
      },
      persistence: 1,
      independentSignals: [
        { signalId: 'pinky_index_gap', score: 1, persistence: 1 },
        { signalId: 'visible_finger_spread', score: 1, persistence: 1 },
      ],
    };
    expect(evidence).toMatchObject({
      schema: 'physioai.bottle_grab.rule_wrap_evidence.v1',
      status: 'can_assess',
      viewProfile: 'front_anatomical_left',
      nativeUnmirrored: true,
      persistence: 1,
    });
    expect(evidence.independentSignals).toEqual(expect.arrayContaining([
      expect.objectContaining({ signalId: 'pinky_index_gap', score: expect.any(Number) }),
      expect.objectContaining({ signalId: 'visible_finger_spread', score: expect.any(Number) }),
    ]));
    const decision = evaluateBottleGrabRuleWrapHybrid({
      calibrationDecision: {
        primaryCueId: 'BG_REF_WRAP_FINGERS_MORE',
        candidates: [{ cueId: 'BG_REF_WRAP_FINGERS_MORE', observationTag: 'BG_OBS_GRASP_CLOSURE_BELOW_REFERENCE' }],
      },
      ruleEvidence: evidence,
      preserveParentFingerOnUnqualified: true,
    });
    expect(decision).toMatchObject({
      engineId: 'bottle_grab_rule_wrap_hybrid_v1',
      version: '1.9.0-dev-calibration-3-rule-wrap-hybrid-1',
      deliveryStatus: 'tentative_not_final',
      fingerDecision: { status: 'qualified_rule_corroborated' },
      claimBoundary: { appAuthorized: false, browserAuthorized: false, physicalContactTruth: false },
    });
  });

  test('session preserves the Baseline #4 cue namespace without changing score/reps', () => {
    const exercise = getExercise('bottle_grab');
    const tracker = {
      reset: jest.fn(),
      push: jest.fn(() => ({
        status: 'fault_decision_ready',
        phase: 'reach',
        modelId: 'bottle_grab_rule_wrap_hybrid_v1_baseline_4',
        modelVersion: '1.9.0-dev-calibration-3-rule-wrap-hybrid-1',
        decisionScope: 'development_rule_wrap_hybrid_preview',
        cuePrefix: 'experimental:baseline4',
        faultDecision: {
          primaryCueId: 'BG_REF_WRAP_FINGERS_MORE',
          messages: { en: 'Wrap your fingers more securely.', th: 'กำมือให้กระชับขึ้น' },
        },
      })),
    };
    const snapshot = createSession({ exercise, source: 'live', bottlePhaseTracker: tracker })
      .pushFrame(makePose(exercise.primaryJoint, exercise.target), 1 / 15, true, {
        boundary: { status: 'inside' },
        handFrame: { landmarks: [], side: 'Left', score: 0.9, timestampMs: 2 },
      });
    expect(snapshot.experimental).toMatchObject({
      modelId: 'bottle_grab_rule_wrap_hybrid_v1_baseline_4',
      decisionScope: 'development_rule_wrap_hybrid_preview',
    });
    expect(snapshot.cue.id).toBe('experimental:baseline4:BG_REF_WRAP_FINGERS_MORE');
    expect(snapshot.score).toBeNull();
    expect(snapshot.reps).toBe(0);
  });
});
