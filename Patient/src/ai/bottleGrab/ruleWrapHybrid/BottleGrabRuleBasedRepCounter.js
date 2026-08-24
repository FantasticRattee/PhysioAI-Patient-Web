// Development-only PWA Bottle Grab repetition counter.
//
// This is deliberately separate from Baseline #4's finger/shoulder cue rules.
// It counts a no-lift Bottle Grab cycle from real same-frame Pose + Hand
// geometry: stable open reference -> stable close -> stable reopen. It does
// not infer bottle contact, lift, correctness, adherence, or clinical outcome.

export const BOTTLE_GRAB_REP_COUNTER_ID = 'bottle_grab_rule_based_counter_v1';
export const BOTTLE_GRAB_REP_COUNTER_VERSION = '1.0.0-dev';
export const BOTTLE_GRAB_REP_COUNTER_PROVENANCE =
  'experimental_browser_baseline4_rule_based_open_close_release_v1';

export const BOTTLE_GRAB_REP_COUNTER_CONDITIONS = Object.freeze({
  anatomicalSide: 'left',
  minimumHandScore: 0.5,
  restRows: 3,
  stableEdgeRows: 3,
  minimumSampleIntervalMs: 66,
  maximumObservationGapMs: 450,
  maximumRepetitionDurationMs: 20_000,
  maximumNoProgressDurationMs: 8_000,
  restWristStabilityArmScale: 0.08,
  apertureCloseDeltaPalmRatio: 0.25,
  flexionCloseDeltaNormalized: 0.12,
  apertureOpenDeltaPalmRatio: 0.25,
  flexionOpenDeltaNormalized: 0.12,
  requiresBottleLift: false,
  requiresWristReturn: false,
});

// The same working-arm/hand subset required by the native V6 setup gate. The
// full Pose result remains available to downstream consumers, but these six
// points are the hard input contract for the Bottle Grab branches.
const POSE_INDICES = Object.freeze([11, 13, 15, 17, 19, 21]);
const FINGER_CHAINS = Object.freeze([
  [0, 5, 6, 7, 8],
  [0, 9, 10, 11, 12],
  [0, 13, 14, 15, 16],
  [0, 17, 18, 19, 20],
]);

const finite = (value) => Number.isFinite(Number(value));

function pointIsFinite(point) {
  return point && finite(point.x) && finite(point.y) && finite(point.z ?? 0);
}

function distance(a, b) {
  return Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
}

function flexionNorm(first, vertex, third) {
  if (![first, vertex, third].every(pointIsFinite)) return null;
  const left = [Number(first.x) - Number(vertex.x), Number(first.y) - Number(vertex.y)];
  const right = [Number(third.x) - Number(vertex.x), Number(third.y) - Number(vertex.y)];
  const leftLength = Math.hypot(...left);
  const rightLength = Math.hypot(...right);
  if (leftLength <= 1e-8 || rightLength <= 1e-8) return null;
  const cosine = (left[0] * right[0] + left[1] * right[1]) / (leftLength * rightLength);
  return Math.max(0, Math.min(1, 1 - Math.acos(Math.max(-1, Math.min(1, cosine))) / Math.PI));
}

function mean(values) {
  const usable = values.filter(finite).map(Number);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function handObservation(handLandmarks) {
  if (!Array.isArray(handLandmarks) || handLandmarks.length !== 21) return null;
  if (!handLandmarks.every(pointIsFinite)) return null;
  const palmScale = distance(handLandmarks[0], handLandmarks[9]);
  if (!(palmScale > 1e-8)) return null;
  const flexions = [];
  for (const chain of FINGER_CHAINS) {
    for (let index = 0; index < chain.length - 2; index += 1) {
      const value = flexionNorm(
        handLandmarks[chain[index]],
        handLandmarks[chain[index + 1]],
        handLandmarks[chain[index + 2]],
      );
      if (!finite(value)) return null;
      flexions.push(value);
    }
  }
  const aperture = distance(handLandmarks[4], handLandmarks[8]) / palmScale;
  const flexion = mean(flexions);
  if (!finite(aperture) || !finite(flexion)) return null;
  return { aperture: Number(aperture), flexion: Number(flexion) };
}

function makeObservation({ poseLandmarks, handLandmarks, handSide, handScore, timestampMs } = {}) {
  if (!Array.isArray(poseLandmarks) || poseLandmarks.length <= Math.max(...POSE_INDICES)) {
    return { reason: 'missing_pose' };
  }
  if (!POSE_INDICES.every((index) => (
    pointIsFinite(poseLandmarks[index])
      && (poseLandmarks[index].visibility == null || Number(poseLandmarks[index].visibility) >= 0.5)
  ))) {
    return { reason: 'unreliable_pose' };
  }
  if (!Array.isArray(handLandmarks) || handLandmarks.length !== 21) {
    return { reason: 'missing_hand' };
  }
  const side = String(handSide || '').toLowerCase();
  if (!side.includes('left')) return { reason: 'wrong_anatomical_side' };
  if (!finite(handScore) || Number(handScore) < BOTTLE_GRAB_REP_COUNTER_CONDITIONS.minimumHandScore) {
    return { reason: 'unreliable_hand_side' };
  }
  const hand = handObservation(handLandmarks);
  if (!hand) return { reason: 'invalid_hand_geometry' };
  const shoulder = poseLandmarks[11];
  const elbow = poseLandmarks[13];
  const wrist = poseLandmarks[15];
  const armScale = distance(shoulder, elbow) + distance(elbow, wrist);
  if (!(armScale > 1e-8)) return { reason: 'degenerate_pose_geometry' };
  const maximumAssociationDistance = Math.max(0.18, armScale * 0.85);
  if (distance(handLandmarks[0], wrist) > maximumAssociationDistance) {
    return { reason: 'unassociated_left_hand' };
  }
  return {
    timestampMs: finite(timestampMs) ? Number(timestampMs) : Date.now(),
    wristX: (Number(wrist.x) - Number(shoulder.x)) / armScale,
    wristY: (Number(wrist.y) - Number(shoulder.y)) / armScale,
    ...hand,
  };
}

function median(values) {
  const ordered = values.slice().sort((a, b) => a - b);
  if (!ordered.length) return 0;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

export function createBottleGrabRuleBasedRepCounter() {
  const conditions = BOTTLE_GRAB_REP_COUNTER_CONDITIONS;
  let countingEnabled = false;
  let stage = 'collecting_rest';
  let restSamples = [];
  let restReference = null;
  let lastIncomingTimestampMs = null;
  let lastSampleTimestampMs = null;
  let closeCount = 0;
  let reopenCount = 0;
  let reopenSamples = [];
  let closedApertureMinimum = null;
  let closedFlexionMaximum = null;
  let cycleStartedAtMs = null;
  let lastProgressAtMs = null;
  let repCount = 0;
  let lastResetReason = null;

  function result(status = stage, reason = lastResetReason, didCompleteRep = false) {
    return {
      status,
      reason: reason || null,
      didCompleteRep,
      repCount,
      modelId: BOTTLE_GRAB_REP_COUNTER_ID,
      modelVersion: BOTTLE_GRAB_REP_COUNTER_VERSION,
      repCounterProvenance: BOTTLE_GRAB_REP_COUNTER_PROVENANCE,
      repCounterConditions: conditions,
    };
  }

  function resetPartial(reason = 'explicit_reset') {
    stage = 'collecting_rest';
    restSamples = [];
    restReference = null;
    lastIncomingTimestampMs = null;
    lastSampleTimestampMs = null;
    closeCount = 0;
    reopenCount = 0;
    reopenSamples = [];
    closedApertureMinimum = null;
    closedFlexionMaximum = null;
    cycleStartedAtMs = null;
    lastProgressAtMs = null;
    lastResetReason = reason;
  }

  function reset(reason = 'explicit_reset') {
    repCount = 0;
    countingEnabled = false;
    resetPartial(reason);
  }

  // Camera/lens replacement clears only the in-flight movement. Completed
  // experimental repetitions remain visible, matching the native V6 source
  // generation policy.
  function resetForNewCaptureSource(reason = 'capture_source_replaced') {
    countingEnabled = false;
    resetPartial(reason);
  }

  function setCountingEnabled(enabled) {
    const next = enabled === true;
    if (next === countingEnabled) return;
    countingEnabled = next;
    resetPartial(next ? 'practice_started_rebaseline' : 'practice_not_active');
  }

  function collectRest(observation) {
    restSamples = [...restSamples, observation].slice(-conditions.restRows);
    if (restSamples.length < conditions.restRows) return;
    const wristX = median(restSamples.map((row) => row.wristX));
    const wristY = median(restSamples.map((row) => row.wristY));
    const apertures = restSamples.map((row) => row.aperture);
    const flexions = restSamples.map((row) => row.flexion);
    const wristStable = restSamples.every((row) => (
      Math.hypot(row.wristX - wristX, row.wristY - wristY) <= conditions.restWristStabilityArmScale
    ));
    const apertureStable = Math.max(...apertures) - Math.min(...apertures)
      <= conditions.apertureCloseDeltaPalmRatio;
    const flexionStable = Math.max(...flexions) - Math.min(...flexions)
      <= conditions.flexionCloseDeltaNormalized;
    const looksOpen = Math.max(...apertures) >= conditions.apertureCloseDeltaPalmRatio
      && Math.min(...flexions) <= 1 - conditions.flexionCloseDeltaNormalized;
    if (!wristStable || !apertureStable || !flexionStable || !looksOpen) {
      lastResetReason = 'unstable_open_rest';
      return;
    }
    restReference = {
      openAperture: Math.max(...apertures),
      openFlexion: Math.min(...flexions),
    };
    restSamples = [];
    stage = 'armed';
    lastResetReason = null;
  }

  function completeCycle() {
    repCount += 1;
    const rearmReference = reopenSamples.length === conditions.stableEdgeRows
      ? {
        openAperture: Math.max(...reopenSamples.map((row) => row.aperture)),
        openFlexion: Math.min(...reopenSamples.map((row) => row.flexion)),
      }
      : null;
    stage = rearmReference ? 'armed' : 'collecting_rest';
    restSamples = [];
    restReference = rearmReference;
    closeCount = 0;
    reopenCount = 0;
    reopenSamples = [];
    closedApertureMinimum = null;
    closedFlexionMaximum = null;
    cycleStartedAtMs = null;
    lastProgressAtMs = null;
    lastResetReason = null;
    return true;
  }

  function advance(observation) {
    if (!countingEnabled) return false;
    if (stage === 'armed') {
      const closedNow = observation.aperture
        <= restReference.openAperture - conditions.apertureCloseDeltaPalmRatio
        && observation.flexion
        >= restReference.openFlexion + conditions.flexionCloseDeltaNormalized;
      closeCount = closedNow ? closeCount + 1 : 0;
      if (closedNow) {
        closedApertureMinimum = Math.min(closedApertureMinimum ?? observation.aperture, observation.aperture);
        closedFlexionMaximum = Math.max(closedFlexionMaximum ?? observation.flexion, observation.flexion);
      } else {
        closedApertureMinimum = null;
        closedFlexionMaximum = null;
      }
      if (closeCount >= conditions.stableEdgeRows) {
        stage = 'grasped';
        cycleStartedAtMs = observation.timestampMs;
        lastProgressAtMs = observation.timestampMs;
      }
      return false;
    }

    if (stage !== 'grasped') return false;
    if (observation.timestampMs - cycleStartedAtMs > conditions.maximumRepetitionDurationMs) {
      resetPartial('repetition_timeout');
      collectRest(observation);
      return false;
    }
    if (observation.timestampMs - lastProgressAtMs > conditions.maximumNoProgressDurationMs) {
      resetPartial('no_progress_timeout');
      collectRest(observation);
      return false;
    }
    const apertureReference = closedApertureMinimum ?? observation.aperture;
    const flexionReference = closedFlexionMaximum ?? observation.flexion;
    const reopenedNow = observation.aperture
      >= apertureReference + conditions.apertureOpenDeltaPalmRatio
      && observation.flexion
      <= flexionReference - conditions.flexionOpenDeltaNormalized;
    reopenCount = reopenedNow ? reopenCount + 1 : 0;
    if (reopenedNow) {
      reopenSamples = [...reopenSamples, observation].slice(-conditions.stableEdgeRows);
    } else {
      reopenSamples = [];
    }
    if (reopenedNow && reopenCount >= conditions.stableEdgeRows) {
      lastProgressAtMs = observation.timestampMs;
      return completeCycle();
    }
    return false;
  }

  function noteUnavailable(timestampMs, reason) {
    if (lastIncomingTimestampMs != null && timestampMs <= lastIncomingTimestampMs) {
      resetPartial('timestamp_regression');
      lastIncomingTimestampMs = timestampMs;
      return result('cannot_assess', 'timestamp_regression');
    }
    if (lastSampleTimestampMs != null && timestampMs - lastSampleTimestampMs > conditions.maximumObservationGapMs) {
      resetPartial(reason);
    }
    if (reason !== 'missing_hand') resetPartial(reason);
    lastIncomingTimestampMs = timestampMs;
    return result('cannot_assess', reason);
  }

  function push(input = {}) {
    if (typeof input.countingEnabled === 'boolean' && input.countingEnabled !== countingEnabled) {
      setCountingEnabled(input.countingEnabled);
    }
    const timestampMs = finite(input.timestampMs) ? Number(input.timestampMs) : Date.now();
    const parsed = makeObservation(input);
    if (parsed.reason) return noteUnavailable(timestampMs, parsed.reason);
    const observation = parsed;
    if (lastIncomingTimestampMs != null && timestampMs <= lastIncomingTimestampMs) {
      resetPartial('timestamp_regression');
      lastIncomingTimestampMs = timestampMs;
      return result('reset', 'timestamp_regression');
    }
    if (lastSampleTimestampMs != null) {
      const gap = timestampMs - lastSampleTimestampMs;
      if (gap > conditions.maximumObservationGapMs) resetPartial('observation_gap');
      if (gap < conditions.minimumSampleIntervalMs) {
        lastIncomingTimestampMs = timestampMs;
        return result('sampling', null);
      }
    }
    lastIncomingTimestampMs = timestampMs;
    lastSampleTimestampMs = timestampMs;
    let didCompleteRep = false;
    if (stage === 'collecting_rest') collectRest(observation);
    else didCompleteRep = advance(observation);
    return result(stage, didCompleteRep ? null : lastResetReason, didCompleteRep);
  }

  reset();
  return {
    push,
    reset,
    resetPartial,
    resetForNewCaptureSource,
    setCountingEnabled,
    get repCount() { return repCount; },
    get status() { return stage; },
    modelId: BOTTLE_GRAB_REP_COUNTER_ID,
    modelVersion: BOTTLE_GRAB_REP_COUNTER_VERSION,
    provenance: BOTTLE_GRAB_REP_COUNTER_PROVENANCE,
    conditions,
  };
}
