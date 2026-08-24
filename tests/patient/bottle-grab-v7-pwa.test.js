import {
  BOTTLE_GRAB_V7_COUNTER_MODE,
  BOTTLE_GRAB_V7_DETECTOR_CONTRACT,
  createBottleProximityCounter,
  normalizeBottleDetections,
  selectBottleDetection,
} from '../../Patient/src/ai/bottleGrab/v7/BottleDetectionV7.js';
jest.mock('react-native', () => ({
  Image: { resolveAssetSource: () => ({ uri: 'http://localhost/phasenet.f32' }) },
}), { virtual: true });
jest.mock('../../Patient/assets/models/phasenet_v2_browser_weights.f32', () => 1);
import { createBottleGrabV7PwaTracker } from '../../Patient/src/ai/bottleGrab/BottleGrabV7PwaTracker.js';

function pose({ inZone = false } = {}) {
  const points = Array.from({ length: 33 }, () => ({ x: 0.8, y: 0.8, z: 0, visibility: 0.98 }));
  const x = inZone ? 0.5 : 0.8;
  for (const index of [15, 19, 17, 21]) points[index] = { x, y: 0.5, z: 0, visibility: 0.98 };
  return points;
}

function detection({ timestampMs = 0, score = 0.9, x = 0.45 } = {}) {
  return {
    sourceGeneration: 1,
    timestampMs,
    label: 'bottle',
    score,
    boundingBox: { x, y: 0.45, width: 0.1, height: 0.1 },
  };
}

describe('App V7 PWA bottle detector and Pose-proximity counter', () => {
  test('selects a fresh bottle and rejects stale, low-score, and ambiguous boxes', () => {
    expect(selectBottleDetection({
      detections: [detection({ timestampMs: 100 })],
      sourceGeneration: 1,
      timestampMs: 200,
    })).toMatchObject({ reason: 'bottle_selected', candidateCount: 1 });

    expect(selectBottleDetection({
      detections: [detection({ timestampMs: 100 })],
      sourceGeneration: 1,
      timestampMs: 100 + BOTTLE_GRAB_V7_DETECTOR_CONTRACT.maximumDetectionAgeMs + 1,
    })).toMatchObject({ detection: null, reason: 'bottle_missing' });

    expect(selectBottleDetection({
      detections: [detection({ timestampMs: 100, score: 0.4 }), detection({ timestampMs: 100, score: 0.41, x: 0.1 })],
      sourceGeneration: 1,
      timestampMs: 110,
    })).toMatchObject({ detection: null, reason: 'bottle_ambiguous' });
  });

  test('normalizes MediaPipe ObjectDetector originX/originY boxes into the V7 contract', () => {
    expect(normalizeBottleDetections({ detections: [{
      categories: [{ categoryName: 'bottle', score: 0.88 }],
      boundingBox: { originX: 0.4, originY: 0.4, width: 0.2, height: 0.2 },
    }] }, { sourceGeneration: 7, timestampMs: 700 })).toEqual([expect.objectContaining({
      sourceGeneration: 7,
      timestampMs: 700,
      label: 'bottle',
      score: 0.88,
      boundingBox: { x: 0.4, y: 0.4, width: 0.2, height: 0.2 },
    })]);

    expect(normalizeBottleDetections({ detections: [{
      categories: [{ categoryName: 'bottle', score: 0.88 }],
      boundingBox: { originX: 640, originY: 180, width: 128, height: 180 },
    }] }, { sourceGeneration: 7, timestampMs: 700, imageWidth: 1280, imageHeight: 720 })).toEqual([expect.objectContaining({
      boundingBox: { x: 0.5, y: 0.25, width: 0.1, height: 0.25 },
    })]);
  });

  test('counts Pose-only outside → inside → outside without a Hand stream', () => {
    const counter = createBottleProximityCounter();
    counter.setCountingEnabled(true);
    let timestampMs = 0;
    let output;
    for (let i = 0; i < 3; i += 1) {
      timestampMs += 67;
      output = counter.push({ poseLandmarks: pose({ inZone: false }), bottleDetection: detection({ timestampMs }), timestampMs, sourceGeneration: 1 });
    }
    for (let i = 0; i < 3; i += 1) {
      timestampMs += 67;
      output = counter.push({ poseLandmarks: pose({ inZone: true }), bottleDetection: detection({ timestampMs }), timestampMs, sourceGeneration: 1 });
    }
    for (let i = 0; i < 3; i += 1) {
      timestampMs += 67;
      output = counter.push({ poseLandmarks: pose({ inZone: false }), bottleDetection: detection({ timestampMs }), timestampMs, sourceGeneration: 1 });
    }
    expect(output).toMatchObject({
      counterMode: BOTTLE_GRAB_V7_COUNTER_MODE,
      totalCycles: 1,
      didCompleteCycle: true,
      status: 'armed_outside_zone',
    });
  });

  test('stale detection cannot count and source reset retains completed totals', () => {
    const counter = createBottleProximityCounter();
    counter.setCountingEnabled(true);
    let timestampMs = 0;
    const push = (inZone, withBottle = true) => {
      timestampMs += 67;
      return counter.push({
        poseLandmarks: pose({ inZone }),
        bottleDetection: withBottle ? detection({ timestampMs }) : null,
        timestampMs,
        sourceGeneration: 1,
      });
    };
    for (let i = 0; i < 3; i += 1) push(false);
    for (let i = 0; i < 3; i += 1) push(true);
    for (let i = 0; i < 3; i += 1) push(false);
    counter.resetForNewCaptureSource('camera_retry');
    const output = push(false, false);
    expect(output.totalCycles).toBe(1);
    expect(output.reason).toBe('bottle_missing');
  });

  test('V7 tracker counts without Hand and preserves PhaseNet as context only', () => {
    const tracker = createBottleGrabV7PwaTracker();
    tracker.push({ poseLandmarks: pose({ inZone: false }), bottleDetection: detection({ timestampMs: 67 }), timestampMs: 67, sourceGeneration: 1, countingEnabled: true });
    tracker.push({ poseLandmarks: pose({ inZone: true }), bottleDetection: detection({ timestampMs: 134 }), timestampMs: 134, sourceGeneration: 1, countingEnabled: true });
    tracker.push({ poseLandmarks: pose({ inZone: true }), bottleDetection: detection({ timestampMs: 201 }), timestampMs: 201, sourceGeneration: 1, countingEnabled: true });
    tracker.push({ poseLandmarks: pose({ inZone: true }), bottleDetection: detection({ timestampMs: 268 }), timestampMs: 268, sourceGeneration: 1, countingEnabled: true });
    tracker.push({ poseLandmarks: pose({ inZone: false }), bottleDetection: detection({ timestampMs: 335 }), timestampMs: 335, sourceGeneration: 1, countingEnabled: true });
    tracker.push({ poseLandmarks: pose({ inZone: false }), bottleDetection: detection({ timestampMs: 402 }), timestampMs: 402, sourceGeneration: 1, countingEnabled: true });
    const output = tracker.push({ poseLandmarks: pose({ inZone: false }), bottleDetection: detection({ timestampMs: 469 }), timestampMs: 469, sourceGeneration: 1, countingEnabled: true });

    expect(output).toMatchObject({
      modelId: 'bottle_grab_v7',
      counterMode: 'bottle_detector_proximity',
      experimentalProximityCount: 1,
      repCount: 1,
      fingerQualityStatus: 'finger_quality_unavailable',
      phaseContextAvailable: false,
    });
  });
});
