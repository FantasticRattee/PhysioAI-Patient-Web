// Bottle Grab camera: BlazePose + MediaPipe Hand Landmarker on the same native
// VisionCamera frame processor. The package-level pose hook emits one event per
// detector, so we join pose/hand events by the native timestamp before forwarding
// the frame to the PhaseNet feature adapter.

import React, { useEffect, useRef, useState } from 'react';
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
    // The bridge can be evaluated before VisionCamera has installed its JSI
    // bindings. Do not permanently cache that transient startup failure.
    return { module: null, error };
  }
}

function normalizeFrame(result) {
  const first = result?.results?.[0];
  const pose = Array.isArray(first?.landmarks?.[0])
    ? first.landmarks[0].map((p) => ({
        x: p.x, y: p.y, z: p.z ?? 0,
        visibility: p.visibility ?? p.presence ?? 1,
      }))
    : null;
  const hand = Array.isArray(first?.handLandmarks?.[0])
    ? first.handLandmarks[0].map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 }))
    : null;
  const category = first?.handedness?.[0]?.[0];
  return {
    pose,
    hand,
    handSide: category?.categoryName ?? null,
    handScore: Number(category?.score ?? 0),
    timestampMs: Number.isFinite(Number(first?.timestampMs)) ? Number(first.timestampMs) : Date.now(),
  };
}

export default function BottleGrabCamera({
  onLandmarks,
  style,
  cameraPosition = 'front',
  cameraLens = 'wide',
  onCameraCapabilities,
  onCameraStatus,
  message,
}) {
  const [loaded, setLoaded] = useState({ module: null, error: null });
  const pending = useRef(new Map());

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
      if (attempts < 10) {
        timer = setTimeout(attempt, 250);
      } else {
        setLoaded(next);
        console.error('PhysioAI Bottle Grab MediaPipe load failed', next.error);
        onCameraStatus?.('module-error', describeLoadError(next.error));
      }
    };

    // Wait one turn so the native VisionCamera/Worklets bridge can finish
    // installing before the MediaPipe package initialises its plugins.
    timer = setTimeout(attempt, 0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [onCameraStatus]);

  useEffect(() => {
    // A camera/lens replacement starts a new timestamp stream.  Do not let a
    // late hand callback from the old stream join the first frame of the new
    // stream.
    pending.current.clear();
  }, [cameraPosition, cameraLens]);

  if (!loaded.module) return <View style={[styles.fallback, style]} />;

  return <BottleGrabDetector MP={loaded.module} {...{
    onLandmarks, style, cameraPosition, cameraLens, onCameraCapabilities,
    onCameraStatus, message, pending,
  }} />;
}

function BottleGrabDetector({
  MP,
  onLandmarks,
  style,
  cameraPosition,
  cameraLens,
  onCameraCapabilities,
  onCameraStatus,
  message,
  pending,
}) {

  const solution = MP.usePoseDetection(
    {
      onResults: (result, viewCoordinator) => {
        const frame = normalizeFrame(result);
        const key = frame.timestampMs;
        const current = pending.current.get(key) || {
          pose: null,
          hand: null,
          viewPts: null,
          handViewPts: null,
          frame,
        };
        if (frame.pose) {
          current.pose = frame.pose;
          current.viewPts = mapLandmarksToView(frame.pose, viewCoordinator, result);
        }
        if (frame.hand) {
          current.hand = frame;
          current.handViewPts = mapLandmarksToView(frame.hand, viewCoordinator, result);
        }
        pending.current.set(key, current);
        // Forward pose immediately (normal pose/rule fallback stays live), then
        // forward the joined event when the hand callback arrives.
        if (frame.pose || (current.pose && frame.hand)) {
          onLandmarks(current.pose, current.viewPts, current.hand ? {
            landmarks: current.hand.hand,
            side: current.hand.handSide,
            score: current.hand.handScore,
            timestampMs: key,
          } : null, current.handViewPts);
        }
        if (pending.current.size > 8) {
          const oldest = pending.current.keys().next().value;
          pending.current.delete(oldest);
        }
      },
      onError: (error) => onCameraStatus?.('runtime-error', describeLoadError(error)),
    },
    MP.RunningMode?.LIVE_STREAM ?? 2,
    'pose_landmarker_lite.task',
    {
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
      // Keep the experimental Bottle Grab path on the CPU delegate for the
      // iOS device preview. The GPU delegate can abort inside MediaPipe's
      // Metal/TFLite shader compiler on iOS 26.x; that is a native crash (not
      // a recoverable JS error) and would close the app while the camera is
      // already streaming. CPU preserves the same pose + hand model contract
      // and is the safer device-test baseline until GPU is revalidated.
      delegate: MP.Delegate?.CPU ?? 0,
      handModel: 'hand_landmarker.task',
      fpsMode: 15,
    },
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
