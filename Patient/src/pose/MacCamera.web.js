// Browser-only camera for local development.
//
// This is intentionally a separate platform file: it uses the MacBook webcam
// through getUserMedia and MediaPipe Tasks Vision WASM. It is not an iOS
// Simulator camera bridge and is never imported by the native build.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import {
  FilesetResolver,
  HandLandmarker,
  ObjectDetector,
  PoseLandmarker,
} from './web/vision_bundle.mjs';
import {
  normalizeBottleDetections,
  selectBottleDetection,
} from '../ai/bottleGrab/v7/BottleDetectionV7.js';

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const POSE_MODEL_CDN = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
const HAND_MODEL_CDN = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const BOTTLE_MODEL_ASSET = require('../../assets/models/efficientdet_lite0.tflite');
const MAX_DETECTION_HZ = 15;

function finite(value) {
  return Number.isFinite(Number(value));
}

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

function mapRect(rect, width, height, video) {
  if (!rect || !width || !height) return null;
  const topLeft = mapPoint({ x: rect.x, y: rect.y }, width, height, video);
  const bottomRight = mapPoint({
    x: Number(rect.x) + Number(rect.width),
    y: Number(rect.y) + Number(rect.height),
  }, width, height, video);
  if (!topLeft || !bottomRight) return null;
  const nextWidth = bottomRight.x - topLeft.x;
  const nextHeight = bottomRight.y - topLeft.y;
  if (!finite(nextWidth) || !finite(nextHeight) || nextWidth <= 0 || nextHeight <= 0) return null;
  return { left: topLeft.x, top: topLeft.y, width: nextWidth, height: nextHeight };
}

function chooseLeftHand(handResult) {
  const landmarks = handResult?.landmarks || [];
  const handedness = handResult?.handednesses || handResult?.handedness || [];
  if (!landmarks.length) return null;
  let index = handedness.findIndex((entry) => {
    const category = Array.isArray(entry) ? entry[0] : entry;
    return String(category?.categoryName || category?.displayName || '').toLowerCase() === 'left';
  });
  if (index < 0) index = 0;
  const category = Array.isArray(handedness[index]) ? handedness[index][0] : handedness[index];
  return {
    landmarks: landmarks[index] || null,
    side: category?.categoryName || category?.displayName || null,
    score: Number(category?.score || 0),
  };
}

export default function MacCamera({ style, message, onLandmarks, onCameraStatus }) {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [status, setStatus] = useState('starting');
  const [error, setError] = useState(null);
  const [detectionCounts, setDetectionCounts] = useState({ pose: 0, hand: 0, side: null });
  const [bottleStatus, setBottleStatus] = useState('bottle_missing');
  const [bottleRoi, setBottleRoi] = useState(null);
  const videoRef = useRef(null);
  const poseRef = useRef(null);
  const handRef = useRef(null);
  const bottleDetectorRef = useRef(null);
  const layoutRef = useRef(layout);
  const onLandmarksRef = useRef(onLandmarks);
  const streamRef = useRef(null);
  const frameRef = useRef(null);
  const lastDetectionRef = useRef(0);
  const sourceGenerationRef = useRef(0);
  const previousBottleRef = useRef(null);
  layoutRef.current = layout;
  onLandmarksRef.current = onLandmarks;

  useEffect(() => {
    if (status === 'ready') onCameraStatus?.('ready');
    else if (status === 'error' || status === 'runtime_error') {
      onCameraStatus?.('runtime-error', error?.message || 'MacBook camera failed');
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
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const sourceGeneration = sourceGenerationRef.current + 1;
        sourceGenerationRef.current = sourceGeneration;
        previousBottleRef.current = null;
        setBottleStatus('bottle_missing');
        setBottleRoi(null);
        streamRef.current = stream;
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await new Promise((resolve) => {
          if (video.readyState >= 2) resolve();
          else video.addEventListener('loadeddata', resolve, { once: true });
        });
        await video.play();
        setStatus('loading_model');
        const fileset = await FilesetResolver.forVisionTasks(WASM_CDN);
        const resolvedBottleModel = Image.resolveAssetSource(BOTTLE_MODEL_ASSET);
        if (!resolvedBottleModel?.uri) throw new Error('V7 bottle detector asset URI is unavailable');
        const [pose, objectDetector] = await Promise.all([
          PoseLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: POSE_MODEL_CDN, delegate: 'CPU' },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          }),
          ObjectDetector.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: resolvedBottleModel.uri, delegate: 'CPU' },
            runningMode: 'VIDEO',
            maxResults: 5,
            scoreThreshold: 0.35,
            categoryAllowlist: ['bottle'],
          }),
        ]);
        let hand = null;
        try {
          hand = await HandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: HAND_MODEL_CDN, delegate: 'CPU' },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        } catch (handError) {
          // V7 count does not require Hand; retain the Pose+bottle path and
          // surface finger-quality as unavailable in the session output.
          console.warn('PhysioAI optional Hand Landmarker unavailable', handError);
        }
        if (cancelled) {
          pose.close();
          hand?.close();
          objectDetector.close();
          return;
        }
        poseRef.current = pose;
        handRef.current = hand;
        bottleDetectorRef.current = objectDetector;
        setStatus('ready');

        const tick = (now) => {
          if (cancelled) return;
          frameRef.current = requestAnimationFrame(tick);
          if (now - lastDetectionRef.current < 1000 / MAX_DETECTION_HZ) return;
          if (!video.videoWidth || !video.videoHeight || !poseRef.current || !bottleDetectorRef.current) return;
          lastDetectionRef.current = now;
          try {
            // The video is deliberately not CSS-mirrored. V7 retains the
            // Baseline #4/nativeUnmirrored contract so anatomical Left
            // remains auditable across Pose, Hand, and detector outputs.
            const timestampMs = Math.round(now);
            const poseResult = poseRef.current.detectForVideo(video, timestampMs);
            const bottleResult = bottleDetectorRef.current.detectForVideo(video, timestampMs);
            const handResult = handRef.current?.detectForVideo(video, timestampMs) || null;
            const landmarks = poseResult?.landmarks?.[0] || null;
            const selectedHand = chooseLeftHand(handResult);
            const bottleCandidates = normalizeBottleDetections(bottleResult, {
              sourceGeneration,
              timestampMs,
              imageWidth: video.videoWidth,
              imageHeight: video.videoHeight,
            });
            const bottleSelection = selectBottleDetection({
              detections: bottleCandidates,
              sourceGeneration,
              timestampMs,
              previous: previousBottleRef.current,
            });
            if (bottleSelection.detection) previousBottleRef.current = bottleSelection.detection;
            const bottleDiagnostics = {
              detectorState: 'ready',
              detections: bottleCandidates,
              selection: bottleSelection,
            };
            setBottleStatus((previous) => {
              const next = bottleSelection.detection ? 'bottle_detected' : bottleSelection.reason;
              return previous === next ? previous : next;
            });
            setBottleRoi((previous) => {
              const next = bottleSelection.detection
                ? {
                  boundingBox: bottleSelection.detection.boundingBox,
                  timestampMs: bottleSelection.detection.timestampMs,
                  sourceGeneration,
                }
                : null;
              const unchanged = previous && next
                && previous.timestampMs === next.timestampMs
                && previous.sourceGeneration === next.sourceGeneration
                && previous.boundingBox?.x === next.boundingBox?.x
                && previous.boundingBox?.y === next.boundingBox?.y
                && previous.boundingBox?.width === next.boundingBox?.width
                && previous.boundingBox?.height === next.boundingBox?.height;
              return unchanged ? previous : next;
            });
            const points = landmarks && layoutRef.current.width > 0 && layoutRef.current.height > 0
              ? landmarks.map((point) => mapPoint(point, layoutRef.current.width, layoutRef.current.height, video))
              : null;
            const handViewPts = selectedHand?.landmarks && layoutRef.current.width > 0 && layoutRef.current.height > 0
              ? selectedHand.landmarks.map((point) => mapPoint(point, layoutRef.current.width, layoutRef.current.height, video))
              : null;
            const nextCounts = {
              pose: Array.isArray(landmarks) ? landmarks.length : 0,
              hand: Array.isArray(selectedHand?.landmarks) ? selectedHand.landmarks.length : 0,
              side: selectedHand?.side || null,
            };
            setDetectionCounts((previous) => (
              previous.pose === nextCounts.pose
                && previous.hand === nextCounts.hand
                && previous.side === nextCounts.side
                ? previous
                : nextCounts
            ));
            onLandmarksRef.current?.(landmarks, points, selectedHand ? {
              landmarks: selectedHand.landmarks,
              side: selectedHand.side,
              score: selectedHand.score,
              timestampMs,
            } : null, handViewPts, bottleSelection.detection, sourceGeneration, bottleDiagnostics, {
              timestampMs,
              sourceGeneration,
              inputIsMirrored: false,
            });
          } catch (detectError) {
            if (!cancelled) {
              setError(detectError);
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
      try { handRef.current?.close(); } catch {}
      try { bottleDetectorRef.current?.close(); } catch {}
      poseRef.current = null;
      handRef.current = null;
      bottleDetectorRef.current = null;
      previousBottleRef.current = null;
      setBottleRoi(null);
      streamRef.current?.getTracks?.().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, []);

  const statusText = error
    ? `${message || 'Camera unavailable'} (${error.message || error})`
    : status === 'ready'
      ? `MacBook camera · App V7.3.3 · Pose ${detectionCounts.pose}/33 · Hand ${detectionCounts.hand}/21${detectionCounts.side ? ` · ${detectionCounts.side}` : ''} · Bottle ${bottleStatus}`
      : status === 'requesting_camera'
        ? 'Allow camera access to continue'
      : status === 'loading_model'
          ? 'Loading local camera models…'
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
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={styles.video}
      />
      {bottleRoi && layout.width > 0 && layout.height > 0
        ? (() => {
          const rect = mapRect(bottleRoi.boundingBox, layout.width, layout.height, videoRef.current);
          return rect ? <View pointerEvents="none" style={[styles.bottleRoi, rect]} /> : null;
        })()
        : null}
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
  bottleRoi: {
    position: 'absolute',
    borderColor: '#D9F29D',
    borderWidth: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(217, 242, 157, 0.08)',
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
