/*
 * Browser-safe causal TCN runtime and parallel phase/comment adapter.
 * The runtime can accept checksum-validated Float32 arrays from a future
 * browser asset loader. It deliberately reports model_unavailable when no
 * weights are injected; it never substitutes fake probabilities.
 */

export const SIT_TO_STAND_PHASE_NET_CONTRACT = Object.freeze({
  modelId: 'sit_to_stand_phasenet_v1_train_only',
  sequenceLength: 30,
  featureCount: 30,
  filters: 24,
  classOrder: ['seated_rest', 'rise', 'standing_hold', 'lower'],
  architecture: 'causal_tcn_three_dilations_global_pooling',
});

const WEIGHT_LENGTHS = Object.freeze({ d1Kernel: 2160, d1Bias: 24, projectionKernel: 720, projectionBias: 24, d2Kernel: 1728, d2Bias: 24, d4Kernel: 1728, d4Bias: 24, classifierKernel: 96, classifierBias: 4 });

const BINARY_WEIGHT_KEYS = Object.freeze([
  ['d1Kernel', 'causal_tcn_dilation_1__0'], ['d1Bias', 'causal_tcn_dilation_1__1'],
  ['projectionKernel', 'residual_projection__0'], ['projectionBias', 'residual_projection__1'],
  ['d2Kernel', 'causal_tcn_dilation_2__0'], ['d2Bias', 'causal_tcn_dilation_2__1'],
  ['d4Kernel', 'causal_tcn_dilation_4__0'], ['d4Bias', 'causal_tcn_dilation_4__1'],
  ['classifierKernel', 'phase_probabilities__0'], ['classifierBias', 'phase_probabilities__1'],
]);

function validTensor(value, length) { return value && value.length === length && Array.from(value).every(Number.isFinite); }

function conv1d(input, kernel, bias, kernelSize, inputChannels, outputChannels, dilation, relu) {
  return input.map((_, time) => Array.from({ length: outputChannels }, (_, output) => {
    let sum = Number(bias[output]);
    for (let kernelIndex = 0; kernelIndex < kernelSize; kernelIndex += 1) {
      const sourceTime = time - dilation * (kernelSize - 1 - kernelIndex);
      if (sourceTime < 0) continue;
      const base = kernelIndex * inputChannels * outputChannels + output;
      for (let channel = 0; channel < inputChannels; channel += 1) sum += input[sourceTime][channel] * kernel[base + channel * outputChannels];
    }
    return relu && sum < 0 ? 0 : sum;
  }));
}
function addRelu(left, right) { return left.map((row, time) => row.map((value, channel) => Math.max(0, value + right[time][channel]))); }
function dense(input, kernel, bias, outputChannels) { return Array.from({ length: outputChannels }, (_, output) => bias[output] + input.reduce((sum, value, index) => sum + value * kernel[index * outputChannels + output], 0)); }
function softmax(logits) { const maximum = Math.max(...logits); const values = logits.map((value) => Math.exp(value - maximum)); const total = values.reduce((sum, value) => sum + value, 0); return values.map((value) => value / total); }

export function createSitToStandPhaseNet({ weights = null } = {}) {
  const ready = weights && Object.keys(WEIGHT_LENGTHS).every((key) => validTensor(weights[key], WEIGHT_LENGTHS[key]));
  function predict(window) {
    if (!Array.isArray(window) || window.length !== SIT_TO_STAND_PHASE_NET_CONTRACT.sequenceLength || window.some((row) => !Array.isArray(row) || row.length !== SIT_TO_STAND_PHASE_NET_CONTRACT.featureCount || row.some((value) => !Number.isFinite(value)))) return { status: 'cannot_assess', phase: null, probabilities: null, reason: 'invalid_window' };
    if (!ready) return { status: 'model_unavailable', phase: null, probabilities: null, reason: 'phase_net_weights_unavailable' };
    const d1 = conv1d(window, weights.d1Kernel, weights.d1Bias, 3, 30, 24, 1, true);
    const residual = conv1d(window, weights.projectionKernel, weights.projectionBias, 1, 30, 24, 1, false);
    const block1 = addRelu(d1, residual);
    const d2 = conv1d(block1, weights.d2Kernel, weights.d2Bias, 3, 24, 24, 2, true);
    const block2 = addRelu(d2, block1);
    const d4 = conv1d(block2, weights.d4Kernel, weights.d4Bias, 3, 24, 24, 4, true);
    const block3 = addRelu(d4, block2);
    const pooled = Array.from({ length: 24 }, (_, channel) => block3.reduce((sum, row) => sum + row[channel], 0) / block3.length);
    const probabilities = softmax(dense(pooled, weights.classifierKernel, weights.classifierBias, 4));
    const argmaxIndex = probabilities.reduce((best, value, index) => (value > probabilities[best] ? index : best), 0);
    return { status: 'ready', phase: SIT_TO_STAND_PHASE_NET_CONTRACT.classOrder[argmaxIndex], argmaxIndex, probabilities, reason: null };
  }
  return { predict, isAvailable: ready, contract: SIT_TO_STAND_PHASE_NET_CONTRACT };
}

function bytesView(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new TypeError('Sit-to-Stand weight must be an ArrayBuffer or typed-array view');
}

/** Decode the ten little-endian Float32 payloads from the model-owned export. */
export function decodeSitToStandFloat32Weights(payloads) {
  const weights = {};
  BINARY_WEIGHT_KEYS.forEach(([key, payloadKey]) => {
    const bytes = bytesView(payloads?.[payloadKey] ?? payloads?.[key]);
    if (bytes.byteLength !== WEIGHT_LENGTHS[key] * 4) throw new Error(`invalid Sit-to-Stand weight byte length: ${payloadKey}`);
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const values = new Float32Array(WEIGHT_LENGTHS[key]);
    for (let index = 0; index < values.length; index += 1) values[index] = data.getFloat32(index * 4, true);
    weights[key] = values;
  });
  return weights;
}

/** Convenience factory for a browser loader that has fetched all ten .f32 files. */
export function createSitToStandPhaseNetFromBytes(payloads) {
  return createSitToStandPhaseNet({ weights: decodeSitToStandFloat32Weights(payloads) });
}

const ORDER = ['seated_rest', 'rise', 'standing_hold', 'lower', 'seated_rest'];
const DEFAULT_COMMENT_PROFILE = null;

function persistent(rows, phaseFeatureEnvelopes, featureIndex) {
  const names = [
    'pelvis_height_above_ankles_norm', 'pelvis_height_velocity_norm_per_s', 'pelvis_view_plane_offset_from_ankles_norm', 'pelvis_view_plane_velocity_norm_per_s', 'trunk_view_plane_tilt_deg_div_90', 'trunk_view_plane_tilt_velocity_tanh', 'trunk_lateral_offset_norm', 'trunk_lateral_velocity_norm_per_s', 'left_hip_angle_deg_div_180', 'right_hip_angle_deg_div_180', 'hip_angle_asymmetry_deg_div_180', 'left_knee_angle_deg_div_180', 'right_knee_angle_deg_div_180', 'knee_angle_asymmetry_deg_div_180', 'left_ankle_proxy_angle_deg_div_180', 'right_ankle_proxy_angle_deg_div_180', 'ankle_proxy_asymmetry_deg_div_180', 'stance_width_norm', 'foot_center_offset_from_pelvis_norm', 'left_wrist_to_shoulder_x_norm', 'left_wrist_to_shoulder_y_norm', 'right_wrist_to_shoulder_x_norm', 'right_wrist_to_shoulder_y_norm', 'left_wrist_speed_norm_per_s', 'right_wrist_speed_norm_per_s', 'left_elbow_angle_deg_div_180', 'right_elbow_angle_deg_div_180', 'left_arm_elevation_deg_div_180', 'right_arm_elevation_deg_div_180', 'wrist_span_norm',
  ];
  const name = names[featureIndex]; let sampleCount = 0; let breachCount = 0; let run = 0; let longestRun = 0;
  rows.forEach((row) => { const envelope = phaseFeatureEnvelopes?.[row.phase]?.[name]; if (!envelope) return; sampleCount += 1; const value = row.vector[featureIndex]; if (value < envelope.lower || value > envelope.upper) { breachCount += 1; run += 1; longestRun = Math.max(longestRun, run); } else run = 0; });
  return sampleCount > 0 && breachCount >= 3 && longestRun >= 3 && breachCount / sampleCount >= 0.6;
}

export function createSitToStandPhaseCommentEngine({ phaseNet = createSitToStandPhaseNet(), referenceProfile = DEFAULT_COMMENT_PROFILE } = {}) {
  let window = []; let lastPhase = null; let phaseStreak = 0; let stablePhase = null; let phaseSequence = []; let activeRows = []; let completedCommentCycles = 0;
  function reset() { window = []; lastPhase = null; phaseStreak = 0; stablePhase = null; phaseSequence = []; activeRows = []; }
  function output(values) { return { completedCommentCycles, ...values }; }
  function observeStablePhase(phase) {
    if (phase === lastPhase) phaseStreak += 1; else { lastPhase = phase; phaseStreak = 1; }
    if (phaseStreak < 2 || phase === stablePhase) return;
    stablePhase = phase;
    const expected = phaseSequence.length ? ORDER[phaseSequence.length] : 'seated_rest';
    if (phase === expected) phaseSequence.push(phase); else if (phase === 'seated_rest') phaseSequence = [phase]; else phaseSequence = [];
  }
  function evaluate() {
    if (!activeRows.length || !referenceProfile?.phaseFeatureEnvelopes) return { status: 'reference_profile_unavailable', cue: null, cueThai: null };
    if (persistent(activeRows, referenceProfile.phaseFeatureEnvelopes, 19) || persistent(activeRows, referenceProfile.phaseFeatureEnvelopes, 21)) return { status: 'named_deviation', cue: 'Move the arm back toward the reference path.', cueThai: 'ลองขยับแขนกลับเข้าใกล้แนวอ้างอิง' };
    if (persistent(activeRows, referenceProfile.phaseFeatureEnvelopes, 6)) return { status: 'named_deviation', cue: 'Keep the trunk closer to the reference midline.', cueThai: 'ลองรักษาลำตัวให้อยู่ใกล้แนวอ้างอิง' };
    return { status: 'no_named_deviation', cue: null, cueThai: null };
  }
  function ingest(frame) {
    if (!frame?.featureReady || !frame.featureVector) { reset(); return output({ status: 'cannot_assess', bufferedFrames: 0, phase: null, probabilities: null, commentStatus: 'cannot_assess', cue: null, cueThai: null }); }
    window.push(frame.featureVector); if (window.length > 30) window = window.slice(-30);
    if (window.length < 30) return output({ status: 'buffering', bufferedFrames: window.length, phase: null, probabilities: null, commentStatus: 'pending', cue: null, cueThai: null });
    const inference = phaseNet.predict(window);
    if (inference.status !== 'ready') return output({ status: inference.status, bufferedFrames: window.length, phase: null, probabilities: null, commentStatus: inference.status, cue: null, cueThai: null, reason: inference.reason });
    activeRows.push({ phase: inference.phase, vector: frame.featureVector }); observeStablePhase(inference.phase);
    if (phaseSequence.join('|') === ORDER.join('|')) { completedCommentCycles += 1; const decision = evaluate(); const result = output({ status: 'phase_cycle_completed', bufferedFrames: 30, phase: inference.phase, probabilities: inference.probabilities, commentStatus: decision.status, cue: decision.cue, cueThai: decision.cueThai }); const sequence = phaseSequence.slice(); reset(); phaseSequence = sequence.length === 1 && sequence[0] === 'seated_rest' ? sequence : []; return result; }
    return output({ status: 'phase_ready', bufferedFrames: window.length, phase: inference.phase, probabilities: inference.probabilities, commentStatus: 'pending', cue: null, cueThai: null });
  }
  return { ingest, reset, get completedCommentCycles() { return completedCommentCycles; } };
}

export { WEIGHT_LENGTHS, BINARY_WEIGHT_KEYS };
