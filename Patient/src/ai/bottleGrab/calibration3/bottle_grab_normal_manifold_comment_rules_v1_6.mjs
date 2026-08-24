/**
 * Named V1.6 normal-manifold rules for development replay.
 *
 * These rules reuse measurements already produced by the Pose+Hand adapter.
 * They are deliberately separate from the frozen V1.4 browser lock: adding a
 * rule here does not authorize Browser/App delivery or change V1.4 bytes.
 */

const PERSISTENCE = Object.freeze({
  minAssessableSamples: 4,
  minConsecutiveFrames: 3,
  minFractionBeyondBoundary: 0.6,
});

function rule({
  observationTag,
  cueId,
  measurementId,
  phaseScope,
  direction,
  lower,
  upper,
  uncertaintyMargin,
}) {
  return Object.freeze({
    observationTag,
    cueId,
    measurementId,
    phaseScope: Object.freeze([...phaseScope]),
    direction,
    referenceBand: Object.freeze({ lower, upper }),
    uncertaintyMargin,
    persistence: PERSISTENCE,
  });
}

export const NORMAL_MANIFOLD_RULES_V1_6 = Object.freeze([
  rule({
    observationTag: 'BG_OBS_PRESHAPE_OPENING_BELOW_REFERENCE',
    cueId: 'BG_REF_OPEN_HAND_MORE',
    measurementId: 'thumb_index_aperture',
    phaseScope: ['preshape'],
    direction: 'below',
    lower: 1.27149,
    upper: 1.526181,
    uncertaintyMargin: 0.166063,
  }),
  rule({
    observationTag: 'BG_OBS_GRASP_CLOSURE_BELOW_REFERENCE',
    cueId: 'BG_REF_WRAP_FINGERS_MORE',
    measurementId: 'mean_finger_flexion',
    phaseScope: ['grasp'],
    direction: 'below',
    lower: 38.888579,
    upper: 44.881449,
    uncertaintyMargin: 2.179326,
  }),
  rule({
    observationTag: 'BG_OBS_WORKING_SHOULDER_ELEVATION_ABOVE_REFERENCE',
    cueId: 'BG_REF_RELAX_SHOULDER',
    measurementId: 'working_shoulder_elevation_delta_from_rest_torso',
    phaseScope: ['reach', 'preshape', 'grasp'],
    direction: 'above',
    // Conservative V1.6 development calibration; not a validated threshold.
    lower: 0.001439,
    upper: 0.058263,
    uncertaintyMargin: 0.010,
  }),
  rule({
    observationTag: 'BG_OBS_TRUNK_MOTION_ABOVE_REFERENCE',
    cueId: 'BG_REF_KEEP_TRUNK_STILL',
    measurementId: 'trunk_vector_change_from_rest_torso',
    phaseScope: ['grasp'],
    direction: 'above',
    // Conservative V1.6 development calibration; not a validated threshold.
    lower: 0.10,
    upper: 0.365572,
    uncertaintyMargin: 0.050,
  }),
]);

export const NORMAL_MANIFOLD_COMMENT_CATALOG_V1_6 = Object.freeze({
  schema: 'physioai.bottle_grab_normal_manifold_comment_catalog.v1_6',
  status: 'development_candidate',
  cues: Object.freeze([
    Object.freeze({
      cueId: 'BG_REF_OPEN_HAND_MORE',
      messages: Object.freeze({
        th: 'ก่อนกำขวด ลองเปิดนิ้วให้กว้างขึ้นอีกเล็กน้อย',
        en: 'Before grasping the bottle, try opening your fingers a little wider.',
      }),
    }),
    Object.freeze({
      cueId: 'BG_REF_WRAP_FINGERS_MORE',
      messages: Object.freeze({
        th: 'ขณะกำขวด ลองโอบนิ้วรอบขวดให้ครบขึ้น',
        en: 'While grasping the bottle, try wrapping your fingers around it more completely.',
      }),
    }),
    Object.freeze({
      cueId: 'BG_REF_RELAX_SHOULDER',
      messages: Object.freeze({
        th: 'ขณะกำขวด ลองผ่อนหัวไหล่ลง',
        en: 'While grasping the bottle, try relaxing your working shoulder.',
      }),
    }),
    Object.freeze({
      cueId: 'BG_REF_KEEP_TRUNK_STILL',
      messages: Object.freeze({
        th: 'ขณะกำขวด ลองรักษาลำตัวให้นิ่ง',
        en: 'While grasping the bottle, try keeping your trunk steady.',
      }),
    }),
  ]),
});

export const NORMAL_MANIFOLD_COMMENT_DELIVERY_POLICY_V1_6 = Object.freeze({
  schema: 'physioai.bottle_grab_normal_manifold_comment_delivery_policy.v1_6',
  status: 'development_candidate',
  priorities: Object.freeze([
    Object.freeze({ cueId: 'BG_REF_OPEN_HAND_MORE', priorityRank: 1 }),
    Object.freeze({ cueId: 'BG_REF_WRAP_FINGERS_MORE', priorityRank: 2 }),
    Object.freeze({ cueId: 'BG_REF_RELAX_SHOULDER', priorityRank: 3 }),
    Object.freeze({ cueId: 'BG_REF_KEEP_TRUNK_STILL', priorityRank: 4 }),
  ]),
  maxVisualObservations: 3,
  audioOrTts: false,
  runtimeAuthorized: false,
});
