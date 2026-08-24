import {
  NORMAL_MANIFOLD_COMMENT_CATALOG_V1_6,
} from './bottle_grab_normal_manifold_comment_rules_v1_6.mjs';
import {
  NORMAL_MANIFOLD_PROFILE_SCHEMA,
  classifyBottleGrabNormalManifoldRepetition,
} from './bottle_grab_normal_manifold_profile_v1_7.mjs';
import {
  evaluateBottleGrabFaultEnginesV1_9,
} from './bottle_grab_fault_engine_bundle_v1_9.mjs';

/**
 * Development-only Long-Run Calibration iteration 05 final candidate.
 *
 * This candidate keeps V1.4 Baseline #1 and V1.9 calibration-2 immutable. It
 * executes the existing V1.9/V1.8 sources, then applies two evidence-backed
 * changes found during the corrected-label replay:
 *
 * 1. finger and shoulder candidates are selected independently, so one source
 * cannot hide the other;
 * 2. shoulder output is guarded by the existing profile direction plus the
 * shoulder-to-ear summary, while the finger rule accepts only profile-backed
 * evidence or a conservative strong joint aperture/closure pattern.
 *
 * This remains a deterministic development candidate, not a trained NN,
 * runtime authorization, or clinical correctness decision.
 */
export const CALIBRATED_FAULT_POLICY_V1_9_CALIBRATION_3 = Object.freeze({
  schema: 'physioai.bottle_grab.calibrated_fault_policy.v1_9_calibration_3',
  version: '1.9.0-dev-calibration-3',
  sourceBundle: 'bottle_grab_fault_engine_bundle_v1_9',
  finger: Object.freeze({
    profileRequiresDeviation: true,
    strongPatternApertureP50Min: 0.56,
    strongPatternFlexionP50Min: 37,
    observation: 'profile_deviation_or_joint_aperture_and_closure_pattern',
  }),
  shoulder: Object.freeze({
    profileRequiresDeviation: true,
    shoulderEarP50Max: 0.48,
    profileScoreMin: 3.5,
    positiveP50OrScore: true,
    observation: 'profile_direction_plus_working_shoulder_to_ear_guard',
  }),
  fusion: Object.freeze({
    independentRegions: true,
    priority: Object.freeze(['finger', 'shoulder']),
    maximumCues: 2,
  }),
  claimBoundary: Object.freeze({
    runtimeAuthorized: false,
    browserAuthorized: false,
    appAuthorized: false,
    correctnessDecision: false,
    clinical: false,
  }),
});

export const FAULT_ENGINE_BUNDLE_V1_9_CALIBRATION_3_DECISION_SCHEMA =
  'physioai.bottle_grab.fault_engine_bundle_decision.v1_9_calibration_3';
export const FAULT_ENGINE_BUNDLE_V1_9_CALIBRATION_3_ID =
  'bottle_grab_fault_engine_bundle_v1_9_calibration_3';
export const BOTTLE_GRAB_MODEL_MODULE_V1_9_CALIBRATION_3_ID =
  'bottle_grab_model_module_v1_9_calibration_3';
export const BOTTLE_GRAB_MODEL_MODULE_V1_9_CALIBRATION_3_SCHEMA =
  'physioai.bottle_grab.model_module_decision.v1_9_calibration_3';

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

function cueMessages(cueId) {
  return NORMAL_MANIFOLD_COMMENT_CATALOG_V1_6.cues.find(
    (cue) => cue.cueId === cueId,
  )?.messages ?? null;
}

function profileCandidate(cueId, observationTag, regionResult) {
  return {
    cueId,
    observationTag,
    messages: cueMessages(cueId),
    aggregate: 'normal_manifold_profile',
    persistence: regionResult?.persistence ?? null,
  };
}

function profileFor({ shoulderProfile, shoulderRepetition }) {
  if (!isRecord(shoulderProfile)
      || shoulderProfile.schema !== NORMAL_MANIFOLD_PROFILE_SCHEMA
      || !isRecord(shoulderRepetition)) return null;
  try {
    return classifyBottleGrabNormalManifoldRepetition({
      repetition: { ...shoulderRepetition, label: 'evaluation', frames: undefined },
      profile: shoulderProfile,
    });
  } catch {
    return null;
  }
}

function region(profileDecision, regionId) {
  return profileDecision?.regionResults?.find((candidate) => candidate.regionId === regionId) ?? null;
}

function sourceCandidate(decision, cueId) {
  return decision?.candidates?.find((candidate) => candidate.cueId === cueId) ?? null;
}

function decisionFromCandidate(candidate, engineId) {
  return {
    schema: 'physioai.bottle_grab.calibrated_region_decision.v1_9_calibration_3',
    engineId,
    deliveryStatus: candidate ? 'tentative_not_final' : 'tentative_no_candidate',
    primaryCueId: candidate?.cueId ?? null,
    primaryObservationTag: candidate?.observationTag ?? null,
    messages: candidate?.messages ?? null,
    secondaryObservations: [],
    candidates: candidate ? [candidate] : [],
    countsAsRepetition: false,
    provenance: {
      baseSourceRan: true,
      labelUsedByEngine: false,
    },
  };
}

function selectFingerCandidate({ source, profileDecision, shoulderRepetition }) {
  const profileRegion = region(profileDecision, 'hand_finger');
  const profileDeviation = profileRegion?.status === 'deviation';
  const sourceFinger = sourceCandidate(source?.faultEngineBundle?.fingerDecision, FINGER_WRAP_CUE_ID);
  const summary = shoulderRepetition?.regionSummaries?.hand_finger ?? {};
  const aperture = Number(summary.thumb_index_aperture_p50);
  const flexion = Number(summary.mean_finger_flexion_p50);
  const strongPattern = finite(aperture)
    && finite(flexion)
    && aperture >= CALIBRATED_FAULT_POLICY_V1_9_CALIBRATION_3.finger.strongPatternApertureP50Min
    && flexion >= CALIBRATED_FAULT_POLICY_V1_9_CALIBRATION_3.finger.strongPatternFlexionP50Min;
  if (!profileDecision) return sourceFinger ?? (strongPattern ? {
    cueId: FINGER_WRAP_CUE_ID,
    observationTag: FINGER_WRAP_TAG,
    messages: cueMessages(FINGER_WRAP_CUE_ID),
    aggregate: { apertureP50: aperture, flexionP50: flexion },
    persistence: { evidence: 'strong_joint_aperture_and_closure_pattern' },
  } : null);
  if (profileDeviation) {
    return profileCandidate(FINGER_WRAP_CUE_ID, FINGER_WRAP_TAG, profileRegion);
  }
  if (strongPattern) return sourceFinger ?? {
    cueId: FINGER_WRAP_CUE_ID,
    observationTag: FINGER_WRAP_TAG,
    messages: cueMessages(FINGER_WRAP_CUE_ID),
    aggregate: { apertureP50: aperture, flexionP50: flexion },
    persistence: { evidence: 'strong_joint_aperture_and_closure_pattern' },
  };
  return null;
}

function selectShoulderCandidate({ source, profileDecision, shoulderRepetition }) {
  const sourceShoulder = sourceCandidate(
    source?.faultEngineBundle?.shoulderDecision,
    SHOULDER_CUE_ID,
  );
  if (!profileDecision) return sourceShoulder;
  const profileRegion = region(profileDecision, 'shoulder_upper_arm');
  const summary = shoulderRepetition?.regionSummaries?.shoulder_upper_arm ?? {};
  const p50 = Number(summary.shoulder_delta_p50);
  const earP50 = Number(summary.shoulder_ear_distance_p50);
  const score = Number(profileRegion?.score);
  const policy = CALIBRATED_FAULT_POLICY_V1_9_CALIBRATION_3.shoulder;
  const profileEvidence = profileRegion?.status === 'deviation'
    && profileRegion.direction === 'elevated'
    && finite(earP50)
    && earP50 < policy.shoulderEarP50Max
    && ((policy.positiveP50OrScore && finite(p50) && p50 > 0)
      || (finite(score) && score >= policy.profileScoreMin));
  return profileEvidence
    ? profileCandidate(SHOULDER_CUE_ID, SHOULDER_TAG, profileRegion)
    : null;
}

function merge(fingerDecision, shoulderDecision, repetitionContext) {
  const candidates = [
    ...fingerDecision.candidates,
    ...shoulderDecision.candidates,
  ].filter(Boolean).sort((left, right) => (
    (left.cueId === FINGER_WRAP_CUE_ID ? 0 : 1)
      - (right.cueId === FINGER_WRAP_CUE_ID ? 0 : 1)
  )).filter((candidate, index, all) => (
    all.findIndex((item) => item.cueId === candidate.cueId) === index
  )).slice(0, CALIBRATED_FAULT_POLICY_V1_9_CALIBRATION_3.fusion.maximumCues);
  const primary = candidates[0] ?? null;
  return {
    schema: 'physioai.bottle_grab.calibrated_fault_merged_decision.v1_9_calibration_3',
    deliveryStatus: primary ? 'tentative_not_final' : 'tentative_no_candidate',
    primaryCueId: primary?.cueId ?? null,
    primaryObservationTag: primary?.observationTag ?? null,
    messages: primary?.messages ?? null,
    secondaryObservations: candidates.slice(1).map((candidate) => ({
      cueId: candidate.cueId,
      observationTag: candidate.observationTag,
      messages: candidate.messages,
    })),
    candidates,
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

export function evaluateBottleGrabFaultEnginesV1_9Calibration3({
  frames,
  shoulderProfile,
  shoulderRepetition,
  repetitionContext,
} = {}) {
  const source = evaluateBottleGrabFaultEnginesV1_9({
    frames,
    shoulderProfile: undefined,
    shoulderRepetition,
    repetitionContext,
  });
  const profileDecision = profileFor({ shoulderProfile, shoulderRepetition });
  const fingerCandidate = selectFingerCandidate({
    source,
    profileDecision,
    shoulderRepetition,
  });
  const shoulderCandidate = selectShoulderCandidate({
    source,
    profileDecision,
    shoulderRepetition,
  });
  const fingerDecision = decisionFromCandidate(
    fingerCandidate,
    'normal_manifold_finger_v1_9_calibration_3',
  );
  const shoulderDecision = decisionFromCandidate(
    shoulderCandidate,
    'normal_manifold_shoulder_v1_9_calibration_3',
  );
  const mergedDecision = merge(
    fingerDecision,
    shoulderDecision,
    source.mergedDecision.repetitionContext,
  );
  return Object.freeze({
    schema: FAULT_ENGINE_BUNDLE_V1_9_CALIBRATION_3_DECISION_SCHEMA,
    engineId: FAULT_ENGINE_BUNDLE_V1_9_CALIBRATION_3_ID,
    version: CALIBRATED_FAULT_POLICY_V1_9_CALIBRATION_3.version,
    mode: 'development_labeled_calibration_candidate',
    invocation: source.invocation,
    sourceBundleDecision: source.sourceBundleDecision,
    fingerDecision,
    shoulderDecision,
    profileDecision,
    mergedDecision,
    calibrationPolicy: CALIBRATED_FAULT_POLICY_V1_9_CALIBRATION_3,
    claimBoundary: CALIBRATED_FAULT_POLICY_V1_9_CALIBRATION_3.claimBoundary,
  });
}

export function evaluateBottleGrabModelModuleV1_9Calibration3(input = {}) {
  const faultEngineBundle = evaluateBottleGrabFaultEnginesV1_9Calibration3(input);
  const sourcesExecuted = ['finger', 'shoulder'].every(
    (source) => faultEngineBundle.invocation?.[source]?.status === 'executed',
  );
  if (!sourcesExecuted) {
    throw new Error('V1.9 calibration-3 requires executed finger and shoulder sources');
  }
  return Object.freeze({
    schema: BOTTLE_GRAB_MODEL_MODULE_V1_9_CALIBRATION_3_SCHEMA,
    moduleId: BOTTLE_GRAB_MODEL_MODULE_V1_9_CALIBRATION_3_ID,
    version: CALIBRATED_FAULT_POLICY_V1_9_CALIBRATION_3.version,
    mode: 'development_automatic_model_module',
    automaticFaultEngine: Object.freeze({
      status: 'executed',
      engineId: faultEngineBundle.engineId,
      invocation: faultEngineBundle.invocation,
      sourceBundleDecision: faultEngineBundle.sourceBundleDecision,
    }),
    faultEngineBundle,
    mergedDecision: faultEngineBundle.mergedDecision,
    provenance: Object.freeze({
      labelUsedByEngine: false,
      automaticTrigger: true,
      independentRegionFusion: true,
    }),
    claimBoundary: faultEngineBundle.claimBoundary,
  });
}
