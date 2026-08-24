// App V6 experimental PWA composition for Bottle Grab.
//
// Geometry First owns the development repetition boundary. The existing
// Baseline #4/Calibration 3 adapter continues to run the frozen PhaseNet V2
// stream on the same Pose+Hand observations, but PhaseNet is context only: it
// cannot increment, suppress, or erase Geometry First repetitions.

import { createBottleGrabRuleWrapHybridTracker } from './ruleWrapHybrid/RuleWrapHybridDeviceAdapter.js';

export const BOTTLE_GRAB_V6_CONTRACT = require('./bottle_grab_parallel_v6_pwa.contract.json');

export const BOTTLE_GRAB_V6_COUNTER_MODE = 'parallel_geometry_first';
export const BOTTLE_GRAB_V6_COUNTER_PROVENANCE =
  'experimental_app_v6_parallel_geometry_first_counter_v1';

function phaseContextFrom(output) {
  const context = output?.phaseContext || {};
  const status = String(context.status || 'phase_context_unavailable');
  const available = context.available === true || status === 'phase_ready';
  return {
    status,
    phase: context.phase || output?.phase || null,
    probabilities: context.probabilities || output?.probabilities || null,
    modelId: context.modelId || null,
    modelStatus: context.modelStatus || null,
    bufferedFrames: Number(context.bufferedFrames || output?.bufferedFrames || 0),
    endpointTimestampMs: context.endpointTimestampMs || null,
    reason: context.reason || output?.reason || (available ? null : status),
    captureQc: context.captureQc || output?.captureQc || null,
    available,
  };
}

function decorate(output) {
  const phaseContext = phaseContextFrom(output);
  const geometryFirst = {
    repCount: Number(output?.repCount || 0),
    status: output?.repCounterStatus || 'collecting_rest',
    reason: output?.repCounterReason || null,
    didCompleteRep: output?.repCounterDidComplete === true,
    provenance: BOTTLE_GRAB_V6_COUNTER_PROVENANCE,
    conditions: output?.repCounterConditions || null,
  };
  return {
    ...output,
    counterMode: BOTTLE_GRAB_V6_COUNTER_MODE,
    repCount: geometryFirst.repCount,
    geometryRepCount: geometryFirst.repCount,
    geometryFirst,
    repCounterProvenance: BOTTLE_GRAB_V6_COUNTER_PROVENANCE,
    phaseContext,
    phaseContextAvailable: phaseContext.available,
    phaseContextUnavailableReason: phaseContext.available ? null : phaseContext.reason,
    decisionScope: 'development_parallel_geometry_first_phase_context',
    sourceType: 'camera_macbook_web_preview',
  };
}

export function createBottleGrabParallelV6Tracker(options = {}) {
  const baseTracker = createBottleGrabRuleWrapHybridTracker(options);
  return {
    push(input = {}) {
      return decorate(baseTracker.push(input));
    },
    reset(reason = 'explicit_reset') {
      baseTracker.reset(reason);
    },
    resetForNewCaptureSource(reason = 'capture_source_replaced') {
      baseTracker.resetForNewCaptureSource?.(reason);
    },
    get bufferedFrameCount() { return baseTracker.bufferedFrameCount; },
    get modelStatus() { return baseTracker.modelStatus; },
    modelId: baseTracker.modelId,
    modelVersion: baseTracker.modelVersion,
    decisionScope: 'development_parallel_geometry_first_phase_context',
    counterMode: BOTTLE_GRAB_V6_COUNTER_MODE,
    contract: BOTTLE_GRAB_V6_CONTRACT,
  };
}
