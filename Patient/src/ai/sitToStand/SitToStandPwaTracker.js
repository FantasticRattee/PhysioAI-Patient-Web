import { createSitToStandFeatureExtractor } from './SitToStandFeatureExtractor.js';
import { createSitToStandGeometryCounter } from './SitToStandGeometryCounter.js';
import { createSitToStandPhaseCommentEngine, createSitToStandPhaseNet } from './SitToStandPhaseNet.js';

export const SIT_TO_STAND_PWA_MODULE_ID = 'sit_to_stand_pwa_v7_3_3_experimental';
export const SIT_TO_STAND_PWA_MODULE_VERSION = '7.3.3-pwa-experimental';

export function createSitToStandPwaTracker({ phaseNet = createSitToStandPhaseNet(), referenceProfile = null } = {}) {
  const extractor = createSitToStandFeatureExtractor();
  const geometryCounter = createSitToStandGeometryCounter();
  const phaseCommentEngine = createSitToStandPhaseCommentEngine({ phaseNet, referenceProfile });
  let sourceGeneration = null;
  function reset() { extractor.reset(); geometryCounter.reset(); phaseCommentEngine.reset(); sourceGeneration = null; }
  function resetForNewCaptureSource() { extractor.reset(); geometryCounter.resetForNewCaptureSource(); phaseCommentEngine.reset(); sourceGeneration = null; }
  function setCountingEnabled(enabled) { geometryCounter.setCountingEnabled(enabled); }
  function push(snapshot) {
    if (sourceGeneration !== null && snapshot.sourceGeneration !== sourceGeneration) resetForNewCaptureSource();
    sourceGeneration = snapshot.sourceGeneration;
    const frame = extractor.extract(snapshot);
    const geometry = frame.featureReady ? geometryCounter.ingest({ pelvisHeightAboveAnklesNorm: frame.pelvisHeightAboveAnklesNorm, timestampMs: frame.timestampMs }) : (geometryCounter.resetPartial(), { status: 'cannot_assess', totalReps: geometryCounter.totalReps, repetitionCompleted: false, reason: frame.reason });
    const phase = phaseCommentEngine.ingest(frame);
    return {
      moduleId: SIT_TO_STAND_PWA_MODULE_ID,
      moduleVersion: SIT_TO_STAND_PWA_MODULE_VERSION,
      captureQC: frame.featureReady ? 'pose_geometry_only' : 'cannot_assess',
      setupReason: frame.reason,
      featureFrameCount: phase.bufferedFrames,
      geometryStatus: geometry.status,
      geometryTotalReps: geometry.totalReps,
      geometryRepetitionCompleted: geometry.repetitionCompleted,
      phase: phase.phase,
      phaseStatus: phase.status,
      phaseProbabilities: phase.probabilities,
      commentStatus: phase.commentStatus,
      cue: phase.cue,
      cueThai: phase.cueThai,
      commentRepetitionCount: phase.completedCommentCycles,
      isTrackingReady: frame.featureReady,
      counterMode: 'parallel_geometry_counter',
    };
  }
  return {
    push,
    reset,
    setCountingEnabled,
    resetForNewCaptureSource,
    extractor,
    geometryCounter,
    phaseCommentEngine,
    modelId: SIT_TO_STAND_PWA_MODULE_ID,
    modelVersion: SIT_TO_STAND_PWA_MODULE_VERSION,
    decisionScope: 'experimental_pwa_pose_only_phase_context_and_geometry_counter',
    counterMode: 'parallel_geometry_counter',
  };
}
