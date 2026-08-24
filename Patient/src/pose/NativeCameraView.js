// Patient-owned VisionCamera presenter.
//
// The MediaPipe hook remains in PoseCamera/BottleGrabCamera so the existing
// detector and ViewCoordinator contract is unchanged.  This component owns
// only native device selection, lens zoom, and the preview surface.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Linking, StyleSheet } from 'react-native';
import {
  cameraCapabilityKey,
  cameraDeviceFilter,
  pickCameraLens,
  resolveCameraLenses,
} from './cameraCapabilities.js';
import { colors } from '../core/theme.js';
import { getLang } from '../core/i18n.js';

function loadVisionCamera() {
  try {
    const module = require('react-native-vision-camera');
    if (!module?.Camera || !module?.useCameraDevice || !module?.useCameraPermission) {
      throw new Error('VisionCamera exports are incomplete');
    }
    return { module, error: null };
  } catch (error) {
    return { module: null, error };
  }
}

export default function NativeCameraView(props) {
  const [loaded, setLoaded] = useState({ module: null, error: null });
  const { onCameraStatus } = props;

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timer = null;
    onCameraStatus?.('loading');
    const attempt = () => {
      if (cancelled) return;
      const next = loadVisionCamera();
      if (next.module) {
        setLoaded(next);
        return;
      }
      attempts += 1;
      if (attempts < 10) timer = setTimeout(attempt, 250);
      else {
        setLoaded(next);
        console.error('PhysioAI VisionCamera load failed', next.error);
        onCameraStatus?.('module-error', next.error?.message || 'VisionCamera bridge unavailable');
      }
    };
    timer = setTimeout(attempt, 0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [onCameraStatus]);

  if (!loaded.module) return <View style={props.style} />;
  return <NativeCameraPresenter VisionCamera={loaded.module} {...props} />;
}

function NativeCameraPresenter({
  style,
  solution,
  position = 'front',
  lensId = 'wide',
  onCapabilitiesChange,
  onCameraStatus,
  fallbackText,
  VisionCamera,
}) {
  const {
    Camera,
    useCameraDevice,
    useCameraPermission,
  } = VisionCamera;
  const { hasPermission, requestPermission } = useCameraPermission();
  const [requestingPermission, setRequestingPermission] = useState(false);
  const lang = getLang();
  const device = useCameraDevice(position, cameraDeviceFilter(position));
  const lenses = useMemo(() => resolveCameraLenses(device, position), [device, position]);
  const selectedLens = useMemo(() => pickCameraLens(lenses, lensId), [lenses, lensId]);
  const capabilities = useMemo(() => ({
    position,
    permission: hasPermission,
    deviceId: hasPermission ? (device?.id || null) : null,
    lenses,
    selectedLens: selectedLens?.id || null,
  }), [device?.id, hasPermission, lenses, position, selectedLens]);

  useEffect(() => {
    solution?.cameraDeviceChangeHandler?.(device);
  }, [device, solution]);

  useEffect(() => {
    solution?.resizeModeChangeHandler?.('cover');
  }, [solution]);

  // Do not publish a fresh object on every render.  PracticeScreen uses this
  // stable key to avoid a capability -> state -> render feedback loop.
  useEffect(() => {
    onCapabilitiesChange?.(capabilities);
  }, [cameraCapabilityKey(capabilities), onCapabilitiesChange]);

  useEffect(() => {
    if (!hasPermission) onCameraStatus?.('permission');
    else if (!device || !selectedLens) onCameraStatus?.('unavailable');
    else if (!solution?.frameProcessor) onCameraStatus?.('loading');
    else onCameraStatus?.('ready');
  }, [device?.id, hasPermission, onCameraStatus, selectedLens?.id, solution?.frameProcessor]);

  if (!hasPermission) {
    const requestCameraAccess = async () => {
      if (requestingPermission) return;
      setRequestingPermission(true);
      try {
        await requestPermission();
      } finally {
        setRequestingPermission(false);
      }
    };
    return (
      <View style={[styles.fallback, style]}>
        <Text style={styles.fallbackTitle}>
          {lang === 'th' ? 'ต้องอนุญาตการใช้กล้อง' : 'Camera access is required'}
        </Text>
        <Text style={styles.fallbackText}>
          {lang === 'th'
            ? 'อนุญาตให้ PhysioAI ใช้กล้อง iPhone ข้อมูลวิดีโอจะอยู่ในเครื่อง'
            : 'Allow PhysioAI to use the camera on this iPhone. Video stays on-device.'}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.permissionButton, pressed && styles.pressed]}
          onPress={requestCameraAccess}
          accessibilityRole="button"
          accessibilityLabel={lang === 'th' ? 'อนุญาตการใช้กล้อง' : 'Allow camera access'}
        >
          <Text style={styles.permissionButtonText}>
            {requestingPermission
              ? (lang === 'th' ? 'กำลังขอสิทธิ์…' : 'Requesting…')
              : (lang === 'th' ? 'อนุญาตกล้อง' : 'Allow camera')}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}
          onPress={() => Linking.openSettings().catch(() => {})}
          accessibilityRole="button"
          accessibilityLabel={lang === 'th' ? 'เปิดการตั้งค่ากล้อง iPhone' : 'Open iPhone camera settings'}
        >
          <Text style={styles.settingsButtonText}>
            {lang === 'th' ? 'เปิดการตั้งค่า iPhone' : 'Open iPhone Settings'}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (!device || !selectedLens || !solution?.frameProcessor) {
    return (
      <View style={[styles.fallback, style]}>
        <Text style={styles.fallbackText}>
          {fallbackText || 'Camera hardware is unavailable in this build.'}
        </Text>
      </View>
    );
  }

  return (
    <Camera
      key={`${device.id}:${selectedLens.id}`}
      style={style}
      device={device}
      zoom={selectedLens.zoom}
      resizeMode="cover"
      pixelFormat="rgb"
      outputOrientation="preview"
      isActive
      frameProcessor={solution.frameProcessor}
      onError={(error) => onCameraStatus?.('runtime-error', error?.message || 'Camera preview failed')}
      onLayout={solution.cameraViewLayoutChangeHandler}
      onOutputOrientationChanged={(orientation) => {
        solution.cameraOrientationChangedHandler?.(orientation);
      }}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.surface3,
  },
  fallbackText: {
    color: colors.ink2,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 21,
  },
  fallbackTitle: {
    color: colors.ink,
    textAlign: 'center',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
    marginBottom: 6,
  },
  permissionButton: {
    minHeight: 46,
    minWidth: 170,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: colors.brand,
    marginTop: 16,
  },
  permissionButtonText: { color: colors.inverse, fontWeight: '800', fontSize: 14 },
  settingsButton: { paddingHorizontal: 14, paddingVertical: 12, marginTop: 2 },
  settingsButtonText: { color: colors.brand, fontWeight: '700', fontSize: 13 },
  pressed: { opacity: 0.72 },
});
