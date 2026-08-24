import {
  BOTTLE_GRAB_REP_COUNTER_VERSION,
  createBottleGrabRuleBasedRepCounter,
} from '../../Patient/src/ai/bottleGrab/ruleWrapHybrid/BottleGrabRuleBasedRepCounter.js';
import { getExercise } from '../../Patient/src/core/exercises.js';
import { createSession } from '../../Patient/src/core/session.js';
import { makePose } from '../../Patient/src/ai/SyntheticPose.js';

function point(x, y) {
  return { x, y, z: 0 };
}

function pose() {
  const landmarks = Array.from({ length: 33 }, () => ({ ...point(0.5, 0.5), visibility: 0.98 }));
  landmarks[11] = { ...point(0.5, 0.4), visibility: 0.98 };
  landmarks[13] = { ...point(0.4, 0.5), visibility: 0.98 };
  landmarks[15] = { ...point(0.3, 0.6), visibility: 0.98 };
  landmarks[17] = { ...point(0.31, 0.58), visibility: 0.98 };
  landmarks[19] = { ...point(0.32, 0.57), visibility: 0.98 };
  landmarks[21] = { ...point(0.33, 0.56), visibility: 0.98 };
  return landmarks;
}

function hand({ closed = false } = {}) {
  const landmarks = Array.from({ length: 21 }, () => point(0.3, 0.6));
  landmarks[0] = point(0.3, 0.6);
  landmarks[9] = point(0.3, 0.5);

  if (!closed) {
    landmarks[1] = point(0.34, 0.58);
    landmarks[2] = point(0.38, 0.56);
    landmarks[3] = point(0.42, 0.54);
    landmarks[4] = point(0.46, 0.52);
    for (const [mcp, x] of [[5, 0.32], [9, 0.34], [13, 0.36], [17, 0.38]]) {
      landmarks[mcp] = point(x, 0.56);
      landmarks[mcp + 1] = point(x, 0.51);
      landmarks[mcp + 2] = point(x, 0.46);
      landmarks[mcp + 3] = point(x, 0.41);
    }
    landmarks[8] = point(0.32, 0.41);
    return landmarks;
  }

  landmarks[1] = point(0.32, 0.58);
  landmarks[2] = point(0.34, 0.56);
  landmarks[3] = point(0.36, 0.54);
  landmarks[4] = point(0.35, 0.52);
  for (const [mcp, x] of [[5, 0.32], [9, 0.34], [13, 0.36], [17, 0.38]]) {
    landmarks[mcp] = point(x, 0.56);
    landmarks[mcp + 1] = point(x + 0.03, 0.53);
    landmarks[mcp + 2] = point(x + 0.04, 0.56);
    landmarks[mcp + 3] = point(x + 0.01, 0.58);
  }
  landmarks[8] = point(0.36, 0.52);
  return landmarks;
}

function push(counter, timestampMs, handLandmarks, handSide = 'Left') {
  return counter.push({
    poseLandmarks: pose(),
    handLandmarks,
    handSide,
    handScore: 0.99,
    timestampMs,
    countingEnabled: true,
  });
}

describe('PWA Bottle Grab Rule-based repetition counter', () => {
  test('counts one open → close → reopen cycle without requiring a bottle lift or wrist return', () => {
    const counter = createBottleGrabRuleBasedRepCounter();
    counter.setCountingEnabled(true);
    let result;
    let timestampMs = 0;

    for (let i = 0; i < 3; i += 1) {
      timestampMs += 67;
      result = push(counter, timestampMs, hand({ closed: false }));
    }
    for (let i = 0; i < 3; i += 1) {
      timestampMs += 67;
      result = push(counter, timestampMs, hand({ closed: true }));
    }
    for (let i = 0; i < 3; i += 1) {
      timestampMs += 67;
      result = push(counter, timestampMs, hand({ closed: false }));
    }

    expect(result).toMatchObject({
      status: 'armed',
      repCount: 1,
      didCompleteRep: true,
      modelId: 'bottle_grab_rule_based_counter_v1',
      modelVersion: BOTTLE_GRAB_REP_COUNTER_VERSION,
    });
  });

  test('requires three consecutive close and three consecutive reopen observations', () => {
    const counter = createBottleGrabRuleBasedRepCounter();
    counter.setCountingEnabled(true);
    let timestampMs = 0;
    for (let i = 0; i < 3; i += 1) {
      timestampMs += 67;
      push(counter, timestampMs, hand({ closed: false }));
    }
    for (let i = 0; i < 2; i += 1) {
      timestampMs += 67;
      expect(push(counter, timestampMs, hand({ closed: true })).repCount).toBe(0);
    }
    timestampMs += 67;
    push(counter, timestampMs, hand({ closed: false }));
    for (let i = 0; i < 2; i += 1) {
      timestampMs += 67;
      expect(push(counter, timestampMs, hand({ closed: false })).repCount).toBe(0);
    }
  });

  test('rejects the wrong anatomical side and does not bridge a long missing-hand gap', () => {
    const counter = createBottleGrabRuleBasedRepCounter();
    counter.setCountingEnabled(true);
    let timestampMs = 0;
    for (let i = 0; i < 3; i += 1) {
      timestampMs += 67;
      push(counter, timestampMs, hand({ closed: false }));
    }
    timestampMs += 67;
    const wrongSide = push(counter, timestampMs, hand({ closed: true }), 'Right');
    expect(wrongSide).toMatchObject({
      status: 'cannot_assess',
      reason: 'wrong_anatomical_side',
      repCount: 0,
    });

    timestampMs += 500;
    const missing = counter.push({
      poseLandmarks: pose(),
      handLandmarks: null,
      handSide: null,
      handScore: 0,
      timestampMs,
      countingEnabled: true,
    });
    expect(missing).toMatchObject({
      status: 'cannot_assess',
      reason: 'missing_hand',
      repCount: 0,
    });
  });

  test('surfaces the experimental counter in the session snapshot and summary', () => {
    const exercise = getExercise('bottle_grab');
    const events = [];
    const tracker = {
      reset: jest.fn(),
      push: jest.fn(() => ({
        status: 'armed',
        repCount: 1,
        repCounterDidComplete: true,
        modelId: 'bottle_grab_rule_wrap_hybrid_v1_baseline_4',
        modelVersion: '1.9.0-dev-calibration-3-rule-wrap-hybrid-1',
        decisionScope: 'development_rule_wrap_hybrid_preview',
      })),
    };
    const session = createSession({
      exercise,
      source: 'live',
      bottlePhaseTracker: tracker,
      onEvent: (event) => events.push(event.type),
    });

    const snapshot = session.pushFrame(makePose(exercise.primaryJoint, exercise.target), 1 / 15, true, {
      boundary: { status: 'inside' },
      handFrame: {
        landmarks: hand({ closed: false }),
        side: 'Left',
        score: 0.99,
        timestampMs: 67,
      },
    });

    expect(snapshot.reps).toBe(1);
    expect(snapshot.experimental).toMatchObject({
      repCount: 1,
      repCounterDidComplete: true,
    });
    expect(events).toContain('rep');
    expect(session.finishSummary()).toMatchObject({ reps: 1, validReps: 1 });
  });
});
