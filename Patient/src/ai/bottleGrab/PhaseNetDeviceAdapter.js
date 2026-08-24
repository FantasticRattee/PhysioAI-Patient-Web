// Experimental on-device adapter for the frozen Bottle Grab PhaseNet V2 bundle.
//
// This model is phase-only and train-only. It must never be used to emit a form
// score, fault flag, rep decision, or clinical cue. In App V6 it is a parallel
// advisory phase context stream; Geometry First owns the experimental repetition
// boundary while this adapter exposes latency, capture-QC, and phase status.

import { Image } from 'react-native';
import {
  buildPhaseNetV2FeatureFrame,
  createPhaseNetV2WindowAccumulator,
} from './phasenet_v2_features.mjs';
import { loadPhaseNetV2RuntimeForDevice } from './phasenet_v2_runtime.mjs';

const CONTRACT = require('./phasenet_v2_browser_runtime.contract.json');
const WEIGHTS = require('../../../assets/models/phasenet_v2_browser_weights.f32');
const LIVE_SOURCE_SHA256 = '0000000000000000000000000000000000000000000000000000000000000001';

let runtimePromise;

async function loadRuntime() {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const resolved = Image.resolveAssetSource(WEIGHTS);
      if (!resolved?.uri) throw new Error('PhaseNet weight asset URI is unavailable');
      const response = await fetch(resolved.uri);
      if (!response.ok) throw new Error(`PhaseNet weight asset request failed: ${response.status}`);
      const bytes = await response.arrayBuffer();
      return loadPhaseNetV2RuntimeForDevice({ contract: CONTRACT, weightBytes: bytes });
    })();
  }
  return runtimePromise;
}

export function preloadBottleGrabPhaseNet() {
  return loadRuntime();
}

export function createBottleGrabPhaseTracker() {
  const accumulator = createPhaseNetV2WindowAccumulator();
  let previousRow = null;
  let runtime = null;
  let loadError = null;
  loadRuntime().then((loaded) => { runtime = loaded; }).catch((error) => { loadError = error; });

  function push({ poseLandmarks, handLandmarks, timestampMs, handSide, handScore }) {
    const timestamp = Number.isFinite(Number(timestampMs)) ? Number(timestampMs) : Date.now();
    let row;
    try {
      row = buildPhaseNetV2FeatureFrame({
        sourceFileSha256: LIVE_SOURCE_SHA256,
        sourceTimestampMs: timestamp,
        poseTimestampMs: timestamp,
        handTimestampMs: timestamp,
        anatomicalSide: 'left',
        poseLandmarks,
        handLandmarks,
        detectedHandSide: handSide,
        detectedHandScore: Number.isFinite(Number(handScore)) ? Number(handScore) : 0,
        previousRow,
      });
    } catch (error) {
      previousRow = null;
      accumulator.reset('feature_adapter_error');
      return { status: 'cannot_assess', reason: 'feature_adapter_error', error: String(error?.message || error) };
    }

    if (row.captureQc === 'can_assess') previousRow = row;
    const buffered = accumulator.push(row);
    const base = {
      ...buffered,
      captureQc: row.captureQc,
      modelStatus: loadError ? 'unavailable_fallback' : runtime ? 'experimental_loaded' : 'loading',
      decisionScope: 'phase_only',
      sourceType: 'camera_live_device_test',
    };
    if (buffered.status !== 'window_ready') return base;
    if (!runtime) return { ...base, status: 'window_ready_model_loading' };
    try {
      const prediction = runtime.predict(buffered.window);
      return {
        ...base,
        status: 'phase_ready',
        phase: prediction.phase,
        probabilities: Array.from(prediction.probabilities),
        modelId: prediction.modelId,
        endpointTimestampMs: buffered.endpointTimestampMs,
      };
    } catch (error) {
      return { ...base, status: 'phase_error', reason: 'inference_error', error: String(error?.message || error) };
    }
  }

  function reset(reason) {
    previousRow = null;
    accumulator.reset(reason || 'explicit_reset');
  }

  return {
    push,
    reset,
    get bufferedFrameCount() { return accumulator.bufferedFrameCount; },
    get modelStatus() { return loadError ? 'unavailable_fallback' : runtime ? 'experimental_loaded' : 'loading'; },
  };
}
