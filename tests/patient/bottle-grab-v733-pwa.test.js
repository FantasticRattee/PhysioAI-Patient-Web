import {
  BOTTLE_GRAB_V7_PWA_DIAGNOSTICS_VERSION,
  BOTTLE_GRAB_V7_PWA_DIAGNOSTIC_STATUS,
  createBottleDetectorDiagnosticsV733,
} from '../../Patient/src/ai/bottleGrab/v7/BottleDetectorDiagnosticsV733.js';
import { createBottleGrabV7PwaTracker } from '../../Patient/src/ai/bottleGrab/BottleGrabV7PwaTracker.js';

jest.mock('react-native', () => ({
  Image: { resolveAssetSource: () => ({ uri: 'http://localhost/phasenet.f32' }) },
}), { virtual: true });
jest.mock('../../Patient/assets/models/phasenet_v2_browser_weights.f32', () => 1);

function pose({ inZone = false } = {}) {
  const points = Array.from({ length: 33 }, () => ({ x: 0.8, y: 0.8, z: 0, visibility: 0.98 }));
  const x = inZone ? 0.5 : 0.8;
  for (const index of [15, 19, 17, 21]) points[index] = { x, y: 0.5, z: 0, visibility: 0.98 };
  return points;
}

function detection({ timestampMs = 0, score = 0.9, x = 0.45, label = 'bottle', sourceGeneration = 1 } = {}) {
  return {
    sourceGeneration,
    timestampMs,
    label,
    score,
    boundingBox: { x, y: 0.45, width: 0.1, height: 0.1 },
  };
}

describe('Bottle Grab PWA V7.3.3 detector diagnostics', () => {
  test('reports waiting, raw/accepted candidates, fresh ROI, and counter evidence', () => {
    const diagnostics = createBottleDetectorDiagnosticsV733();

    expect(diagnostics.update({ timestampMs: 0, sourceGeneration: 1, detectorState: 'waiting' })).toMatchObject({
      status: BOTTLE_GRAB_V7_PWA_DIAGNOSTIC_STATUS.DETECTOR_WAITING,
      rawCandidateCount: 0,
      acceptedCandidateCount: 0,
      sourceGeneration: 1,
    });

    const selected = detection({ timestampMs: 100 });
    const output = diagnostics.update({
      timestampMs: 150,
      sourceGeneration: 1,
      detectorState: 'ready',
      detections: [selected],
      selection: { detection: selected, reason: 'bottle_selected', candidateCount: 1 },
      counter: { status: 'inside_bottle_zone', reason: 'inside_zone' },
    });

    expect(output).toMatchObject({
      version: BOTTLE_GRAB_V7_PWA_DIAGNOSTICS_VERSION,
      status: BOTTLE_GRAB_V7_PWA_DIAGNOSTIC_STATUS.DETECTED,
      rawCandidateCount: 1,
      acceptedCandidateCount: 1,
      topLabel: 'bottle',
      topScore: 0.9,
      sourceGeneration: 1,
      selectionReason: 'bottle_selected',
      roi: expect.objectContaining({ ageMs: 50, fresh: true, boundingBox: selected.boundingBox }),
      counter: { stage: 'inside_bottle_zone', reason: 'inside_zone' },
    });
  });

  test('distinguishes ambiguity, stale ROI, source change, and detector error', () => {
    const diagnostics = createBottleDetectorDiagnosticsV733();
    const first = detection({ timestampMs: 100 });
    diagnostics.update({
      timestampMs: 100,
      sourceGeneration: 1,
      detectorState: 'ready',
      detections: [first],
      selection: { detection: first, reason: 'bottle_selected', candidateCount: 1 },
    });

    expect(diagnostics.update({
      timestampMs: 120,
      sourceGeneration: 1,
      detectorState: 'ready',
      detections: [first, detection({ timestampMs: 120, score: 0.91, x: 0.1 })],
      selection: { detection: null, reason: 'bottle_ambiguous', candidateCount: 2 },
    })).toMatchObject({
      status: BOTTLE_GRAB_V7_PWA_DIAGNOSTIC_STATUS.AMBIGUOUS,
      rawCandidateCount: 2,
      acceptedCandidateCount: 2,
      selectionReason: 'bottle_ambiguous',
    });

    expect(diagnostics.update({
      timestampMs: 100 + 350 + 1,
      sourceGeneration: 1,
      detectorState: 'ready',
      detections: [],
      selection: { detection: first, reason: 'bottle_selected', candidateCount: 1 },
    })).toMatchObject({
      status: BOTTLE_GRAB_V7_PWA_DIAGNOSTIC_STATUS.STALE,
      roi: expect.objectContaining({ ageMs: 351, fresh: false }),
    });

    expect(diagnostics.update({
      timestampMs: 500,
      sourceGeneration: 2,
      detectorState: 'ready',
      detections: [],
      selection: { detection: null, reason: 'bottle_missing', candidateCount: 0 },
    })).toMatchObject({
      status: BOTTLE_GRAB_V7_PWA_DIAGNOSTIC_STATUS.SOURCE_CHANGED,
      sourceGeneration: 2,
    });

    expect(diagnostics.update({
      timestampMs: 550,
      sourceGeneration: 2,
      detectorState: 'error',
      detectorError: 'object detector unavailable',
    })).toMatchObject({
      status: BOTTLE_GRAB_V7_PWA_DIAGNOSTIC_STATUS.ERROR,
      error: 'object detector unavailable',
    });
  });

  test('tracker exposes V7.3.3 diagnostics while keeping proximity counter authoritative', () => {
    const tracker = createBottleGrabV7PwaTracker();
    const selected = detection({ timestampMs: 67 });
    const output = tracker.push({
      poseLandmarks: pose(),
      bottleDetection: selected,
      bottleDiagnostics: {
        detectorState: 'ready',
        detections: [selected],
        selection: { detection: selected, reason: 'bottle_selected', candidateCount: 1 },
      },
      timestampMs: 67,
      sourceGeneration: 1,
      countingEnabled: true,
    });

    expect(output).toMatchObject({
      modelVersion: '1.0.0-dev-v7-3-3-diagnostics',
      bottleStatus: BOTTLE_GRAB_V7_PWA_DIAGNOSTIC_STATUS.DETECTED,
      bottleDiagnosticsStatus: BOTTLE_GRAB_V7_PWA_DIAGNOSTIC_STATUS.DETECTED,
      bottleRawCandidateCount: 1,
      bottleAcceptedCandidateCount: 1,
      bottleSelectionReason: 'bottle_selected',
      bottleCounterStage: expect.any(String),
      bottleDiagnosticsVersion: BOTTLE_GRAB_V7_PWA_DIAGNOSTICS_VERSION,
      counterMode: 'bottle_detector_proximity',
    });
    expect(output.bottleDiagnostics.counter).toEqual(expect.objectContaining({
      stage: expect.any(String),
    }));
  });
});
