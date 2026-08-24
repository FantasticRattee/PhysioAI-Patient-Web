/**
 * Reference-conditioned normal-manifold profile for Bottle Grab V1.7.
 *
 * This is a development/evaluation layer only.  It is intentionally not
 * imported by the frozen V1.4 browser activation bundle.  The profile learns
 * the range of regional repetition summaries from several nominal videos and
 * reports a named residual only when multiple features agree.  It does not
 * produce a correctness verdict, does not invent fault names, and does not
 * replace upstream Capture-QC or the PhaseNet repetition tracker.
 */

export const NORMAL_MANIFOLD_PROFILE_SCHEMA =
  'physioai.bottle_grab.normal_manifold_profile.v1_7';

export const NORMAL_MANIFOLD_PROFILE_REGIONS = Object.freeze([
  'hand_finger',
  'shoulder_upper_arm',
  'trunk',
]);

const REGION_RULES = Object.freeze({
  hand_finger: Object.freeze({
    cueId: 'BG_REF_WRAP_FINGERS_MORE',
    observationTag: 'BG_OBS_GRASP_CLOSURE_BELOW_REFERENCE',
    direction: 'hand_configuration_deviation',
    featureIds: Object.freeze([
      'mean_finger_flexion_p50',
      'mean_finger_flexion_p90',
      'thumb_index_aperture_p10',
      'thumb_index_aperture_p50',
      'index_mcp_flexion_p50',
      'index_pip_flexion_p50',
      'index_dip_flexion_p50',
    ]),
  }),
  shoulder_upper_arm: Object.freeze({
    cueId: 'BG_REF_RELAX_SHOULDER',
    observationTag: 'BG_OBS_WORKING_SHOULDER_ELEVATION_ABOVE_REFERENCE',
    direction: 'elevated',
    featureIds: Object.freeze([
      'shoulder_delta_p10',
      'shoulder_delta_p50',
      'shoulder_delta_p90',
      // An absolute shoulder-to-ear distance is intentionally kept beside
      // the bilateral asymmetry features.  A bilateral shoulder hike can
      // leave right-minus-left asymmetry almost unchanged, while the
      // working shoulder still moves materially closer to the ear.
      'shoulder_ear_distance_p10',
      'shoulder_ear_distance_p50',
      'shoulder_ear_distance_p90',
    ]),
  }),
  trunk: Object.freeze({
    cueId: 'BG_REF_KEEP_TRUNK_STILL',
    observationTag: 'BG_OBS_TRUNK_MOTION_ABOVE_REFERENCE',
    direction: 'excess_motion',
    featureIds: Object.freeze([
      'trunk_change_p50',
      'trunk_change_p90',
      'trunk_lean_p50',
      'trunk_lean_p90',
    ]),
  }),
});

// A concurrent torso residual must not hide a clearer, named shoulder
// compensation.  Keep the hand cue first when it is independently clear,
// then shoulder, then trunk; score still breaks ties within a region.
const REGION_PRIORITY = Object.freeze({
  hand_finger: 0,
  shoulder_upper_arm: 1,
  trunk: 2,
});

const DEFAULT_MIN_REPETITION_FRAMES = 15;
const DEFAULT_MIN_FEATURES_BEYOND = 2;
const DEFAULT_ROBUST_Z = 3.5;
const EPSILON = 1e-9;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function number(value, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${field} must be finite`);
  return parsed;
}

function nonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
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

function robustScale(values, center) {
  const q25 = quantile(values, 0.25);
  const q75 = quantile(values, 0.75);
  const iqr = q25 === null || q75 === null ? 0 : q75 - q25;
  const range = Math.abs((quantile(values, 0.95) ?? center) - (quantile(values, 0.05) ?? center));
  // The floor keeps a small nominal sample from turning a harmless sensor
  // epsilon into an enormous z-score.  It is deliberately descriptive, not
  // a clinical tolerance.
  return Math.max(iqr / 1.349, range * 0.1, Math.abs(center) * 0.02, 0.01);
}

function validateRegionSummary(summary, field) {
  if (!isRecord(summary)) throw new TypeError(`${field} must be an object`);
  const normalized = {};
  for (const [featureId, raw] of Object.entries(summary)) {
    normalized[featureId] = number(raw, `${field}.${featureId}`);
  }
  return normalized;
}

function validateRepetition(rep, field, expectedLabel) {
  if (!isRecord(rep)) throw new TypeError(`${field} must be an object`);
  const clipId = nonEmptyString(rep.clipId ?? rep.sourceClipId, `${field}.clipId`);
  const lineage = nonEmptyString(
    rep.sourceLineageGroup ?? rep.lineageGroup,
    `${field}.sourceLineageGroup`,
  );
  const label = rep.label ?? expectedLabel;
  if (expectedLabel && label !== expectedLabel) {
    throw new Error(`${field}.label must be ${expectedLabel}`);
  }
  const frameCount = Number(rep.assessableFrameCount ?? rep.frameCount ?? 0);
  if (!Number.isInteger(frameCount) || frameCount < 1) {
    throw new TypeError(`${field}.assessableFrameCount must be a positive integer`);
  }
  const regionSummaries = {};
  for (const regionId of NORMAL_MANIFOLD_PROFILE_REGIONS) {
    regionSummaries[regionId] = validateRegionSummary(
      rep.regionSummaries?.[regionId],
      `${field}.regionSummaries.${regionId}`,
    );
  }
  return { clipId, sourceLineageGroup: lineage, label, assessableFrameCount: frameCount, regionSummaries };
}

function buildFeatureProfile(repetitions, regionId, featureId) {
  const values = repetitions
    .map((rep) => rep.regionSummaries[regionId][featureId])
    .filter(finite);
  if (values.length < 3) return null;
  const center = quantile(values, 0.5);
  const scale = robustScale(values, center);
  return {
    center,
    scale,
    lower: quantile(values, 0.05),
    upper: quantile(values, 0.95),
    sampleCount: values.length,
  };
}

/** Build a train-only nominal profile from independent correct-form clips. */
export function buildBottleGrabNormalManifoldProfile({
  profileId = 'bottle_grab_nominal_development_profile_v1_7',
  nominalRepetitions,
  minDistinctLineages = 2,
} = {}) {
  if (!Array.isArray(nominalRepetitions) || nominalRepetitions.length < 3) {
    throw new TypeError('nominalRepetitions must contain at least three repetitions');
  }
  const repetitions = nominalRepetitions.map((rep, index) => validateRepetition(
    rep,
    `nominalRepetitions[${index}]`,
    'nominal',
  ));
  const lineages = [...new Set(repetitions.map((rep) => rep.sourceLineageGroup))];
  if (lineages.length < minDistinctLineages) {
    throw new Error(`normal profile requires at least ${minDistinctLineages} source lineages`);
  }
  const regions = {};
  for (const regionId of NORMAL_MANIFOLD_PROFILE_REGIONS) {
    const featureIds = REGION_RULES[regionId].featureIds;
    const features = {};
    for (const featureId of featureIds) {
      const profile = buildFeatureProfile(repetitions, regionId, featureId);
      if (profile) features[featureId] = profile;
    }
    if (Object.keys(features).length < 2) {
      throw new Error(`normal profile lacks features for ${regionId}`);
    }
    regions[regionId] = {
      ...REGION_RULES[regionId],
      features,
    };
  }
  return {
    schema: NORMAL_MANIFOLD_PROFILE_SCHEMA,
    profileId: nonEmptyString(profileId, 'profileId'),
    status: 'development_train_only',
    nominalRepetitionCount: repetitions.length,
    sourceLineages: lineages,
    regions,
    policy: {
      minRepetitionFrames: DEFAULT_MIN_REPETITION_FRAMES,
      minFeaturesBeyond: DEFAULT_MIN_FEATURES_BEYOND,
      robustZThreshold: DEFAULT_ROBUST_Z,
      unknownDeviation: 'review_required_no_named_cue',
    },
    claimBoundary: {
      runtimeAuthorized: false,
      browserAuthorized: false,
      appAuthorized: false,
      correctnessVerdict: false,
      clinical: false,
    },
  };
}

function classifyRegion(rep, regionId, profile, policy) {
  const region = profile.regions[regionId];
  const summary = rep.regionSummaries[regionId];
  const featureScores = [];
  for (const featureId of Object.keys(region.features)) {
    const value = summary[featureId];
    const reference = region.features[featureId];
    if (!finite(value)) continue;
    const z = (value - reference.center) / Math.max(reference.scale, EPSILON);
    featureScores.push({ featureId, value, z, absoluteZ: Math.abs(z) });
  }
  const beyond = featureScores.filter((score) => score.absoluteZ >= policy.robustZThreshold);
  const score = featureScores.length
    ? featureScores.reduce((sum, item) => sum + item.absoluteZ, 0) / featureScores.length
    : null;
  let direction = region.direction;
  if (regionId === 'shoulder_upper_arm') {
    const shoulder = summary.shoulder_delta_p50;
    const shoulderEar = summary.shoulder_ear_distance_p50;
    const shoulderCenter = region.features.shoulder_delta_p50?.center;
    const shoulderEarCenter = region.features.shoulder_ear_distance_p50?.center;
    direction = (
      (finite(shoulder) && finite(shoulderCenter) && shoulder < shoulderCenter)
      || (finite(shoulderEar) && finite(shoulderEarCenter) && shoulderEar < shoulderEarCenter)
    )
      ? 'elevated'
      : 'not_elevated';
  }
  const qualifies = rep.assessableFrameCount >= policy.minRepetitionFrames
    && beyond.length >= policy.minFeaturesBeyond;
  return {
    regionId,
    cueId: region.cueId,
    observationTag: region.observationTag,
    status: qualifies ? 'deviation' : 'within_reference',
    direction,
    score,
    beyondFeatureCount: beyond.length,
    featureScores,
    persistence: {
      assessableFrameCount: rep.assessableFrameCount,
      minRepetitionFrames: policy.minRepetitionFrames,
      minFeaturesBeyond: policy.minFeaturesBeyond,
    },
  };
}

/** Classify one aggregate repetition without inventing an unknown fault name. */
export function classifyBottleGrabNormalManifoldRepetition({ repetition, profile } = {}) {
  if (!isRecord(profile) || profile.schema !== NORMAL_MANIFOLD_PROFILE_SCHEMA) {
    throw new TypeError('a V1.7 normal-manifold profile is required');
  }
  const rep = validateRepetition(repetition, 'repetition');
  const policy = { ...profile.policy };
  const regionResults = NORMAL_MANIFOLD_PROFILE_REGIONS.map((regionId) => (
    classifyRegion(rep, regionId, profile, policy)
  ));
  const candidates = regionResults
    .filter((result) => result.status === 'deviation' && result.direction !== 'not_elevated')
    .sort((left, right) => (
      (REGION_PRIORITY[left.regionId] ?? Number.MAX_SAFE_INTEGER)
      - (REGION_PRIORITY[right.regionId] ?? Number.MAX_SAFE_INTEGER)
      || (right.score ?? 0) - (left.score ?? 0)
    ));
  const primary = candidates[0] ?? null;
  return {
    schema: 'physioai.bottle_grab.normal_manifold_repetition_decision.v1_7',
    mode: 'development_reference_conditioned_residual',
    deliveryStatus: primary ? 'tentative_deviation' : 'tentative_no_named_deviation',
    primaryCueId: primary?.cueId ?? null,
    primaryObservationTag: primary?.observationTag ?? null,
    secondaryObservations: candidates.slice(1, 3).map((candidate) => ({
      cueId: candidate.cueId,
      observationTag: candidate.observationTag,
    })),
    regionResults,
    countsAsRepetition: false,
    claimBoundary: profile.claimBoundary,
  };
}

export function normalManifoldProfileRulesV1_7() {
  return REGION_RULES;
}
