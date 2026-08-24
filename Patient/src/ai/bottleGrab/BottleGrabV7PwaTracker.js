// App V7 PWA Bottle Grab orchestration.
//
// Bottle localization + Pose-proximity owns the experimental count. The
// existing Baseline #4 cue branch and frozen PhaseNet V2 remain parallel
// context/comment streams and cannot change that count.

import { createBottleGrabRuleWrapHybridTracker } from './ruleWrapHybrid/RuleWrapHybridDeviceAdapter.js';
import {
  BOTTLE_GRAB_V7_COUNTER_MODE,
  BOTTLE_GRAB_V7_COUNTER_PROVENANCE,
  BOTTLE_GRAB_V7_COUNTER_CONTRACT,
  BOTTLE_GRAB_V7_DETECTOR_CONTRACT,
  createBottleProximityCounter,
} from './v7/BottleDetectionV7.js';
import {
  BOTTLE_GRAB_V7_PWA_DIAGNOSTICS_VERSION,
  createBottleDetectorDiagnosticsV733,
} from './v7/BottleDetectorDiagnosticsV733.js';

export const BOTTLE_GRAB_V7_MODULE_ID = 'bottle_grab_v7';
export const BOTTLE_GRAB_V7_MODULE_VERSION = '1.0.0-dev-v7-3-3-diagnostics';
export const BOTTLE_GRAB_V7_PWA_DIAGNOSTICS = BOTTLE_GRAB_V7_PWA_DIAGNOSTICS_VERSION;
export const BOTTLE_GRAB_V7_DECISION_SCOPE = 'experimental_local_device_proximity_only';
export const BOTTLE_GRAB_V7_CONTRACT = require('./v7/bottle_grab_v7_pwa.contract.json');

function fingerQualityStatus(handLandmarks, handSide, handScore) {
  if (!Array.isArray(handLandmarks) || handLandmarks.length !== 21) return 'finger_quality_unavailable';
  if (!String(handSide || '').toLowerCase().includes('left')) return 'finger_quality_wrong_side';
  if (!Number.isFinite(Number(handScore)) || Number(handScore) < 0.5) return 'finger_quality_unreliable';
  return 'finger_quality_available';
}

function phaseContextFrom(base) {
  const context = base?.phaseContext || {};
  const status = String(context.status || 'phase_context_unavailable');
  const available = context.available === true || status === 'phase_ready';
  return {
    status,
    phase: context.phase || base?.phase || null,
    probabilities: context.probabilities || base?.probabilities || null,
    modelId: context.modelId || null,
    modelStatus: context.modelStatus || null,
    bufferedFrames: Number(context.bufferedFrames || 0),
    endpointTimestampMs: context.endpointTimestampMs || null,
    reason: context.reason || base?.reason || (available ? null : status),
    available,
  };
}

export function createBottleGrabV7PwaTracker(options = {}) {
  // Baseline #4/PhaseNet uses the same frame but its old geometry counter is
  // disabled here so only the V7 bottle-proximity counter can own the total.
  const contextTracker = createBottleGrabRuleWrapHybridTracker({
    ...options,
    disableRepCounter: true,
  });
  const proximityCounter = createBottleProximityCounter();
  const detectorDiagnostics = createBottleDetectorDiagnosticsV733();

  function push({
    poseLandmarks,
    handLandmarks,
    bottleDetection = null,
    bottleDiagnostics = null,
    timestampMs,
    sourceGeneration = 0,
    handSide,
    handScore,
    positioning = false,
    countingEnabled = false,
  } = {}) {
    const base = contextTracker.push({
      poseLandmarks,
      handLandmarks,
      timestampMs,
      handSide,
      handScore,
      positioning,
      countingEnabled: false,
    });
    const proximity = proximityCounter.push({
      poseLandmarks,
      bottleDetection,
      timestampMs,
      sourceGeneration,
      countingEnabled,
    });
    const detectorInput = bottleDiagnostics || {
      detectorState: 'ready',
      detections: bottleDetection ? [bottleDetection] : [],
      selection: bottleDetection
        ? { detection: bottleDetection, reason: 'bottle_selected', candidateCount: 1 }
        : { detection: null, reason: 'bottle_missing', candidateCount: 0 },
    };
    const diagnostics = detectorDiagnostics.update({
      ...detectorInput,
      timestampMs,
      sourceGeneration,
      selectedDetection: detectorInput.selectedDetection === undefined
        ? (detectorInput.selection?.detection ?? bottleDetection)
        : detectorInput.selectedDetection,
      counter: proximity,
    });
    const phaseContext = phaseContextFrom(base);
    const bottleStatus = diagnostics.status;
    const fingerStatus = fingerQualityStatus(handLandmarks, handSide, handScore);
    return {
      ...base,
      modelId: BOTTLE_GRAB_V7_MODULE_ID,
      modelVersion: BOTTLE_GRAB_V7_MODULE_VERSION,
      decisionScope: BOTTLE_GRAB_V7_DECISION_SCOPE,
      bottleDiagnostics: diagnostics,
      bottleDiagnosticsStatus: diagnostics.status,
      bottleDiagnosticsVersion: diagnostics.version,
      bottleRawCandidateCount: diagnostics.rawCandidateCount,
      bottleAcceptedCandidateCount: diagnostics.acceptedCandidateCount,
      bottleTopLabel: diagnostics.topLabel,
      bottleTopScore: diagnostics.topScore,
      bottleSourceGeneration: diagnostics.sourceGeneration,
      bottleSelectionReason: diagnostics.selectionReason,
      bottleRoi: diagnostics.roi,
      bottleRoiAgeMs: diagnostics.roi?.ageMs ?? null,
      bottleRoiFresh: diagnostics.roi?.fresh === true,
      bottleCounterStage: diagnostics.counter.stage,
      bottleCounterReason: diagnostics.counter.reason,
      counterMode: BOTTLE_GRAB_V7_COUNTER_MODE,
      bottleStatus,
      bottleInZone: proximity.bottleInZone,
      bottleScore: proximity.bottleScore,
      proximityRepCount: proximity.proximityRepCount,
      proximityRepStatus: proximity.proximityRepStatus,
      proximityRepReason: proximity.reason || null,
      proximityRepDidComplete: proximity.didCompleteCycle,
      proximityRepProvenance: BOTTLE_GRAB_V7_COUNTER_PROVENANCE,
      proximityRepConditions: BOTTLE_GRAB_V7_COUNTER_CONTRACT,
      experimentalProximityCount: proximity.totalCycles,
      repCount: proximity.totalCycles,
      repCounterProvenance: BOTTLE_GRAB_V7_COUNTER_PROVENANCE,
      fingerQualityStatus: fingerStatus,
      // Do not carry a previous Hand comment through a missing/wrong-side
      // observation. V7 count remains valid, but finger evidence is not.
      faultDecision: fingerStatus === 'finger_quality_available' ? base.faultDecision : null,
      phaseContext,
      phaseContextAvailable: phaseContext.available,
      phaseContextUnavailableReason: phaseContext.available ? null : phaseContext.reason,
      v7Detector: BOTTLE_GRAB_V7_DETECTOR_CONTRACT,
      v7Contract: BOTTLE_GRAB_V7_CONTRACT,
      sourceType: 'camera_macbook_web_preview',
    };
  }

  function reset(reason = 'explicit_reset') {
    contextTracker.reset(reason);
    proximityCounter.reset(reason);
    detectorDiagnostics.reset(reason);
  }

  function resetForNewCaptureSource(reason = 'capture_source_replaced') {
    contextTracker.resetForNewCaptureSource?.(reason);
    proximityCounter.resetForNewCaptureSource(reason);
    detectorDiagnostics.reset(reason);
  }

  return {
    push,
    reset,
    resetForNewCaptureSource,
    get bufferedFrameCount() { return contextTracker.bufferedFrameCount; },
    get modelStatus() { return contextTracker.modelStatus; },
    modelId: BOTTLE_GRAB_V7_MODULE_ID,
    modelVersion: BOTTLE_GRAB_V7_MODULE_VERSION,
    decisionScope: BOTTLE_GRAB_V7_DECISION_SCOPE,
    counterMode: BOTTLE_GRAB_V7_COUNTER_MODE,
    contract: BOTTLE_GRAB_V7_CONTRACT,
  };
}
