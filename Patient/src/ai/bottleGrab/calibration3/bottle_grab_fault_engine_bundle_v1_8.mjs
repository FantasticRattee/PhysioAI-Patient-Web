import {
  NORMAL_MANIFOLD_COMMENT_CATALOG_V1_6,
  NORMAL_MANIFOLD_COMMENT_DELIVERY_POLICY_V1_6,
  NORMAL_MANIFOLD_RULES_V1_6,
} from './bottle_grab_normal_manifold_comment_rules_v1_6.mjs';
import {
  buildBottleGrabRepetitionCalibration,
} from './bottle_grab_normal_manifold_comment_calibration_v1_6.mjs';
import {
  classifyBottleGrabNormalManifoldRepetition,
} from './bottle_grab_normal_manifold_profile_v1_7.mjs';

/**
 * Development-only automatic fault bundle for one phrase-tracked repetition.
 *
 * The bundle is the single entry point for the two currently approved fault
 * engines: the V1.6 New-Open/finger engine and the V1.7 shoulder engine.  It
 * always invokes both engines for every call.  A neutral result is still an
 * executed assessment; a finger `cannot_assess` result is kept as provenance
 * and never suppresses a clear shoulder observation.
 *
 * This does not activate a browser/App route, change either source engine,
 * or turn a development candidate into a correctness/clinical decision.
 */
export const FAULT_ENGINE_BUNDLE_DECISION_SCHEMA =
  'physioai.bottle_grab.fault_engine_bundle_decision.v1_8';
export const FAULT_ENGINE_BUNDLE_ID = 'bottle_grab_fault_engine_bundle_v1_8';
export const FAULT_ENGINE_BUNDLE_VERSION = '1.8.0-dev';

function executedDecision(decision, engineId) {
  return Object.freeze({
    status: 'executed',
    engineId,
    deliveryStatus: decision.deliveryStatus,
  });
}

const FINGER_CUE_IDS = new Set([
  'BG_REF_OPEN_HAND_MORE',
  'BG_REF_WRAP_FINGERS_MORE',
]);
const SHOULDER_CUE_IDS = new Set(['BG_REF_RELAX_SHOULDER']);

function rulesFor(cueIds) {
  return NORMAL_MANIFOLD_RULES_V1_6.filter((rule) => cueIds.has(rule.cueId));
}

function cannotAssessShoulderDecision(error) {
  return Object.freeze({
    schema: 'physioai.bottle_grab.normal_manifold_repetition_decision.v1_7',
    mode: 'development_reference_conditioned_residual',
    deliveryStatus: 'cannot_assess',
    reason: error instanceof Error ? error.message : String(error),
    primaryCueId: null,
    primaryObservationTag: null,
    secondaryObservations: [],
    regionResults: [],
    countsAsRepetition: false,
    claimBoundary: {
      runtimeAuthorized: false,
      browserAuthorized: false,
      appAuthorized: false,
      correctnessVerdict: false,
      clinical: false,
    },
  });
}

function runShoulderEngine({ shoulderProfile, shoulderRepetition }) {
  try {
    return classifyBottleGrabNormalManifoldRepetition({
      profile: shoulderProfile,
      repetition: shoulderRepetition,
    });
  } catch (error) {
    return cannotAssessShoulderDecision(error);
  }
}

function validateRepetitionContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('repetitionContext must be an object');
  }
  if (typeof value.repetitionId !== 'string' || value.repetitionId.trim() === '') {
    throw new TypeError('repetitionContext.repetitionId must be a non-empty string');
  }
  if (!Number.isInteger(value.repetitionIndex) || value.repetitionIndex < 1) {
    throw new TypeError('repetitionContext.repetitionIndex must be a positive integer');
  }
  if (!Number.isFinite(Number(value.startMs)) || !Number.isFinite(Number(value.endMs))
      || Number(value.endMs) < Number(value.startMs)) {
    throw new TypeError('repetitionContext must contain an ordered finite interval');
  }
  if (typeof value.phaseWindowId !== 'string' || value.phaseWindowId.trim() === '') {
    throw new TypeError('repetitionContext.phaseWindowId must be a non-empty string');
  }
  return Object.freeze({
    repetitionId: value.repetitionId.trim(),
    repetitionIndex: value.repetitionIndex,
    startMs: Number(value.startMs),
    endMs: Number(value.endMs),
    phaseWindowId: value.phaseWindowId.trim(),
  });
}

function mergeDecisions({ fingerDecision, shoulderDecision, repetitionContext }) {
  const priorities = new Map(
    NORMAL_MANIFOLD_COMMENT_DELIVERY_POLICY_V1_6.priorities
      .map((entry) => [entry.cueId, entry.priorityRank]),
  );
  const fingerCandidates = fingerDecision.candidates.map((candidate) => ({
    ...candidate,
    messages: NORMAL_MANIFOLD_COMMENT_CATALOG_V1_6.cues.find(
      (cue) => cue.cueId === candidate.cueId,
    )?.messages ?? null,
  }));
  // V1.7's profile also reports exploratory trunk/hand regions.  This bundle
  // is intentionally the two-engine contract: only the named shoulder cue
  // may cross the shoulder source boundary.  The finger source owns both
  // finger cues, so an exploratory duplicate cannot become a third engine.
  const shoulderCandidates = [
    ...(shoulderDecision.primaryCueId ? [{
      cueId: shoulderDecision.primaryCueId,
      observationTag: shoulderDecision.primaryObservationTag,
    }] : []),
    ...(shoulderDecision.secondaryObservations ?? []),
  ].map((candidate) => ({
    ...candidate,
    messages: NORMAL_MANIFOLD_COMMENT_CATALOG_V1_6.cues.find(
      (cue) => cue.cueId === candidate.cueId,
    )?.messages ?? null,
  })).filter((candidate) => SHOULDER_CUE_IDS.has(candidate.cueId));
  const candidates = [...fingerCandidates, ...shoulderCandidates]
    .filter((candidate) => candidate.messages)
    .filter((candidate, index, all) => all.findIndex((item) => item.cueId === candidate.cueId) === index)
    .sort((left, right) => (
      (priorities.get(left.cueId) ?? Number.MAX_SAFE_INTEGER)
      - (priorities.get(right.cueId) ?? Number.MAX_SAFE_INTEGER)
    ));
  const selected = candidates.slice(0, 3);
  const primary = selected[0] ?? null;
  const hasCannotAssess = fingerDecision.deliveryStatus === 'tentative_unavailable'
    || shoulderDecision.deliveryStatus === 'cannot_assess';
  return Object.freeze({
    schema: 'physioai.bottle_grab.fault_engine_bundle_merged_decision.v1_8',
    deliveryStatus: primary
      ? 'tentative_not_final'
      : hasCannotAssess ? 'tentative_unavailable' : 'tentative_no_candidate',
    primaryObservationTag: primary?.observationTag ?? null,
    primaryCueId: primary?.cueId ?? null,
    messages: primary?.messages ?? null,
    secondaryObservations: Object.freeze(selected.slice(1).map((candidate) => Object.freeze({
      observationTag: candidate.observationTag,
      cueId: candidate.cueId,
      messages: candidate.messages,
    }))),
    candidates: Object.freeze(selected.map((candidate) => Object.freeze({
      observationTag: candidate.observationTag,
      cueId: candidate.cueId,
      aggregate: candidate.aggregate,
      persistence: candidate.persistence,
    }))),
    sourceAssessments: Object.freeze({
      finger: Object.freeze({
        status: fingerDecision.deliveryStatus,
        candidateCount: fingerDecision.candidates.length,
      }),
      shoulder: Object.freeze({
        status: shoulderDecision.deliveryStatus,
        candidateCount: shoulderCandidates.length,
        schema: shoulderDecision.schema,
      }),
    }),
    repetitionContext,
  });
}

/**
 * Run shoulder and finger fault engines together and merge their observations.
 *
 * Required arguments intentionally include one shared frame set.  This keeps
 * New-Open/finger and shoulder evaluations on the same phrase window and
 * prevents a caller from accidentally using a shoulder-only path.
 */
export function evaluateBottleGrabFaultEnginesV1_8({
  frames,
  shoulderProfile,
  shoulderRepetition,
  repetitionContext,
} = {}) {
  const validatedRepetitionContext = validateRepetitionContext(repetitionContext);
  if (!Array.isArray(frames) || frames.length === 0) {
    // Run both engines on an explicit empty frame input so each returns its
    // own cannot_assess result rather than silently skipping one source.
    frames = [{ phase: null, measurements: {} }];
  }
  const fingerDecision = buildBottleGrabRepetitionCalibration({
    frames,
    rules: rulesFor(FINGER_CUE_IDS),
    commentCatalog: NORMAL_MANIFOLD_COMMENT_CATALOG_V1_6,
    commentDeliveryPolicy: NORMAL_MANIFOLD_COMMENT_DELIVERY_POLICY_V1_6,
  });
  // Shoulder is a separate V1.7 profile-conditioned engine. It is invoked on
  // every call, and malformed/missing shoulder evidence becomes an explicit
  // cannot_assess source decision rather than skipping the engine.
  const shoulderDecision = runShoulderEngine({ shoulderProfile, shoulderRepetition });
  const mergedDecision = mergeDecisions({
    fingerDecision,
    shoulderDecision,
    repetitionContext: validatedRepetitionContext,
  });

  return Object.freeze({
    schema: FAULT_ENGINE_BUNDLE_DECISION_SCHEMA,
    engineId: FAULT_ENGINE_BUNDLE_ID,
    version: FAULT_ENGINE_BUNDLE_VERSION,
    mode: 'development_automatic_fault_bundle',
    invocation: Object.freeze({
      shoulder: executedDecision(shoulderDecision, 'normal_manifold_v1_7'),
      finger: executedDecision(fingerDecision, 'normal_manifold_new_open_finger_v1_6'),
    }),
    shoulderDecision,
    fingerDecision,
    mergedDecision,
    claimBoundary: Object.freeze({
      runtimeAuthorized: false,
      browserAuthorized: false,
      appAuthorized: false,
      correctnessDecision: false,
      clinical: false,
    }),
  });
}
