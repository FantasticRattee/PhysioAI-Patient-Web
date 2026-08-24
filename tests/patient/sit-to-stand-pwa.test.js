import {
  SIT_TO_STAND_FEATURE_NAMES,
  SIT_TO_STAND_FEATURE_COUNT,
  createSitToStandFeatureExtractor,
} from '../../Patient/src/ai/sitToStand/SitToStandFeatureExtractor.js';
import fs from 'fs';
import path from 'path';
import { createSitToStandGeometryCounter } from '../../Patient/src/ai/sitToStand/SitToStandGeometryCounter.js';
import { createSitToStandPhaseNet, createSitToStandPhaseCommentEngine, WEIGHT_LENGTHS } from '../../Patient/src/ai/sitToStand/SitToStandPhaseNet.js';
import { createSitToStandPwaTracker } from '../../Patient/src/ai/sitToStand/SitToStandPwaTracker.js';

function pose({ height = 1.2, visibility = 0.98 } = {}) {
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility }));
  const set = (index, x, y, z = 0) => { points[index] = { x, y, z, visibility }; };
  set(0, 0.5, 0.2);
  set(11, 0.4, 0.3); set(12, 0.6, 0.3);
  set(13, 0.35, 0.45); set(14, 0.65, 0.45);
  set(15, 0.3, 0.55); set(16, 0.7, 0.55);
  set(23, 0.4, 0.6); set(24, 0.6, 0.6);
  set(25, 0.4, 0.6 + height * 0.05); set(26, 0.6, 0.6 + height * 0.05);
  set(27, 0.4, 0.6 + height * 0.05 + 0.4); set(28, 0.6, 0.6 + height * 0.05 + 0.4);
  set(31, 0.35, 0.6 + height * 0.05 + 0.45); set(32, 0.65, 0.6 + height * 0.05 + 0.45);
  return points;
}

describe('Sit-to-Stand PWA experimental pure runtime', () => {
  test('extractor produces the native 30-feature order and rejects mirror/missing input', () => {
    const extractor = createSitToStandFeatureExtractor();
    const first = extractor.extract({ timestampMs: 0, sourceGeneration: 1, inputIsMirrored: false, poseLandmarks: pose() });
    expect(first).toMatchObject({ featureReady: true, reason: null });
    expect(first.featureVector).toHaveLength(SIT_TO_STAND_FEATURE_COUNT);
    expect(SIT_TO_STAND_FEATURE_NAMES[0]).toBe('pelvis_height_above_ankles_norm');
    expect(extractor.extract({ timestampMs: 67, sourceGeneration: 1, inputIsMirrored: true, poseLandmarks: pose() })).toMatchObject({ featureReady: false, reason: 'source_mirrored' });
    expect(extractor.extract({ timestampMs: 134, sourceGeneration: 1, inputIsMirrored: false, poseLandmarks: pose({ visibility: 0.1 }) })).toMatchObject({ featureReady: false, reason: 'pose_only_capture_qc_failed' });
  });

  test('geometry counter owns repetition count and completes seated → stand → seated', () => {
    const counter = createSitToStandGeometryCounter();
    counter.setCountingEnabled(true);
    const push = (height, timestampMs) => counter.ingest({ pelvisHeightAboveAnklesNorm: height, timestampMs });
    push(0.65, 0); push(0.66, 67); push(0.65, 134); push(0.65, 2500);
    push(0.8, 2570); push(1.1, 2640); push(1.2, 2707); push(1.2, 2774); push(0.9, 2841); push(0.65, 2908); push(0.65, 2975);
    expect(counter.totalReps).toBe(1);
    expect(counter.lastResult).toMatchObject({ repetitionCompleted: true, totalReps: 1 });
  });

  test('new-session reset clears completed geometry totals while source reset is partial only', () => {
    const counter = createSitToStandGeometryCounter();
    counter.setCountingEnabled(true);
    const push = (height, timestampMs) => counter.ingest({ pelvisHeightAboveAnklesNorm: height, timestampMs });
    push(0.65, 0); push(0.66, 67); push(0.65, 134); push(0.65, 2500);
    push(0.8, 2570); push(1.1, 2640); push(1.2, 2707); push(1.2, 2774); push(0.9, 2841); push(0.65, 2908); push(0.65, 2975);
    expect(counter.totalReps).toBe(1);
    counter.resetForNewCaptureSource();
    expect(counter.totalReps).toBe(1);
    counter.reset();
    expect(counter.totalReps).toBe(0);
    expect(counter.state).toBe('awaiting_seated_baseline');
  });

  test('phase/comment path is independent and explicit when weights are unavailable', () => {
    const phaseNet = createSitToStandPhaseNet();
    expect(phaseNet.predict(Array.from({ length: 30 }, () => Array(30).fill(0)))).toMatchObject({ status: 'model_unavailable', phase: null });
    const engine = createSitToStandPhaseCommentEngine({ phaseNet });
    const frame = { featureVector: Array(30).fill(0), featureReady: true, timestampMs: 0, sourceGeneration: 1, pelvisHeightAboveAnklesNorm: 0.65, reason: null };
    let output;
    for (let i = 0; i < 30; i += 1) output = engine.ingest(frame);
    expect(output).toMatchObject({ status: 'model_unavailable', commentStatus: 'model_unavailable' });
  });

  test('injected Float32 weights execute the causal TCN without faking probabilities', () => {
    const weights = Object.fromEntries(Object.entries(WEIGHT_LENGTHS).map(([key, length]) => [key, new Float32Array(length)]));
    weights.classifierBias[0] = 1;
    const runtime = createSitToStandPhaseNet({ weights });
    const output = runtime.predict(Array.from({ length: 30 }, () => Array(30).fill(0)));
    expect(output).toMatchObject({ status: 'ready', phase: 'seated_rest', argmaxIndex: 0 });
    expect(output.probabilities[0]).toBeGreaterThan(output.probabilities[1]);
  });

  test('matches every model-owned golden window when the export bundle is present', () => {
    const bundle = path.resolve(__dirname, '../../../..', 'models/AI_Models/NN_ExerciseClassifier/experiments/sit_to_stand_pose_only_v1/integration_bundle');
    const weightFiles = {
      d1Kernel: 'causal_tcn_dilation_1__0.f32', d1Bias: 'causal_tcn_dilation_1__1.f32',
      projectionKernel: 'residual_projection__0.f32', projectionBias: 'residual_projection__1.f32',
      d2Kernel: 'causal_tcn_dilation_2__0.f32', d2Bias: 'causal_tcn_dilation_2__1.f32',
      d4Kernel: 'causal_tcn_dilation_4__0.f32', d4Bias: 'causal_tcn_dilation_4__1.f32',
      classifierKernel: 'phase_probabilities__0.f32', classifierBias: 'phase_probabilities__1.f32',
    };
    const weights = Object.fromEntries(Object.entries(weightFiles).map(([key, file]) => {
      const bytes = fs.readFileSync(path.join(bundle, 'artifacts/weights', file));
      return [key, new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))];
    }));
    const golden = JSON.parse(fs.readFileSync(path.join(bundle, 'golden/sit_to_stand_phasenet_v1_golden.json'), 'utf8'));
    const runtime = createSitToStandPhaseNet({ weights });
    golden.cases.forEach((expected) => {
      const output = runtime.predict(expected.input);
      expect(output.status).toBe('ready');
      expect(output.phase).toBe(expected.python.class);
      output.probabilities.forEach((probability, index) => {
        expect(probability).toBeCloseTo(expected.python.probabilities[index], 5);
      });
    });
  });

  test('tracker keeps geometry count and phase context parallel', () => {
    const tracker = createSitToStandPwaTracker({ phaseNet: createSitToStandPhaseNet() });
    tracker.setCountingEnabled(true);
    const output = tracker.push({ timestampMs: 0, sourceGeneration: 1, inputIsMirrored: false, poseLandmarks: pose() });
    expect(output).toMatchObject({ moduleId: 'sit_to_stand_pwa_v7_3_3_experimental', counterMode: 'parallel_geometry_counter', geometryTotalReps: 0 });
    expect(output.phaseStatus).toBe('buffering');
  });
});
