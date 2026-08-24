// PhysioAI · Version-2 — usePractice hook.
//
// Owns the live practice loop on the React side: builds the session, drives the
// synthetic DEMO feed (works in Expo Go, no native module), receives LIVE pose
// frames from <PoseCamera>, speaks cues (TTS), and logs the session on finish.
// Camera-agnostic: the screen renders the camera and pipes results to onPoseResult.

import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { createSession } from '../core/session.js';
import { getExercise } from '../core/exercises.js';
import { getSettings, logSession } from '../core/store.js';
import { makeSyntheticFeed } from '../ai/SyntheticPose.js';
import { tts } from '../core/tts.js';
import { t, getLang } from '../core/i18n.js';
import {
  PRESENTATION_MODE,
  normalizePresentationMode,
  shouldSpeak,
  getSpokenFeedback,
} from '../core/accessibilityMode.js';
import { createBottleGrabCalibration3Tracker } from '../ai/bottleGrab/Calibration3DeviceAdapter.js';
import { createBottleGrabV7PwaTracker } from '../ai/bottleGrab/BottleGrabV7PwaTracker.js';
import {
  createBundledSitToStandPwaTracker,
  preloadSitToStandPwaPhaseNet,
} from '../ai/sitToStand/SitToStandPwaDeviceAdapter.js';

export function usePractice({
  exId, mode, dose, kind, exercise: exerciseSnapshot, patientId = 'p1',
  presentationMode = PRESENTATION_MODE.STANDARD,
}) {
  const presentation = normalizePresentationMode(presentationMode);
  const [snapshot, setSnapshot] = useState(null);
  const [summary, setSummary] = useState(null);
  const [ready, setReady] = useState(false);

  const session = useRef(null);
  const feed = useRef(null);
  const timer = useRef(null);
  const lastTs = useRef(0);
  const finished = useRef(false);
  const voice = useRef(true);
  const lang = useRef(getLang());
  const lastExperimentalCueId = useRef(null);

  // Practice phase (live): positioning → countdown → active. Demo starts active.
  const [phase, setPhaseState] = useState(mode === 'live' ? 'positioning' : 'active');
  const [countdown, setCountdown] = useState(0);
  const phaseRef = useRef(mode === 'live' ? 'positioning' : 'active');
  const posStableSince = useRef(0);
  const cdTimer = useRef(null);
  const posFallback = useRef(null);

  const stopLoop = useCallback(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
  }, []);

  const clearPhaseTimers = useCallback(() => {
    if (cdTimer.current) { clearInterval(cdTimer.current); cdTimer.current = null; }
    if (posFallback.current) { clearTimeout(posFallback.current); posFallback.current = null; }
  }, []);

  const enterActive = useCallback(() => {
    clearPhaseTimers();
    session.current?.reset();          // active workout = fresh reps / score / duration
    lastTs.current = Date.now();
    setCountdown(0);
    phaseRef.current = 'active'; setPhaseState('active');
  }, [clearPhaseTimers]);

  const startCountdown = useCallback(() => {
    if (phaseRef.current === 'countdown' || phaseRef.current === 'active') return;
    clearPhaseTimers();
    phaseRef.current = 'countdown'; setPhaseState('countdown');
    let n = 3; setCountdown(n);
    if (presentation === PRESENTATION_MODE.AUDIO && voice.current) {
      tts.speakEssential(String(n), lang.current);
    }
    cdTimer.current = setInterval(() => {
      n -= 1;
      if (n <= 0) enterActive();
      else {
        setCountdown(n);
        if (presentation === PRESENTATION_MODE.AUDIO && voice.current) {
          tts.speakEssential(String(n), lang.current);
        }
      }
    }, 1000);
  }, [clearPhaseTimers, enterActive, presentation]);

  const emit = useCallback((snap) => {
    if (!snap) return;
    setSnapshot({ ...snap });
    if (voice.current && phaseRef.current !== 'countdown') {
      const spoken = getSpokenFeedback(snap, presentation, lang.current);
      if (spoken && snap.cue?.tts !== false) {
        const isExperimentalPreview = Boolean(snap.experimental?.exerciseId)
          || String(snap.experimental?.decisionScope || '').startsWith('development_');
        // Experimental modules are sampled every few camera frames. Speak only
        // when a permitted visible cue actually changes; their tracker never
        // derives count authority from this presentation policy.
        if (isExperimentalPreview && lastExperimentalCueId.current === spoken.id) return;
        if (isExperimentalPreview) lastExperimentalCueId.current = spoken.id;
        if (String(spoken.id || '').startsWith('gate:')) tts.sayEssential(spoken.id, spoken.text, lang.current);
        else tts.say(spoken.id, spoken.text, lang.current);
      }
    }
  }, [presentation]);

  const feedFrame = useCallback((
    landmarks,
    boundary = null,
    handFrame = null,
    bottleDetection = null,
    sourceGeneration = 0,
    bottleDiagnostics = null,
    frameMeta = null,
  ) => {
    const s = session.current;
    if (!s || finished.current || !landmarks) return;
    const now = Date.now();
    const dt = Math.min(0.1, (now - lastTs.current) / 1000);
    lastTs.current = now;
    const counting = phaseRef.current === 'active';   // only count reps once active
    const snap = s.pushFrame(landmarks, dt, counting, {
      boundary,
      handFrame,
      bottleDetection,
      bottleDiagnostics,
      sourceGeneration,
      timestampMs: frameMeta?.timestampMs ?? null,
      inputIsMirrored: frameMeta?.inputIsMirrored === true,
      phase: phaseRef.current,
      positioning: phaseRef.current === 'positioning',
    });
    emit(snap);
    // Live: hold a well-framed pose ~1s → start the 3-2-1 countdown (setup frames don't count).
    if (mode === 'live' && phaseRef.current === 'positioning' && snap) {
      const framed = snap.experimental?.exerciseId === 'sit_to_stand'
        ? snap.experimental?.sitToStand?.isTrackingReady === true
        : snap.hasPose && snap.gate && snap.gate.ok;
      if (framed) {
        if (!posStableSince.current) posStableSince.current = now;
        else if (now - posStableSince.current >= 1000) startCountdown();
      } else {
        posStableSince.current = 0;
      }
    }
  }, [emit, mode, startCountdown]);

  // Live camera pushes normalized 33-landmark frames here.
  const onPoseResult = useCallback((
    landmarks,
    boundary,
    handFrame = null,
    bottleDetection = null,
    sourceGeneration = 0,
    bottleDiagnostics = null,
    frameMeta = null,
  ) => {
    if (mode === 'live') {
      feedFrame(
        landmarks,
        boundary,
        handFrame,
        bottleDetection,
        sourceGeneration,
        bottleDiagnostics,
        frameMeta,
      );
    }
  }, [mode, feedFrame]);

  const startDemo = useCallback(() => {
    const start = Date.now();
    lastTs.current = start;
    timer.current = setInterval(() => {
      const el = (Date.now() - start) / 1000;
      const { landmarks } = feed.current(el);
      feedFrame(landmarks);
    }, 40); // ~25 fps synthetic
  }, [feedFrame]);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    stopLoop();
    const sum = session.current.finishSummary();
    logSession(sum).catch(() => {});
    if (voice.current) tts.speakEssential(t('sessionDone', null, lang.current), lang.current);
    setSummary(sum);
  }, [stopLoop]);

  const handleEvent = useCallback((e) => {
    if (e.type === 'rep' && voice.current) tts.say('evt:rep', t('repDone', null, lang.current), lang.current, 1200);
    else if (e.type === 'set' && voice.current) tts.say('evt:set', t('setDone', null, lang.current), lang.current, 1200);
    else if (e.type === 'done') finish();
  }, [finish]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const settings = await getSettings();
      if (!alive) return;
      lastExperimentalCueId.current = null;
      const ex = getExercise(exId, [exerciseSnapshot, dose?.exercise]);
      voice.current = shouldSpeak(presentation, settings.voice);
      lang.current = getLang();
      const browserCamera = Platform.OS === 'web';
      // Native iPhone remains on Calibration 3 Baseline #3. The browser
      // MacBook-camera lane selects the local App V7 bottle-detector
      // composition. V6/V6.1 remains the rollback branch.
      const bottlePhaseTracker = ex.id === 'bottle_grab'
        ? (browserCamera ? createBottleGrabV7PwaTracker() : createBottleGrabCalibration3Tracker())
        : null;
      // PWA Sit-to-Stand is a separate pose-only module. Its bundled asset
      // adapter is phase/comment context only; the geometry counter is owned
      // by the tracker and remains independent from the PhaseNet result.
      const sitToStandTracker = ex.id === 'sit_to_stand' && browserCamera
        ? createBundledSitToStandPwaTracker()
        : null;
      if (sitToStandTracker) preloadSitToStandPwaPhaseNet().catch(() => {});
      session.current = createSession({
        exercise: ex, reference: null, allRefs: {}, lang: lang.current, dose, kind,
        patientId,
        source: mode === 'demo' ? 'demo' : 'live',
        onEvent: handleEvent,
        bottlePhaseTracker,
        sitToStandTracker,
      });
      feed.current = makeSyntheticFeed(session.current.exercise);
      lastTs.current = Date.now();
      setReady(true);
      if (presentation === PRESENTATION_MODE.VISUAL) tts.cancel();
      if (presentation === PRESENTATION_MODE.AUDIO && voice.current) {
        tts.speakEssential(t('audioIntro', null, lang.current), lang.current);
      }
      if (mode === 'demo') startDemo();
      else posFallback.current = setTimeout(startCountdown, 10000); // never stall if framing never passes
    })();
    return () => { alive = false; stopLoop(); clearPhaseTimers(); tts.cancel(); };
  }, [exId, mode, dose, exerciseSnapshot, patientId, presentation, handleEvent, startDemo, stopLoop, startCountdown, clearPhaseTimers]);

  const restart = useCallback(() => {
    stopLoop(); clearPhaseTimers(); // clear any running demo/countdown timer before re-arming
    finished.current = false;
    lastExperimentalCueId.current = null;
    setSummary(null);
    setSnapshot(null);
    session.current?.reset();
    lastTs.current = Date.now();
    posStableSince.current = 0;
    const p = mode === 'live' ? 'positioning' : 'active';
    phaseRef.current = p; setPhaseState(p); setCountdown(0);
    if (mode === 'demo') startDemo();
    else posFallback.current = setTimeout(startCountdown, 10000);
  }, [mode, startDemo, stopLoop, clearPhaseTimers, startCountdown]);

  const resetCameraSource = useCallback((reason = 'capture_source_replaced') => {
    session.current?.resetExperimentalCaptureSource?.(reason);
    setSnapshot(null);
    lastTs.current = Date.now();
    posStableSince.current = 0;
  }, []);

  return {
    snapshot, summary, ready, source: mode, phase, countdown, onPoseResult,
    restart, finish, resetCameraSource,
  };
}
