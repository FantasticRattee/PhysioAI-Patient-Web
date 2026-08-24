// Bottle Grab PWA V7.3.3 diagnostic adapter.
//
// This module is deliberately pure: it does not run detection and it does not
// change the V7 proximity counter. It makes detector evidence visible to the
// PWA diagnostic surface so a missing/ambiguous/stale result is distinguishable
// from an optional Hand or PhaseNet context limitation.

import { BOTTLE_GRAB_V7_DETECTOR_CONTRACT } from './BottleDetectionV7.js';

export const BOTTLE_GRAB_V7_PWA_DIAGNOSTICS_VERSION = '7.3.3';

export const BOTTLE_GRAB_V7_PWA_DIAGNOSTIC_STATUS = Object.freeze({
  DETECTOR_WAITING: 'detector_waiting',
  DETECTED: 'bottle_detected',
  MISSING: 'bottle_missing',
  AMBIGUOUS: 'bottle_ambiguous',
  STALE: 'bottle_stale',
  SOURCE_CHANGED: 'source_changed',
  ERROR: 'detector_error',
});

const finite = (value) => Number.isFinite(Number(value));

function topCandidate(detections) {
  return (Array.isArray(detections) ? detections : [])
    .filter((detection) => detection && finite(detection.score))
    .slice()
    .sort((left, right) => Number(right.score) - Number(left.score))[0] || null;
}

function counterEvidence(counter) {
  return {
    stage: counter?.status || counter?.stage || null,
    reason: counter?.reason || counter?.proximityRepReason || null,
    totalCycles: Number.isFinite(Number(counter?.totalCycles))
      ? Number(counter.totalCycles)
      : Number.isFinite(Number(counter?.proximityRepCount))
        ? Number(counter.proximityRepCount)
        : null,
    didCompleteCycle: counter?.didCompleteCycle === true,
  };
}

function roiEvidence(detection, timestampMs) {
  if (!detection) return null;
  const detectionTimestamp = finite(detection.timestampMs) ? Number(detection.timestampMs) : null;
  const now = finite(timestampMs) ? Number(timestampMs) : null;
  const ageMs = detectionTimestamp != null && now != null ? Math.max(0, now - detectionTimestamp) : null;
  return {
    boundingBox: detection.boundingBox || null,
    ageMs,
    fresh: ageMs != null && ageMs <= BOTTLE_GRAB_V7_DETECTOR_CONTRACT.maximumDetectionAgeMs,
    sourceGeneration: detection.sourceGeneration ?? null,
    timestampMs: detectionTimestamp,
  };
}

function cloneState(state) {
  return {
    ...state,
    roi: state.roi ? { ...state.roi } : null,
    counter: { ...state.counter },
  };
}

export function createBottleDetectorDiagnosticsV733({
  maximumDetectionAgeMs = BOTTLE_GRAB_V7_DETECTOR_CONTRACT.maximumDetectionAgeMs,
} = {}) {
  let hasDetectorResult = false;
  let previousSourceGeneration = null;
  let state = {
    version: BOTTLE_GRAB_V7_PWA_DIAGNOSTICS_VERSION,
    status: BOTTLE_GRAB_V7_PWA_DIAGNOSTIC_STATUS.DETECTOR_WAITING,
    rawCandidateCount: 0,
    acceptedCandidateCount: 0,
    topLabel: null,
    topScore: null,
    sourceGeneration: null,
    selectionReason: 'detector_waiting',
    roi: null,
    counter: counterEvidence(null),
    error: null,
    detectorState: 'waiting',
  };

  function update({
    timestampMs = Date.now(),
    sourceGeneration = 0,
    detectorState = 'ready',
    detectorError = null,
    detections = [],
    selection = null,
    selectedDetection = undefined,
    counter = null,
  } = {}) {
    const generationChanged = previousSourceGeneration != null
      && Number(previousSourceGeneration) !== Number(sourceGeneration);
    previousSourceGeneration = sourceGeneration;
    const rawCandidates = Array.isArray(detections) ? detections.filter(Boolean) : [];
    const top = topCandidate(rawCandidates);
    const chosen = selectedDetection === undefined
      ? selection?.detection || null
      : selectedDetection;
    const selectionReason = selection?.reason
      || (chosen ? 'bottle_selected' : 'bottle_missing');
    const acceptedCandidateCount = Number.isFinite(Number(selection?.candidateCount))
      ? Number(selection.candidateCount)
      : chosen ? 1 : 0;
    const roi = roiEvidence(chosen, timestampMs);
    const roiSourceMatches = !roi
      || roi.sourceGeneration == null
      || Number(roi.sourceGeneration) === Number(sourceGeneration);
    const roiFresh = roi?.fresh === true
      && roiSourceMatches
      && Number(roi.ageMs) <= Number(maximumDetectionAgeMs);
    let status;
    if (detectorState === 'error' || detectorError) {
      status = BOTTLE_GRAB_V7_PWA_DIAGNOSTIC_STATUS.ERROR;
    } else if (generationChanged) {
      status = BOTTLE_GRAB_V7_PWA_DIAGNOSTIC_STATUS.SOURCE_CHANGED;
    } else if (detectorState === 'waiting' || (!hasDetectorResult && detectorState !== 'ready')) {
      status = BOTTLE_GRAB_V7_PWA_DIAGNOSTIC_STATUS.DETECTOR_WAITING;
    } else if (selectionReason === 'bottle_ambiguous') {
      status = BOTTLE_GRAB_V7_PWA_DIAGNOSTIC_STATUS.AMBIGUOUS;
    } else if (chosen && !roiFresh) {
      status = BOTTLE_GRAB_V7_PWA_DIAGNOSTIC_STATUS.STALE;
    } else if (chosen && roiFresh) {
      status = BOTTLE_GRAB_V7_PWA_DIAGNOSTIC_STATUS.DETECTED;
    } else {
      status = BOTTLE_GRAB_V7_PWA_DIAGNOSTIC_STATUS.MISSING;
    }

    hasDetectorResult = detectorState !== 'waiting';
    state = {
      version: BOTTLE_GRAB_V7_PWA_DIAGNOSTICS_VERSION,
      status,
      rawCandidateCount: rawCandidates.length,
      acceptedCandidateCount,
      topLabel: top?.label || null,
      topScore: top ? Number(top.score) : null,
      sourceGeneration,
      selectionReason,
      roi: roi ? { ...roi, fresh: roiFresh } : null,
      counter: counterEvidence(counter),
      error: detectorError ? String(detectorError) : null,
      detectorState,
    };
    return cloneState(state);
  }

  function reset(reason = 'explicit_reset') {
    hasDetectorResult = false;
    previousSourceGeneration = null;
    state = {
      ...state,
      status: BOTTLE_GRAB_V7_PWA_DIAGNOSTIC_STATUS.DETECTOR_WAITING,
      sourceGeneration: null,
      selectionReason: reason,
      roi: null,
      rawCandidateCount: 0,
      acceptedCandidateCount: 0,
      topLabel: null,
      topScore: null,
      counter: counterEvidence(null),
      error: null,
      detectorState: 'waiting',
    };
    return cloneState(state);
  }

  return {
    update,
    reset,
    snapshot: () => cloneState(state),
    get status() { return state.status; },
  };
}
