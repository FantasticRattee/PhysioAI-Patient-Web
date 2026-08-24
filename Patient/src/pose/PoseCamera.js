// PhysioAI · Version-2 — Live pose camera (react-native-mediapipe / BlazePose).
//
// Renders the on-device MediaPipe Pose Landmarker camera and forwards each frame
// as 33 normalized landmarks { x, y, z, visibility } (the SAME schema as V1) to
// `onLandmarks`. That feeds the unchanged AI pipeline (angle calc → comparator →
// form scorer). No video leaves the device.
//
// ⚠️ NATIVE MODULE — requires an Expo *dev build* (won't run in Expo Go) and the
// MediaPipe model asset bundled (see README). The exact react-native-mediapipe
// API is version-specific; this targets ~0.5.x. If your installed version differs,
// adjust the two clearly-marked spots: (1) the hook/usePoseDetection call and
// (2) normalizeResults() — keep the normalized output shape identical.

import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../core/theme.js';
import NativeCameraView from './NativeCameraView.js';
import { mapLandmarksToView } from './viewPoints.js';

function describeLoadError(error) {
  const text = String(error?.message || error || 'MediaPipe bridge unavailable')
    .replace(/^FrameProcessorsUnavailableError:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 180) || 'MediaPipe bridge unavailable';
}

function loadMediaPipe() {
  try {
    const module = require('react-native-mediapipe');
    if (!module?.usePoseDetection) throw new Error('usePoseDetection export is missing');
    return { module, error: null };
  } catch (error) {
    return { module: null, error };
  }
}

// MediaPipe Pose returns 33 landmarks already in BlazePose order → pass through,
// guaranteeing x/y/z/visibility fields. Adjust here if your version nests differently.
function normalizeResults(result) {
  // react-native-mediapipe 0.5.x bundle: { results: [{ landmarks: Landmark[][] }], ... }.
  // results[0].landmarks[0] = the first pose's 33 landmarks (normalized 0..1, BlazePose order).
  const first = result?.results?.[0]?.landmarks?.[0];
  if (!Array.isArray(first)) return null;
  return first.map((p) => ({
    x: p.x, y: p.y, z: p.z ?? 0,
    visibility: p.visibility ?? p.presence ?? 1,
  }));
}

export function normalizeBottleGrabResults(result) {
  const first = result?.results?.[0];
  const pose = Array.isArray(first?.landmarks?.[0])
    ? first.landmarks[0].map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0, visibility: p.visibility ?? p.presence ?? 1 }))
    : null;
  const hand = Array.isArray(first?.handLandmarks?.[0])
    ? first.handLandmarks[0].map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 }))
    : null;
  const handedness = first?.handedness?.[0]?.[0];
  return { pose, hand, handSide: handedness?.categoryName ?? null, handScore: handedness?.score ?? 0, timestampMs: first?.timestampMs ?? null };
}

export default function PoseCamera(props) {
  const [loaded, setLoaded] = useState({ module: null, error: null });
  const { onCameraStatus } = props;

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timer = null;
    onCameraStatus?.('loading');
    const attempt = () => {
      if (cancelled) return;
      const next = loadMediaPipe();
      if (next.module) {
        setLoaded(next);
        return;
      }
      attempts += 1;
      if (attempts < 10) timer = setTimeout(attempt, 250);
      else {
        setLoaded(next);
        console.error('PhysioAI Pose MediaPipe load failed', next.error);
        onCameraStatus?.('module-error', describeLoadError(next.error));
      }
    };
    // Give the native JSI bridge one turn to finish installing before the
    // MediaPipe package initializes its frame-processor plugins.
    timer = setTimeout(attempt, 0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [onCameraStatus]);

  if (!loaded.module) return <View style={[styles.fallback, props.style]} />;
  return <PoseDetector MP={loaded.module} {...props} />;
}

function PoseDetector({
  MP,
  onLandmarks,
  style,
  cameraPosition = 'front',
  cameraLens = 'wide',
  onCameraCapabilities,
  onCameraStatus,
  message,
}) {
  // react-native-mediapipe 0.5.x: usePoseDetection(callbacks, runningMode, model, options).
  // RunningMode + Delegate are ENUMS (not strings); model is the .task filename that must be
  // bundled into the native app (iOS: app bundle resource · Android: android/app/src/main/assets).
  const solution = MP.usePoseDetection(
    {
      onResults: (result, vc) => {
        const lm = normalizeResults(result);
        if (!lm) return;
        // Map landmarks to VIEW pixels using the SDK's ViewCoordinator. It applies the
        // frame rotation (camera buffer is in sensor orientation!) + front-camera mirror
        // + cover crop — i.e. the SAME transform as the preview. Raw normalized coords
        // are in the rotated buffer space and will NOT line up if drawn directly.
        let viewPts = null;
        viewPts = mapLandmarksToView(lm, vc, result);
        onLandmarks(lm, viewPts);
      },
      onError: (error) => onCameraStatus?.('runtime-error', describeLoadError(error)),
    },
    MP.RunningMode?.LIVE_STREAM ?? 2,
    'pose_landmarker_lite.task',
    { numPoses: 1, minPoseDetectionConfidence: 0.5, minTrackingConfidence: 0.5, delegate: MP.Delegate?.GPU ?? 1 },
  );

  return (
    <NativeCameraView
      style={[styles.camera, style]}
      solution={solution}
      position={cameraPosition}
      lensId={cameraLens}
      onCapabilitiesChange={onCameraCapabilities}
      onCameraStatus={onCameraStatus}
      fallbackText={message || 'Camera hardware is unavailable in this build.'}
    />
  );
}

const styles = StyleSheet.create({
  camera: { flex: 1 },
  fallback: { flex: 1, backgroundColor: colors.surface3 },
});
