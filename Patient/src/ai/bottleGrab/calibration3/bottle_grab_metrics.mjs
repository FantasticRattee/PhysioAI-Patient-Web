function finitePoint(point) {
  return point
    && Number.isFinite(Number(point.x))
    && Number.isFinite(Number(point.y))
    && Number.isFinite(Number(point.z ?? 0));
}

export function interiorAngleDegrees(a, vertex, c) {
  if (![a, vertex, c].every(finitePoint)) return null;
  const left = [a.x - vertex.x, a.y - vertex.y, (a.z ?? 0) - (vertex.z ?? 0)];
  const right = [c.x - vertex.x, c.y - vertex.y, (c.z ?? 0) - (vertex.z ?? 0)];
  const leftNorm = Math.hypot(...left);
  const rightNorm = Math.hypot(...right);
  if (leftNorm < 1e-9 || rightNorm < 1e-9) return null;
  const cosine = left.reduce((sum, value, index) => sum + value * right[index], 0)
    / (leftNorm * rightNorm);
  const clamped = Math.min(1, Math.max(-1, cosine));
  return Math.acos(clamped) * 180 / Math.PI;
}

function finitePolicy(policy) {
  const keys = [
    'fullCreditMin', 'fullCreditMax', 'acceptableMin', 'acceptableMax', 'boundaryScore',
  ];
  return policy && keys.every((key) => Number.isFinite(Number(policy[key])));
}

export function isValidRangePolicy(policy) {
  if (!finitePolicy(policy)) return false;
  const acceptableMin = Number(policy.acceptableMin);
  const fullCreditMin = Number(policy.fullCreditMin);
  const fullCreditMax = Number(policy.fullCreditMax);
  const acceptableMax = Number(policy.acceptableMax);
  const boundaryScore = Number(policy.boundaryScore);
  return acceptableMin < fullCreditMin
    && fullCreditMin <= fullCreditMax
    && fullCreditMax < acceptableMax
    && boundaryScore >= 0
    && boundaryScore <= 100;
}

function roundScore(value) {
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
}

export function computeRangePreview(observedValue, policy) {
  if (observedValue === null || observedValue === undefined || !Number.isFinite(Number(observedValue))) {
    return {
      assessability: 'cannot_assess',
      counted: false,
      rangeStatus: 'cannot_assess',
      practiceScore: null,
    };
  }
  if (!isValidRangePolicy(policy)) {
    return {
      assessability: 'cannot_assess',
      counted: false,
      rangeStatus: 'invalid_draft_policy',
      practiceScore: null,
    };
  }

  const value = Number(observedValue);
  const acceptableMin = Number(policy.acceptableMin);
  const fullCreditMin = Number(policy.fullCreditMin);
  const fullCreditMax = Number(policy.fullCreditMax);
  const acceptableMax = Number(policy.acceptableMax);
  const boundaryScore = Number(policy.boundaryScore);

  if (value < acceptableMin || value > acceptableMax) {
    return {
      assessability: 'can_assess',
      counted: false,
      rangeStatus: 'outside_draft_range',
      practiceScore: 0,
    };
  }
  if (value >= fullCreditMin && value <= fullCreditMax) {
    return {
      assessability: 'can_assess',
      counted: true,
      rangeStatus: 'near_reference',
      practiceScore: 100,
    };
  }

  const score = value < fullCreditMin
    ? boundaryScore + (100 - boundaryScore) * (value - acceptableMin) / (fullCreditMin - acceptableMin)
    : boundaryScore + (100 - boundaryScore) * (acceptableMax - value) / (acceptableMax - fullCreditMax);
  return {
    assessability: 'can_assess',
    counted: true,
    rangeStatus: 'acceptable',
    practiceScore: roundScore(score),
  };
}

export function computeCombinedRangePreview(observedValue, policy, requiredStreamsReady) {
  if (!requiredStreamsReady) {
    return {
      assessability: 'cannot_assess',
      counted: false,
      rangeStatus: 'cannot_assess',
      practiceScore: null,
    };
  }
  return computeRangePreview(observedValue, policy);
}

export function flexionDegrees(a, vertex, c) {
  const interior = interiorAngleDegrees(a, vertex, c);
  return interior === null ? null : 180 - interior;
}

export function normalizedDistance(a, b, scale) {
  if (!finitePoint(a) || !finitePoint(b) || !Number.isFinite(scale) || scale <= 1e-9) return null;
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)) / scale;
}
