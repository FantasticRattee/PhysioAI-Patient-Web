// App V7 PWA: generic bottle detection selection + Pose-proximity counter.
// This module is pure JavaScript and intentionally has no MediaPipe/React
// dependency so detector and counter behavior can be tested without a camera.

export const BOTTLE_GRAB_V7_COUNTER_MODE = 'bottle_detector_proximity';
export const BOTTLE_GRAB_V7_COUNTER_PROVENANCE =
  'experimental_app_v7_bottle_detector_pose_proximity_counter_v1';

export const BOTTLE_GRAB_V7_DETECTOR_CONTRACT = Object.freeze({
  asset: 'efficientdet_lite0.tflite',
  label: 'bottle',
  minimumScore: 0.35,
  ambiguityMargin: 0.05,
  roiMargin: 0.02,
  maximumDetectionAgeMs: 350,
  source: 'mediapipe-efficientdet-lite0-coco-v1-dev',
  status: 'experimental_generic_coco_baseline',
});

export const BOTTLE_GRAB_V7_COUNTER_CONTRACT = Object.freeze({
  counterMode: BOTTLE_GRAB_V7_COUNTER_MODE,
  poseProxyIndices: Object.freeze([15, 19, 17, 21]),
  stableEntryObservations: 3,
  stableExitObservations: 3,
  minimumSampleIntervalMs: 66,
  maximumObservationGapMs: 450,
  requiresHandLandmarks: false,
  requiresBottleLift: false,
  requiresWristReturn: false,
  clinicalDecision: false,
});

const finite = (value) => Number.isFinite(Number(value));

function validRect(rect) {
  return rect
    && finite(rect.x) && finite(rect.y) && finite(rect.width) && finite(rect.height)
    && Number(rect.width) > 0 && Number(rect.height) > 0
    && Number(rect.x) >= 0 && Number(rect.y) >= 0
    && Number(rect.x) + Number(rect.width) <= 1
    && Number(rect.y) + Number(rect.height) <= 1;
}

function iou(left, right) {
  const x1 = Math.max(Number(left.x), Number(right.x));
  const y1 = Math.max(Number(left.y), Number(right.y));
  const x2 = Math.min(Number(left.x) + Number(left.width), Number(right.x) + Number(right.width));
  const y2 = Math.min(Number(left.y) + Number(left.height), Number(right.y) + Number(right.height));
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = Number(left.width) * Number(left.height)
    + Number(right.width) * Number(right.height) - intersection;
  return union > 0 ? intersection / union : 0;
}

function normalizeDetection(raw, sourceGeneration, timestampMs, imageWidth = 1, imageHeight = 1) {
  const categories = raw?.categories || [];
  const category = categories[0] || {};
  const label = category.categoryName || category.displayName || raw?.label || '';
  const score = Number(category.score ?? raw?.score ?? 0);
  const box = raw?.boundingBox || raw?.bounding_box || raw?.box;
  const rawBox = {
    x: Number(box?.origin?.x ?? box?.originX ?? box?.x),
    y: Number(box?.origin?.y ?? box?.originY ?? box?.y),
    width: Number(box?.width),
    height: Number(box?.height),
  };
  // MediaPipe Tasks Vision returns ObjectDetector boxes in image pixels;
  // native V7 and the counter contract use normalized [0,1] coordinates.
  const pixelBox = rawBox.x > 1 || rawBox.y > 1 || rawBox.width > 1 || rawBox.height > 1;
  const boundingBox = pixelBox && Number(imageWidth) > 0 && Number(imageHeight) > 0
    ? {
      x: rawBox.x / Number(imageWidth),
      y: rawBox.y / Number(imageHeight),
      width: rawBox.width / Number(imageWidth),
      height: rawBox.height / Number(imageHeight),
    }
    : rawBox;
  if (!validRect(boundingBox)) return null;
  return {
    sourceGeneration,
    timestampMs: finite(raw?.timestampMs) ? Number(raw.timestampMs) : timestampMs,
    label: String(label),
    score,
    boundingBox,
  };
}

export function normalizeBottleDetections(result, {
  sourceGeneration = 0,
  timestampMs = 0,
  imageWidth = 1,
  imageHeight = 1,
} = {}) {
  return (result?.detections || [])
    .map((detection) => normalizeDetection(detection, sourceGeneration, timestampMs, imageWidth, imageHeight))
    .filter(Boolean);
}

export function selectBottleDetection({
  detections = [],
  sourceGeneration = 0,
  timestampMs = 0,
  previous = null,
} = {}) {
  const candidates = detections
    .filter((detection) => (
      detection
      && Number(detection.sourceGeneration) === Number(sourceGeneration)
      && finite(detection.timestampMs)
      && Number(detection.timestampMs) <= Number(timestampMs)
      && Number(timestampMs) - Number(detection.timestampMs) <= BOTTLE_GRAB_V7_DETECTOR_CONTRACT.maximumDetectionAgeMs
      && String(detection.label || '').toLowerCase() === BOTTLE_GRAB_V7_DETECTOR_CONTRACT.label
      && finite(detection.score)
      && Number(detection.score) >= BOTTLE_GRAB_V7_DETECTOR_CONTRACT.minimumScore
      && validRect(detection.boundingBox)
    ))
    .sort((left, right) => Number(right.score) - Number(left.score));

  if (!candidates.length) return { detection: null, reason: 'bottle_missing', candidateCount: 0 };

  if (previous?.boundingBox && Number(previous.sourceGeneration) === Number(sourceGeneration)) {
    const tracked = candidates
      .slice()
      .sort((left, right) => iou(right.boundingBox, previous.boundingBox) - iou(left.boundingBox, previous.boundingBox))[0];
    if (tracked && iou(tracked.boundingBox, previous.boundingBox) >= 0.05) {
      return { detection: tracked, reason: 'bottle_selected_tracked', candidateCount: candidates.length };
    }
  }

  if (candidates.length > 1
    && Number(candidates[0].score) - Number(candidates[1].score)
      < BOTTLE_GRAB_V7_DETECTOR_CONTRACT.ambiguityMargin) {
    return { detection: null, reason: 'bottle_ambiguous', candidateCount: candidates.length };
  }
  return { detection: candidates[0], reason: 'bottle_selected', candidateCount: candidates.length };
}

function expandedContains(point, detection) {
  const margin = BOTTLE_GRAB_V7_DETECTOR_CONTRACT.roiMargin;
  const box = detection.boundingBox;
  return Number(point.x) >= Number(box.x) - margin
    && Number(point.x) <= Number(box.x) + Number(box.width) + margin
    && Number(point.y) >= Number(box.y) - margin
    && Number(point.y) <= Number(box.y) + Number(box.height) + margin;
}

function poseProxyPoints(poseLandmarks) {
  const points = BOTTLE_GRAB_V7_COUNTER_CONTRACT.poseProxyIndices
    .map((index) => poseLandmarks?.[index])
    .filter((point) => point && finite(point.x) && finite(point.y)
      && (point.visibility == null || Number(point.visibility) >= 0.4));
  return points.length ? points : null;
}

export function createBottleProximityCounter() {
  const contract = BOTTLE_GRAB_V7_COUNTER_CONTRACT;
  let stage = 'waiting_for_bottle';
  let sourceGeneration = null;
  let lastTimestampMs = null;
  let lastBottleDetection = null;
  let entryCount = 0;
  let exitCount = 0;
  let countingEnabled = false;
  let totalCycles = 0;
  let lastResetReason = null;

  function resetPartial(reason = 'explicit_reset') {
    stage = 'waiting_for_bottle';
    entryCount = 0;
    exitCount = 0;
    lastBottleDetection = null;
    lastResetReason = reason;
  }

  function reset(reason = 'explicit_reset') {
    totalCycles = 0;
    countingEnabled = false;
    sourceGeneration = null;
    lastTimestampMs = null;
    resetPartial(reason);
  }

  function resetForNewCaptureSource(reason = 'capture_source_replaced') {
    countingEnabled = false;
    lastTimestampMs = null;
    resetPartial(reason);
  }

  function result({ didCompleteCycle = false, reason = null, bottleInZone = null, bottleScore = null } = {}) {
    return {
      counterMode: BOTTLE_GRAB_V7_COUNTER_MODE,
      totalCycles,
      didCompleteCycle,
      status: stage,
      reason: reason || lastResetReason,
      isArmed: stage === 'armed_outside_zone' || stage === 'inside_bottle_zone',
      bottleInZone,
      bottleScore,
      proximityRepCount: totalCycles,
      proximityRepStatus: stage,
      proximityRepProvenance: BOTTLE_GRAB_V7_COUNTER_PROVENANCE,
      proximityRepConditions: contract,
    };
  }

  function setCountingEnabled(enabled) {
    const next = enabled === true;
    if (next === countingEnabled) return;
    countingEnabled = next;
    resetPartial(next ? 'practice_started_rebaseline' : 'practice_not_active');
  }

  function push({
    poseLandmarks,
    bottleDetection = null,
    timestampMs = Date.now(),
    sourceGeneration: frameSourceGeneration = 0,
    countingEnabled: inputCountingEnabled,
  } = {}) {
    if (typeof inputCountingEnabled === 'boolean' && inputCountingEnabled !== countingEnabled) {
      setCountingEnabled(inputCountingEnabled);
    }
    const timestamp = finite(timestampMs) ? Number(timestampMs) : Date.now();
    if (sourceGeneration != null && sourceGeneration !== frameSourceGeneration) {
      sourceGeneration = frameSourceGeneration;
      lastTimestampMs = null;
      resetPartial('source_generation_changed');
    } else if (sourceGeneration == null) {
      sourceGeneration = frameSourceGeneration;
    }
    if (lastTimestampMs != null && timestamp <= lastTimestampMs) {
      resetPartial('timestamp_regression');
      lastTimestampMs = timestamp;
      return result({ reason: 'timestamp_regression' });
    }
    if (lastTimestampMs != null) {
      const gap = timestamp - lastTimestampMs;
      if (gap > contract.maximumObservationGapMs) resetPartial('observation_gap');
      if (gap < contract.minimumSampleIntervalMs) return result();
    }
    lastTimestampMs = timestamp;

    if (bottleDetection) {
      const selection = selectBottleDetection({
        detections: [bottleDetection],
        sourceGeneration: frameSourceGeneration,
        timestampMs: timestamp,
        previous: lastBottleDetection,
      });
      if (selection.detection) lastBottleDetection = selection.detection;
      else if (stage !== 'waiting_for_bottle') resetPartial(selection.reason);
    }
    if (!lastBottleDetection
      || timestamp - lastBottleDetection.timestampMs > BOTTLE_GRAB_V7_DETECTOR_CONTRACT.maximumDetectionAgeMs) {
      if (stage !== 'waiting_for_bottle') resetPartial('bottle_detection_stale');
      return result({ reason: 'bottle_missing' });
    }
    const proxy = poseProxyPoints(poseLandmarks);
    if (!proxy) return result({ reason: 'pose_hand_proxy_missing', bottleScore: lastBottleDetection.score });
    const inZone = proxy.some((point) => expandedContains(point, lastBottleDetection));
    if (!countingEnabled) return result({ reason: 'practice_not_active', bottleInZone: inZone, bottleScore: lastBottleDetection.score });

    if (stage === 'waiting_for_bottle') {
      if (!inZone) {
        stage = 'armed_outside_zone';
        lastResetReason = null;
      }
    } else if (stage === 'armed_outside_zone') {
      entryCount = inZone ? entryCount + 1 : 0;
      if (entryCount >= contract.stableEntryObservations) {
        stage = 'inside_bottle_zone';
        entryCount = 0;
        exitCount = 0;
      }
    } else if (stage === 'inside_bottle_zone') {
      exitCount = inZone ? 0 : exitCount + 1;
      if (exitCount >= contract.stableExitObservations) {
        totalCycles += 1;
        stage = 'armed_outside_zone';
        entryCount = 0;
        exitCount = 0;
        lastResetReason = null;
        return result({ didCompleteCycle: true, bottleInZone: false, bottleScore: lastBottleDetection.score });
      }
    }
    return result({ bottleInZone: inZone, bottleScore: lastBottleDetection.score });
  }

  reset();
  return {
    push,
    reset,
    resetPartial,
    resetForNewCaptureSource,
    setCountingEnabled,
    get totalCycles() { return totalCycles; },
    counterMode: BOTTLE_GRAB_V7_COUNTER_MODE,
    provenance: BOTTLE_GRAB_V7_COUNTER_PROVENANCE,
    conditions: contract,
  };
}
