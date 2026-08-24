// Native camera capability helpers.
//
// VisionCamera exposes one logical device for a multi-camera cluster.  The
// helper turns that device's physical camera metadata into the small set of
// lens presets that the Patient UI is allowed to show.  It is deliberately
// pure so the hardware policy can be tested without a native runtime.

export const CAMERA_POSITIONS = Object.freeze({
  FRONT: 'front',
  BACK: 'back',
});

export const LENS_IDS = Object.freeze({
  ULTRA_WIDE: 'ultra-wide',
  WIDE: 'wide',
  TELE: 'tele',
  MAX: 'max',
});

export const BACK_CAMERA_PHYSICAL_DEVICES = Object.freeze([
  'ultra-wide-angle-camera',
  'wide-angle-camera',
  'telephoto-camera',
]);

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function cameraDeviceFilter(position) {
  return position === CAMERA_POSITIONS.BACK
    ? { physicalDevices: BACK_CAMERA_PHYSICAL_DEVICES }
    : undefined;
}

export function clampZoom(device, zoom) {
  if (!device) return null;
  const min = finite(device.minZoom, 1);
  const max = Math.max(min, finite(device.maxZoom, min));
  const value = finite(zoom, finite(device.neutralZoom, 1));
  return Math.min(max, Math.max(min, value));
}

function hasPhysical(device, physicalDevice) {
  return Array.isArray(device?.physicalDevices) && device.physicalDevices.includes(physicalDevice);
}

function lens(id, label, zoom, physicalDevice) {
  return { id, label, zoom, physicalDevice };
}

function zoomLabel(value) {
  const rounded = Math.round(Number(value) * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}×`;
}

/**
 * Return only lens presets that the selected CameraDevice can actually serve.
 * No button is fabricated from an assumed iPhone model: a single-camera or
 * simulator device therefore returns only its real wide lens.
 */
export function resolveCameraLenses(device, position = device?.position) {
  if (!device || device.position !== position) return [];
  const neutral = finite(device.neutralZoom, 1);
  const min = finite(device.minZoom, 1);
  const max = Math.max(min, finite(device.maxZoom, neutral));
  const result = [];

  if (position === CAMERA_POSITIONS.FRONT) {
    result.push(lens(LENS_IDS.WIDE, '1×', clampZoom(device, neutral), 'wide-angle-camera'));
    if (max > neutral * 1.05) {
      result.push(lens(LENS_IDS.MAX, zoomLabel(max), max, 'digital-zoom'));
    }
    return result;
  }

  if (hasPhysical(device, 'ultra-wide-angle-camera') && min < neutral * 0.95) {
    // VisionCamera's minZoom is the authoritative way to select the
    // ultra-wide end of a logical multi-camera. Do not assume every iPhone
    // reports exactly 0.5 in every format/OS combination.
    const ultraFactor = min / Math.max(neutral, 1e-6);
    result.push(lens(LENS_IDS.ULTRA_WIDE, zoomLabel(ultraFactor), clampZoom(device, min), 'ultra-wide-angle-camera'));
  }

  if (hasPhysical(device, 'wide-angle-camera')) {
    result.push(lens(LENS_IDS.WIDE, '1×', clampZoom(device, neutral), 'wide-angle-camera'));
  }

  // A rare single physical device may not identify itself as wide-angle. Keep
  // one honest default view rather than inventing ultra-wide/telephoto choices.
  if (!result.length && Array.isArray(device.physicalDevices) && device.physicalDevices.length) {
    result.push(lens(LENS_IDS.WIDE, '1×', clampZoom(device, neutral), device.physicalDevices[0]));
  }

  if (hasPhysical(device, 'telephoto-camera')) {
    const teleZoom = max >= neutral * 2.8
      ? neutral * 3
      : max >= neutral * 1.9
        ? neutral * 2
        : max >= neutral * 1.45 ? neutral * 1.5 : null;
    if (teleZoom != null) {
      result.push(lens(LENS_IDS.TELE, teleZoom >= neutral * 2.8 ? '3×' : teleZoom >= neutral * 1.9 ? '2×' : '1.5×', clampZoom(device, teleZoom), 'telephoto-camera'));
    }
  }

  // Keep the complete digital range reachable even when the device reports a
  // telephoto physical camera. `maxZoom` is hardware/format/OS specific, so
  // expose its runtime value instead of claiming a fixed 14×/24× limit.
  if (max > neutral * 1.05 && !result.some((item) => item.zoom === max)) {
    result.push(lens(LENS_IDS.MAX, zoomLabel(max), max, 'digital-zoom'));
  }

  return result;
}

export function pickCameraLens(lenses, requestedId) {
  if (!Array.isArray(lenses) || !lenses.length) return null;
  return lenses.find((item) => item.id === requestedId)
    || lenses.find((item) => item.id === LENS_IDS.WIDE)
    || lenses[0];
}

export function cameraCapabilityKey(capabilities) {
  if (!capabilities) return '';
  const lensKey = (capabilities.lenses || []).map((item) => `${item.id}:${item.zoom}`).join('|');
  return `${capabilities.position || ''}:${capabilities.deviceId || ''}:${capabilities.selectedLens || ''}:${lensKey}`;
}
