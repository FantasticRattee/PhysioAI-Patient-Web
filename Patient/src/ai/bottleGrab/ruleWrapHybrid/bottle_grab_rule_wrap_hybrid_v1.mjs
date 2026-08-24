import {
  NORMAL_MANIFOLD_COMMENT_CATALOG_V1_6,
} from '../calibration3/bottle_grab_normal_manifold_comment_rules_v1_6.mjs';

/**
 * Rule-Wrap Hybrid V1 is a development-only wrapper around frozen Calibration
 * 3.  It keeps the parent shoulder decision and gates/replaces only the finger
 * candidate with independent, view-aware evidence.  It is deliberately not a
 * neural model and cannot establish physical bottle contact.
 */
export const RULE_WRAP_HYBRID_VERSION =
  '1.9.0-dev-calibration-3-rule-wrap-hybrid-1';
export const RULE_WRAP_HYBRID_BASELINE_NUMBER = 4;
export const RULE_WRAP_HYBRID_ID = 'bottle_grab_rule_wrap_hybrid_v1';
export const RULE_WRAP_HYBRID_SCHEMA =
  'physioai.bottle_grab.rule_wrap_hybrid_decision.v1';
export const RULE_WRAP_EVIDENCE_SCHEMA =
  'physioai.bottle_grab.rule_wrap_evidence.v1';

export const RULE_WRAP_HYBRID_POLICY_V1 = Object.freeze({
  schema: 'physioai.bottle_grab.rule_wrap_hybrid_policy.v1',
  version: RULE_WRAP_HYBRID_VERSION,
  baseline: Object.freeze({
    number: RULE_WRAP_HYBRID_BASELINE_NUMBER,
    id: 'bottle_grab_rule_wrap_hybrid_v1_baseline_4',
    status: 'frozen_development_baseline',
  }),
  parentEngine: 'bottle_grab_fault_engine_bundle_v1_9_calibration_3',
  parentVersion: '1.9.0-dev-calibration-3',
  viewProfiles: Object.freeze({
    side_anatomical_left: Object.freeze({
      visibleFingerIds: Object.freeze(['index', 'middle', 'ring', 'pinky']),
      thumbRole: 'optional_when_occluded',
    }),
    front_anatomical_left: Object.freeze({
      visibleFingerIds: Object.freeze(['thumb', 'index', 'middle', 'ring', 'pinky']),
      thumbRole: 'required_when_reliable',
    }),
  }),
  finger: Object.freeze({
    minimumVisibleAssessableFingers: 3,
    minimumIndependentSignalFamilies: 2,
    minimumSignalScore: 0.75,
    minimumPersistence: 0.65,
    suppressBaseFingerWithoutRuleEvidence: true,
  }),
  evidenceThresholds: Object.freeze({
    pinkyIndexGapMinDegrees: 12,
    visibleFingerSpreadMinDegrees: 10,
    preserveParentFingerOnUnqualified: true,
  }),
  fusion: Object.freeze({
    preserveParentShoulder: true,
    maximumCues: 2,
    priority: Object.freeze(['finger', 'shoulder']),
  }),
  claimBoundary: Object.freeze({
    runtimeAuthorized: false,
    browserAuthorized: false,
    appAuthorized: false,
    correctnessDecision: false,
    physicalContactTruth: false,
    clinical: false,
    labelsUsedByEngine: false,
  }),
});

const FINGER_CUE_ID = 'BG_REF_WRAP_FINGERS_MORE';
const SHOULDER_CUE_ID = 'BG_REF_RELAX_SHOULDER';

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

function candidateFor(decision, cueId) {
  if (!isRecord(decision)) return null;
  const direct = Array.isArray(decision.candidates)
    ? decision.candidates.find((candidate) => candidate?.cueId === cueId)
    : null;
  if (direct) return direct;
  const secondary = Array.isArray(decision.secondaryObservations)
    ? decision.secondaryObservations.find((candidate) => candidate?.cueId === cueId)
    : null;
  if (secondary) return secondary;
  if (decision.primaryCueId === cueId) {
    return {
      cueId,
      observationTag: decision.primaryObservationTag ?? null,
      messages: decision.messages ?? cueMessages(cueId),
    };
  }
  return null;
}

function normalizeVisibleFingerIds(evidence, profile) {
  const ids = Array.isArray(evidence.visibleFingerIds)
    ? evidence.visibleFingerIds.filter((id) => typeof id === 'string')
    : [];
  const allowed = new Set(profile.visibleFingerIds);
  return [...new Set(ids.map((id) => (id === 'little' ? 'pinky' : id)))]
    .filter((id) => allowed.has(id));
}

function assessRuleEvidence(ruleEvidence) {
  if (!isRecord(ruleEvidence) || ruleEvidence.schema !== RULE_WRAP_EVIDENCE_SCHEMA) {
    return {
      status: 'cannot_assess',
      reason: 'missing_or_unknown_rule_evidence_schema',
      viewProfile: null,
      visibleFingerIds: [],
      thumbRole: null,
      supportingFingerCount: 0,
      independentSignalCount: 0,
      persistence: null,
    };
  }
  const profile = RULE_WRAP_HYBRID_POLICY_V1.viewProfiles[ruleEvidence.viewProfile];
  if (!profile) {
    return {
      status: 'cannot_assess',
      reason: 'unsupported_view_profile',
      viewProfile: ruleEvidence.viewProfile,
      visibleFingerIds: [],
      thumbRole: null,
      supportingFingerCount: 0,
      independentSignalCount: 0,
      persistence: null,
    };
  }
  const visibleFingerIds = normalizeVisibleFingerIds(ruleEvidence, profile);
  const availableFingerIds = visibleFingerIds.filter((fingerId) => (
    (ruleEvidence.fingerEvidence?.[fingerId]
      ?? (fingerId === 'pinky' ? ruleEvidence.fingerEvidence?.little : null))?.status === 'available'
  ));
  const persistence = Number(ruleEvidence.persistence);
  const independentSignals = Array.isArray(ruleEvidence.independentSignals)
    ? ruleEvidence.independentSignals.filter((signal) => (
      isRecord(signal)
      && typeof signal.signalId === 'string'
      && finite(Number(signal.score))
      && Number(signal.score) >= RULE_WRAP_HYBRID_POLICY_V1.finger.minimumSignalScore
    ))
    : [];
  const uniqueSignals = [...new Set(independentSignals.map((signal) => signal.signalId))];
  const common = {
    viewProfile: ruleEvidence.viewProfile,
    visibleFingerIds,
    thumbRole: profile.thumbRole,
    supportingFingerCount: availableFingerIds.length,
    independentSignalCount: uniqueSignals.length,
    persistence: finite(persistence) ? persistence : null,
  };
  if (ruleEvidence.status !== 'can_assess' || ruleEvidence.nativeUnmirrored !== true) {
    return { ...common, status: 'cannot_assess', reason: 'upstream_view_or_hand_not_assessable' };
  }
  if (availableFingerIds.length < RULE_WRAP_HYBRID_POLICY_V1.finger.minimumVisibleAssessableFingers) {
    return { ...common, status: 'suppressed_insufficient_visible_fingers', reason: 'minimum_visible_finger_gate' };
  }
  if (uniqueSignals.length < RULE_WRAP_HYBRID_POLICY_V1.finger.minimumIndependentSignalFamilies) {
    return { ...common, status: 'suppressed_insufficient_corroboration', reason: 'minimum_independent_signal_gate' };
  }
  if (!finite(persistence) || persistence < RULE_WRAP_HYBRID_POLICY_V1.finger.minimumPersistence) {
    return { ...common, status: 'suppressed_insufficient_persistence', reason: 'minimum_persistence_gate' };
  }
  return {
    ...common,
    status: 'qualified',
    reason: null,
    signalIds: uniqueSignals,
  };
}

function buildFingerCandidate(parentFinger, assessment) {
  const parent = parentFinger ?? {};
  return {
    ...parent,
    cueId: FINGER_CUE_ID,
    observationTag: parent.observationTag ?? 'BG_OBS_GRASP_CLOSURE_BELOW_REFERENCE',
    messages: parent.messages ?? cueMessages(FINGER_CUE_ID),
    source: 'rule_wrap_hybrid',
    evidence: {
      viewProfile: assessment.viewProfile,
      visibleFingerIds: assessment.visibleFingerIds,
      supportingFingerCount: assessment.supportingFingerCount,
      independentSignalCount: assessment.independentSignalCount,
      persistence: assessment.persistence,
      signalIds: assessment.signalIds,
    },
    physicalContactTruth: false,
    tentative: true,
  };
}

function mergeCandidates(fingerCandidate, shoulderCandidate) {
  return [fingerCandidate, shoulderCandidate]
    .filter(Boolean)
    .sort((left, right) => (
      (left.cueId === FINGER_CUE_ID ? 0 : 1) - (right.cueId === FINGER_CUE_ID ? 0 : 1)
    ))
    .filter((candidate, index, all) => (
      all.findIndex((item) => item.cueId === candidate.cueId) === index
    ))
    .slice(0, RULE_WRAP_HYBRID_POLICY_V1.fusion.maximumCues);
}

export function evaluateBottleGrabRuleWrapHybrid({
  calibrationDecision,
  ruleEvidence,
  repetitionContext = null,
  preserveParentFingerOnUnqualified = false,
} = {}) {
  const assessment = assessRuleEvidence(ruleEvidence);
  const parentFinger = candidateFor(calibrationDecision, FINGER_CUE_ID);
  const parentShoulder = candidateFor(calibrationDecision, SHOULDER_CUE_ID);
  const fingerCandidate = assessment.status === 'qualified'
    ? buildFingerCandidate(parentFinger, assessment)
    : preserveParentFingerOnUnqualified && parentFinger
      ? { ...parentFinger, source: 'calibration3_parent_fallback', tentative: true }
      : null;
  const candidates = mergeCandidates(fingerCandidate, parentShoulder);
  const primary = candidates[0] ?? null;
  const shoulderPreserved = parentShoulder !== null;
  const fingerStatus = assessment.status === 'qualified'
    ? 'qualified_rule_corroborated'
    : assessment.status === 'cannot_assess'
      ? 'cannot_assess'
      : assessment.status;
  return Object.freeze({
    schema: RULE_WRAP_HYBRID_SCHEMA,
    engineId: RULE_WRAP_HYBRID_ID,
    version: RULE_WRAP_HYBRID_VERSION,
    mode: 'development_rule_wrap_hybrid',
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
    fingerDecision: Object.freeze({
      status: fingerStatus,
      candidate: fingerCandidate,
      parentCandidatePresent: parentFinger !== null,
      parentFallbackUsed: assessment.status !== 'qualified'
        && preserveParentFingerOnUnqualified
        && parentFinger !== null,
    }),
    shoulderDecision: Object.freeze({
      status: parentShoulder ? 'preserved_from_calibration_3' : 'no_parent_candidate',
      candidate: parentShoulder,
    }),
    ruleEvidence: Object.freeze({
      ...assessment,
      labelsUsedByEngine: false,
      rawLandmarksPersisted: false,
    }),
    repetitionContext,
    provenance: Object.freeze({
      parentEngine: RULE_WRAP_HYBRID_POLICY_V1.parentEngine,
      parentVersion: RULE_WRAP_HYBRID_POLICY_V1.parentVersion,
      shoulderPreservedFromCalibration3: shoulderPreserved,
      labelsUsedByEngine: false,
      physicalContactTruth: false,
      ruleEvidenceValidated: true,
    }),
    policy: RULE_WRAP_HYBRID_POLICY_V1,
    claimBoundary: RULE_WRAP_HYBRID_POLICY_V1.claimBoundary,
  });
}
