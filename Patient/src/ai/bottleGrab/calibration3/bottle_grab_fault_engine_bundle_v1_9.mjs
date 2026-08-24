import {
  NORMAL_MANIFOLD_COMMENT_CATALOG_V1_6,
} from './bottle_grab_normal_manifold_comment_rules_v1_6.mjs';
import {
  evaluateBottleGrabFaultEnginesV1_8,
} from './bottle_grab_fault_engine_bundle_v1_8.mjs';
import {
  NORMAL_MANIFOLD_PROFILE_SCHEMA,
  classifyBottleGrabNormalManifoldRepetition,
} from './bottle_grab_normal_manifold_profile_v1_7.mjs';

/**
 * Development-only calibrated layer on top of the mandatory V1.8 source
 * bundle.  V1.8 is still called first, so both original fault engines execute
 * for every repetition.  This version changes only the development decision
 * policy after the source assessments: it uses a flexible hand reference and
 * a robust shoulder summary instead of the stale fixed opening band.
 *
 * This is not a trained neural model, a correctness classifier, or a Browser /
 * App runtime.  The policy is a labeled-development calibration candidate and
 * must be re-evaluated on an untouched holdout before promotion.
 */
export const CALIBRATED_FAULT_POLICY_V1_9 = Object.freeze({
  schema: 'physioai.bottle_grab.calibrated_fault_policy.v1_9',
  version: '1.9.0-dev-calibration-2',
  sourceBundle: 'bottle_grab_fault_engine_bundle_v1_8',
  finger: Object.freeze({
    minAssessableSamples: 15,
    minConsecutiveFrames: 3,
    minFractionBeyondBoundary: 0.6,
    apertureUpper: 0.55,
    flexionLower: 28,
    aggregate: 'p50',
    openCuePolicy: 'flexible_reference_no_candidate',
  }),
  shoulder: Object.freeze({
    minAssessableFrames: 15,
    shoulderDeltaP50Min: 0,
    shoulderDeltaP90Min: 0.055,
    aggregate: 'p50+p90',
  }),
  profileConditionedFusion: Object.freeze({
    enabled: true,
    profileSchema: NORMAL_MANIFOLD_PROFILE_SCHEMA,
    requiresSourceLineageGroup: true,
    suppressWhenProfileHasNoNamedDeviation: true,
    fallbackOnlyWhenSourceEnginesHaveNoCandidate: true,
    shoulderFallbackRequiresPositiveP50: true,
  }),
  claimBoundary: Object.freeze({
    runtimeAuthorized: false,
    browserAuthorized: false,
    appAuthorized: false,
    correctnessDecision: false,
    clinical: false,
  }),
});

export const FAULT_ENGINE_BUNDLE_V1_9_DECISION_SCHEMA =
  'physioai.bottle_grab.fault_engine_bundle_decision.v1_9';
export const FAULT_ENGINE_BUNDLE_V1_9_ID = 'bottle_grab_fault_engine_bundle_v1_9';
export const BOTTLE_GRAB_MODEL_MODULE_V1_9_ID = 'bottle_grab_model_module_v1_9';
export const BOTTLE_GRAB_MODEL_MODULE_V1_9_SCHEMA =
  'physioai.bottle_grab.model_module_decision.v1_9';

const FINGER_WRAP_CUE_ID = 'BG_REF_WRAP_FINGERS_MORE';
const FINGER_WRAP_TAG = 'BG_OBS_GRASP_CLOSURE_BELOW_REFERENCE';
const SHOULDER_CUE_ID = 'BG_REF_RELAX_SHOULDER';
const SHOULDER_TAG = 'BG_OBS_WORKING_SHOULDER_ELEVATION_ABOVE_REFERENCE';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function quantile(values, probability) {
  const ordered = values.filter(finite).toSorted((left, right) => left - right);
  if (ordered.length === 0) return null;
  const index = (ordered.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return ordered[lower];
  return ordered[lower] + ((ordered[upper] - ordered[lower]) * (index - lower));
}

function longestConsecutive(values) {
  let current = 0;
  let longest = 0;
  for (const value of values) {
    current = value ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

function measurementValue(frame, measurementId) {
  const measurement = frame?.measurements?.[measurementId];
  if (!isRecord(measurement)
      || measurement.assessability !== 'can_assess'
      || !finite(Number(measurement.value))) return null;
  return Number(measurement.value);
}

function classifyThreshold({
  frames,
  measurementId,
  direction,
  threshold,
  policy,
}) {
  const values = frames.map((frame) => measurementValue(frame, measurementId));
  const assessable = values.filter((value) => value !== null);
  const beyond = values.map((value) => (
    value === null
      ? false
      : direction === 'above' ? value > threshold : value < threshold
  ));
  const beyondCount = beyond.filter(Boolean).length;
  const fraction = assessable.length ? beyondCount / assessable.length : 0;
  const aggregate = quantile(assessable, 0.5);
  const persistent = longestConsecutive(beyond) >= policy.minConsecutiveFrames
    && fraction >= policy.minFractionBeyondBoundary;
  const status = assessable.length < policy.minAssessableSamples
    ? 'cannot_assess'
    : aggregate === null
      ? 'cannot_assess'
      : ((direction === 'above' ? aggregate > threshold : aggregate < threshold) && persistent)
        ? 'deviation'
        : 'within_reference';
  return {
    measurementId,
    status,
    aggregate,
    assessableSamples: assessable.length,
    beyondBoundarySamples: beyondCount,
    fractionBeyondBoundary: fraction,
    maxConsecutiveBeyond: longestConsecutive(beyond),
    threshold,
    direction,
    persistence: {
      minAssessableSamples: policy.minAssessableSamples,
      minConsecutiveFrames: policy.minConsecutiveFrames,
      minFractionBeyondBoundary: policy.minFractionBeyondBoundary,
    },
  };
}

function cueMessages(cueId) {
  const cue = NORMAL_MANIFOLD_COMMENT_CATALOG_V1_6.cues.find(
    (candidate) => candidate.cueId === cueId,
  );
  return cue?.messages ?? null;
}

function candidateFrom(rule, cueId, observationTag) {
  if (rule.status !== 'deviation') return null;
  return {
    cueId,
    observationTag,
    messages: cueMessages(cueId),
    aggregate: rule.aggregate,
    persistence: rule.persistence,
  };
}

function emptyCandidateDecision(decision) {
  return {
    ...decision,
    deliveryStatus: 'tentative_no_candidate',
    primaryCueId: null,
    primaryObservationTag: null,
    messages: null,
    secondaryObservations: [],
    candidates: [],
  };
}

function profileCandidate({ cueId, observationTag, regionResult }) {
  return {
    cueId,
    observationTag,
    messages: cueMessages(cueId),
    aggregate: 'normal_manifold_profile',
    persistence: regionResult?.persistence ?? null,
  };
}

/**
 * Use the nominal profile as a development-only guard around named cues.
 * A synthetic/unit fixture without a real source lineage intentionally keeps
 * the old V1.9 behavior, so this cannot silently change existing contracts.
 */
function applyProfileConditionedFusion({
  fingerDecision,
  shoulderDecision,
  shoulderProfile,
  shoulderRepetition,
  repetitionContext,
}) {
  const enabled = shoulderProfile?.schema === NORMAL_MANIFOLD_PROFILE_SCHEMA
    && typeof repetitionContext?.sourceLineageGroup === 'string'
    && repetitionContext.sourceLineageGroup.length > 0
    && shoulderRepetition?.regionSummaries;
  if (!enabled) {
    return {
      fingerDecision,
      shoulderDecision,
      metadata: {
        enabled: false,
        profileNamedDeviation: null,
        fallbackUsed: [],
      },
    };
  }

  let profileDecision;
  try {
    profileDecision = classifyBottleGrabNormalManifoldRepetition({
      repetition: {
        ...shoulderRepetition,
        label: 'nominal',
        frames: undefined,
      },
      profile: shoulderProfile,
    });
  } catch {
    return {
      fingerDecision,
      shoulderDecision,
      metadata: {
        enabled: true,
        profileNamedDeviation: null,
        fallbackUsed: [],
        status: 'profile_unavailable',
      },
    };
  }

  const regions = new Map((profileDecision.regionResults || [])
    .map((region) => [region.regionId, region]));
  const namedRegions = [...regions.values()].filter((region) => (
    region.status === 'deviation' && region.direction !== 'not_elevated'
  ));
  const profileNamedDeviation = namedRegions.length > 0;
  if (!profileNamedDeviation
      && CALIBRATED_FAULT_POLICY_V1_9.profileConditionedFusion.suppressWhenProfileHasNoNamedDeviation) {
    return {
      fingerDecision: emptyCandidateDecision(fingerDecision),
      shoulderDecision: emptyCandidateDecision(shoulderDecision),
      metadata: {
        enabled: true,
        profileNamedDeviation: false,
        fallbackUsed: [],
        profileDecision,
      },
    };
  }

  const sourceCandidatesExist = fingerDecision.candidates.length > 0
    || shoulderDecision.candidates.length > 0;
  const fallbackUsed = [];
  if (!sourceCandidatesExist
      && regions.get('hand_finger')?.status === 'deviation') {
    const candidate = profileCandidate({
      cueId: FINGER_WRAP_CUE_ID,
      observationTag: FINGER_WRAP_TAG,
      regionResult: regions.get('hand_finger'),
    });
    fingerDecision = {
      ...fingerDecision,
      deliveryStatus: 'tentative_not_final',
      primaryCueId: candidate.cueId,
      primaryObservationTag: candidate.observationTag,
      messages: candidate.messages,
      candidates: [candidate],
    };
    fallbackUsed.push('finger');
  }
  const shoulderRegion = regions.get('shoulder_upper_arm');
  const shoulderP50 = Number(shoulderRepetition?.regionSummaries?.shoulder_upper_arm?.shoulder_delta_p50);
  if (!sourceCandidatesExist
      && shoulderRegion?.status === 'deviation'
      && shoulderRegion.direction === 'elevated'
      && (!CALIBRATED_FAULT_POLICY_V1_9.profileConditionedFusion.shoulderFallbackRequiresPositiveP50
        || (finite(shoulderP50) && shoulderP50 > 0))) {
    const candidate = profileCandidate({
      cueId: SHOULDER_CUE_ID,
      observationTag: SHOULDER_TAG,
      regionResult: shoulderRegion,
    });
    shoulderDecision = {
      ...shoulderDecision,
      deliveryStatus: 'tentative_not_final',
      primaryCueId: candidate.cueId,
      primaryObservationTag: candidate.observationTag,
      messages: candidate.messages,
      candidates: [candidate],
    };
    fallbackUsed.push('shoulder');
  }
  return {
    fingerDecision,
    shoulderDecision,
    metadata: {
      enabled: true,
      profileNamedDeviation: true,
      fallbackUsed,
      profileDecision,
    },
  };
}

function classifyCalibratedFinger(frames) {
  const policy = CALIBRATED_FAULT_POLICY_V1_9.finger;
  const openValues = frames.map((frame) => measurementValue(frame, 'thumb_index_aperture'));
  const openAssessable = openValues.filter((value) => value !== null).length;
  const flexionRule = classifyThreshold({
    frames,
    measurementId: 'mean_finger_flexion',
    direction: 'below',
    threshold: policy.flexionLower,
    policy,
  });
  const apertureRule = classifyThreshold({
    frames,
    measurementId: 'thumb_index_aperture',
    direction: 'above',
    threshold: policy.apertureUpper,
    policy,
  });
  // Opening remains an executed source assessment, but this calibrated
  // version deliberately treats ordinary wide/narrow preshape as flexible.
  const openRule = {
    observationTag: 'BG_OBS_PRESHAPE_OPENING_BELOW_REFERENCE',
    cueId: 'BG_REF_OPEN_HAND_MORE',
    measurementId: 'thumb_index_aperture',
    status: openAssessable >= policy.minAssessableSamples ? 'within_reference' : 'cannot_assess',
    aggregate: quantile(openValues.filter((value) => value !== null), 0.5),
    assessableSamples: openAssessable,
    policy: policy.openCuePolicy,
  };
  const wrapRules = [apertureRule, flexionRule];
  const wrapCandidate = wrapRules
    .map((rule) => candidateFrom(rule, FINGER_WRAP_CUE_ID, FINGER_WRAP_TAG))
    .filter(Boolean)
    .sort((left, right) => Math.abs(right.aggregate ?? 0) - Math.abs(left.aggregate ?? 0))[0] ?? null;
  const ruleResults = [
    { ...openRule },
    { ...apertureRule, cueId: FINGER_WRAP_CUE_ID, observationTag: FINGER_WRAP_TAG },
    { ...flexionRule, cueId: FINGER_WRAP_CUE_ID, observationTag: FINGER_WRAP_TAG },
  ];
  return {
    schema: 'physioai.bottle_grab.calibrated_finger_decision.v1_9',
    engineId: 'normal_manifold_new_open_finger_v1_9_calibrated',
    deliveryStatus: wrapCandidate ? 'tentative_not_final'
      : ruleResults.some((rule) => rule.status === 'cannot_assess')
        ? 'tentative_unavailable' : 'tentative_no_candidate',
    primaryCueId: wrapCandidate?.cueId ?? null,
    primaryObservationTag: wrapCandidate?.observationTag ?? null,
    messages: wrapCandidate?.messages ?? null,
    secondaryObservations: [],
    candidates: wrapCandidate ? [wrapCandidate] : [],
    ruleResults,
    countsAsRepetition: false,
    provenance: { baseSourceRan: true, labelUsedByEngine: false },
  };
}

function classifyCalibratedShoulder(shoulderRepetition) {
  const policy = CALIBRATED_FAULT_POLICY_V1_9.shoulder;
  const summary = shoulderRepetition?.regionSummaries?.shoulder_upper_arm;
  const p50 = Number(summary?.shoulder_delta_p50);
  const p90 = Number(summary?.shoulder_delta_p90);
  const frameCount = Number(shoulderRepetition?.assessableFrameCount ?? 0);
  const assessable = finite(p50) && finite(p90) && Number.isInteger(frameCount) && frameCount >= 1;
  const deviation = assessable
    && frameCount >= policy.minAssessableFrames
    && p50 > policy.shoulderDeltaP50Min
    && p90 > policy.shoulderDeltaP90Min;
  const regionResult = {
    regionId: 'shoulder_upper_arm',
    cueId: SHOULDER_CUE_ID,
    observationTag: SHOULDER_TAG,
    status: !assessable ? 'cannot_assess' : deviation ? 'deviation' : 'within_reference',
    direction: deviation ? 'elevated' : 'not_elevated',
    score: finite(p50) && finite(p90) ? (p50 + p90) / 2 : null,
    beyondFeatureCount: deviation ? 2 : 0,
    featureScores: [
      { featureId: 'shoulder_delta_p50', value: p50 },
      { featureId: 'shoulder_delta_p90', value: p90 },
    ],
    persistence: {
      assessableFrameCount: frameCount,
      minAssessableFrames: policy.minAssessableFrames,
      shoulderDeltaP50Min: policy.shoulderDeltaP50Min,
      shoulderDeltaP90Min: policy.shoulderDeltaP90Min,
    },
  };
  const candidate = deviation ? {
    cueId: SHOULDER_CUE_ID,
    observationTag: SHOULDER_TAG,
    messages: cueMessages(SHOULDER_CUE_ID),
    aggregate: { p50, p90 },
    persistence: regionResult.persistence,
  } : null;
  return {
    schema: 'physioai.bottle_grab.calibrated_shoulder_decision.v1_9',
    engineId: 'normal_manifold_shoulder_v1_9_calibrated',
    deliveryStatus: candidate ? 'tentative_not_final'
      : regionResult.status === 'cannot_assess' ? 'tentative_unavailable' : 'tentative_no_candidate',
    primaryCueId: candidate?.cueId ?? null,
    primaryObservationTag: candidate?.observationTag ?? null,
    messages: candidate?.messages ?? null,
    secondaryObservations: [],
    regionResults: [regionResult],
    candidates: candidate ? [candidate] : [],
    countsAsRepetition: false,
    provenance: { baseSourceRan: true, labelUsedByEngine: false },
  };
}

function merge(fingerDecision, shoulderDecision, repetitionContext) {
  const candidates = [...fingerDecision.candidates, ...shoulderDecision.candidates]
    .filter((candidate) => candidate.messages)
    .sort((left, right) => {
      const priority = (cueId) => cueId === FINGER_WRAP_CUE_ID ? 1 : 2;
      return priority(left.cueId) - priority(right.cueId);
    })
    .filter((candidate, index, all) => all.findIndex((item) => item.cueId === candidate.cueId) === index)
    .slice(0, 3);
  const primary = candidates[0] ?? null;
  const hasUnavailable = fingerDecision.deliveryStatus === 'tentative_unavailable'
    || shoulderDecision.deliveryStatus === 'tentative_unavailable';
  return {
    schema: 'physioai.bottle_grab.calibrated_fault_merged_decision.v1_9',
    deliveryStatus: primary ? 'tentative_not_final'
      : hasUnavailable ? 'tentative_unavailable' : 'tentative_no_candidate',
    primaryCueId: primary?.cueId ?? null,
    primaryObservationTag: primary?.observationTag ?? null,
    messages: primary?.messages ?? null,
    secondaryObservations: candidates.slice(1).map((candidate) => ({
      cueId: candidate.cueId,
      observationTag: candidate.observationTag,
      messages: candidate.messages,
    })),
    candidates: candidates.map((candidate) => ({
      cueId: candidate.cueId,
      observationTag: candidate.observationTag,
      aggregate: candidate.aggregate,
      persistence: candidate.persistence,
    })),
    sourceAssessments: {
      finger: {
        status: fingerDecision.deliveryStatus,
        candidateCount: fingerDecision.candidates.length,
        engineId: fingerDecision.engineId,
      },
      shoulder: {
        status: shoulderDecision.deliveryStatus,
        candidateCount: shoulderDecision.candidates.length,
        engineId: shoulderDecision.engineId,
      },
    },
    repetitionContext,
  };
}

/**
 * Mandatory V1.9 development entry point. It calls V1.8 first (thereby
 * executing both original sources), then applies the labeled-development
 * calibration policy without passing human labels into either decision.
 */
export function evaluateBottleGrabFaultEnginesV1_9({
  frames,
  shoulderProfile,
  shoulderRepetition,
  repetitionContext,
} = {}) {
  const base = evaluateBottleGrabFaultEnginesV1_8({
    frames,
    shoulderProfile,
    shoulderRepetition,
    repetitionContext,
  });
  const safeFrames = Array.isArray(frames) && frames.length > 0
    ? frames : [{ phase: null, measurements: {} }];
  const fingerDecision = classifyCalibratedFinger(safeFrames);
  const shoulderDecision = classifyCalibratedShoulder(shoulderRepetition);
  const profileFusion = applyProfileConditionedFusion({
    fingerDecision,
    shoulderDecision,
    shoulderProfile,
    shoulderRepetition,
    repetitionContext,
  });
  const mergedDecision = merge(
    profileFusion.fingerDecision,
    profileFusion.shoulderDecision,
    base.mergedDecision.repetitionContext,
  );
  return Object.freeze({
    schema: FAULT_ENGINE_BUNDLE_V1_9_DECISION_SCHEMA,
    engineId: FAULT_ENGINE_BUNDLE_V1_9_ID,
    version: '1.9.0-dev-calibration-1',
    mode: 'development_labeled_calibration_candidate',
    invocation: base.invocation,
    sourceBundleDecision: {
      schema: base.schema,
      finger: base.fingerDecision.deliveryStatus,
      shoulder: base.shoulderDecision.deliveryStatus,
    },
    fingerDecision: profileFusion.fingerDecision,
    shoulderDecision: profileFusion.shoulderDecision,
    profileConditionedFusion: profileFusion.metadata,
    mergedDecision,
    calibrationPolicy: CALIBRATED_FAULT_POLICY_V1_9,
    claimBoundary: CALIBRATED_FAULT_POLICY_V1_9.claimBoundary,
  });
}

/**
 * Canonical Bottle Grab development-module entry point.
 *
 * Callers use this function for model evaluation instead of selecting a
 * source engine. It triggers the V1.9 bundle exactly once; V1.9 calls the
 * V1.8 source bundle, which executes both finger and shoulder engines. The
 * explicit status guard prevents a future refactor from silently skipping a
 * source while still returning a plausible-looking comment.
 */
export function evaluateBottleGrabModelModuleV1_9(input = {}) {
  const faultEngineBundle = evaluateBottleGrabFaultEnginesV1_9(input);
  const invocation = faultEngineBundle.invocation;
  const sourcesExecuted = ['finger', 'shoulder'].every(
    (source) => invocation?.[source]?.status === 'executed',
  );
  if (!sourcesExecuted) {
    throw new Error('V1.9 automatic module requires executed finger and shoulder sources');
  }
  return Object.freeze({
    schema: BOTTLE_GRAB_MODEL_MODULE_V1_9_SCHEMA,
    moduleId: BOTTLE_GRAB_MODEL_MODULE_V1_9_ID,
    version: CALIBRATED_FAULT_POLICY_V1_9.version,
    mode: 'development_automatic_model_module',
    automaticFaultEngine: Object.freeze({
      status: 'executed',
      engineId: faultEngineBundle.engineId,
      invocation,
      sourceBundleDecision: faultEngineBundle.sourceBundleDecision,
    }),
    faultEngineBundle,
    mergedDecision: faultEngineBundle.mergedDecision,
    provenance: Object.freeze({
      labelUsedByEngine: false,
      automaticTrigger: true,
    }),
    claimBoundary: faultEngineBundle.claimBoundary,
  });
}
