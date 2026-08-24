// NNExerciseClassifier.js (Patient app) — runs the from-scratch neural network on-device.
// No ML library, no network: the model weights are BUNDLED (imported below) so inference
// is fully offline and synchronous per frame. Forward pass = standardize -> [Linear ->
// ReLU] x N -> Linear -> sigmoid (MULTI-LABEL). Mirrors Therapist/shared/ai/NNExerciseClassifier.js
// and the Python trainer (batch_test_real_photos.predict).
//
// Input : exerciseId + jointAngles ({ right_shoulder: 150, ... }).
// Output: { correct, active:[flag], primary, comments:[{th,en}], probs:{flag:0..1} } — or null
//         when no model exists for that exercise.

import overheadCeilingReach from './models/overhead_ceiling_reach.json';
import lateralArmRaise from './models/lateral_arm_raise.json';
import crossBodyShoulderStretch from './models/cross_body_shoulder_stretch.json';

// The 3 validated exercises that ship with a model (evidence in models/evidence-assets).
const MODELS = {
  overhead_ceiling_reach: overheadCeilingReach,
  lateral_arm_raise: lateralArmRaise,
  cross_body_shoulder_stretch: crossBodyShoulderStretch,
};
export const NN_EXERCISES = Object.keys(MODELS);
export const hasModel = (exerciseId) => !!MODELS[exerciseId];

// numerically-stable logistic
function sigmoid(z) { return z >= 0 ? 1 / (1 + Math.exp(-z)) : (() => { const e = Math.exp(z); return e / (1 + e); })(); }

function runModel(m, jointAngles) {
  const neutral = m.neutral || {};
  const vec = m.joint_order.map((j) => {
    const v = jointAngles ? jointAngles[j] : null;
    return (typeof v === 'number' && isFinite(v)) ? v : (neutral[j] ?? m.scaler.mean[m.joint_order.indexOf(j)] ?? 150);
  });
  let x = vec.map((v, i) => (v - m.scaler.mean[i]) / m.scaler.std[i]);
  m.layers.forEach((layer, li) => {
    const { W, b } = layer;
    const out = b.slice();
    for (let o = 0; o < out.length; o++) {
      let s = out[o];
      for (let i = 0; i < x.length; i++) s += x[i] * W[i][o];
      out[o] = s;
    }
    x = li < m.layers.length - 1 ? out.map((v) => Math.max(0, v)) : out;
  });
  const probs = x.map(sigmoid);
  const flags = m.flags;
  const thr = (m.meta && typeof m.meta.threshold === 'number') ? m.meta.threshold : 0.5;
  let active = flags.filter((_f, k) => probs[k] >= thr);
  // arm_low / arm_high are two readings of one shoulder angle — never both.
  if (flags.includes('arm_low') && flags.includes('arm_high') && active.includes('arm_low') && active.includes('arm_high')) {
    const lo = probs[flags.indexOf('arm_low')], hi = probs[flags.indexOf('arm_high')];
    active = active.filter((f) => f !== (lo >= hi ? 'arm_high' : 'arm_low'));
  }
  const correct = active.length === 0;
  const probMap = {};
  flags.forEach((f, k) => { probMap[f] = probs[k]; });
  let primary = null, best = -1;
  for (const f of active) { if (probMap[f] > best) { best = probMap[f]; primary = f; } }
  const comments = correct
    ? [m.correct_comment].filter(Boolean)
    : active.map((f) => m.comments && m.comments[f]).filter(Boolean);
  return { correct, active, primary, comments, probs: probMap };
}

// Synchronous — models are bundled, so a per-frame call needs no await.
export function classifyForm(exerciseId, jointAngles) {
  const m = MODELS[exerciseId];
  if (!m) return null;
  return runModel(m, jointAngles);
}
