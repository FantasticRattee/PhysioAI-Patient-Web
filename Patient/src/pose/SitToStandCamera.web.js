// Browser-only Sit-to-Stand camera.
//
// This lane deliberately loads MediaPipe Pose Full only.  It does not import
// Bottle Grab's ObjectDetector or Hand Landmarker, so the pose-only feature
// and geometry/PhaseNet contract cannot depend on either stream.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FilesetResolver, PoseLandmarker } from './web/vision_bundle.mjs';
import {
  pwaCameraError,
  pwaCameraErrorDetail,
  waitForVideoReady,
} from './PwaCameraSupport.web.js';

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const POSE_MODEL_CDN = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
const PWA_POSE_DETECTION_HZ = 10;

const finite = (value) => Number.isFinite(Number(value));

function mapPoint(point, width, height, video) {
  if (!point || !width || !height) return null;
  const videoWidth = video?.videoWidth || 16;
  const videoHeight = video?.videoHeight || 9;
  const scale = Math.max(width / videoWidth, height / videoHeight);
  const renderedWidth = videoWidth * scale;
  const renderedHeight = videoHeight * scale;
  const offsetX = (width - renderedWidth) / 2;
  const offsetY = (height - renderedHeight) / 2;
  return {
    x: Number(point.x) * renderedWidth + offsetX,
    y: Number(point.y) * renderedHeight + offsetY,
  };
}

export default function SitToStandCamera({ style, message, onLandmarks, onCameraStatus, initialStream = null }) {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [status, setStatus] = useState('starting');
  const [error, setError] = useState(null);
  const [poseCount, setPoseCount] = useState(0);
  const videoRef = useRef(null);
  const poseRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(null);
  const lastDetectionRef = useRef(0);
  const sourceGenerationRef = useRef(0);
  const layoutRef = useRef(layout);
  const onLandmarksRef = useRef(onLandmarks);
  layoutRef.current = layout;
  onLandmarksRef.current = onLandmarks;

  useEffect(() => {
    if (status === 'ready') onCameraStatus?.('ready');
    else if (status === 'error' || status === 'runtime_error') {
      onCameraStatus?.('runtime-error', pwaCameraErrorDetail(error));
    } else if (status === 'requesting_camera') onCameraStatus?.('permission');
    else onCameraStatus?.('loading');
  }, [error, onCameraStatus, status]);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
          throw new Error('This browser does not expose getUserMedia');
        }
        const video = videoRef.current;
        if (!video) throw new Error('Mac camera video element is unavailable');
        setStatus('requesting_camera');
        const stream = initialStream;
        if (!stream?.getVideoTracks?.().length) {
          throw pwaCameraError('camera_handoff', new Error('camera stream was not started by the patient action'));
        }
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const sourceGeneration = sourceGenerationRef.current + 1;
        sourceGenerationRef.current = sourceGeneration;
        streamRef.current = stream;
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await waitForVideoReady(video);
        try {
          await video.play();
        } catch (playError) {
          throw pwaCameraError('video_playback', playError);
        }
        setStatus('loading_model');
        let pose;
        try {
          const fileset = await FilesetResolver.forVisionTasks(WASM_CDN);
          pose = await PoseLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: POSE_MODEL_CDN, delegate: 'CPU' },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        } catch (poseError) {
          throw pwaCameraError('pose_initialization', poseError);
        }
        if (cancelled) {
          pose.close();
          return;
        }
        poseRef.current = pose;
        setStatus('ready');

        const tick = (now) => {
          if (cancelled) return;
          frameRef.current = requestAnimationFrame(tick);
          if (now - lastDetectionRef.current < 1000 / PWA_POSE_DETECTION_HZ) return;
          if (!video.videoWidth || !video.videoHeight || !poseRef.current) return;
          lastDetectionRef.current = now;
          try {
            // The element is not CSS-mirrored.  The model contract accepts a
            // front, unmirrored source only; source replacement resets the
            // temporal feature extractor through sourceGeneration.
            const timestampMs = Math.round(now);
            let poseResult;
            try {
              poseResult = poseRef.current.detectForVideo(video, timestampMs);
            } catch (poseError) {
              throw pwaCameraError('pose_inference', poseError);
            }
            const landmarks = poseResult?.landmarks?.[0] || null;
            const points = landmarks && layoutRef.current.width > 0 && layoutRef.current.height > 0
              ? landmarks.map((point) => mapPoint(point, layoutRef.current.width, layoutRef.current.height, video))
              : null;
            const nextPoseCount = Array.isArray(landmarks) ? landmarks.length : 0;
            setPoseCount((previous) => (previous === nextPoseCount ? previous : nextPoseCount));
            onLandmarksRef.current?.(landmarks, points, {
              timestampMs,
              sourceGeneration,
              inputIsMirrored: false,
              trackingProfile: 'pose_only',
            });
          } catch (detectError) {
            if (!cancelled) {
              setError(detectError?.stage ? detectError : pwaCameraError('pose_inference', detectError));
              setStatus('runtime_error');
            }
          }
        };
        frameRef.current = requestAnimationFrame(tick);
      } catch (startError) {
        if (!cancelled) {
          setError(startError);
          setStatus('error');
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      try { poseRef.current?.close(); } catch {}
      poseRef.current = null;
      streamRef.current?.getTracks?.().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [initialStream]);

  const statusText = error
    ? `${message || 'Camera unavailable'} (${error.message || error})`
    : status === 'ready'
      ? `PWA camera · Sit-to-Stand · Pose ${poseCount}/33 · Pose-only`
      : status === 'requesting_camera'
        ? 'Allow camera access to continue'
        : status === 'loading_model'
          ? 'Loading local pose model…'
          : message || 'Starting MacBook camera…';

  return (
    <View
      style={[styles.root, style]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (finite(width) && finite(height) && (width !== layout.width || height !== layout.height)) {
          setLayout({ width, height });
        }
      }}
    >
      <video ref={videoRef} autoPlay muted playsInline style={styles.video} />
      <View pointerEvents="none" style={styles.statusCard}>
        <Text style={styles.statusText}>{statusText}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#101713',
  },
  video: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    backgroundColor: '#101713',
  },
  statusCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 96,
    alignItems: 'center',
  },
  statusText: {
    maxWidth: 520,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 16,
    color: '#F7F4EA',
    backgroundColor: 'rgba(16, 23, 19, 0.72)',
    fontSize: 13,
    textAlign: 'center',
  },
});
