// PhysioAI · Version-2 — Practice screen (ready → live/demo session → summary).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePractice } from '../pose/usePractice.js';
import Skeleton, { HandSkeleton } from '../components/Skeleton.js';
import BoundaryBoxOverlay from '../components/BoundaryBoxOverlay.js';
import ScoreRing from '../components/ScoreRing.js';
import CameraControls from '../components/CameraControls.js';
import { getExercise } from '../core/exercises.js';
import { getSettings } from '../core/store.js';
import { isCloud, isDemoEnabled } from '../core/api.js';
import { t, getLang } from '../core/i18n.js';
import { tts } from '../core/tts.js';
import { colors, scoreTone, toneColor } from '../core/theme.js';
import { evaluateBoundaryBox } from '../ai/BoundaryBoxGate.js';
import { PRESENTATION_MODE, getVisualGuidance, shouldSpeak } from '../core/accessibilityMode.js';
import { cameraCapabilityKey } from '../pose/cameraCapabilities.js';
import BackButton from '../components/BackButton.js';
import {
  LIVE_ASSIST_POLL_MS,
  acknowledgeLiveAssist,
  correctionMatchesExercise,
  correctionSymbol,
  createLiveAssistPoller,
  fetchLiveAssistBatch,
  isLiveAssistEventExpired,
  patientCueText,
  selectActiveTherapistCue,
} from '../core/liveAssist.js';

// Native camera modules (VisionCamera/Worklets/MediaPipe) are optional and can
// throw while their native bridge is being initialised. Do not import them at
// app startup: a patient should be able to open Home/Welcome without the
// camera stack being present. Resolve the component only after Live is chosen.
let CachedPoseCamera = null;
let CachedBottleGrabCamera = null;
let CachedMacCamera = null;
let CachedSitToStandCamera = null;
let CachedPwaCameraSupport = null;

function CameraUnavailable({ style, message }) {
  return (
    <View style={[styles.cameraUnavailable, style]}>
      <Text style={styles.cameraUnavailableText}>{message}</Text>
    </View>
  );
}

function loadCameraComponent(exerciseId) {
  try {
    if (exerciseId === 'bottle_grab') {
      if (Platform.OS === 'web') {
        if (!CachedMacCamera) {
          CachedMacCamera = require('../pose/MacCamera.web.js').default;
        }
        return CachedMacCamera;
      }
      if (!CachedBottleGrabCamera) {
        CachedBottleGrabCamera = require('../pose/BottleGrabCamera.js').default;
      }
      return CachedBottleGrabCamera;
    }
    if (exerciseId === 'sit_to_stand') {
      if (Platform.OS === 'web') {
        if (!CachedSitToStandCamera) {
          CachedSitToStandCamera = require('../pose/SitToStandCamera.web.js').default;
        }
        return CachedSitToStandCamera;
      }
      return function SitToStandNativeFallback({ style }) {
        return (
          <CameraUnavailable
            style={style}
            message="Sit-to-Stand PWA experimental camera is available in the browser lane."
          />
        );
      };
    }
    if (!CachedPoseCamera) {
      CachedPoseCamera = require('../pose/PoseCamera.js').default;
    }
    return CachedPoseCamera;
  } catch (error) {
    // Keep the rest of the Patient app usable if a native camera dependency
    // is unavailable in this build. The error remains visible in Metro logs.
    console.error('PhysioAI camera module failed to load', error);
    return function CameraLoadFallback({ style }) {
      return (
        <CameraUnavailable
          style={style}
          message={t('cameraDenied')}
        />
      );
    };
  }
}

function loadPwaCameraSupport() {
  if (Platform.OS !== 'web') return null;
  if (!CachedPwaCameraSupport) {
    CachedPwaCameraSupport = require('../pose/PwaCameraSupport.web.js');
  }
  return CachedPwaCameraSupport;
}

function stopWebCameraStream(stream) {
  try { stream?.getTracks?.().forEach((track) => track.stop()); } catch {}
}

export default function PracticeScreen({ route, navigation }) {
  const exId = route.params?.exId || 'shoulder';
  const dose = route.params?.dose;            // prescribed reps/sets/holdSec (plan); undefined = defaults
  const kind = route.params?.kind || 'plan';  // 'plan' counts toward adherence, 'extra' does not
  const exercise = route.params?.exercise || dose?.exercise || null;
  const patientId = route.params?.patientId || 'p1';
  const [mode, setMode] = useState(null); // null = ready, else 'live' | 'demo'
  const [presentationMode, setPresentationMode] = useState(PRESENTATION_MODE.STANDARD);
  const [runKey, setRunKey] = useState(0);
  const [webCameraStream, setWebCameraStream] = useState(null);
  const [webCameraError, setWebCameraError] = useState(null);
  const webCameraStreamRef = useRef(null);

  const requestWebCameraStream = useCallback(async () => {
    if (Platform.OS !== 'web') return null;
    const support = loadPwaCameraSupport();
    try {
      // Call this from the actual patient tap. iOS standalone PWAs retain that
      // user activation more reliably than an effect after navigation.
      const stream = await support.requestWebCameraStream();
      const previous = webCameraStreamRef.current;
      if (previous && previous !== stream) stopWebCameraStream(previous);
      webCameraStreamRef.current = stream;
      setWebCameraStream(stream);
      setWebCameraError(null);
      return stream;
    } catch (error) {
      const detail = support?.pwaCameraErrorDetail?.(error) || String(error?.message || error || 'camera_request_failed');
      setWebCameraError(detail);
      throw error;
    }
  }, []);

  const startPractice = useCallback(async (selectedMode) => {
    if (selectedMode === 'live' && Platform.OS === 'web') {
      try {
        await requestWebCameraStream();
      } catch {
        return;
      }
    }
    setWebCameraError(null);
    setMode(selectedMode);
  }, [requestWebCameraStream]);

  const exitPractice = useCallback(() => {
    stopWebCameraStream(webCameraStreamRef.current);
    webCameraStreamRef.current = null;
    setWebCameraStream(null);
    navigation.goBack();
  }, [navigation]);

  const againPractice = useCallback(async () => {
    if (mode === 'live' && Platform.OS === 'web') {
      try {
        await requestWebCameraStream();
      } catch {
        setMode(null);
        return;
      }
    }
    setRunKey((key) => key + 1);
  }, [mode, requestWebCameraStream]);

  if (!mode) {
    return <ReadyView
      exId={exId} dose={dose} exercise={exercise}
      presentationMode={presentationMode} onPresentationModeChange={setPresentationMode}
      cameraError={webCameraError}
      onStart={startPractice} onBack={() => navigation.goBack()}
    />;
  }
  return <SessionView
    key={runKey} exId={exId} mode={mode} presentationMode={presentationMode}
    dose={dose} kind={kind} exercise={exercise} patientId={patientId}
    initialWebStream={webCameraStream} onRequestWebCamera={requestWebCameraStream}
    onAgain={againPractice} onExit={exitPractice}
  />;
}

function ReadyView({ exId, dose, exercise, presentationMode, onPresentationModeChange, onStart, onBack, cameraError }) {
  const ex = getExercise(exId, [exercise]);
  const experimentalBottle = ex.id === 'bottle_grab';
  const experimentalSitToStand = ex.id === 'sit_to_stand';
  const experimentalModule = experimentalBottle || experimentalSitToStand;
  const lang = getLang();
  const showDemo = isDemoEnabled();
  const reps = dose?.reps ?? ex.reps, sets = dose?.sets ?? ex.sets, holdSec = dose?.holdSec ?? ex.holdSec;
  const planLine = ex.type === 'hold'
    ? `${holdSec}${t('sec')} ${t('hold')} · ${sets} ${t('sets')}`
    : `${reps} ${t('reps')} · ${sets} ${t('sets')}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.readyPage}>
        <BackButton onPress={onBack} />
        <Text style={[styles.pill, styles.pillBrand]}>{experimentalModule ? 'App V7.3.3 PWA · Experimental' : t('modePractice')}</Text>
        <Text style={styles.h1}>{ex.source === 'custom' ? (lang === 'th' ? ex.labelTh : ex.label) : t('ex_' + ex.key)}</Text>
        <Text style={styles.sub}>{ex.source === 'custom' ? (lang === 'th' ? 'ท่าที่นักกายภาพสร้างเอง' : 'Custom therapist exercise') : t('exd_' + ex.key)}</Text>

        <View style={styles.card}>
          <Row label={t('target')} value={`${Math.round(ex.target)}°`} />
          <Row label={ex.type === 'hold' ? t('hold') : t('reps')} value={planLine} />
          {experimentalSitToStand ? <Row label="PWA" value={lang === 'th' ? 'Pose-only · เห็นทั้งตัว · ไม่ใช้ตัดสินคะแนน' : 'Pose-only · full body · no score decision'} /> : null}
        </View>

        <View style={styles.modeChooser}>
          <Text style={styles.modeLabel}>{t('chooseMode')}</Text>
          <View style={styles.modeChoices}>
            <ModeChoice
              mode={PRESENTATION_MODE.STANDARD} selected={presentationMode === PRESENTATION_MODE.STANDARD}
              title={t('modeStandard')} hint={t('hintPractice')} onPress={onPresentationModeChange}
            />
            <ModeChoice
              mode={PRESENTATION_MODE.AUDIO} selected={presentationMode === PRESENTATION_MODE.AUDIO}
              title={t('modeAudio')} hint={t('hintAudio')} onPress={onPresentationModeChange}
            />
            <ModeChoice
              mode={PRESENTATION_MODE.VISUAL} selected={presentationMode === PRESENTATION_MODE.VISUAL}
              title={t('modeVisual')} hint={t('hintVisual')} onPress={onPresentationModeChange}
            />
          </View>
        </View>

        <View style={{ flex: 1 }} />
        <Text style={styles.permHint}>{t('permissionHint')}</Text>
        {cameraError ? <Text style={styles.readyCameraError}>{cameraError}</Text> : null}
        <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => { void onStart('live'); }}>
          <Text style={styles.btnPrimaryTxt}>{t('startCamera')}</Text>
        </Pressable>
        {showDemo ? (
          <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => onStart('demo')}>
            <Text style={styles.btnGhostTxt}>▶  {t('demoMode')}</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function ModeChoice({ mode, selected, title, hint, onPress }) {
  return (
    <Pressable
      style={[styles.modeChoice, selected && styles.modeChoiceSelected]}
      onPress={() => onPress(mode)} accessibilityRole="radio" accessibilityState={{ selected }}
      accessibilityLabel={`${title}. ${hint}`}
    >
      <Text style={[styles.modeChoiceTitle, selected && styles.modeChoiceTitleSelected]}>{title}</Text>
      <Text style={[styles.modeChoiceHint, selected && styles.modeChoiceHintSelected]}>{hint}</Text>
    </Pressable>
  );
}

function SessionView({ exId, mode, presentationMode, dose, kind, exercise, patientId, initialWebStream, onRequestWebCamera, onAgain, onExit }) {
  const { snapshot: s, summary, ready, phase, countdown, onPoseResult, resetCameraSource } = usePractice({
    exId, mode, dose, kind, exercise, patientId, presentationMode,
  });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [livePts, setLivePts] = useState(null); // skeleton points pre-mapped to view px by the camera ViewCoordinator
  const [liveHandPts, setLiveHandPts] = useState(null); // Bottle Grab Hand Landmarker points in view px
  const [boundary, setBoundary] = useState(null);
  const [therapistCue, setTherapistCue] = useState(null);
  const [pendingCueVersion, setPendingCueVersion] = useState(0);
  const [cameraPosition, setCameraPosition] = useState('front');
  const [cameraLensByPosition, setCameraLensByPosition] = useState({ front: 'wide', back: 'wide' });
  const [cameraCapabilities, setCameraCapabilities] = useState(null);
  const [cameraStatus, setCameraStatus] = useState(() => (
    mode === 'live' ? { kind: 'loading', detail: '' } : { kind: 'idle', detail: '' }
  ));
  const [cameraRetryKey, setCameraRetryKey] = useState(0);
  const [webStream, setWebStream] = useState(initialWebStream);
  const boundaryFrame = useRef(null);
  const therapistCueTimer = useRef(null);
  const voiceEnabledRef = useRef(shouldSpeak(presentationMode, true));
  const pendingTherapistCues = useRef([]);
  const pendingAckIds = useRef(new Set());
  const ackInFlight = useRef(false);
  const presentedCueId = useRef(null);
  const lang = getLang();
  const ex = getExercise(exId, [exercise]);
  const experimentalBottle = ex.id === 'bottle_grab';
  const experimentalSitToStand = ex.id === 'sit_to_stand';
  const experimentalModule = experimentalBottle || experimentalSitToStand;
  const visibleReps = experimentalModule
    ? Number(s?.experimental?.repCount || 0)
    : Number(s?.reps || 0);
  const v7Bottle = experimentalBottle && s?.experimental?.counterMode === 'bottle_detector_proximity'
    ? s?.experimental
    : null;
  const sitToStand = experimentalSitToStand ? s?.experimental?.sitToStand : null;
  const parallelPhase = experimentalBottle
    ? s?.experimental?.phaseContext
    : sitToStand ? {
      phase: sitToStand.phase,
      status: sitToStand.phaseStatus,
      probabilities: sitToStand.phaseProbabilities,
    } : null;
  const parallelPhaseLabel = parallelPhase?.phase
    || parallelPhase?.status
    || 'context_unavailable';
  const sitToStandSetupBad = experimentalSitToStand && mode === 'live' && sitToStand?.isTrackingReady !== true;
  const gateBad = mode === 'live' && (experimentalSitToStand ? sitToStandSetupBad : s?.gate && !s.gate.ok);
  const gateTone = s?.gate?.blockingBoundaryStatus === 'outside' || s?.gate?.boundaryStatus === 'outside'
    ? 'bad'
    : 'warn';
  const canPresentTherapistCue = mode === 'live' && !summary && phase === 'active'
    && (experimentalSitToStand ? sitToStand?.isTrackingReady === true : s?.gate?.ok === true);
  const cameraLens = cameraLensByPosition[cameraPosition] || 'wide';
  const cameraReady = mode !== 'live' || cameraStatus.kind === 'ready';
  const cameraBlocked = mode === 'live' && !cameraReady;

  useEffect(() => {
    setWebStream(initialWebStream || null);
  }, [initialWebStream]);

  const handleCameraCapabilities = useCallback((capabilities) => {
    setCameraCapabilities((previous) => (
      cameraCapabilityKey(previous) === cameraCapabilityKey(capabilities) ? previous : capabilities
    ));
    if (!capabilities?.position || !capabilities.selectedLens) return;
    setCameraLensByPosition((previous) => (
      previous[capabilities.position] === capabilities.selectedLens
        ? previous
        : { ...previous, [capabilities.position]: capabilities.selectedLens }
    ));
  }, []);

  const switchCamera = useCallback(() => {
    resetCameraSource('camera_position_changed');
    setCameraPosition((previous) => previous === 'front' ? 'back' : 'front');
    setCameraCapabilities(null);
    setCameraStatus({ kind: 'loading', detail: '' });
  }, [resetCameraSource]);

  const handleCameraStatus = useCallback((kind, detail = '') => {
    setCameraStatus((previous) => (
      previous.kind === kind && previous.detail === detail
        ? previous
        : { kind, detail: detail || '' }
    ));
  }, []);

  const retryCamera = useCallback(async () => {
    resetCameraSource('camera_retry');
    setCameraCapabilities(null);
    setCameraStatus({ kind: 'loading', detail: '' });
    if (Platform.OS === 'web') {
      try {
        const nextStream = await onRequestWebCamera?.();
        if (!nextStream) throw new Error('camera stream was not returned from the patient action');
        setWebStream(nextStream);
      } catch (error) {
        setCameraStatus({ kind: 'runtime-error', detail: String(error?.message || error || 'camera_retry_failed') });
        return;
      }
    }
    setCameraRetryKey((key) => key + 1);
  }, [onRequestWebCamera, resetCameraSource]);

  const selectCameraLens = useCallback((lensId) => {
    setCameraLensByPosition((previous) => ({ ...previous, [cameraPosition]: lensId }));
  }, [cameraPosition]);

  const flushPendingAcks = useCallback(async () => {
    if (ackInFlight.current || !pendingAckIds.current.size) return;
    ackInFlight.current = true;
    try {
      for (const id of Array.from(pendingAckIds.current)) {
        try {
          await acknowledgeLiveAssist(id);
          pendingAckIds.current.delete(id);
        } catch {}
      }
    } finally {
      ackInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    boundaryFrame.current = null;
    setBoundary(null);
    setLivePts(null);
    setLiveHandPts(null);
  }, [exId, mode, size.w, size.h]);

  useEffect(() => {
    if (!isCloud() || mode !== 'live' || summary) return undefined;
    let alive = true;
    // Standard mode speaks by default until the persisted preference is loaded;
    // Audio-Only always speaks and Visual-Only never does.
    voiceEnabledRef.current = shouldSpeak(presentationMode, true);
    getSettings().then((settings) => {
      voiceEnabledRef.current = shouldSpeak(presentationMode, settings.voice);
    }).catch(() => {});

    const poller = createLiveAssistPoller({
      // Poll all corrections for this authenticated Patient. Generic events
      // (exerciseId=null) target whichever live exercise is currently active.
      fetchBatch: (cursor) => fetchLiveAssistBatch(cursor),
      onCorrection: async (event) => {
        if (!alive || !correctionMatchesExercise(event, exId)) return;
        const text = patientCueText(event, lang);
        if (!text) return;
        const next = { ...event, text, symbol: correctionSymbol(event) };
        pendingTherapistCues.current.push(next);
        if (alive) setPendingCueVersion((version) => version + 1);
      },
    });

    const tick = () => { poller.pollNow(); flushPendingAcks(); };
    tick();
    const interval = setInterval(tick, LIVE_ASSIST_POLL_MS);
    return () => {
      alive = false;
      poller.stop();
      clearInterval(interval);
      if (therapistCueTimer.current) clearTimeout(therapistCueTimer.current);
      therapistCueTimer.current = null;
    };
  }, [exId, flushPendingAcks, lang, mode, presentationMode, summary]);

  // Promote one queued correction only after camera setup/countdown have passed.
  // A burst is shown and spoken sequentially instead of overwriting earlier cues.
  useEffect(() => {
    if (!canPresentTherapistCue || therapistCue || !pendingTherapistCues.current.length) return;
    let next = pendingTherapistCues.current.shift();
    while (next && isLiveAssistEventExpired(next)) next = pendingTherapistCues.current.shift();
    if (next) setTherapistCue(next);
  }, [canPresentTherapistCue, pendingCueVersion, therapistCue]);

  // ACK means the correction reached the visible Patient surface. Failed ACKs
  // remain in a retry set and are attempted again on the next polling tick.
  useEffect(() => {
    if (!canPresentTherapistCue || !therapistCue || presentedCueId.current === therapistCue.id) return;
    presentedCueId.current = therapistCue.id;
    if (voiceEnabledRef.current && presentationMode !== PRESENTATION_MODE.VISUAL) {
      tts.speakPriority(therapistCue.text, lang, 5500);
    }
    pendingAckIds.current.add(therapistCue.id);
    flushPendingAcks();
    if (therapistCueTimer.current) clearTimeout(therapistCueTimer.current);
    therapistCueTimer.current = setTimeout(() => {
      setTherapistCue((current) => current?.id === therapistCue.id ? null : current);
    }, 8000);
  }, [canPresentTherapistCue, flushPendingAcks, lang, presentationMode, therapistCue]);

  if (summary) return <SummaryView summary={summary} onAgain={onAgain} onExit={onExit} />;

  const tone = scoreTone(s?.score);
  const activeTherapistCue = selectActiveTherapistCue(!canPresentTherapistCue, therapistCue);
  const sitToStandSetupHint = sitToStand?.setupReason === 'source_mirrored'
    ? (lang === 'th' ? 'ปิดการกลับด้านภาพของกล้อง แล้วลองใหม่' : 'Turn off camera mirroring, then try again')
    : (lang === 'th'
      ? 'ให้กล้องเห็นร่างกายตั้งแต่ศีรษะถึงเท้าให้ชัดก่อนเริ่ม'
      : 'Make sure the camera can see your full body from head to feet before starting');
  const localCueText = gateBad
    ? (experimentalSitToStand ? sitToStandSetupHint : (lang === 'th' ? s.gate.hintTh : s.gate.hint))
    : (s?.cue?.text || t('cueGetReady'));
  const localCueTone = gateBad ? gateTone : (s?.cue?.tone || 'none');
  // Camera/framing safety remains the highest-priority visual instruction.
  // A Therapist correction returns automatically once the Patient is in frame.
  const cueText = activeTherapistCue?.text || localCueText;
  const cueTone = activeTherapistCue ? 'warn' : localCueTone;
  const fc = s?.formClass;
  const isAudio = presentationMode === PRESENTATION_MODE.AUDIO;
  const isVisual = presentationMode === PRESENTATION_MODE.VISUAL;
  const visualGuidance = getVisualGuidance(s, lang);
  const visualTone = activeTherapistCue
    ? 'warn'
    : visualGuidance.state === 'hold'
    ? 'good'
    : visualGuidance.state === 'reframe'
      ? gateTone
      : cueTone === 'none' ? 'warn' : cueTone;
  const CameraComponent = mode === 'live' ? loadCameraComponent(ex.id) : null;
  const cameraErrorText = lang === 'th'
    ? (Platform.OS === 'web'
      ? 'อนุญาตกล้องใน Safari หรือแอป Home Screen แล้วลองใหม่'
      : 'เปิดกล้องไม่ได้ใน build นี้ — ใช้โหมดสาธิตหรือ rebuild dev client ใหม่')
    : (Platform.OS === 'web'
      ? 'Allow camera access in Safari or the Home Screen app, then try again'
      : 'Camera is unavailable in this build — use Demo mode or rebuild the dev client');

  return (
    <View style={styles.sessionRoot} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {mode === 'live'
        ? (experimentalBottle ? <CameraComponent
          key={'camera-' + cameraRetryKey}
          style={StyleSheet.absoluteFill}
          message={cameraErrorText}
          cameraPosition={cameraPosition}
          cameraLens={cameraLens}
          onCameraCapabilities={handleCameraCapabilities}
          onCameraStatus={handleCameraStatus}
          initialStream={Platform.OS === 'web' ? webStream : null}
          onLandmarks={(lm, viewPts, handFrame, handViewPts, bottleDetection, sourceGeneration, bottleDiagnostics, frameMeta) => {
            setLivePts(viewPts);
            setLiveHandPts(handViewPts || null);
            const nextBoundary = viewPts && size.w > 0 && size.h > 0
              ? evaluateBoundaryBox(viewPts, size.w, size.h, boundaryFrame.current, ex)
              : null;
            boundaryFrame.current = nextBoundary?.nextFrame || null;
            setBoundary(nextBoundary);
            onPoseResult(lm, nextBoundary, handFrame, bottleDetection, sourceGeneration, bottleDiagnostics, frameMeta);
          }} /> : experimentalSitToStand ? <CameraComponent
          key={'camera-' + cameraRetryKey}
          style={StyleSheet.absoluteFill}
          message={cameraErrorText}
          onCameraStatus={handleCameraStatus}
          initialStream={Platform.OS === 'web' ? webStream : null}
          onLandmarks={(lm, viewPts, frameMeta) => {
            setLivePts(viewPts);
            setLiveHandPts(null);
            const nextBoundary = viewPts && size.w > 0 && size.h > 0
              ? evaluateBoundaryBox(viewPts, size.w, size.h, boundaryFrame.current, ex)
              : null;
            boundaryFrame.current = nextBoundary?.nextFrame || null;
            setBoundary(nextBoundary);
            onPoseResult(
              lm,
              nextBoundary,
              null,
              null,
              frameMeta?.sourceGeneration ?? 0,
              null,
              frameMeta,
            );
          }} /> : <CameraComponent
          key={'camera-' + cameraRetryKey}
          style={StyleSheet.absoluteFill}
          message={cameraErrorText}
          cameraPosition={cameraPosition}
          cameraLens={cameraLens}
          onCameraCapabilities={handleCameraCapabilities}
          onCameraStatus={handleCameraStatus}
          initialStream={Platform.OS === 'web' ? webStream : null}
          onLandmarks={(lm, viewPts) => {
            setLivePts(viewPts);   // view-pixel points from the camera ViewCoordinator
            const nextBoundary = viewPts && size.w > 0 && size.h > 0
              ? evaluateBoundaryBox(viewPts, size.w, size.h, boundaryFrame.current, ex)
              : null;
            boundaryFrame.current = nextBoundary?.nextFrame || null;
            setBoundary(nextBoundary);
            onPoseResult(lm, nextBoundary);
          }} />)
        : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface3 }]} />}

      {mode === 'live' && Platform.OS !== 'web' && cameraReady && cameraCapabilities?.permission !== false ? (
        <CameraControls
          position={cameraPosition}
          lenses={cameraCapabilities?.position === cameraPosition ? cameraCapabilities.lenses : []}
          selectedLens={cameraCapabilities?.position === cameraPosition
            ? cameraCapabilities.selectedLens || cameraLens
            : cameraLens}
          onSwitch={switchCamera}
          onLensSelect={selectCameraLens}
        />
      ) : null}

      {!cameraBlocked && !isAudio && size.w > 0 && experimentalBottle && mode === 'live' && liveHandPts
        ? <HandSkeleton points={liveHandPts} width={size.w} height={size.h} tone={tone} />
        : null}

      {!cameraBlocked && !isAudio && size.w > 0 && (mode === 'live' ? livePts : s?.landmarks)
        ? <Skeleton
            points={mode === 'live' ? livePts : null}
            pixels={mode === 'live'}
            landmarks={mode === 'live' ? null : s.landmarks}
            width={size.w} height={size.h} tone={tone} />
        : null}

      {!cameraBlocked && !isAudio && mode === 'live' && size.w > 0
        ? <BoundaryBoxOverlay boundary={boundary} width={size.w} height={size.h} />
        : null}

      {/* positioning → countdown overlay (live only; reps don't count until active) */}
      {!cameraBlocked && !isAudio && mode === 'live' && phase && phase !== 'active' ? (
        <View style={styles.phaseOverlay} pointerEvents="none">
          {phase === 'countdown'
            ? <Text style={styles.countdownNum}>{countdown}</Text>
            : (
              <View style={styles.posCard}>
                <Text style={styles.posTitle}>{lang === 'th' ? 'จัดท่าให้พร้อม' : 'Get into position'}</Text>
                <Text style={styles.posHint}>
                  {gateBad ? cueText : (experimentalSitToStand
                    ? (lang === 'th'
                      ? 'นั่งบนเก้าอี้อย่างปลอดภัย ให้กล้องเห็นตั้งแต่ศีรษะถึงเท้า แล้วค้างไว้สักครู่'
                      : 'Sit safely on a chair with your full body in frame, then hold still')
                    : (lang === 'th'
                      ? 'ยืนให้เห็นทั้งตัวในกรอบ แล้วค้างไว้สักครู่'
                      : 'Stand fully in view, then hold still'))}
                </Text>
              </View>
            )}
        </View>
      ) : null}

      {cameraBlocked ? (
        <CameraFailureHud status={cameraStatus} onRetry={retryCamera} onExit={onExit} />
      ) : isAudio ? (
        <AudioOnlyHud ex={ex} phase={phase} countdown={countdown} cueText={cueText} cueTone={cueTone} therapistCue={activeTherapistCue} onExit={onExit} />
      ) : isVisual ? (
        <VisualOnlyHud
          ex={ex} mode={mode} guidance={visualGuidance} cueText={cueText} cueTone={visualTone}
          score={s?.score} reps={visibleReps} target={s?.repsTarget || 1}
          setsDone={s?.setsDone || 0} totalSets={s?.totalSets || 1} therapistCue={activeTherapistCue} onExit={onExit}
        />
      ) : (
      <SafeAreaView style={styles.hud} edges={['top', 'bottom']} pointerEvents="box-none">
        {/* top */}
        <View style={styles.topRow}>
          <BackButton onPress={onExit} variant="glass" label={t('ex_' + ex.key)} />
          <Text style={styles.glassPill}>{mode === 'demo' ? t('demoMode') : t('liveMode')}</Text>
        </View>

        {/* progress + form chip */}
        <View style={styles.progressWrap}>
          <RepBar reps={visibleReps} target={s?.repsTarget || 1} />
          <Text style={styles.repLabel}>
            {experimentalBottle
              ? (Platform.OS === 'web'
                ? (lang === 'th'
                  ? `App V7.3.3 PWA · Bottle Detector + Pose · รอบทดลอง ${visibleReps} · ไม่ใช้ตัดสินคะแนน`
                  : `App V7.3.3 PWA · Bottle Detector + Pose · development reps ${visibleReps} · no score`)
                : (lang === 'th'
                  ? `Calibration 3 · รอบทดลอง ${visibleReps} · ไม่ใช้ตัดสินคะแนน`
                  : `Calibration 3 · development reps ${visibleReps} · no score`))
              : experimentalSitToStand
                ? (lang === 'th'
                  ? `App V7.3.3 PWA · Sit-to-Stand Pose-only · รอบทดลอง ${visibleReps} · ไม่ใช้ตัดสินคะแนน`
                  : `App V7.3.3 PWA · Sit-to-Stand Pose-only · development reps ${visibleReps} · no score`)
              : <>{(ex.type === 'hold' ? t('hold') : t('rep'))} {Math.min((s?.reps || 0) + 1, s?.repsTarget || 1)} {t('of')} {s?.repsTarget || 1}
                {'  ·  '}{t('sets')} {(s?.setsDone || 0) + 1}/{s?.totalSets || 1}</>}
          </Text>
          <View style={styles.chipRow}>
            {experimentalBottle ? <Text style={styles.angleChip}>{s?.experimental?.faultDecision?.primaryCueId || s?.experimental?.phase || (lang === 'th' ? 'รอข้อมูลมือ' : 'waiting for hand')}</Text>
              : experimentalSitToStand ? <Text style={styles.angleChip}>{lang === 'th' ? `QC: ${sitToStand?.isTrackingReady ? 'พร้อม' : (sitToStand?.setupReason || 'รอข้อมูล')}` : `QC: ${sitToStand?.isTrackingReady ? 'ready' : (sitToStand?.setupReason || 'waiting')}`}</Text>
              : <Text style={styles.angleChip}>{s?.primaryAngle == null ? '—' : `${Math.round(s.primaryAngle)}° / ${Math.round(s.targetAngle || 0)}°`}</Text>}
            {parallelPhase ? <Text style={styles.phaseChip}>
              {lang === 'th' ? `PhaseNet: ${parallelPhaseLabel}` : `PhaseNet: ${parallelPhaseLabel}`}
            </Text> : null}
            {v7Bottle ? <Text style={styles.bottleChip}>
              {lang === 'th' ? `ขวด: ${v7Bottle.bottleStatus || 'missing'}` : `Bottle: ${v7Bottle.bottleStatus || 'missing'}`}
            </Text> : null}
            {experimentalSitToStand ? <Text style={styles.bottleChip}>
              {lang === 'th' ? `ตัวนับ: ${sitToStand?.geometryStatus || 'waiting'}` : `Counter: ${sitToStand?.geometryStatus || 'waiting'}`}
            </Text> : null}
            {fc ? <Text style={[styles.formChip, { color: toneColor(fc.conf === 0 ? 'none' : fc.cls === 'correct' ? 'good' : fc.cls === 'multi' ? 'bad' : 'warn') }]}>
              {t('formLabel')}: {lang === 'th' ? fc.labelTh : fc.label}</Text> : null}
          </View>
          {v7Bottle ? <View style={styles.diagnosticCard}>
            <Text style={styles.diagnosticTitle}>Bottle Detector Diagnostics · PWA Experimental</Text>
            <Text style={styles.diagnosticText}>
              {`state=${v7Bottle.bottleDiagnosticsStatus || 'detector_waiting'} · raw=${v7Bottle.bottleRawCandidateCount ?? 0} · accepted=${v7Bottle.bottleAcceptedCandidateCount ?? 0}`}
            </Text>
            <Text style={styles.diagnosticText}>
              {`top=${v7Bottle.bottleTopLabel || '—'}${v7Bottle.bottleTopScore == null ? '' : ` ${Number(v7Bottle.bottleTopScore).toFixed(2)}`} · selector=${v7Bottle.bottleSelectionReason || '—'} · roi=${v7Bottle.bottleRoiFresh ? `${v7Bottle.bottleRoiAgeMs ?? 0}ms fresh` : 'hidden/stale'}`}
            </Text>
            <Text style={styles.diagnosticText}>
              {`counter=${v7Bottle.bottleCounterStage || 'waiting'} · reason=${v7Bottle.bottleCounterReason || '—'}`}
            </Text>
          </View> : null}
          {experimentalSitToStand ? <View style={styles.diagnosticCard}>
            <Text style={styles.diagnosticTitle}>{lang === 'th' ? 'Sit-to-Stand · ตัวนับและ PhaseNet แยกกัน' : 'Sit-to-Stand · independent counter and PhaseNet'}</Text>
            <Text style={styles.diagnosticText}>{`geometry=${sitToStand?.geometryStatus || 'cannot_assess'} · phase=${sitToStand?.phaseStatus || 'cannot_assess'} · comment=${sitToStand?.commentStatus || 'pending'}`}</Text>
          </View> : null}
        </View>

        <View style={{ flex: 1 }} />

        {/* cue */}
        <View style={styles.cueCard}>
          <Text style={styles.cueEyebrow}>{activeTherapistCue ? (lang === 'th' ? 'จากนักกายภาพ' : 'From Therapist') : (lang === 'th' ? 'คำแนะนำ' : 'Cue')}</Text>
          <Text style={[styles.cueText, { color: toneColor(cueTone) }]}>{cueText}</Text>
          {activeTherapistCue ? <Text style={styles.therapistCueMeta}>{lang === 'th' ? 'คำแนะนำนี้ไม่เปลี่ยนคะแนน AI' : 'This correction does not change the AI score'}</Text> : null}
        </View>

        {/* bottom: score */}
        <View style={styles.bottomBar}>
          <ScoreRing value={s?.score ?? null} size={58} color={toneColor(tone)} />
          <View style={{ flex: 1 }}>
            <Text style={styles.accEyebrow}>{t('accuracy')}</Text>
            <Text style={styles.accText}>{experimentalModule
              ? (lang === 'th' ? 'โหมดทดลอง · ไม่มีคะแนน' : 'Experimental · no score')
              : (s?.score == null ? t('cueNoPose') : `${s.score}%`)}</Text>
          </View>
          {!ready ? <ActivityIndicator color={colors.brand} /> : null}
        </View>
      </SafeAreaView>
      )}
    </View>
  );
}

function CameraFailureHud({ status, onRetry, onExit }) {
  const lang = getLang();
  const copy = {
    loading: {
      title: lang === 'th' ? 'กำลังเปิดกล้อง' : 'Starting camera',
      body: lang === 'th' ? 'กำลังเชื่อมต่อกล้องและตัวตรวจจับ กรุณารอสักครู่' : 'Connecting the camera and pose detector. Please wait a moment.',
    },
    permission: {
      title: lang === 'th' ? 'รอสิทธิ์การใช้กล้อง' : 'Waiting for camera permission',
      body: lang === 'th' ? 'ยืนยันสิทธิ์กล้องจาก iPhone แล้วระบบจะเริ่มต่อเอง' : 'Confirm camera permission on the iPhone and the session will continue.',
    },
    unavailable: {
      title: lang === 'th' ? 'ไม่พบกล้องที่ใช้ได้' : 'Camera is unavailable',
      body: lang === 'th' ? 'ตรวจสอบสิทธิ์กล้อง แล้วลองเปิดกล้องใหม่อีกครั้ง' : 'Check camera permission, then try opening the camera again.',
    },
    'module-error': {
      title: lang === 'th' ? 'ตัวตรวจจับยังไม่พร้อม' : 'Pose detector is not ready',
      body: lang === 'th' ? 'แอปโหลดตัวประมวลผลกล้องไม่สำเร็จ กรุณาลองใหม่' : 'The camera processing module did not finish loading. Try again.',
    },
    'runtime-error': {
      title: lang === 'th' ? 'กล้องหยุดทำงาน' : 'Camera stopped',
      body: lang === 'th' ? 'เกิดข้อผิดพลาดระหว่างประมวลผลเฟรม กรุณาลองใหม่' : 'The frame processor stopped unexpectedly. Try again.',
    },
  }[status.kind] || {
    title: lang === 'th' ? 'เปิดกล้องไม่ได้' : 'Camera could not start',
    body: lang === 'th' ? 'กรุณาลองใหม่อีกครั้ง' : 'Please try again.',
  };

  return (
    <View style={styles.cameraFailureLayer} pointerEvents="box-none">
      <View style={styles.cameraFailureCard}>
        <Text style={styles.cameraFailureTitle}>{copy.title}</Text>
        <Text style={styles.cameraFailureBody}>{copy.body}</Text>
        {(Platform.OS === 'web' || __DEV__) && status.detail ? <Text style={styles.cameraFailureDetail}>{status.detail}</Text> : null}
        <Pressable style={[styles.btn, styles.btnPrimary, styles.cameraFailureButton]} onPress={onRetry}>
          <Text style={styles.btnPrimaryTxt}>{lang === 'th' ? '↻ ลองเปิดใหม่' : '↻ Retry camera'}</Text>
        </Pressable>
        <BackButton
          onPress={onExit}
          variant="ghost"
          label={lang === 'th' ? 'กลับ' : 'Back'}
        />
      </View>
    </View>
  );
}

function AudioOnlyHud({ ex, phase, countdown, cueText, cueTone, therapistCue, onExit }) {
  const status = phase === 'countdown'
    ? `${t('audioReady')} · ${countdown}`
    : phase === 'positioning' ? t('audioReady') : t('listening');
  return (
    <SafeAreaView style={styles.audioHud} edges={['top', 'bottom']} pointerEvents="box-none">
      <View style={styles.audioTop}>
        <View>
          <Text style={styles.audioEyebrow}>{t('audioTitle')}</Text>
          <Text style={styles.audioStatus} accessibilityLiveRegion="polite">{status}</Text>
        </View>
        <BackButton onPress={onExit} variant="glass" label={t('finish')} />
      </View>
      <View style={{ flex: 1 }} />
      <View style={styles.audioCard}>
        {therapistCue ? <Text style={styles.therapistSource}>{getLang() === 'th' ? 'จากนักกายภาพ' : 'From Therapist'}</Text> : null}
        <Text style={styles.audioExercise}>{t('ex_' + ex.key)}</Text>
        <Text style={[styles.audioCue, { color: toneColor(cueTone) }]}>{cueText}</Text>
        <Text style={styles.audioHint}>{t('audioExitHint')}</Text>
      </View>
    </SafeAreaView>
  );
}

function VisualOnlyHud({ ex, mode, guidance, cueText, cueTone, score, reps, target, setsDone, totalSets, therapistCue, onExit }) {
  const directionText = {
    hold: t('visualHold'),
    increase: t('directionIncrease'),
    decrease: t('directionDecrease'),
    reframe: t('visualReframe'),
    waiting: t('visualWaiting'),
  }[guidance.direction] || t('visualAdjust');
  const detail = guidance.label
    ? `${guidance.label}${guidance.delta == null ? '' : ` · ${guidance.delta}°`}`
    : directionText;

  return (
    <SafeAreaView style={styles.visualHud} edges={['top', 'bottom']} pointerEvents="box-none">
      <View pointerEvents="none" style={[styles.visualFrame, { borderColor: toneColor(cueTone) }]} />
      <View style={styles.topRow}>
        <BackButton onPress={onExit} variant="glass" label={t('ex_' + ex.key)} />
        <View style={styles.visualPills}>
          <Text style={styles.visualPill}>{t('visualTitle')}</Text>
          <Text style={styles.visualSilent}>{t('visualSilent')}</Text>
        </View>
      </View>

      <View style={styles.visualProgress}>
        <RepBar reps={reps} target={target} />
        <Text style={styles.visualRepLabel}>
          {(ex.type === 'hold' ? t('hold') : t('rep'))} {Math.min(reps + 1, target)} {t('of')} {target}
          {'  ·  '}{t('sets')} {setsDone + 1}/{totalSets}
        </Text>
      </View>

      <View style={styles.visualCenter} pointerEvents="none">
        <Text style={[styles.visualArrow, { color: toneColor(cueTone) }]}>{therapistCue?.symbol || guidance.arrow}</Text>
        <Text style={[styles.visualState, { color: toneColor(cueTone) }]}>{therapistCue ? (getLang() === 'th' ? 'จากนักกายภาพ' : 'From Therapist') : directionText}</Text>
        <Text style={styles.visualDetail}>{therapistCue?.text || detail}</Text>
      </View>

      <View style={{ flex: 1 }} />
      <View style={[styles.visualCueCard, { borderColor: toneColor(cueTone) }]}>
        <Text style={styles.visualEyebrow}>{t('bigCue')}</Text>
        <Text style={[styles.visualCueText, { color: toneColor(cueTone) }]}>{cueText}</Text>
        <Text style={styles.visualScore}>{score == null ? t('cueNoPose') : `${t('score')}: ${score}%`}</Text>
      </View>
      <Text style={styles.visualSource}>{mode === 'demo' ? t('demoMode') : t('liveMode')}</Text>
    </SafeAreaView>
  );
}

const metricValue = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
const pctText = (v) => {
  const n = metricValue(v);
  return n == null ? '—' : `${n}%`;
};

function issueLabels(lang) {
  return {
    tempo: lang === 'th' ? 'ทำช้าลงและคุมจังหวะให้สม่ำเสมอ' : 'Slow down and keep the tempo steady',
    smoothness: lang === 'th' ? 'ลดการกระตุกระหว่างเคลื่อนไหว' : 'Reduce jerky movement during the transition',
    path: lang === 'th' ? 'รักษาแนวการเคลื่อนไหวให้ตรงกับท่า' : 'Keep the movement on the intended path',
    sync: lang === 'th' ? 'ขยับสองข้างให้พร้อมกันมากขึ้น' : 'Move both sides more evenly',
    sequence: lang === 'th' ? 'ทำตามลำดับซ้าย/ขวาที่กำหนด' : 'Follow the required left/right sequence',
    inactiveSide: lang === 'th' ? 'คุมอีกข้างให้อยู่ใกล้ท่าพัก' : 'Keep the inactive side near rest',
    tracking: lang === 'th' ? 'ให้กล้องเห็นข้อต่อสำคัญชัดขึ้น' : 'Keep the key joints clearly visible',
    boundary: lang === 'th' ? 'อยู่ในกรอบตลอดทั้งครั้ง' : 'Stay inside the boundary for the whole rep',
    pose: lang === 'th' ? 'จัดท่าให้ใกล้ reference มากขึ้น' : 'Match the reference pose more closely',
    motion: lang === 'th' ? 'ควบคุม motion ให้ต่อเนื่องขึ้น' : 'Control the motion more smoothly',
  };
}

function topIssues(summary, lang) {
  const labels = issueLabels(lang);
  const counts = summary.motionIssueCounts || {};
  const sorted = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (!sorted.length) {
    return [lang === 'th' ? 'ไม่มีปัญหาหลักในเซสชันนี้' : 'No major issues detected in this session'];
  }
  return sorted.map(([k]) => labels[k] || k);
}

function SummaryView({ summary, onAgain, onExit }) {
  const lang = getLang();
  const experimentalModule = summary.experimentalOnly === true;
  const overallScore = summary.overallScore ?? summary.avgScore ?? 0;
  const poseScore = summary.avgPoseScore ?? summary.avgScore ?? null;
  const motionScore = summary.avgMotionScore ?? null;
  const col = toneColor(scoreTone(overallScore));
  const issues = topIssues(summary, lang);
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.summaryPage}>
        <View style={styles.summaryTopRow}>
          <BackButton onPress={onExit} />
        </View>
          <View style={styles.summaryHero}>
            <ScoreRing value={experimentalModule ? null : overallScore} size={118} thickness={10} color={col} />
            <View style={{ flex: 1 }}>
              <Text style={styles.h2}>{t('sessionDone')}</Text>
              <Text style={styles.summarySub}>
                {experimentalModule
                  ? (lang === 'th' ? 'สรุปการทดลองในเครื่อง · ไม่ใช่คะแนนหรือผลทางคลินิก' : 'Local experimental summary · not a score or clinical result')
                  : (lang === 'th' ? 'คะแนนรวมของท่านี้' : 'Exercise session dashboard')}
              </Text>
            </View>
          </View>

          {!experimentalModule ? <View style={styles.scoreGrid}>
            <MetricCard label={lang === 'th' ? 'รวม' : 'Overall'} value={pctText(overallScore)} tone={scoreTone(overallScore)} />
            <MetricCard label={lang === 'th' ? 'ท่าทาง' : 'Pose'} value={pctText(poseScore)} tone={scoreTone(poseScore)} />
            <MetricCard label="Motion" value={pctText(motionScore)} tone={scoreTone(motionScore)} />
          </View> : null}

          {!experimentalModule ? <View style={styles.dashboardBand}>
            <Text style={styles.sectionTitle}>{lang === 'th' ? 'คุณภาพระหว่างเคลื่อนไหว' : 'Motion quality'}</Text>
          <MetricBar label={lang === 'th' ? 'จังหวะ' : 'Tempo'} value={summary.avgTempoScore} />
          <MetricBar label={lang === 'th' ? 'ความลื่นไหล' : 'Smoothness'} value={summary.avgSmoothnessScore} />
          <MetricBar label={lang === 'th' ? 'แนวการเคลื่อนไหว' : 'Path'} value={summary.avgPathScore} />
          <MetricBar label={lang === 'th' ? 'ความพร้อมกัน' : 'Sync'} value={summary.avgSyncScore} />
          </View> : null}

          {!experimentalModule ? <View style={styles.dashboardBand}>
            <Text style={styles.sectionTitle}>{lang === 'th' ? 'สิ่งที่ควรโฟกัสครั้งหน้า' : 'Focus next time'}</Text>
            {issues.map((txt, i) => (
              <View key={`${txt}-${i}`} style={styles.issueRow}>
                <Text style={styles.issueDot}>{i + 1}</Text>
                <Text style={styles.issueText}>{txt}</Text>
              </View>
            ))}
          </View> : null}

        <View style={styles.statPanel}>
          <Stat v={summary.validReps ?? summary.reps} label={t('reps')} />
          <Stat v={summary.invalidRepCount ?? 0} label={lang === 'th' ? 'ไม่ผ่าน' : 'invalid'} />
          <Stat v={summary.sets} label={t('sets')} />
          <Stat v={`${summary.durationSec}s`} label={lang === 'th' ? 'เวลา' : 'time'} />
          {summary.avgSecPerRep != null
            ? <Stat v={`${summary.avgSecPerRep}s`} label={lang === 'th' ? 'วิ/ครั้ง' : 'sec/rep'} />
            : null}
        </View>

        <Pressable style={[styles.btn, styles.btnPrimary, { alignSelf: 'stretch' }]} onPress={onAgain}>
          <Text style={styles.btnPrimaryTxt}>↻  {t('startPractice')}</Text>
        </Pressable>
        <BackButton
          onPress={onExit}
          variant="ghost"
          label={t('finish')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const Row = ({ label, value }) => (
  <View style={styles.kvRow}><Text style={styles.kvLabel}>{label}</Text><Text style={styles.kvValue}>{value}</Text></View>
);
const Stat = ({ v, label }) => (
  <View style={{ alignItems: 'center' }}><Text style={styles.statV}>{String(v)}</Text><Text style={styles.statL}>{label}</Text></View>
);
const MetricCard = ({ label, value, tone }) => (
  <View style={styles.metricCard}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={[styles.metricValue, { color: toneColor(tone) }]}>{value}</Text>
  </View>
);
const MetricBar = ({ label, value }) => {
  const n = metricValue(value);
  const width = `${Math.max(0, Math.min(100, n ?? 0))}%`;
  return (
    <View style={styles.metricBarRow}>
      <View style={styles.metricBarTop}>
        <Text style={styles.metricBarLabel}>{label}</Text>
        <Text style={styles.metricBarValue}>{n == null ? '—' : `${n}%`}</Text>
      </View>
      <View style={styles.metricTrack}>
        <View style={[styles.metricFill, { width, backgroundColor: toneColor(scoreTone(n)) }]} />
      </View>
    </View>
  );
};
const RepBar = ({ reps, target }) => (
  <View style={{ flexDirection: 'row', gap: 4 }}>
    {Array.from({ length: target }).map((_, i) => (
      <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < reps ? colors.accent : 'rgba(245,241,232,0.40)' }} />
    ))}
  </View>
);

const glass = {
  backgroundColor: 'rgba(251,247,239,0.94)', borderColor: 'rgba(245,241,232,0.74)',
  borderRadius: 16, borderWidth: 1,
};
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, fontSize: 12, fontWeight: '800', letterSpacing: 0.2, overflow: 'hidden' },
  pillBrand: { backgroundColor: colors.brandSoft, color: colors.brand },
  h1: { fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.8, color: colors.ink, marginTop: 16 },
  sub: { fontSize: 14, lineHeight: 21, color: colors.ink2, marginTop: 6 },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 18, padding: 18, marginTop: 20 },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  kvLabel: { color: colors.ink2, fontWeight: '600' }, kvValue: { color: colors.ink, fontWeight: '800', fontVariant: ['tabular-nums'] },
  modeChooser: { marginTop: 18 },
  modeLabel: { color: colors.ink, fontSize: 13, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  modeChoices: { flexDirection: 'row', gap: 8, marginTop: 9 },
  modeChoice: { flex: 1, minHeight: 84, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 14, padding: 10, justifyContent: 'space-between' },
  modeChoiceSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  modeChoiceTitle: { color: colors.ink, fontSize: 12.5, lineHeight: 16, fontWeight: '800' },
  modeChoiceTitleSelected: { color: colors.inverse },
  modeChoiceHint: { color: colors.ink2, fontSize: 10.5, lineHeight: 14, marginTop: 5 },
  modeChoiceHintSelected: { color: 'rgba(245,241,232,0.76)' },
  permHint: { color: colors.ink2, fontSize: 12.5, lineHeight: 18, textAlign: 'center', marginBottom: 12 },
  readyCameraError: { color: '#B3433A', fontSize: 12, lineHeight: 18, textAlign: 'center', marginBottom: 10, paddingHorizontal: 12 },
  btn: { minHeight: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  btnPrimary: { backgroundColor: colors.brand },
  btnPrimaryTxt: { color: colors.inverse, fontWeight: '800', fontSize: 16 },
  btnGhost: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  btnGhostTxt: { color: colors.brand, fontWeight: '800', fontSize: 15 },

  sessionRoot: { flex: 1, backgroundColor: colors.brand },
  cameraUnavailable: { alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.surface3 },
  cameraUnavailableText: { color: colors.ink2, textAlign: 'center', fontSize: 15, lineHeight: 22 },
  cameraFailureLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
    backgroundColor: colors.bg,
  },
  cameraFailureCard: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 22,
    padding: 22,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  cameraFailureTitle: { color: colors.ink, fontSize: 20, lineHeight: 26, fontWeight: '800', textAlign: 'center' },
  cameraFailureBody: { color: colors.ink2, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  cameraFailureDetail: { color: colors.ink3, fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 10 },
  cameraFailureButton: { alignSelf: 'stretch', minHeight: 48, marginTop: 14 },
  hud: { ...StyleSheet.absoluteFillObject, paddingHorizontal: 18 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  glassPill: { ...glass, paddingHorizontal: 12, paddingVertical: 7, fontSize: 13, color: colors.ink, fontWeight: '700', overflow: 'hidden' },
  glassTxt: { color: colors.ink, fontWeight: '700', fontSize: 13 },
  progressWrap: { marginTop: 12 },
  repLabel: { color: colors.inverse, fontSize: 11, letterSpacing: 0.8, fontWeight: '700', textTransform: 'uppercase', marginTop: 7 },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
      angleChip: { ...glass, paddingHorizontal: 9, paddingVertical: 5, fontSize: 13, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'], overflow: 'hidden' },
      phaseChip: { ...glass, paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: '800', color: colors.brand, overflow: 'hidden' },
      bottleChip: { ...glass, paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: '800', color: colors.accent, overflow: 'hidden' },
      formChip: { ...glass, paddingHorizontal: 9, paddingVertical: 5, fontSize: 13, fontWeight: '800', overflow: 'hidden' },
      diagnosticCard: { ...glass, marginTop: 9, padding: 10, backgroundColor: 'rgba(251,247,239,0.90)' },
      diagnosticTitle: { color: colors.brand, fontSize: 10.5, lineHeight: 15, fontWeight: '800', letterSpacing: 0.45, textTransform: 'uppercase' },
      diagnosticText: { color: colors.ink2, fontSize: 10.5, lineHeight: 15, fontWeight: '600', marginTop: 2, fontVariant: ['tabular-nums'] },
      cueCard: { ...glass, padding: 16, marginBottom: 12 },
  cueEyebrow: { fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase', color: colors.ink3, fontWeight: '800' },
  cueText: { fontSize: 17, lineHeight: 23, fontWeight: '800', marginTop: 3 },
  therapistCueMeta: { color: colors.ink2, fontSize: 11.5, lineHeight: 17, fontWeight: '600', marginTop: 7 },
  bottomBar: { ...glass, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, marginBottom: 12 },
  accEyebrow: { fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase', color: colors.ink3, fontWeight: '800' },
  accText: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'], color: colors.ink },

  // Audio-Only: the camera still runs behind this minimal VoiceOver/TTS surface.
  audioHud: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(18,36,30,0.86)', paddingHorizontal: 20 },
  audioTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 12 },
  audioEyebrow: { color: '#B9D5C7', fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  audioStatus: { color: colors.inverse, fontSize: 19, lineHeight: 26, fontWeight: '800', marginTop: 4 },
  audioCard: { backgroundColor: colors.surface, borderColor: colors.accent, borderWidth: 1, borderRadius: 20, padding: 20, marginBottom: 18 },
  therapistSource: { color: colors.brand, fontSize: 11, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 7 },
  audioExercise: { color: colors.ink2, fontSize: 12, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' },
  audioCue: { fontSize: 26, lineHeight: 34, fontWeight: '800', marginTop: 8 },
  audioHint: { color: colors.ink2, fontSize: 13, lineHeight: 19, marginTop: 14 },

  // Visual-Only: colour reinforces the explicit icon/text feedback; it is not the only signal.
  visualHud: { ...StyleSheet.absoluteFillObject, paddingHorizontal: 18 },
  visualFrame: { ...StyleSheet.absoluteFillObject, borderWidth: 6, borderRadius: 18 },
  visualPills: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  visualPill: { ...glass, color: colors.brand, fontSize: 12, fontWeight: '800', paddingHorizontal: 11, paddingVertical: 7, overflow: 'hidden' },
  visualSilent: { backgroundColor: colors.surface2, borderColor: colors.line, borderWidth: 1, borderRadius: 999, color: colors.ink2, fontSize: 11, fontWeight: '800', paddingHorizontal: 9, paddingVertical: 6, overflow: 'hidden' },
  visualProgress: { marginTop: 12 },
  visualRepLabel: { color: colors.inverse, fontSize: 11, letterSpacing: 0.8, fontWeight: '800', textTransform: 'uppercase', marginTop: 7 },
  visualCenter: { alignItems: 'center', marginTop: 26 },
  visualArrow: { fontSize: 100, lineHeight: 105, fontWeight: '800', textShadowColor: 'rgba(245,241,232,0.76)', textShadowRadius: 10 },
  visualState: { backgroundColor: 'rgba(251,247,239,0.93)', borderColor: colors.line, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 7, fontSize: 17, fontWeight: '800', overflow: 'hidden' },
  visualDetail: { color: colors.inverse, fontSize: 14, fontWeight: '800', marginTop: 9, textShadowColor: 'rgba(18,36,30,0.62)', textShadowRadius: 6 },
  visualCueCard: { ...glass, borderWidth: 2, padding: 18, marginBottom: 8 },
  visualEyebrow: { color: colors.ink3, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  visualCueText: { fontSize: 24, lineHeight: 30, fontWeight: '800', marginTop: 5 },
  visualScore: { color: colors.ink2, fontSize: 14, fontWeight: '800', marginTop: 10, fontVariant: ['tabular-nums'] },
  visualSource: { alignSelf: 'center', color: colors.inverse, fontSize: 11, fontWeight: '800', marginBottom: 12, textShadowColor: 'rgba(18,36,30,0.62)', textShadowRadius: 6 },

  phaseOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  countdownNum: { fontSize: 120, fontWeight: '800', color: colors.inverse, textShadowColor: 'rgba(18,36,30,0.48)', textShadowRadius: 12 },
  posCard: { ...glass, paddingVertical: 18, paddingHorizontal: 22, marginHorizontal: 28, alignItems: 'center' },
  posTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  posHint: { fontSize: 13.5, lineHeight: 20, color: colors.ink2, marginTop: 6, textAlign: 'center' },

  h2: { fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.4, color: colors.ink, marginTop: 18 },
  readyPage: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center', padding: 20 },
  summaryPage: { width: '100%', maxWidth: 560, alignSelf: 'center', padding: 20, paddingBottom: 40 },
  summaryTopRow: { minHeight: 44, marginBottom: 8 },
  summaryHero: { flexDirection: 'row', alignItems: 'center', gap: 18, marginBottom: 20 },
  summarySub: { color: colors.ink2, fontSize: 13.5, lineHeight: 20, marginTop: 4 },
  scoreGrid: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  metricCard: { flex: 1, minHeight: 90, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 14, padding: 14, justifyContent: 'space-between' },
  metricLabel: { color: colors.ink2, fontSize: 12, fontWeight: '700' },
  metricValue: { color: colors.ink, fontSize: 23, fontWeight: '800', fontVariant: ['tabular-nums'] },
  dashboardBand: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 14 },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: '800', marginBottom: 10 },
  metricBarRow: { marginTop: 12 },
  metricBarTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  metricBarLabel: { color: colors.ink2, fontSize: 12.5, fontWeight: '600' },
  metricBarValue: { color: colors.ink, fontSize: 12.5, fontWeight: '800', fontVariant: ['tabular-nums'] },
  metricTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surface3, overflow: 'hidden' },
  metricFill: { height: 8, borderRadius: 4 },
  issueRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 7 },
  issueDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brandSoft, color: colors.brand, textAlign: 'center', lineHeight: 24, fontWeight: '800', fontSize: 12, fontVariant: ['tabular-nums'] },
  issueText: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  statPanel: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 18, paddingVertical: 20 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 22, marginVertical: 20 },
  statV: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'], color: colors.ink },
  statL: { fontSize: 11, color: colors.ink2, fontWeight: '600', marginTop: 2 },
});
