/*
 * Pure PWA port of NativeSitToStandFeatureExtractor.
 *
 * Input is a MediaPipe Pose Full landmark array. No Hand/ObjectDetector data
 * is accepted or required. Missing data is rejected; this module never
 * imputes zeros for an invalid frame.
 */

export const SIT_TO_STAND_FEATURE_COUNT = 30;
export const SIT_TO_STAND_MINIMUM_VISIBILITY = 0.4;
export const SIT_TO_STAND_FEATURE_NAMES = [
  'pelvis_height_above_ankles_norm', 'pelvis_height_velocity_norm_per_s',
  'pelvis_view_plane_offset_from_ankles_norm', 'pelvis_view_plane_velocity_norm_per_s',
  'trunk_view_plane_tilt_deg_div_90', 'trunk_view_plane_tilt_velocity_tanh',
  'trunk_lateral_offset_norm', 'trunk_lateral_velocity_norm_per_s',
  'left_hip_angle_deg_div_180', 'right_hip_angle_deg_div_180', 'hip_angle_asymmetry_deg_div_180',
  'left_knee_angle_deg_div_180', 'right_knee_angle_deg_div_180', 'knee_angle_asymmetry_deg_div_180',
  'left_ankle_proxy_angle_deg_div_180', 'right_ankle_proxy_angle_deg_div_180', 'ankle_proxy_asymmetry_deg_div_180',
  'stance_width_norm', 'foot_center_offset_from_pelvis_norm',
  'left_wrist_to_shoulder_x_norm', 'left_wrist_to_shoulder_y_norm',
  'right_wrist_to_shoulder_x_norm', 'right_wrist_to_shoulder_y_norm',
  'left_wrist_speed_norm_per_s', 'right_wrist_speed_norm_per_s',
  'left_elbow_angle_deg_div_180', 'right_elbow_angle_deg_div_180',
  'left_arm_elevation_deg_div_180', 'right_arm_elevation_deg_div_180', 'wrist_span_norm',
];

const MIN_FRAME_INTERVAL_MS = 45;
const MAX_FRAME_INTERVAL_MS = 100;

const finite = (value) => Number.isFinite(value);

function pointFrom(pose, index) {
  const value = pose?.[index];
  if (!value || Number(value.visibility) < SIT_TO_STAND_MINIMUM_VISIBILITY) return null;
  if (![value.x, value.y, value.z].every(finite)) return null;
  return { x: Number(value.x), y: Number(value.y), z: Number(value.z) };
}

function average(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function angle(first, vertex, third) {
  const left = { x: first.x - vertex.x, y: first.y - vertex.y, z: first.z - vertex.z };
  const right = { x: third.x - vertex.x, y: third.y - vertex.y, z: third.z - vertex.z };
  const leftNorm = Math.hypot(left.x, left.y, left.z);
  const rightNorm = Math.hypot(right.x, right.y, right.z);
  if (leftNorm <= 1e-6 || rightNorm <= 1e-6) return null;
  const cosine = Math.max(-1, Math.min(1, (left.x * right.x + left.y * right.y + left.z * right.z) / (leftNorm * rightNorm)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

function viewPlaneTilt(shoulder, hip) {
  const horizontal = shoulder.x - hip.x;
  const vertical = hip.y - shoulder.y;
  if (Math.hypot(horizontal, vertical) <= 1e-6) return null;
  return (Math.atan2(horizontal, vertical) * 180) / Math.PI;
}

function armElevation(shoulder, elbow) {
  const horizontal = elbow.x - shoulder.x;
  const vertical = elbow.y - shoulder.y;
  if (Math.hypot(horizontal, vertical) <= 1e-6) return null;
  return (Math.atan2(horizontal, vertical) * 180) / Math.PI;
}

function measurementsFrom(pose) {
  const required = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 31, 32];
  const points = Object.fromEntries(required.map((index) => [index, pointFrom(pose, index)]));
  if (required.some((index) => !points[index])) return null;
  const nose = points[0];
  void nose;
  const leftShoulder = points[11]; const rightShoulder = points[12];
  const leftElbow = points[13]; const rightElbow = points[14];
  const leftWrist = points[15]; const rightWrist = points[16];
  const leftHip = points[23]; const rightHip = points[24];
  const leftKnee = points[25]; const rightKnee = points[26];
  const leftAnkle = points[27]; const rightAnkle = points[28];
  const leftFoot = points[31]; const rightFoot = points[32];
  const shoulderCenter = average(leftShoulder, rightShoulder);
  const hipCenter = average(leftHip, rightHip);
  const ankleCenter = average(leftAnkle, rightAnkle);
  const footCenter = average(leftFoot, rightFoot);
  const torsoScale = distance(shoulderCenter, hipCenter);
  if (torsoScale <= 1e-6) return null;
  const leftHipAngle = angle(shoulderCenter, leftHip, leftKnee);
  const rightHipAngle = angle(shoulderCenter, rightHip, rightKnee);
  const leftKneeAngle = angle(leftHip, leftKnee, leftAnkle);
  const rightKneeAngle = angle(rightHip, rightKnee, rightAnkle);
  const leftAnkleAngle = angle(leftKnee, leftAnkle, leftFoot);
  const rightAnkleAngle = angle(rightKnee, rightAnkle, rightFoot);
  const leftElbowAngle = angle(leftShoulder, leftElbow, leftWrist);
  const rightElbowAngle = angle(rightShoulder, rightElbow, rightWrist);
  const trunkTilt = viewPlaneTilt(shoulderCenter, hipCenter);
  const leftArmElevation = armElevation(leftShoulder, leftElbow);
  const rightArmElevation = armElevation(rightShoulder, rightElbow);
  const allDerived = [leftHipAngle, rightHipAngle, leftKneeAngle, rightKneeAngle, leftAnkleAngle, rightAnkleAngle, leftElbowAngle, rightElbowAngle, trunkTilt, leftArmElevation, rightArmElevation];
  if (allDerived.some((value) => !finite(value))) return null;
  return {
    pelvisHeightAboveAnklesNorm: (ankleCenter.y - hipCenter.y) / torsoScale,
    pelvisViewPlaneOffsetFromAnklesNorm: (hipCenter.x - ankleCenter.x) / torsoScale,
    trunkViewPlaneTiltDeg: trunkTilt,
    trunkLateralOffsetNorm: (shoulderCenter.x - hipCenter.x) / torsoScale,
    leftHipAngleDeg: leftHipAngle, rightHipAngleDeg: rightHipAngle,
    leftKneeAngleDeg: leftKneeAngle, rightKneeAngleDeg: rightKneeAngle,
    leftAnkleProxyAngleDeg: leftAnkleAngle, rightAnkleProxyAngleDeg: rightAnkleAngle,
    stanceWidthNorm: Math.abs(leftAnkle.x - rightAnkle.x) / torsoScale,
    footCenterOffsetFromPelvisNorm: (footCenter.x - hipCenter.x) / torsoScale,
    leftWristToShoulderXNorm: (leftWrist.x - leftShoulder.x) / torsoScale,
    leftWristToShoulderYNorm: (leftWrist.y - leftShoulder.y) / torsoScale,
    rightWristToShoulderXNorm: (rightWrist.x - rightShoulder.x) / torsoScale,
    rightWristToShoulderYNorm: (rightWrist.y - rightShoulder.y) / torsoScale,
    leftElbowAngleDeg: leftElbowAngle, rightElbowAngleDeg: rightElbowAngle,
    leftArmElevationDeg: leftArmElevation, rightArmElevationDeg: rightArmElevation,
    wristSpanNorm: distance(leftWrist, rightWrist) / torsoScale,
    torsoScale,
    leftWrist,
    rightWrist,
  };
}

function makeVector(current, previous, elapsedSeconds) {
  const delta = (value, prior) => (prior !== undefined && elapsedSeconds > 0 ? (value - prior) / elapsedSeconds : 0);
  const wristSpeed = (currentPoint, priorPoint) => (priorPoint && elapsedSeconds > 0
    ? Math.hypot(currentPoint.x - priorPoint.x, currentPoint.y - priorPoint.y) / current.torsoScale / elapsedSeconds
    : 0);
  return [
    current.pelvisHeightAboveAnklesNorm,
    delta(current.pelvisHeightAboveAnklesNorm, previous?.pelvisHeightAboveAnklesNorm),
    current.pelvisViewPlaneOffsetFromAnklesNorm,
    delta(current.pelvisViewPlaneOffsetFromAnklesNorm, previous?.pelvisViewPlaneOffsetFromAnklesNorm),
    current.trunkViewPlaneTiltDeg / 90,
    Math.tanh(delta(current.trunkViewPlaneTiltDeg, previous?.trunkViewPlaneTiltDeg) / 90),
    current.trunkLateralOffsetNorm,
    delta(current.trunkLateralOffsetNorm, previous?.trunkLateralOffsetNorm),
    current.leftHipAngleDeg / 180, current.rightHipAngleDeg / 180,
    Math.abs(current.leftHipAngleDeg - current.rightHipAngleDeg) / 180,
    current.leftKneeAngleDeg / 180, current.rightKneeAngleDeg / 180,
    Math.abs(current.leftKneeAngleDeg - current.rightKneeAngleDeg) / 180,
    current.leftAnkleProxyAngleDeg / 180, current.rightAnkleProxyAngleDeg / 180,
    Math.abs(current.leftAnkleProxyAngleDeg - current.rightAnkleProxyAngleDeg) / 180,
    current.stanceWidthNorm, current.footCenterOffsetFromPelvisNorm,
    current.leftWristToShoulderXNorm, current.leftWristToShoulderYNorm,
    current.rightWristToShoulderXNorm, current.rightWristToShoulderYNorm,
    wristSpeed(current.leftWrist, previous?.leftWrist), wristSpeed(current.rightWrist, previous?.rightWrist),
    current.leftElbowAngleDeg / 180, current.rightElbowAngleDeg / 180,
    current.leftArmElevationDeg / 180, current.rightArmElevationDeg / 180,
    current.wristSpanNorm,
  ];
}

export function createSitToStandFeatureExtractor() {
  let previousMeasurements = null;
  let previousTimestampMs = null;
  let sourceGeneration = null;
  const reset = () => { previousMeasurements = null; previousTimestampMs = null; sourceGeneration = null; };
  const invalid = (snapshot, reason) => ({
    timestampMs: snapshot.timestampMs,
    sourceGeneration: snapshot.sourceGeneration,
    featureVector: null,
    pelvisHeightAboveAnklesNorm: null,
    reason,
    featureReady: false,
  });
  const extract = (snapshot = {}) => {
    if (sourceGeneration !== null && snapshot.sourceGeneration !== sourceGeneration) reset();
    sourceGeneration = snapshot.sourceGeneration;
    if (snapshot.inputIsMirrored) { previousMeasurements = null; previousTimestampMs = null; return invalid(snapshot, 'source_mirrored'); }
    const current = measurementsFrom(snapshot.poseLandmarks || snapshot.pose);
    if (!current) { previousMeasurements = null; previousTimestampMs = null; return invalid(snapshot, 'pose_only_capture_qc_failed'); }
    let elapsedSeconds = null;
    if (previousTimestampMs !== null) {
      const elapsedMs = Number(snapshot.timestampMs) - previousTimestampMs;
      if (elapsedMs < MIN_FRAME_INTERVAL_MS || elapsedMs > MAX_FRAME_INTERVAL_MS) {
        previousMeasurements = null; previousTimestampMs = null;
        return invalid(snapshot, 'source_timeline_discontinuity');
      }
      elapsedSeconds = elapsedMs / 1000;
    }
    const vector = makeVector(current, previousMeasurements, elapsedSeconds || 0);
    previousMeasurements = current;
    previousTimestampMs = Number(snapshot.timestampMs);
    if (vector.length !== SIT_TO_STAND_FEATURE_COUNT || vector.some((value) => !finite(value))) return invalid(snapshot, 'non_finite_derived_feature');
    return {
      timestampMs: snapshot.timestampMs,
      sourceGeneration: snapshot.sourceGeneration,
      featureVector: vector,
      pelvisHeightAboveAnklesNorm: current.pelvisHeightAboveAnklesNorm,
      reason: null,
      featureReady: true,
    };
  };
  return { extract, reset };
}

export { measurementsFrom };
