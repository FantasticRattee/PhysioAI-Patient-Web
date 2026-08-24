import {
  flexionDegrees,
  interiorAngleDegrees,
  normalizedDistance,
} from './bottle_grab_metrics.mjs';


export const COMMENT_MEASUREMENT_IDS = Object.freeze([
  'elbow_interior',
  'shoulder_trunk',
  'trunk_lean',
  'thumb_mcp_flexion',
  'thumb_ip_flexion',
  'index_mcp_flexion',
  'index_pip_flexion',
  'index_dip_flexion',
  'mean_finger_flexion',
  'thumb_index_aperture',
  'working_shoulder_elevation_delta_from_rest_torso',
  'working_shoulder_elevation_asymmetry_torso',
  'trunk_vector_change_from_rest_torso',
  'pose_hand_wrist_association_distance_image',
]);

const POSE_REQUIRED = Object.freeze([11, 12, 13, 15, 23, 24]);
const POSE_VISIBILITY_THRESHOLD = 0.5;
const HAND_SCORE_THRESHOLD = 0.5;
const ASSOCIATION_MAX_ARM_RATIO = 0.15;
const EPSILON = 1e-9;
const REST_RELATIVE_MEASUREMENT_IDS = new Set([
  'working_shoulder_elevation_delta_from_rest_torso',
  'trunk_vector_change_from_rest_torso',
]);

const UNITS = Object.freeze({
  elbow_interior: 'degree',
  shoulder_trunk: 'degree',
  trunk_lean: 'degree',
  thumb_mcp_flexion: 'degree',
  thumb_ip_flexion: 'degree',
  index_mcp_flexion: 'degree',
  index_pip_flexion: 'degree',
  index_dip_flexion: 'degree',
  mean_finger_flexion: 'degree',
  thumb_index_aperture: 'palm_ratio',
  working_shoulder_elevation_delta_from_rest_torso: 'torso_ratio',
  working_shoulder_elevation_asymmetry_torso: 'torso_ratio',
  trunk_vector_change_from_rest_torso: 'torso_ratio',
  pose_hand_wrist_association_distance_image: 'arm_ratio',
});

function finitePoint(point) {
  return point
    && Number.isFinite(Number(point.x))
    && Number.isFinite(Number(point.y))
    && Number.isFinite(Number(point.z ?? 0));
}

function reliablePosePoint(point) {
  if (!finitePoint(point)) return false;
  if (Number.isFinite(Number(point.visibility))
      && Number(point.visibility) < POSE_VISIBILITY_THRESHOLD) return false;
  if (Number.isFinite(Number(point.presence))
      && Number(point.presence) < POSE_VISIBILITY_THRESHOLD) return false;
  return true;
}

function reliablePose(points) {
  return Array.isArray(points)
    && points.length >= 25
    && POSE_REQUIRED.every((index) => reliablePosePoint(points[index]));
}

function reliableHand(points) {
  return Array.isArray(points)
    && points.length === 21
    && points.every(finitePoint);
}

function distance(a, b) {
  return Math.hypot(
    Number(a.x) - Number(b.x),
    Number(a.y) - Number(b.y),
    Number(a.z ?? 0) - Number(b.z ?? 0),
  );
}

function distanceXy(a, b) {
  return Math.hypot(
    Number(a.x) - Number(b.x),
    Number(a.y) - Number(b.y),
  );
}

function midpoint(a, b) {
  return {
    x: (Number(a.x) + Number(b.x)) / 2,
    y: (Number(a.y) + Number(b.y)) / 2,
    z: (Number(a.z ?? 0) + Number(b.z ?? 0)) / 2,
  };
}

function median(values) {
  const ordered = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  if (ordered.length === 0) return null;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

function metric(value, unit, source, assessability = 'can_assess', context = undefined) {
  const finite = Number.isFinite(value);
  return {
    value: finite ? Number(value) : null,
    unit,
    source,
    assessability: finite ? assessability : assessability === 'can_assess'
      ? 'cannot_assess'
      : assessability,
    ...(context === undefined ? {} : { context }),
  };
}

function blankMeasurements(reason) {
  return Object.fromEntries(COMMENT_MEASUREMENT_IDS.map((measurementId) => [
    measurementId,
    metric(null, UNITS[measurementId], reason, 'cannot_assess'),
  ]));
}

function selectPosePoints(poseImage, poseWorld, indices) {
  const imageReady = Array.isArray(poseImage)
    && indices.every((index) => reliablePosePoint(poseImage[index]));
  if (!imageReady) return { points: null, source: 'cannot_assess' };
  const worldReady = Array.isArray(poseWorld)
    && indices.every((index) => finitePoint(poseWorld[index]));
  return worldReady
    ? { points: poseWorld, source: 'pose_world' }
    : { points: poseImage, source: 'pose_image' };
}

function selectHandPoints(handImage, handWorld, indices) {
  const imageReady = Array.isArray(handImage)
    && indices.every((index) => finitePoint(handImage[index]));
  if (!imageReady) return { points: null, source: 'cannot_assess' };
  const worldReady = Array.isArray(handWorld)
    && indices.every((index) => finitePoint(handWorld[index]));
  return worldReady
    ? { points: handWorld, source: 'hand_world' }
    : { points: handImage, source: 'hand_image' };
}

function imageContext(poseImage) {
  const shoulderMidpoint = midpoint(poseImage[11], poseImage[12]);
  const hipMidpoint = midpoint(poseImage[23], poseImage[24]);
  const torsoScale = distanceXy(shoulderMidpoint, hipMidpoint);
  const armScale = distanceXy(poseImage[11], poseImage[13])
    + distanceXy(poseImage[13], poseImage[15]);
  if (torsoScale <= EPSILON || armScale <= EPSILON) {
    throw new Error('degenerate Pose scale');
  }
  return { shoulderMidpoint, hipMidpoint, torsoScale, armScale };
}

export function selectBottleGrabWorkingHandIndex({
  result,
  poseImage,
  anatomicalSide = 'left',
}) {
  if (anatomicalSide !== 'left' || !reliablePosePoint(poseImage?.[15])) return -1;
  const handednessGroups = result?.handednesses || result?.handedness;
  const imageGroups = result?.landmarks;
  if (!Array.isArray(handednessGroups) || !Array.isArray(imageGroups)) return -1;

  const candidates = [];
  for (let index = 0; index < handednessGroups.length; index += 1) {
    const category = handednessGroups[index]?.[0] || handednessGroups[index];
    const label = String(
      category?.categoryName ?? category?.displayName ?? category?.label ?? '',
    ).toLowerCase();
    const score = Number(category?.score);
    const points = imageGroups[index];
    if (label !== 'left'
        || !Number.isFinite(score)
        || score < HAND_SCORE_THRESHOLD
        || !reliableHand(points)) continue;
    candidates.push({
      index,
      score,
      workingWristDistance: distanceXy(poseImage[15], points[0]),
    });
  }
  candidates.sort((left, right) => (
    left.workingWristDistance - right.workingWristDistance
    || right.score - left.score
    || left.index - right.index
  ));
  return candidates[0]?.index ?? -1;
}

export function computeBottleGrabCommentMeasurements({
  poseImage,
  poseWorld = null,
  handImage,
  handWorld = null,
  anatomicalSide = 'left',
}) {
  if (anatomicalSide !== 'left') {
    throw new Error('Bottle Grab Comment Engine V1 supports anatomical-left only');
  }
  if (!reliablePose(poseImage) || !reliableHand(handImage)) {
    return blankMeasurements('cannot_assess_missing_required_landmarks');
  }

  const context = imageContext(poseImage);
  const bodyAll = selectPosePoints(poseImage, poseWorld, [11, 12, 13, 15, 23, 24]);
  const fingerChains = [
    [0, 5, 6], [5, 6, 7], [6, 7, 8],
    [0, 9, 10], [9, 10, 11], [10, 11, 12],
    [0, 13, 14], [13, 14, 15], [14, 15, 16],
    [0, 17, 18], [17, 18, 19], [18, 19, 20],
  ];
  const handAll = selectHandPoints(handImage, handWorld, Array.from({ length: 21 }, (_, index) => index));
  const fingerValues = handAll.points
    ? fingerChains.map(([a, b, c]) => flexionDegrees(
      handAll.points[a], handAll.points[b], handAll.points[c],
    )).filter(Number.isFinite)
    : [];
  const palmScales = [5, 9, 13, 17]
    .map((index) => distance(handAll.points[0], handAll.points[index]))
    .toSorted((a, b) => a - b);
  const palmScale = palmScales[Math.floor(palmScales.length / 2)];
  const shoulderElevationAsymmetry = (
    Number(poseImage[12].y) - Number(poseImage[11].y)
  ) / context.torsoScale;
  const torsoVector = {
    x: context.shoulderMidpoint.x - context.hipMidpoint.x,
    y: context.shoulderMidpoint.y - context.hipMidpoint.y,
    z: context.shoulderMidpoint.z - context.hipMidpoint.z,
  };
  const association = distanceXy(poseImage[15], handImage[0]) / context.armScale;

  return {
    elbow_interior: metric(
      bodyAll.points
        ? interiorAngleDegrees(bodyAll.points[11], bodyAll.points[13], bodyAll.points[15])
        : null,
      'degree',
      bodyAll.source,
    ),
    shoulder_trunk: metric(
      bodyAll.points
        ? interiorAngleDegrees(bodyAll.points[13], bodyAll.points[11], bodyAll.points[23])
        : null,
      'degree',
      bodyAll.source,
    ),
    trunk_lean: metric(bodyAll.points ? (() => {
      const shoulder = midpoint(bodyAll.points[11], bodyAll.points[12]);
      const hip = midpoint(bodyAll.points[23], bodyAll.points[24]);
      const vertical = { x: hip.x, y: hip.y - 1, z: hip.z };
      return interiorAngleDegrees(shoulder, hip, vertical);
    })() : null, 'degree', bodyAll.source),
    thumb_mcp_flexion: metric(
      handAll.points ? flexionDegrees(handAll.points[1], handAll.points[2], handAll.points[3]) : null,
      'degree',
      handAll.source,
    ),
    thumb_ip_flexion: metric(
      handAll.points ? flexionDegrees(handAll.points[2], handAll.points[3], handAll.points[4]) : null,
      'degree',
      handAll.source,
    ),
    index_mcp_flexion: metric(
      handAll.points ? flexionDegrees(handAll.points[0], handAll.points[5], handAll.points[6]) : null,
      'degree',
      handAll.source,
    ),
    index_pip_flexion: metric(
      handAll.points ? flexionDegrees(handAll.points[5], handAll.points[6], handAll.points[7]) : null,
      'degree',
      handAll.source,
    ),
    index_dip_flexion: metric(
      handAll.points ? flexionDegrees(handAll.points[6], handAll.points[7], handAll.points[8]) : null,
      'degree',
      handAll.source,
    ),
    mean_finger_flexion: metric(
      fingerValues.length
        ? fingerValues.reduce((sum, value) => sum + value, 0) / fingerValues.length
        : null,
      'degree',
      handAll.source,
    ),
    thumb_index_aperture: metric(
      palmScale > EPSILON ? distance(handAll.points[4], handAll.points[8]) / palmScale : null,
      'palm_ratio',
      handAll.source,
    ),
    working_shoulder_elevation_delta_from_rest_torso: metric(
      null,
      'torso_ratio',
      'pose_image_rest_relative',
      'requires_rest_reference',
      { shoulderElevationAsymmetry, torsoVector, torsoScale: context.torsoScale },
    ),
    working_shoulder_elevation_asymmetry_torso: metric(
      shoulderElevationAsymmetry,
      'torso_ratio',
      'pose_image',
    ),
    trunk_vector_change_from_rest_torso: metric(
      null,
      'torso_ratio',
      'pose_image_rest_relative',
      'requires_rest_reference',
      {
        torsoVector,
        torsoScale: context.torsoScale,
      },
    ),
    pose_hand_wrist_association_distance_image: metric(
      association,
      'arm_ratio',
      'pose_hand_image_arm_normalized',
    ),
  };
}

function computeBottleGrabTentativeBodyMeasurements({ poseImage, poseWorld }) {
  if (!reliablePose(poseImage)) return null;
  const context = imageContext(poseImage);
  const bodyAll = selectPosePoints(poseImage, poseWorld, [11, 12, 13, 15, 23, 24]);
  const shoulder = midpoint(bodyAll.points[11], bodyAll.points[12]);
  const hip = midpoint(bodyAll.points[23], bodyAll.points[24]);
  const vertical = { x: hip.x, y: hip.y - 1, z: hip.z };
  const shoulderElevationAsymmetry = (
    Number(poseImage[12].y) - Number(poseImage[11].y)
  ) / context.torsoScale;
  const torsoVector = {
    x: context.shoulderMidpoint.x - context.hipMidpoint.x,
    y: context.shoulderMidpoint.y - context.hipMidpoint.y,
    z: context.shoulderMidpoint.z - context.hipMidpoint.z,
  };
  const measurements = blankMeasurements('cannot_assess_missing_hand');
  measurements.elbow_interior = metric(
    interiorAngleDegrees(bodyAll.points[11], bodyAll.points[13], bodyAll.points[15]),
    'degree',
    bodyAll.source,
  );
  measurements.shoulder_trunk = metric(
    interiorAngleDegrees(bodyAll.points[13], bodyAll.points[11], bodyAll.points[23]),
    'degree',
    bodyAll.source,
  );
  measurements.trunk_lean = metric(
    interiorAngleDegrees(shoulder, hip, vertical),
    'degree',
    bodyAll.source,
  );
  measurements.working_shoulder_elevation_delta_from_rest_torso = metric(
    null,
    'torso_ratio',
    'pose_image_rest_relative',
    'requires_rest_reference',
    { shoulderElevationAsymmetry, torsoVector, torsoScale: context.torsoScale },
  );
  measurements.working_shoulder_elevation_asymmetry_torso = metric(
    shoulderElevationAsymmetry,
    'torso_ratio',
    'pose_image',
  );
  measurements.trunk_vector_change_from_rest_torso = metric(
    null,
    'torso_ratio',
    'pose_image_rest_relative',
    'requires_rest_reference',
    { torsoVector, torsoScale: context.torsoScale },
  );
  return measurements;
}

/**
 * Build a non-authoritative measurement snapshot for the debug probe.
 * Strict observation construction remains unchanged and still requires Pose+Hand.
 */
export function computeBottleGrabTentativeMeasurements({
  poseImage,
  poseWorld = null,
  handImage = null,
  handWorld = null,
  anatomicalSide = 'left',
}) {
  if (anatomicalSide !== 'left') {
    throw new Error('Bottle Grab tentative probe supports anatomical-left only');
  }
  if (reliablePose(poseImage) && reliableHand(handImage)) {
    return computeBottleGrabCommentMeasurements({
      poseImage,
      poseWorld,
      handImage,
      handWorld,
      anatomicalSide,
    });
  }
  return computeBottleGrabTentativeBodyMeasurements({ poseImage, poseWorld })
    || blankMeasurements(
      !reliablePose(poseImage)
        ? 'cannot_assess_missing_pose'
        : 'cannot_assess_missing_hand',
    );
}

function tentativeMeasurementIsFinite(measurement) {
  return measurement
    && measurement.assessability === 'can_assess'
    && Number.isFinite(Number(measurement.value));
}

function tentativeCue(catalog, cueId) {
  return catalog?.cues?.find((cue) => cue?.cueId === cueId) || null;
}

function tentativeConditionStatus(condition, measurement) {
  if (!tentativeMeasurementIsFinite(measurement)) return 'cannot_assess';
  const value = Number(measurement.value);
  const lower = Number(condition.referenceBand?.lower);
  const upper = Number(condition.referenceBand?.upper);
  const uncertainty = Number(condition.uncertaintyMargin);
  if (![lower, upper, uncertainty].every(Number.isFinite)) return 'cannot_assess';
  const boundary = condition.direction === 'below'
    ? value >= lower - uncertainty && value <= lower + uncertainty
    : value >= upper - uncertainty && value <= upper + uncertainty;
  if (boundary) return 'boundary';
  const deviation = condition.direction === 'below'
    ? value < lower - uncertainty
    : value > upper + uncertainty;
  return deviation ? 'deviation' : 'within_reference';
}

/**
 * Inspect available measurements without promoting them to real evidence.
 * This intentionally does not evaluate persistence or completion.
 */
export function buildBottleGrabTentativeCommentProbe({
  timestampMs,
  phase = null,
  captureQc = 'can_assess',
  measurements = {},
  referencePolicy,
  commentCatalog,
  commentDeliveryPolicy,
  availableStreams = {},
  restReferenceAvailable = false,
}) {
  const timestamp = Number(timestampMs);
  if (!Number.isFinite(timestamp) || timestamp < 0) {
    throw new TypeError('tentative probe timestampMs must be finite and non-negative');
  }
  const rules = Array.isArray(referencePolicy?.rules) ? referencePolicy.rules : [];
  const phaseAvailable = typeof phase === 'string' && phase.length > 0;
  const unavailableChecks = [];
  if (availableStreams.pose !== true) unavailableChecks.push('pose_landmarks');
  if (availableStreams.hand !== true) unavailableChecks.push('hand_landmarks');
  if (!phaseAvailable) unavailableChecks.push('phase_unavailable');
  const ruleResults = [];
  const candidates = [];

  for (const rule of rules) {
    if (!phaseAvailable || !rule.phaseScope?.includes(phase)) {
      ruleResults.push({ observationTag: rule.observationTag, status: 'out_of_phase' });
      continue;
    }
    const statuses = (rule.conditions || []).map((condition) => {
      const measurement = measurements[condition.measurementId];
      if (REST_RELATIVE_MEASUREMENT_IDS.has(condition.measurementId)
          && restReferenceAvailable !== true) {
        if (!unavailableChecks.includes('reference_rest_unavailable')) {
          unavailableChecks.push('reference_rest_unavailable');
        }
        return {
          measurementId: condition.measurementId,
          status: 'cannot_assess',
        };
      }
      if (!tentativeMeasurementIsFinite(measurement)
          && measurement?.assessability === 'requires_rest_reference') {
        if (!restReferenceAvailable && !unavailableChecks.includes('reference_rest_unavailable')) {
          unavailableChecks.push('reference_rest_unavailable');
        }
      }
      return {
        measurementId: condition.measurementId,
        status: tentativeConditionStatus(condition, measurement),
      };
    });
    const statusValues = statuses.map((entry) => entry.status);
    const hasCannotAssess = statusValues.includes('cannot_assess');
    const hasDeviation = statusValues.includes('deviation');
    const hasBoundary = statusValues.includes('boundary');
    const matches = rule.conditionMatch === 'any'
      ? hasDeviation
      : !hasCannotAssess && statusValues.length > 0 && statusValues.every((status) => status === 'deviation');
    const status = matches
      ? 'deviation'
      : hasCannotAssess
        ? 'cannot_assess'
        : hasBoundary
          ? 'boundary'
          : 'within_reference';
    const result = {
      observationTag: rule.observationTag,
      cueId: rule.cueId,
      status,
      persistence: 'not_evaluated_tentative',
      conditions: statuses,
    };
    ruleResults.push(result);
    if (matches) {
      const cue = tentativeCue(commentCatalog, rule.cueId);
      if (cue?.messages?.th != null && cue?.messages?.en != null) {
        candidates.push({
          observationTag: rule.observationTag,
          cueId: rule.cueId,
          messages: { th: cue.messages.th, en: cue.messages.en },
          persistence: 'not_evaluated_tentative',
        });
      }
    }
  }

  const priorities = new Map((commentDeliveryPolicy?.priorities || [])
    .map((entry) => [entry.cueId, Number(entry.priorityRank)]));
  candidates.sort((left, right) => (
    (priorities.get(left.cueId) ?? Number.MAX_SAFE_INTEGER)
      - (priorities.get(right.cueId) ?? Number.MAX_SAFE_INTEGER)
  ));
  const selected = candidates.slice(0, 3);
  const primary = selected[0] || null;
  const secondary = selected.slice(1, 3).map((candidate) => ({
    observationTag: candidate.observationTag,
    cueId: candidate.cueId,
  }));
  const sourceQc = String(captureQc || 'can_assess');
  const noCandidate = !primary;
  const noAvailableEvidence = unavailableChecks.length > 0
    && ruleResults.every((result) => ['out_of_phase', 'cannot_assess'].includes(result.status));
  return {
    schema: 'physioai.bottle_grab_tentative_comment_probe.v1_5',
    mode: 'debug_tentative',
    assessability: 'tentative',
    timestampMs: timestamp,
    phase: phaseAvailable ? phase : null,
    sourceQc,
    deliveryStatus: noCandidate
      ? (noAvailableEvidence ? 'tentative_unavailable' : 'tentative_no_candidate')
      : 'tentative_not_final',
    primaryCueId: primary?.cueId ?? null,
    primaryObservationTag: primary?.observationTag ?? null,
    messages: primary?.messages ?? null,
    secondaryObservations: secondary,
    candidates: selected.map((candidate) => ({
      observationTag: candidate.observationTag,
      cueId: candidate.cueId,
      persistence: candidate.persistence,
    })),
    ruleResults,
    unavailableChecks: [...new Set(unavailableChecks)],
    completedRepetition: false,
    countsAsRepetition: false,
    persistence: 'not_evaluated_tentative',
    provenance: {
      rawFramesPersisted: false,
      rawLandmarksPersisted: false,
      generatedText: false,
      network: false,
      audioOrTts: false,
    },
  };
}

export function deriveBottleGrabRestReference(frames) {
  if (!Array.isArray(frames) || frames.length < 3) {
    throw new Error('At least three assessable rest frames are required');
  }
  const shoulderContexts = frames.map((frame) => (
    frame?.working_shoulder_elevation_delta_from_rest_torso?.context
  ));
  const torsoContexts = frames.map((frame) => frame?.trunk_vector_change_from_rest_torso?.context);
  const shoulderValues = shoulderContexts.map((item) => item?.shoulderElevationAsymmetry);
  const trunkLeanValues = frames.map((frame) => frame?.trunk_lean?.value);
  if (!shoulderValues.every(Number.isFinite)
      || !trunkLeanValues.every(Number.isFinite)
      || torsoContexts.some((item) => !finitePoint(item?.torsoVector)
        || !Number.isFinite(item?.torsoScale)
        || item.torsoScale <= EPSILON)) {
    throw new Error('Rest frames do not contain complete torso context');
  }
  return Object.freeze({
    schema: 'physioai.bottle_grab_comment_rest_reference.v1',
    shoulderAsymmetryMedian: median(shoulderValues),
    torsoVector: Object.freeze({
      x: median(torsoContexts.map((item) => item.torsoVector.x)),
      y: median(torsoContexts.map((item) => item.torsoVector.y)),
      z: median(torsoContexts.map((item) => item.torsoVector.z)),
    }),
    torsoScale: median(torsoContexts.map((item) => item.torsoScale)),
    trunkLeanMedian: median(trunkLeanValues),
    frameCount: frames.length,
  });
}

export function applyBottleGrabRestReference(measurements, restReference) {
  if (restReference?.schema !== 'physioai.bottle_grab_comment_rest_reference.v1') {
    throw new Error('A Bottle Grab rest reference is required');
  }
  const shoulderContext = measurements
    ?.working_shoulder_elevation_delta_from_rest_torso?.context;
  const trunkContext = measurements?.trunk_vector_change_from_rest_torso?.context;
  if (!Number.isFinite(shoulderContext?.shoulderElevationAsymmetry)
      || !finitePoint(trunkContext?.torsoVector)
      || !Number.isFinite(restReference.torsoScale)
      || restReference.torsoScale <= EPSILON) {
    throw new Error('Current measurements do not contain rest-relative torso context');
  }
  const shoulderDelta = shoulderContext.shoulderElevationAsymmetry
    - restReference.shoulderAsymmetryMedian;
  const trunkTranslation = distanceXy(
    trunkContext.torsoVector,
    restReference.torsoVector,
  ) / restReference.torsoScale;
  return {
    ...measurements,
    working_shoulder_elevation_delta_from_rest_torso: metric(
      shoulderDelta,
      'torso_ratio',
      'pose_image_rest_relative',
    ),
    trunk_vector_change_from_rest_torso: metric(
      trunkTranslation,
      'torso_ratio',
      'pose_image_rest_relative',
    ),
  };
}

export function buildBottleGrabCommentObservation({
  timestampMs,
  poseImage,
  poseWorld = null,
  handImage,
  handWorld = null,
  detectedHandSide,
  detectedHandScore,
  anatomicalSide = 'left',
  restReference = null,
}) {
  if (anatomicalSide !== 'left') {
    throw new Error('Bottle Grab Comment Engine V1 supports anatomical-left only');
  }
  const timestamp = Number(timestampMs);
  if (!Number.isFinite(timestamp) || timestamp < 0) {
    throw new TypeError('timestampMs must be a finite non-negative number');
  }

  let captureQc = 'can_assess';
  if (!Array.isArray(poseImage) || poseImage.length < 25) {
    captureQc = 'cannot_assess_missing_pose';
  } else if (!reliablePose(poseImage)) {
    captureQc = 'cannot_assess_unreliable_pose';
  } else if (!Array.isArray(handImage) || handImage.length !== 21) {
    captureQc = 'cannot_assess_missing_hand';
  } else if (String(detectedHandSide || '').toLowerCase() !== anatomicalSide) {
    captureQc = 'cannot_assess_wrong_anatomical_side';
  } else if (!Number.isFinite(Number(detectedHandScore))
      || Number(detectedHandScore) < HAND_SCORE_THRESHOLD) {
    captureQc = 'cannot_assess_unreliable_hand_side';
  } else if (!reliableHand(handImage)) {
    captureQc = 'cannot_assess_unreliable_hand';
  }

  if (captureQc !== 'can_assess') {
    return {
      schema: 'physioai.bottle_grab_comment_measurement_frame.v1',
      timestampMs: timestamp,
      anatomicalSide,
      assessability: 'cannot_assess',
      captureQc,
      measurements: blankMeasurements(captureQc),
    };
  }

  let measurements;
  try {
    measurements = computeBottleGrabCommentMeasurements({
      poseImage,
      poseWorld,
      handImage,
      handWorld,
      anatomicalSide,
    });
  } catch {
    captureQc = 'cannot_assess_degenerate_geometry';
    measurements = blankMeasurements(captureQc);
  }
  const association = measurements.pose_hand_wrist_association_distance_image?.value;
  const workingWristDistance = distanceXy(poseImage[15], handImage[0]);
  const contralateralWristDistance = reliablePosePoint(poseImage[16])
    ? distanceXy(poseImage[16], handImage[0])
    : null;
  if (captureQc === 'can_assess'
      && (!Number.isFinite(association)
        || association > ASSOCIATION_MAX_ARM_RATIO
        || (Number.isFinite(contralateralWristDistance)
          && !(workingWristDistance < contralateralWristDistance)))) {
    captureQc = 'cannot_assess_pose_hand_association';
    measurements = blankMeasurements(captureQc);
  }
  if (captureQc === 'can_assess') {
    const incompleteGeometry = Object.entries(measurements).some(([measurementId, entry]) => (
      !REST_RELATIVE_MEASUREMENT_IDS.has(measurementId)
      && (entry?.assessability !== 'can_assess' || !Number.isFinite(entry?.value))
    ));
    if (incompleteGeometry) {
      captureQc = 'cannot_assess_measurement_geometry';
      measurements = blankMeasurements(captureQc);
    }
  }
  if (captureQc === 'can_assess' && restReference) {
    try {
      measurements = applyBottleGrabRestReference(measurements, restReference);
    } catch {
      captureQc = 'cannot_assess_invalid_rest_reference';
      measurements = blankMeasurements(captureQc);
    }
  }
  return {
    schema: 'physioai.bottle_grab_comment_measurement_frame.v1',
    timestampMs: timestamp,
    anatomicalSide,
    assessability: captureQc === 'can_assess' ? 'can_assess' : 'cannot_assess',
    captureQc,
    measurements,
  };
}
