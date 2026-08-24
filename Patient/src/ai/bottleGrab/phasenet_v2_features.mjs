// Frozen browser port of bottle_grab_features.py for PhaseNet V2.
// This module derives phase-model inputs only. It emits no quality or cue data.

export const PHASENET_V2_ROW_SCHEMA = 'physioai.bottle_grab_feature_frame.v0';
export const PHASENET_V2_WINDOW_SCHEMA = 'physioai.bottle_grab_feature_window.v0';
export const PHASENET_V2_CLASS_ORDER = Object.freeze([
  'start_or_rest',
  'reach',
  'preshape',
  'grasp',
  'release',
  'return',
]);
export const PHASENET_V2_FEATURE_NAMES = Object.freeze([
  'pose_elbow_flexion_norm',
  'pose_wrist_rel_shoulder_x_arm',
  'pose_wrist_rel_shoulder_y_arm',
  'pose_coarse_hand_centroid_rel_wrist_x_arm',
  'pose_coarse_hand_centroid_rel_wrist_y_arm',
  'pose_elbow_flexion_delta',
  'pose_wrist_rel_shoulder_x_delta',
  'pose_wrist_rel_shoulder_y_delta',
  'pose_coarse_hand_centroid_rel_wrist_x_delta',
  'pose_coarse_hand_centroid_rel_wrist_y_delta',
  'hand_thumb_mcp_flexion_norm',
  'hand_thumb_ip_flexion_norm',
  'hand_index_mcp_flexion_norm',
  'hand_index_pip_flexion_norm',
  'hand_index_dip_flexion_norm',
  'hand_mean_finger_flexion_norm',
  'hand_thumb_index_aperture_palm_ratio',
  'hand_thumb_index_aperture_delta',
  'hand_mean_finger_flexion_delta',
  'hand_index_pip_flexion_delta',
]);

export const PHASENET_V2_SAMPLE_RATE_HZ = 15;
export const PHASENET_V2_SAMPLE_INTERVAL_MS = 1000 / PHASENET_V2_SAMPLE_RATE_HZ;
export const PHASENET_V2_SEQUENCE_LENGTH = 30;
export const PHASENET_V2_WINDOW_STRIDE_FRAMES = 3;
export const PHASENET_V2_MAX_CONTIGUOUS_GAP_MS = PHASENET_V2_SAMPLE_INTERVAL_MS * 1.5;

const EPSILON = 1e-8;
const MIN_POSE_VISIBILITY = 0.5;
const MIN_HANDEDNESS_SCORE = 0.5;
const POSE_INDICES = Object.freeze([11, 13, 15, 17, 19, 21]);

function finite(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${field} must be finite numeric`);
  }
  return value;
}

/**
 * Read the top MediaPipe Tasks Vision handedness category for one detected hand.
 *
 * HandLandmarkerResult stores categories as `handednesses[handIndex][0]`.
 * This adapter deliberately throws when that category or its confidence score
 * is unavailable so callers cannot silently replace missing provenance with a
 * default score.
 */
export function getMediaPipeHandednessCategory(handLandmarkerResult, handIndex = 0) {
  if (!Number.isInteger(handIndex) || handIndex < 0) {
    throw new TypeError('handIndex must be a non-negative integer');
  }
  const category = handLandmarkerResult?.handednesses?.[handIndex]?.[0];
  const categoryName = category?.categoryName;
  if (typeof categoryName !== 'string' || categoryName.length === 0) {
    throw new TypeError(`MediaPipe handedness category is missing for hand ${handIndex}`);
  }
  const score = finite(category.score, 'MediaPipe handedness score');
  if (score < 0 || score > 1) {
    throw new TypeError('MediaPipe handedness score must be within [0, 1]');
  }
  return Object.freeze({ categoryName, score });
}

/** Return only the MediaPipe handedness category confidence for UI/QC display. */
export function getMediaPipeHandednessScore(handLandmarkerResult, handIndex = 0) {
  return getMediaPipeHandednessCategory(handLandmarkerResult, handIndex).score;
}

function xy(point, field) {
  if (!point || typeof point !== 'object') throw new TypeError(`${field} is missing`);
  return [finite(point.x, `${field}.x`), finite(point.y, `${field}.y`)];
}

function distance(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function angle(first, vertex, third) {
  const left = [first[0] - vertex[0], first[1] - vertex[1]];
  const right = [third[0] - vertex[0], third[1] - vertex[1]];
  const leftNorm = Math.hypot(...left);
  const rightNorm = Math.hypot(...right);
  if (leftNorm <= EPSILON || rightNorm <= EPSILON) {
    throw new TypeError('degenerate angle geometry');
  }
  const cosine = (left[0] * right[0] + left[1] * right[1]) / (leftNorm * rightNorm);
  return Math.acos(Math.max(-1, Math.min(1, cosine)));
}

function flexionNorm(first, vertex, third) {
  return Math.max(0, Math.min(1, 1 - angle(first, vertex, third) / Math.PI));
}

function validSha256(value) {
  const normalized = String(value || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new TypeError('sourceFileSha256 must contain 64 hexadecimal characters');
  }
  return normalized;
}

function reliablePose(poseLandmarks) {
  if (!Array.isArray(poseLandmarks) || poseLandmarks.length <= Math.max(...POSE_INDICES)) return false;
  try {
    for (const index of POSE_INDICES) {
      xy(poseLandmarks[index], `pose[${index}]`);
      const visibility = poseLandmarks[index].visibility;
      if (visibility != null && finite(visibility, `pose[${index}].visibility`) < MIN_POSE_VISIBILITY) {
        return false;
      }
    }
  } catch {
    return false;
  }
  return true;
}

function reliableHand(handLandmarks) {
  if (!Array.isArray(handLandmarks) || handLandmarks.length !== 21) return false;
  try {
    handLandmarks.forEach((point, index) => xy(point, `hand[${index}]`));
  } catch {
    return false;
  }
  return true;
}

function poseStatic(poseLandmarks) {
  const shoulder = xy(poseLandmarks[11], 'pose[11]');
  const elbow = xy(poseLandmarks[13], 'pose[13]');
  const wrist = xy(poseLandmarks[15], 'pose[15]');
  const coarse = [17, 19, 21].map((index) => xy(poseLandmarks[index], `pose[${index}]`));
  const armScale = distance(shoulder, elbow) + distance(elbow, wrist);
  if (armScale <= EPSILON) throw new TypeError('degenerate Pose arm scale');
  const centroid = [
    coarse.reduce((sum, point) => sum + point[0], 0) / coarse.length,
    coarse.reduce((sum, point) => sum + point[1], 0) / coarse.length,
  ];
  return [
    flexionNorm(shoulder, elbow, wrist),
    (wrist[0] - shoulder[0]) / armScale,
    (wrist[1] - shoulder[1]) / armScale,
    (centroid[0] - wrist[0]) / armScale,
    (centroid[1] - wrist[1]) / armScale,
  ];
}

function handStatic(handLandmarks) {
  const points = handLandmarks.map((point, index) => xy(point, `hand[${index}]`));
  const palmScale = distance(points[0], points[9]);
  if (palmScale <= EPSILON) throw new TypeError('degenerate Hand palm scale');
  const fingerChains = [
    [0, 5, 6, 7, 8],
    [0, 9, 10, 11, 12],
    [0, 13, 14, 15, 16],
    [0, 17, 18, 19, 20],
  ];
  const fingerFlexions = [];
  for (const [wrist, mcp, pip, dip, tip] of fingerChains) {
    fingerFlexions.push(
      flexionNorm(points[wrist], points[mcp], points[pip]),
      flexionNorm(points[mcp], points[pip], points[dip]),
      flexionNorm(points[pip], points[dip], points[tip]),
    );
  }
  return [
    flexionNorm(points[1], points[2], points[3]),
    flexionNorm(points[2], points[3], points[4]),
    flexionNorm(points[0], points[5], points[6]),
    flexionNorm(points[5], points[6], points[7]),
    flexionNorm(points[6], points[7], points[8]),
    fingerFlexions.reduce((sum, value) => sum + value, 0) / fingerFlexions.length,
    distance(points[4], points[8]) / palmScale,
  ];
}

function baseRow({ sourceFileSha256, sourceTimestampMs, poseDetected, handDetected, captureQc, features }) {
  if (!Array.isArray(features) || features.length !== PHASENET_V2_FEATURE_NAMES.length) {
    throw new TypeError('features must contain exactly 20 values');
  }
  return {
    schema: PHASENET_V2_ROW_SCHEMA,
    sourceFileSha256: validSha256(sourceFileSha256),
    sourceTimestampMs: finite(sourceTimestampMs, 'sourceTimestampMs'),
    anatomicalSide: 'left',
    poseDetected: Boolean(poseDetected),
    handDetected: Boolean(handDetected),
    captureQc,
    features: features.slice(),
    featureNames: [...PHASENET_V2_FEATURE_NAMES],
  };
}

function previousFeatures(previousRow, sourceFileSha256, sourceTimestampMs) {
  if (!previousRow || typeof previousRow !== 'object') return null;
  if (previousRow.captureQc !== 'can_assess') return null;
  if (previousRow.sourceFileSha256 !== sourceFileSha256 || previousRow.anatomicalSide !== 'left') return null;
  try {
    const gap = sourceTimestampMs - finite(previousRow.sourceTimestampMs, 'previous sourceTimestampMs');
    if (gap <= 0 || gap > PHASENET_V2_MAX_CONTIGUOUS_GAP_MS) return null;
    if (!Array.isArray(previousRow.features) || previousRow.features.length !== 20) return null;
    return previousRow.features.map((value) => finite(value, 'previous feature'));
  } catch {
    return null;
  }
}

export function buildPhaseNetV2FeatureFrame({
  sourceFileSha256,
  sourceTimestampMs,
  poseTimestampMs,
  handTimestampMs,
  anatomicalSide,
  poseLandmarks,
  handLandmarks,
  detectedHandSide,
  detectedHandScore = 1,
  previousRow = null,
}) {
  if (String(anatomicalSide || '').toLowerCase() !== 'left') {
    throw new TypeError('Bottle Grab PhaseNet V2 supports anatomical-left only');
  }
  const sourceSha = validSha256(sourceFileSha256);
  const sourceTimestamp = finite(sourceTimestampMs, 'sourceTimestampMs');
  const poseTimestamp = finite(poseTimestampMs, 'poseTimestampMs');
  const handTimestamp = finite(handTimestampMs, 'handTimestampMs');
  const poseDetected = Array.isArray(poseLandmarks) && poseLandmarks.length > 0;
  const handDetected = Array.isArray(handLandmarks) && handLandmarks.length > 0;

  let failure = null;
  if (!poseDetected) failure = 'cannot_assess_missing_pose';
  else if (!handDetected) failure = 'cannot_assess_missing_hand';
  else if (poseTimestamp !== handTimestamp || sourceTimestamp !== poseTimestamp) {
    failure = 'cannot_assess_unsynchronised_streams';
  } else if (String(detectedHandSide || '').toLowerCase() !== 'left') {
    failure = 'cannot_assess_wrong_anatomical_side';
  } else if (finite(detectedHandScore, 'detectedHandScore') < MIN_HANDEDNESS_SCORE) {
    failure = 'cannot_assess_unreliable_hand_side';
  } else if (!reliablePose(poseLandmarks)) failure = 'cannot_assess_unreliable_pose';
  else if (!reliableHand(handLandmarks)) failure = 'cannot_assess_unreliable_hand';

  if (failure) {
    return baseRow({
      sourceFileSha256: sourceSha,
      sourceTimestampMs: sourceTimestamp,
      poseDetected,
      handDetected,
      captureQc: failure,
      features: Array(20).fill(null),
    });
  }

  let poseValues;
  let handValues;
  try {
    poseValues = poseStatic(poseLandmarks);
    handValues = handStatic(handLandmarks);
  } catch {
    return baseRow({
      sourceFileSha256: sourceSha,
      sourceTimestampMs: sourceTimestamp,
      poseDetected: true,
      handDetected: true,
      captureQc: 'cannot_assess_degenerate_geometry',
      features: Array(20).fill(null),
    });
  }

  const previous = previousFeatures(previousRow, sourceSha, sourceTimestamp);
  const poseDelta = previous ? poseValues.map((value, index) => value - previous[index]) : Array(5).fill(0);
  const handDelta = previous
    ? [handValues[6] - previous[16], handValues[5] - previous[15], handValues[3] - previous[13]]
    : Array(3).fill(0);
  const features = [...poseValues, ...poseDelta, ...handValues, ...handDelta];
  if (features.length !== 20 || !features.every(Number.isFinite)) {
    throw new TypeError('Bottle Grab feature adapter emitted an invalid vector');
  }
  return baseRow({
    sourceFileSha256: sourceSha,
    sourceTimestampMs: sourceTimestamp,
    poseDetected: true,
    handDetected: true,
    captureQc: 'can_assess',
    features,
  });
}

function arraysEqual(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function validateAssessableRow(row) {
  if (!row || typeof row !== 'object') throw new TypeError('feature row must be an object');
  if (row.schema !== PHASENET_V2_ROW_SCHEMA) throw new TypeError('feature row schema mismatch');
  if (row.anatomicalSide !== 'left') throw new TypeError('feature row anatomical side mismatch');
  if (row.captureQc !== 'can_assess' || row.poseDetected !== true || row.handDetected !== true) {
    return false;
  }
  validSha256(row.sourceFileSha256);
  finite(row.sourceTimestampMs, 'sourceTimestampMs');
  if (!arraysEqual(row.featureNames, PHASENET_V2_FEATURE_NAMES)) {
    throw new TypeError('feature row order mismatch');
  }
  if (!Array.isArray(row.features) || row.features.length !== 20) {
    throw new TypeError('feature row must contain exactly 20 features');
  }
  row.features.forEach((value, index) => finite(value, `features[${index}]`));
  return true;
}

export function createPhaseNetV2WindowAccumulator() {
  let rows = [];
  let framesSinceEmission = 0;
  let hasEmitted = false;
  let lastResetReason = null;

  function reset(reason = 'explicit_reset') {
    rows = [];
    framesSinceEmission = 0;
    hasEmitted = false;
    lastResetReason = String(reason);
  }

  function push(row) {
    if (!validateAssessableRow(row)) {
      const reason = String(row?.captureQc || 'cannot_assess');
      reset(reason);
      return { status: 'cannot_assess', reason };
    }
    const previous = rows.at(-1);
    if (previous) {
      const gap = row.sourceTimestampMs - previous.sourceTimestampMs;
      if (row.sourceFileSha256 !== previous.sourceFileSha256
        || gap <= 0
        || gap > PHASENET_V2_MAX_CONTIGUOUS_GAP_MS) {
        reset('source_timeline_discontinuity');
        return { status: 'reset', reason: lastResetReason };
      }
    }

    rows.push({ ...row, featureNames: row.featureNames.slice(), features: row.features.slice() });
    if (rows.length > PHASENET_V2_SEQUENCE_LENGTH) rows.shift();
    if (rows.length < PHASENET_V2_SEQUENCE_LENGTH) {
      return { status: 'buffering', bufferedFrames: rows.length };
    }

    const expectedSpan = (PHASENET_V2_SEQUENCE_LENGTH - 1) * PHASENET_V2_SAMPLE_INTERVAL_MS;
    const actualSpan = rows.at(-1).sourceTimestampMs - rows[0].sourceTimestampMs;
    if (Math.abs(actualSpan - expectedSpan) > PHASENET_V2_SAMPLE_INTERVAL_MS) {
      reset('invalid_15hz_window_span');
      return { status: 'reset', reason: lastResetReason };
    }

    if (hasEmitted) {
      framesSinceEmission += 1;
      if (framesSinceEmission < PHASENET_V2_WINDOW_STRIDE_FRAMES) {
        return { status: 'buffering', bufferedFrames: rows.length };
      }
    }
    hasEmitted = true;
    framesSinceEmission = 0;
    return {
      status: 'window_ready',
      window: rows.map((entry) => entry.features.slice()),
      startTimestampMs: rows[0].sourceTimestampMs,
      endpointTimestampMs: rows.at(-1).sourceTimestampMs,
      featureNames: [...PHASENET_V2_FEATURE_NAMES],
    };
  }

  return {
    push,
    reset,
    get bufferedFrameCount() { return rows.length; },
    get lastResetReason() { return lastResetReason; },
  };
}
