/**
 * Development-only normal-manifold comment calibration for Bottle Grab.
 *
 * This adapter is deliberately separate from the frozen V1.4 browser lock.
 * It evaluates a completed repetition as an aggregate instead of promoting
 * every per-frame difference to a cue.  A future QualityNet may learn the
 * same reference-conditioned behavior; this module is only an auditable
 * calibration probe and has no runtime, clinical, or correctness authority.
 */

export const NORMAL_MANIFOLD_CALIBRATION_SCHEMA =
  'physioai.bottle_grab.normal_manifold_comment_calibration.v1_6';

const EPSILON = 1e-12;


function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}


function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}


function finiteNumber(value, field) {
  const number = Number(value);
  if (!finite(number)) throw new TypeError(`${field} must be finite`);
  return number;
}


function quantile(values, probability) {
  const ordered = [...values].sort((left, right) => left - right);
  if (ordered.length === 0) return null;
  const index = (ordered.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return ordered[lower];
  const fraction = index - lower;
  return ordered[lower] + ((ordered[upper] - ordered[lower]) * fraction);
}


function longestConsecutive(values) {
  let longest = 0;
  let current = 0;
  for (const value of values) {
    if (value) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}


function rulePersistence(rule) {
  const persistence = isRecord(rule.persistence) ? rule.persistence : {};
  const minAssessableSamples = Number(persistence.minAssessableSamples ?? 4);
  const minConsecutiveFrames = Number(persistence.minConsecutiveFrames ?? 3);
  const minFractionBeyondBoundary = Number(
    persistence.minFractionBeyondBoundary ?? 0.6,
  );
  if (!Number.isInteger(minAssessableSamples) || minAssessableSamples < 1) {
    throw new TypeError('rule.persistence.minAssessableSamples must be a positive integer');
  }
  if (!Number.isInteger(minConsecutiveFrames) || minConsecutiveFrames < 1) {
    throw new TypeError('rule.persistence.minConsecutiveFrames must be a positive integer');
  }
  if (!finite(minFractionBeyondBoundary)
      || minFractionBeyondBoundary <= 0
      || minFractionBeyondBoundary > 1) {
    throw new TypeError('rule.persistence.minFractionBeyondBoundary must be in (0, 1]');
  }
  return {
    minAssessableSamples,
    minConsecutiveFrames,
    minFractionBeyondBoundary,
  };
}


function conditionBoundary(rule) {
  const band = rule.referenceBand;
  if (!isRecord(band)) throw new TypeError('rule.referenceBand must be an object');
  const lower = finiteNumber(band.lower, 'rule.referenceBand.lower');
  const upper = finiteNumber(band.upper, 'rule.referenceBand.upper');
  if (lower > upper) throw new RangeError('rule.referenceBand.lower must not exceed upper');
  const uncertaintyMargin = finiteNumber(
    rule.uncertaintyMargin ?? 0,
    'rule.uncertaintyMargin',
  );
  if (uncertaintyMargin < 0) throw new RangeError('rule.uncertaintyMargin must be non-negative');
  if (rule.direction !== 'above' && rule.direction !== 'below') {
    throw new TypeError('rule.direction must be above or below');
  }
  return { lower, upper, uncertaintyMargin };
}


function assessableValue(frame, measurementId) {
  const measurement = frame?.measurements?.[measurementId];
  if (!isRecord(measurement)
      || measurement.assessability !== 'can_assess'
      || !finite(Number(measurement.value))) {
    return null;
  }
  return Number(measurement.value);
}


function classifyRule(rule, frames) {
  const phases = Array.isArray(rule.phaseScope) ? rule.phaseScope : [];
  if (phases.length === 0) throw new TypeError('rule.phaseScope must be non-empty');
  const scopedFrames = frames.filter((frame) => phases.includes(frame?.phase));
  const values = scopedFrames
    .map((frame) => assessableValue(frame, rule.measurementId));
  const assessableValues = values.filter((value) => value !== null);
  const { lower, upper, uncertaintyMargin } = conditionBoundary(rule);
  const persistence = rulePersistence(rule);
  const base = {
    observationTag: rule.observationTag ?? null,
    cueId: rule.cueId ?? null,
    measurementId: rule.measurementId ?? null,
    status: 'cannot_assess',
    aggregate: null,
    assessableSamples: assessableValues.length,
    beyondBoundarySamples: 0,
    maxConsecutiveBeyond: 0,
    fractionBeyondBoundary: 0,
    persistence,
    referenceBand: { lower, upper },
    uncertaintyMargin,
  };
  if (scopedFrames.length === 0) return { ...base, status: 'out_of_phase' };
  if (assessableValues.length < persistence.minAssessableSamples) return base;

  const aggregate = quantile(assessableValues, 0.9);
  const clearBoundary = rule.direction === 'above'
    ? upper + uncertaintyMargin
    : lower - uncertaintyMargin;
  const reviewLower = rule.direction === 'above'
    ? upper - uncertaintyMargin
    : lower + uncertaintyMargin;
  const beyond = assessableValues.map((value) => rule.direction === 'above'
    ? value > clearBoundary
    : value < clearBoundary);
  const beyondCount = beyond.filter(Boolean).length;
  const fractionBeyondBoundary = beyondCount / assessableValues.length;
  const maxConsecutiveBeyond = longestConsecutive(beyond);
  const persistent = maxConsecutiveBeyond >= persistence.minConsecutiveFrames
    && fractionBeyondBoundary >= persistence.minFractionBeyondBoundary;
  const aggregateClearlyBeyond = rule.direction === 'above'
    ? aggregate > clearBoundary
    : aggregate < clearBoundary;
  const aggregateNearBoundary = rule.direction === 'above'
    ? aggregate >= reviewLower && aggregate <= clearBoundary
    : aggregate <= reviewLower && aggregate >= clearBoundary;

  let status = 'within_reference';
  if (aggregateClearlyBeyond && persistent) status = 'deviation';
  else if (aggregateClearlyBeyond) status = 'insufficient_persistence';
  else if (aggregateNearBoundary) status = 'boundary';
  return {
    ...base,
    status,
    aggregate,
    beyondBoundarySamples: beyondCount,
    maxConsecutiveBeyond,
    fractionBeyondBoundary,
  };
}


function cueFor(catalog, cueId) {
  const cue = catalog?.cues?.find((candidate) => candidate?.cueId === cueId);
  if (!cue?.messages || cue.messages.th == null || cue.messages.en == null) return null;
  return {
    cueId,
    messages: { th: cue.messages.th, en: cue.messages.en },
  };
}


/**
 * Evaluate one repetition against phase-conditioned normal-manifold rules.
 * The result remains ``tentative`` and never counts a repetition or authorizes
 * a browser/App comment.  The key behavior is aggregate + persistence: normal
 * reaching movement is not converted into a trunk cue frame by frame.
 */
export function buildBottleGrabRepetitionCalibration({
  frames,
  rules,
  commentCatalog,
  commentDeliveryPolicy,
} = {}) {
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new TypeError('frames must be a non-empty array');
  }
  if (!Array.isArray(rules) || rules.length === 0) {
    throw new TypeError('rules must be a non-empty array');
  }

  const ruleResults = rules.map((rule) => classifyRule(rule, frames));
  const priorities = new Map((commentDeliveryPolicy?.priorities || [])
    .map((entry) => [entry.cueId, Number(entry.priorityRank)]));
  const candidates = ruleResults
    .filter((result) => result.status === 'deviation' && result.cueId)
    .map((result) => {
      const cue = cueFor(commentCatalog, result.cueId);
      return cue ? {
        observationTag: result.observationTag,
        cueId: result.cueId,
        messages: cue.messages,
        aggregate: result.aggregate,
        persistence: result.persistence,
      } : null;
    })
    .filter(Boolean)
    .sort((left, right) => (
      (priorities.get(left.cueId) ?? Number.MAX_SAFE_INTEGER)
      - (priorities.get(right.cueId) ?? Number.MAX_SAFE_INTEGER)
    ));
  const selected = candidates.slice(0, 3);
  const primary = selected[0] || null;
  const hasCannotAssess = ruleResults.some((result) => result.status === 'cannot_assess');
  return {
    schema: NORMAL_MANIFOLD_CALIBRATION_SCHEMA,
    mode: 'normal_manifold_repetition_calibration',
    assessability: 'tentative',
    deliveryStatus: primary
      ? 'tentative_not_final'
      : (hasCannotAssess ? 'tentative_unavailable' : 'tentative_no_candidate'),
    primaryCueId: primary?.cueId ?? null,
    primaryObservationTag: primary?.observationTag ?? null,
    messages: primary?.messages ?? null,
    secondaryObservations: selected.slice(1).map((candidate) => ({
      observationTag: candidate.observationTag,
      cueId: candidate.cueId,
    })),
    candidates: selected.map((candidate) => ({
      observationTag: candidate.observationTag,
      cueId: candidate.cueId,
      aggregate: candidate.aggregate,
      persistence: candidate.persistence,
    })),
    ruleResults,
    completedRepetition: false,
    countsAsRepetition: false,
    provenance: {
      rawFramesPersisted: false,
      rawLandmarksPersisted: false,
      generatedText: false,
      network: false,
      audioOrTts: false,
    },
  };
}
