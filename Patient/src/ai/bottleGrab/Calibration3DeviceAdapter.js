// Development-only device preview for Bottle Grab Calibration 3 Baseline #3.
//
// The frozen model source is copied byte-for-byte under ./calibration3. This
// adapter is the App seam: it joins live Pose + Hand frames, derives the same
// measurement IDs used by the research replay, keeps a short rolling phrase
// window, and calls the exact V1.9 Calibration 3 entrypoint. It deliberately
// does not count repetitions or turn a tentative cue into a clinical verdict.

import { createBottleGrabPhaseTracker } from './PhaseNetDeviceAdapter.js';
import {
  applyBottleGrabRestReference,
  buildBottleGrabCommentObservation,
  deriveBottleGrabRestReference,
} from './calibration3/bottle_grab_comment_measurements.mjs';
import { evaluateBottleGrabModelModuleV1_9Calibration3 } from './calibration3/bottle_grab_fault_engine_bundle_v1_9_calibration_3.mjs';

const PROFILE = require('./calibration3/calibration3_normal_profile.json');
export const CALIBRATION_3_CONTRACT = require('./calibration3/calibration3_device_preview.contract.json');

export const CALIBRATION_3_MODEL_ID = CALIBRATION_3_CONTRACT.modelModuleId;
export const CALIBRATION_3_MODEL_VERSION = CALIBRATION_3_CONTRACT.modelVersion;
export const CALIBRATION_3_DECISION_SCOPE = 'development_fault_cue_preview';
export const CALIBRATION_3_PROFILE_SHA256 = CALIBRATION_3_CONTRACT.profileSha256;

const MAX_WINDOW_FRAMES = 90; // six seconds at the frozen 15 Hz capture cadence
const MIN_EVALUATION_FRAMES = 15;
const EVALUATE_EVERY_FRAMES = 3;

// Hermes versions used by older native dev clients may not expose the ES2023
// non-mutating sort helpers. The research source uses toSorted; this shim keeps
// its semantics without changing the frozen source files or mutating inputs.
function ensureArrayCopyHelpers() {
  if (!Array.prototype.toSorted) {
    Object.defineProperty(Array.prototype, 'toSorted', {
      configurable: true,
      value(compareFn) { return Array.from(this).sort(compareFn); },
    });
  }
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function quantile(values, probability) {
  const ordered = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
  if (!ordered.length) return null;
  const index = (ordered.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return ordered[lower];
  return ordered[lower] + ((ordered[upper] - ordered[lower]) * (index - lower));
}

function finitePoint(point) {
  return point
    && finite(point.x)
    && finite(point.y)
    && finite(point.z ?? 0);
}

function distance2d(a, b) {
  return Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
}

function addShoulderEarMeasurement(observation, poseLandmarks) {
  const points = poseLandmarks || [];
  const shoulder = points[11];
  const ear = points[7];
  const leftShoulder = points[11];
  const rightShoulder = points[12];
  const leftHip = points[23];
  const rightHip = points[24];
  if (![shoulder, ear, leftShoulder, rightShoulder, leftHip, rightHip].every(finitePoint)) {
    return observation;
  }
  const shoulderMid = {
    x: (Number(leftShoulder.x) + Number(rightShoulder.x)) / 2,
    y: (Number(leftShoulder.y) + Number(rightShoulder.y)) / 2,
  };
  const hipMid = {
    x: (Number(leftHip.x) + Number(rightHip.x)) / 2,
    y: (Number(leftHip.y) + Number(rightHip.y)) / 2,
  };
  const torsoScale = distance2d(shoulderMid, hipMid);
  if (!(torsoScale > 1e-9)) return observation;
  return {
    ...observation,
    measurements: {
      ...observation.measurements,
      working_shoulder_to_ear_distance_torso: {
        value: distance2d(shoulder, ear) / torsoScale,
        unit: 'torso_ratio',
        source: 'pose_image',
        assessability: 'can_assess',
      },
    },
  };
}

const HAND_FEATURES = [
  'mean_finger_flexion',
  'thumb_index_aperture',
  'index_mcp_flexion',
  'index_pip_flexion',
  'index_dip_flexion',
];

function summaryFor(frames) {
  const values = (measurementId) => frames
    .map((frame) => frame?.measurements?.[measurementId])
    .filter((measurement) => measurement?.assessability === 'can_assess' && finite(measurement.value))
    .map((measurement) => Number(measurement.value));
  const triplet = (measurementId) => {
    const list = values(measurementId);
    return {
      p10: quantile(list, 0.1),
      p50: quantile(list, 0.5),
      p90: quantile(list, 0.9),
    };
  };
  const hand = {};
  HAND_FEATURES.forEach((id) => {
    const q = triplet(id);
    hand[`${id}_p10`] = q.p10;
    hand[`${id}_p50`] = q.p50;
    hand[`${id}_p90`] = q.p90;
  });
  const shoulderDelta = triplet('working_shoulder_elevation_delta_from_rest_torso');
  const shoulderEar = triplet('working_shoulder_to_ear_distance_torso');
  const trunkChange = triplet('trunk_vector_change_from_rest_torso');
  const trunkLean = triplet('trunk_lean');
  const regionSummaries = {
    hand_finger: hand,
    shoulder_upper_arm: {
      shoulder_delta_p10: shoulderDelta.p10,
      shoulder_delta_p50: shoulderDelta.p50,
      shoulder_delta_p90: shoulderDelta.p90,
      shoulder_ear_distance_p10: shoulderEar.p10,
      shoulder_ear_distance_p50: shoulderEar.p50,
      shoulder_ear_distance_p90: shoulderEar.p90,
    },
    trunk: {
      trunk_change_p10: trunkChange.p10,
      trunk_change_p50: trunkChange.p50,
      trunk_change_p90: trunkChange.p90,
      trunk_lean_p10: trunkLean.p10,
      trunk_lean_p50: trunkLean.p50,
      trunk_lean_p90: trunkLean.p90,
    },
  };
  const required = [
    ...HAND_FEATURES,
    'working_shoulder_elevation_delta_from_rest_torso',
    'working_shoulder_to_ear_distance_torso',
    'trunk_vector_change_from_rest_torso',
    'trunk_lean',
  ];
  const assessableFrameCount = frames.filter((frame) => required.every((id) => (
    frame?.measurements?.[id]?.assessability === 'can_assess'
    && finite(frame.measurements[id].value)
  ))).length;
  return { regionSummaries, assessableFrameCount };
}

function summaryIsComplete(summary) {
  return Object.values(summary.regionSummaries).every((region) => (
    Object.values(region).every((value) => finite(value))
  ));
}

function repetitionSummary(frames, startMs, endMs) {
  const summary = summaryFor(frames);
  return {
    clipId: 'live-device-preview',
    sourceLineageGroup: 'live-device-preview',
    label: 'evaluation',
    assessableFrameCount: summary.assessableFrameCount,
    intervalMs: [startMs, endMs],
    regionSummaries: summary.regionSummaries,
  };
}

function contextFor(index, startMs, endMs) {
  return {
    repetitionId: `live-device-preview-${index}`,
    repetitionIndex: index,
    startMs,
    endMs,
    phaseWindowId: `live-device-preview-window-${index}`,
    sourceLineageGroup: 'live-device-preview',
  };
}

function cueSummary(decision) {
  const merged = decision?.mergedDecision;
  if (!merged) return null;
  return {
    deliveryStatus: merged.deliveryStatus,
    primaryCueId: merged.primaryCueId || null,
    primaryObservationTag: merged.primaryObservationTag || null,
    messages: merged.messages || null,
    secondaryObservations: merged.secondaryObservations || [],
    candidates: merged.candidates || [],
    sourceAssessments: merged.sourceAssessments || null,
  };
}

export function createBottleGrabCalibration3Tracker({ phaseTracker: injectedPhaseTracker = null } = {}) {
  ensureArrayCopyHelpers();
  const phaseTracker = injectedPhaseTracker || createBottleGrabPhaseTracker();
  let phase = null;
  let frames = [];
  let restFrames = [];
  let restReference = null;
  let frameIndex = 0;
  let repetitionIndex = 1;
  let windowStartMs = null;
  let lastDecision = null;
  let lastObservation = null;
  let runtimeError = null;

  function push({
    poseLandmarks,
    handLandmarks,
    timestampMs,
    handSide,
    handScore,
    positioning = false,
  } = {}) {
    const timestamp = finite(timestampMs) ? Number(timestampMs) : Date.now();
    const phaseResult = phaseTracker.push({
      poseLandmarks,
      handLandmarks,
      timestampMs: timestamp,
      handSide,
      handScore,
    });
    if (phaseResult?.phase) phase = phaseResult.phase;

    let observation;
    try {
      observation = buildBottleGrabCommentObservation({
        timestampMs: timestamp,
        poseImage: poseLandmarks,
        handImage: handLandmarks,
        detectedHandSide: handSide,
        detectedHandScore: handScore,
        anatomicalSide: 'left',
        restReference,
      });
      observation = addShoulderEarMeasurement(observation, poseLandmarks);
    } catch (error) {
      runtimeError = error;
      observation = {
        timestampMs: timestamp,
        captureQc: 'cannot_assess_measurement_adapter_error',
        assessability: 'cannot_assess',
        measurements: {},
      };
    }

    // Positioning frames form the anonymous rest reference. This reference is
    // derived only from the current device session and never leaves the phone.
    if (!restReference && positioning && observation.captureQc === 'can_assess') {
      const candidate = observation.measurements;
      if (candidate?.working_shoulder_elevation_delta_from_rest_torso?.context) {
        restFrames = [...restFrames, candidate].slice(-15);
        if (restFrames.length >= 3) {
          try {
            restReference = deriveBottleGrabRestReference(restFrames);
          } catch {
            restReference = null;
          }
        }
      }
    }
    if (restReference && observation.captureQc === 'can_assess') {
      try {
        observation = {
          ...observation,
          measurements: applyBottleGrabRestReference(observation.measurements, restReference),
        };
      } catch {
        // Keep the frame but let the engine fail closed on missing relative data.
      }
    }

    if (windowStartMs == null) windowStartMs = timestamp;
    frames = [...frames, { ...observation, phase }].slice(-MAX_WINDOW_FRAMES);
    frameIndex += 1;
    lastObservation = observation;

    if (frameIndex % EVALUATE_EVERY_FRAMES === 0) {
      const summary = summaryFor(frames);
      if (summary.assessableFrameCount >= MIN_EVALUATION_FRAMES && summaryIsComplete(summary)) {
        try {
          lastDecision = evaluateBottleGrabModelModuleV1_9Calibration3({
            frames,
            shoulderProfile: PROFILE,
            shoulderRepetition: repetitionSummary(frames, windowStartMs, timestamp),
            repetitionContext: contextFor(repetitionIndex, windowStartMs, timestamp),
          });
          repetitionIndex += 1;
          windowStartMs = timestamp;
        } catch (error) {
          runtimeError = error;
        }
      }
    }

    const phaseStatus = phaseResult?.status || 'waiting_for_camera_data';
    const phaseContext = {
      status: phaseStatus,
      phase: phaseResult?.phase || phase || null,
      probabilities: phaseResult?.probabilities || null,
      modelId: phaseResult?.modelId || null,
      modelStatus: phaseResult?.modelStatus || null,
      bufferedFrames: phaseResult?.bufferedFrames || 0,
      endpointTimestampMs: phaseResult?.endpointTimestampMs || null,
      reason: phaseResult?.reason || null,
      captureQc: phaseResult?.captureQc || observation.captureQc || null,
      available: phaseStatus === 'phase_ready',
    };
    return {
      ...phaseResult,
      status: lastDecision ? 'fault_decision_ready' : phaseStatus,
      phase: phase || phaseResult?.phase || null,
      phaseContext,
      modelStatus: runtimeError ? 'unavailable_fallback' : 'experimental_loaded',
      modelId: CALIBRATION_3_MODEL_ID,
      modelVersion: CALIBRATION_3_MODEL_VERSION,
      decisionScope: CALIBRATION_3_DECISION_SCOPE,
      captureQc: observation.captureQc,
      bufferedFrames: frames.length,
      restReferenceAvailable: Boolean(restReference),
      faultDecision: cueSummary(lastDecision),
      sourceType: 'camera_live_device_preview',
      error: runtimeError ? String(runtimeError.message || runtimeError) : null,
      measurementFrame: lastObservation,
    };
  }

  function reset(reason = 'explicit_reset') {
    phaseTracker.reset(reason);
    phase = null;
    frames = [];
    restFrames = [];
    restReference = null;
    frameIndex = 0;
    repetitionIndex = 1;
    windowStartMs = null;
    lastDecision = null;
    lastObservation = null;
    runtimeError = null;
  }

  function resetForNewCaptureSource(reason = 'capture_source_replaced') {
    reset(reason);
  }

  return {
    push,
    reset,
    resetForNewCaptureSource,
    get bufferedFrameCount() { return frames.length; },
    get modelStatus() { return runtimeError ? 'unavailable_fallback' : 'experimental_loaded'; },
    modelId: CALIBRATION_3_MODEL_ID,
    modelVersion: CALIBRATION_3_MODEL_VERSION,
    decisionScope: CALIBRATION_3_DECISION_SCOPE,
  };
}
