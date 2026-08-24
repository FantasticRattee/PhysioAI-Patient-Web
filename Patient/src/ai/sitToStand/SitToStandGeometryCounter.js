/* Geometry-only repetition authority ported from NativeSitToStandGeometryCounter. */

const STATE = {
  AWAITING_BASELINE: 'awaiting_seated_baseline',
  SEATED_REST: 'seated_rest',
  RISING: 'rising',
  STANDING_HOLD: 'standing_hold',
  LOWERING: 'lowering',
};

export const SIT_TO_STAND_GEOMETRY_CONTRACT = Object.freeze({
  seatedCeiling: 0.8,
  standingMinimum: 1.1,
  minimumBaselineFrames: 3,
  seatedStabilitySpan: 0.15,
  seatedDwellMs: 2250,
  riseDelta: 0.1,
  standingDelta: 0.25,
  lowerStartDelta: 0.15,
  seatedReturnDelta: 0.1,
  minimumStandingHoldFrames: 2,
});

export function createSitToStandGeometryCounter() {
  let state = STATE.AWAITING_BASELINE;
  let countingEnabled = false;
  let totalReps = 0;
  let baselineSamples = [];
  let baselineHeight = null;
  let seatedStartedAtMs = null;
  let standingHoldFrames = 0;
  let lastResult = result();

  function reset() {
    totalReps = 0;
    countingEnabled = false;
    resetPartial();
    lastResult = result();
  }

  function resetPartial() {
    state = STATE.AWAITING_BASELINE;
    baselineSamples = [];
    baselineHeight = null;
    seatedStartedAtMs = null;
    standingHoldFrames = 0;
  }
  function resetForNewCaptureSource() { resetPartial(); countingEnabled = false; }
  function result(reason = null, completed = false) {
    return { status: state, totalReps, repetitionCompleted: completed, reason };
  }
  function ingest({ pelvisHeightAboveAnklesNorm: height, timestampMs }) {
    if (!Number.isFinite(height)) { resetPartial(); lastResult = result('non_finite_pelvis_height'); return lastResult; }
    if (state === STATE.AWAITING_BASELINE) {
      if (height > SIT_TO_STAND_GEOMETRY_CONTRACT.seatedCeiling) { baselineSamples = []; lastResult = result('awaiting_seated_baseline'); return lastResult; }
      baselineSamples.push(height);
      if (baselineSamples.length > SIT_TO_STAND_GEOMETRY_CONTRACT.minimumBaselineFrames) baselineSamples = baselineSamples.slice(-SIT_TO_STAND_GEOMETRY_CONTRACT.minimumBaselineFrames);
      if (baselineSamples.length !== SIT_TO_STAND_GEOMETRY_CONTRACT.minimumBaselineFrames) { lastResult = result('collecting_seated_baseline'); return lastResult; }
      const min = Math.min(...baselineSamples); const max = Math.max(...baselineSamples);
      if (max - min > SIT_TO_STAND_GEOMETRY_CONTRACT.seatedStabilitySpan) { lastResult = result('collecting_seated_baseline'); return lastResult; }
      baselineHeight = baselineSamples.reduce((sum, value) => sum + value, 0) / baselineSamples.length;
      seatedStartedAtMs = timestampMs; state = STATE.SEATED_REST; lastResult = result(); return lastResult;
    }
    if (state === STATE.SEATED_REST) {
      if (!countingEnabled) { lastResult = result('counting_disabled'); return lastResult; }
      if (baselineHeight === null || seatedStartedAtMs === null) { resetPartial(); lastResult = result('baseline_missing'); return lastResult; }
      if (timestampMs - seatedStartedAtMs >= SIT_TO_STAND_GEOMETRY_CONTRACT.seatedDwellMs && height >= baselineHeight + SIT_TO_STAND_GEOMETRY_CONTRACT.riseDelta) state = STATE.RISING;
      lastResult = result(); return lastResult;
    }
    if (state === STATE.RISING) {
      if (baselineHeight === null) { resetPartial(); lastResult = result('baseline_missing'); return lastResult; }
      if (height >= SIT_TO_STAND_GEOMETRY_CONTRACT.standingMinimum && height - baselineHeight >= SIT_TO_STAND_GEOMETRY_CONTRACT.standingDelta) { standingHoldFrames = 1; state = STATE.STANDING_HOLD; }
      else if (height <= baselineHeight + SIT_TO_STAND_GEOMETRY_CONTRACT.seatedReturnDelta) { state = STATE.SEATED_REST; seatedStartedAtMs = timestampMs; }
      lastResult = result(); return lastResult;
    }
    if (state === STATE.STANDING_HOLD) {
      if (baselineHeight === null) { resetPartial(); lastResult = result('baseline_missing'); return lastResult; }
      if (height >= SIT_TO_STAND_GEOMETRY_CONTRACT.standingMinimum && height - baselineHeight >= SIT_TO_STAND_GEOMETRY_CONTRACT.standingDelta) standingHoldFrames += 1;
      if (height - baselineHeight >= SIT_TO_STAND_GEOMETRY_CONTRACT.lowerStartDelta) standingHoldFrames += 1;
      else if (standingHoldFrames >= SIT_TO_STAND_GEOMETRY_CONTRACT.minimumStandingHoldFrames) state = STATE.LOWERING;
      lastResult = result(); return lastResult;
    }
    if (state === STATE.LOWERING) {
      if (baselineHeight === null) { resetPartial(); lastResult = result('baseline_missing'); return lastResult; }
      if (height <= baselineHeight + SIT_TO_STAND_GEOMETRY_CONTRACT.seatedReturnDelta) {
        totalReps += 1; state = STATE.SEATED_REST; seatedStartedAtMs = timestampMs; standingHoldFrames = 0;
        lastResult = result(null, true); return lastResult;
      }
      lastResult = result(); return lastResult;
    }
    lastResult = result(); return lastResult;
  }
  return {
    setCountingEnabled(enabled) { countingEnabled = Boolean(enabled); if (!countingEnabled) resetPartial(); },
    reset,
    resetPartial,
    resetForNewCaptureSource,
    ingest,
    get totalReps() { return totalReps; },
    get lastResult() { return lastResult; },
    get state() { return state; },
  };
}
