// Development-only App adapter for Bottle Grab Rule-Wrap Hybrid V1 — Baseline #4.
//
// Baseline #4 is a deterministic wrapper around the frozen Calibration 3
// parent. It does not become a score, form classifier, repetition decision, or
// bottle-contact detector. This adapter exists only for the MacBook-camera web
// preview so the experimental model can be exercised without changing the
// native iPhone Calibration 3 route. App V6 wraps its two outputs explicitly;
// Baseline #4 remains only the cue branch.

import { createBottleGrabCalibration3Tracker } from '../Calibration3DeviceAdapter.js';
import { flexionDegrees } from '../calibration3/bottle_grab_metrics.mjs';
import { createBottleGrabRuleBasedRepCounter } from './BottleGrabRuleBasedRepCounter.js';
import {
  evaluateBottleGrabRuleWrapHybrid,
  RULE_WRAP_EVIDENCE_SCHEMA,
} from './bottle_grab_rule_wrap_hybrid_v1.mjs';

const CONTRACT = require('./rule_wrap_hybrid_device_preview.contract.json');

export const RULE_WRAP_HYBRID_MODEL_ID = CONTRACT.modelModuleId;
export const RULE_WRAP_HYBRID_MODEL_VERSION = CONTRACT.modelVersion;
export const RULE_WRAP_HYBRID_DECISION_SCOPE = 'development_rule_wrap_hybrid_preview';
export const RULE_WRAP_HYBRID_CUE_PREFIX = 'experimental:baseline4';

const HAND_PROFILE = 'front_anatomical_left';
const MAX_HAND_HISTORY = 30;
const MIN_HAND_FRAMES = 5;
const MIN_SCORE = 0.5;
const FINGERS = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};

function finite(value) {
  return Number.isFinite(Number(value));
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value)));
}

function validPoint(point) {
  return point && finite(point.x) && finite(point.y) && finite(point.z ?? 0);
}

function fingerFlexion(landmarks, ids) {
  if (!Array.isArray(landmarks) || !ids.every((id) => validPoint(landmarks[id]))) return null;
  const values = [
    flexionDegrees(landmarks[ids[0]], landmarks[ids[1]], landmarks[ids[2]]),
    flexionDegrees(landmarks[ids[1]], landmarks[ids[2]], landmarks[ids[3]]),
  ].filter(finite);
  return values.length === 2 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function fingerSnapshot(landmarks) {
  return Object.fromEntries(Object.entries(FINGERS).map(([fingerId, ids]) => [
    fingerId,
    fingerFlexion(landmarks, ids),
  ]));
}

function completeFingerSnapshot(snapshot) {
  return Object.values(snapshot).filter(finite).length >= 4;
}

function mean(values) {
  const finiteValues = values.filter(finite).map(Number);
  return finiteValues.length ? finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length : null;
}

function scoreAtLeast(value, threshold, scale) {
  if (!finite(value) || Number(value) < threshold) return 0;
  return clamp(0.75 + (Number(value) - threshold) / scale);
}

function signalPersistence(history, predicate) {
  if (!history.length) return 0;
  return history.filter(predicate).length / history.length;
}

function buildEvidence(history) {
  const current = history[history.length - 1] || {};
  const available = Object.entries(current).filter(([, value]) => finite(value)).map(([id]) => id);
  const thumbAvailable = finite(current.thumb);
  const profileReady = history.length >= MIN_HAND_FRAMES
    && available.length >= 4
    && thumbAvailable;
  const rows = history.map((row) => Object.values(row).filter(finite).map(Number));
  const currentValues = available.map((id) => Number(current[id]));
  const indexMean = Number(current.index);
  const pinkyMean = Number(current.pinky);
  const gap = finite(indexMean) && finite(pinkyMean) ? pinkyMean - indexMean : null;
  const spread = currentValues.length >= 2 ? Math.max(...currentValues) - Math.min(...currentValues) : null;
  const gapPersistence = signalPersistence(history, (row) => (
    finite(row.index) && finite(row.pinky) && Number(row.pinky) - Number(row.index) >= 12
  ));
  const spreadPersistence = signalPersistence(history, (row) => {
    const values = Object.values(row).filter(finite).map(Number);
    return values.length >= 3 && Math.max(...values) - Math.min(...values) >= 10;
  });
  const persistence = Math.min(gapPersistence, spreadPersistence);
  const evidence = {
    schema: RULE_WRAP_EVIDENCE_SCHEMA,
    status: profileReady ? 'can_assess' : 'cannot_assess',
    viewProfile: HAND_PROFILE,
    nativeUnmirrored: true,
    visibleFingerIds: ['thumb', 'index', 'middle', 'ring', 'pinky'],
    fingerEvidence: Object.fromEntries(Object.keys(FINGERS).map((fingerId) => [
      fingerId,
      finite(current[fingerId])
        ? { status: 'available', value: Number(current[fingerId]) }
        : { status: 'missing' },
    ])),
    persistence,
    independentSignals: [
      {
        signalId: 'pinky_index_gap',
        score: scoreAtLeast(gap, 12, 24),
        persistence: gapPersistence,
      },
      {
        signalId: 'visible_finger_spread',
        score: scoreAtLeast(spread, 10, 20),
        persistence: spreadPersistence,
      },
    ],
    labelsUsedByEngine: false,
    rawLandmarksPersisted: false,
    metadata: {
      historyFrames: history.length,
      assessableFingerCount: available.length,
      meanFlexion: mean(rows.flat()),
    },
  };
  return evidence;
}

function cueSummary(decision) {
  if (!decision) return null;
  return {
    deliveryStatus: decision.deliveryStatus,
    primaryCueId: decision.primaryCueId || null,
    primaryObservationTag: decision.primaryObservationTag || null,
    messages: decision.messages || null,
    secondaryObservations: decision.secondaryObservations || [],
    candidates: decision.candidates || [],
    sourceAssessments: decision.ruleEvidence || null,
  };
}

export function createBottleGrabRuleWrapHybridTracker({ phaseTracker = null, disableRepCounter = false } = {}) {
  const parentTracker = createBottleGrabCalibration3Tracker({ phaseTracker });
  const repCounter = disableRepCounter ? null : createBottleGrabRuleBasedRepCounter();
  let handHistory = [];
  let lastDecision = null;
  let lastParent = null;
  let runtimeError = null;

  function push({
    poseLandmarks,
    handLandmarks,
    timestampMs,
    handSide,
    handScore,
    positioning = false,
    countingEnabled = false,
  } = {}) {
    const timestamp = finite(timestampMs) ? Number(timestampMs) : Date.now();
    lastParent = parentTracker.push({
      poseLandmarks,
      handLandmarks,
      timestampMs: timestamp,
      handSide,
      handScore,
      positioning,
    });
    const repCounterResult = repCounter?.push({
        poseLandmarks,
        handLandmarks,
        timestampMs: timestamp,
        handSide,
        handScore,
        countingEnabled,
      }) || null;

    if (handSide === 'Left' && Number(handScore) >= MIN_SCORE && Array.isArray(handLandmarks)) {
      const row = fingerSnapshot(handLandmarks);
      if (completeFingerSnapshot(row)) handHistory = [...handHistory, row].slice(-MAX_HAND_HISTORY);
    }

    if (handHistory.length >= MIN_HAND_FRAMES) {
      try {
        const ruleEvidence = buildEvidence(handHistory);
        lastDecision = evaluateBottleGrabRuleWrapHybrid({
          calibrationDecision: lastParent?.faultDecision || null,
          ruleEvidence,
          repetitionContext: {
            sourceLineageGroup: 'camera-macbook-web-preview',
            repetitionId: 'live-device-preview',
            sourceType: 'camera_macbook_web_preview',
          },
          preserveParentFingerOnUnqualified: true,
        });
      } catch (error) {
        runtimeError = error;
      }
    }

    const status = runtimeError
      ? 'unavailable_fallback'
      : lastDecision?.deliveryStatus === 'tentative_not_final'
        ? 'fault_decision_ready'
        : lastParent?.status || 'waiting_for_camera_data';
    return {
      ...lastParent,
      status,
      modelStatus: runtimeError ? 'unavailable_fallback' : 'experimental_loaded',
      modelId: RULE_WRAP_HYBRID_MODEL_ID,
      modelVersion: RULE_WRAP_HYBRID_MODEL_VERSION,
      decisionScope: RULE_WRAP_HYBRID_DECISION_SCOPE,
      cuePrefix: RULE_WRAP_HYBRID_CUE_PREFIX,
      faultDecision: cueSummary(lastDecision),
      phaseContext: lastParent?.phaseContext || null,
      sourceType: 'camera_macbook_web_preview',
      bufferedFrames: lastParent?.bufferedFrames || 0,
      error: runtimeError ? String(runtimeError.message || runtimeError) : null,
      ruleEvidence: lastDecision?.ruleEvidence || null,
      repCount: repCounterResult?.repCount || 0,
      repCounterStatus: repCounterResult?.status || 'disabled',
      repCounterReason: repCounterResult?.reason || null,
      repCounterDidComplete: repCounterResult?.didCompleteRep === true,
      repCounterProvenance: repCounterResult?.repCounterProvenance || null,
      repCounterConditions: repCounterResult?.repCounterConditions || null,
    };
  }

  function reset(reason = 'explicit_reset') {
    parentTracker.reset(reason);
    repCounter?.reset(reason);
    handHistory = [];
    lastDecision = null;
    lastParent = null;
    runtimeError = null;
  }

  function resetForNewCaptureSource(reason = 'capture_source_replaced') {
    parentTracker.resetForNewCaptureSource?.(reason);
    repCounter?.resetForNewCaptureSource(reason);
    handHistory = [];
    lastDecision = null;
    lastParent = null;
    runtimeError = null;
  }

  return {
    push,
    reset,
    resetForNewCaptureSource,
    get bufferedFrameCount() { return parentTracker.bufferedFrameCount; },
    get modelStatus() { return runtimeError ? 'unavailable_fallback' : 'experimental_loaded'; },
    modelId: RULE_WRAP_HYBRID_MODEL_ID,
    modelVersion: RULE_WRAP_HYBRID_MODEL_VERSION,
    decisionScope: RULE_WRAP_HYBRID_DECISION_SCOPE,
    cuePrefix: RULE_WRAP_HYBRID_CUE_PREFIX,
  };
}

export { buildEvidence };
