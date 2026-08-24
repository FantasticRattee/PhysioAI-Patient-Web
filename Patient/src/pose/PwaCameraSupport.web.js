// Browser-only camera helpers shared by the experimental PWA camera lanes.
//
// Keep the browser/standalone-PWA boundary explicit: camera access must begin
// from a Patient action, and every failure carries a small stage identifier so
// a device recording is diagnostic without exposing raw frames or landmarks.

const IOS_UA = /iPad|iPhone|iPod/i;

function runtimeNavigator(override) {
  if (override) return override;
  return typeof navigator === 'undefined' ? null : navigator;
}

function cleanMessage(error) {
  const name = String(error?.name || '').trim();
  const message = String(error?.message || error || '').replace(/\s+/g, ' ').trim();
  const joined = name && message && !message.startsWith(name) ? `${name}: ${message}` : (message || name || 'unknown_error');
  return joined.slice(0, 180);
}

export function isIOSLike(navigatorLike) {
  const nav = runtimeNavigator(navigatorLike);
  const userAgent = String(nav?.userAgent || '');
  const platform = String(nav?.platform || '');
  const touchPoints = Number(nav?.maxTouchPoints || 0);
  return IOS_UA.test(userAgent) || (platform === 'MacIntel' && touchPoints > 1);
}

export function pwaVideoConstraints(navigatorLike) {
  const ios = isIOSLike(navigatorLike);
  return {
    video: {
      // `ideal`, rather than an exact front-camera constraint, leaves iOS free
      // to choose the available camera while preserving the intended view.
      facingMode: { ideal: 'user' },
      width: { ideal: ios ? 640 : 1280 },
      height: { ideal: ios ? 480 : 720 },
      frameRate: { ideal: ios ? 24 : 30, max: 30 },
    },
    audio: false,
  };
}

export function pwaCameraError(stage, error) {
  const next = new Error(`${stage}: ${cleanMessage(error)}`);
  next.stage = stage;
  next.cause = error || null;
  return next;
}

export function pwaCameraErrorDetail(error) {
  const stage = String(error?.stage || 'unknown_stage');
  const detail = cleanMessage(error?.cause || error);
  return `${stage}: ${detail}`.slice(0, 220);
}

export async function requestWebCameraStream({ navigatorLike, constraints } = {}) {
  const nav = runtimeNavigator(navigatorLike);
  if (!nav?.mediaDevices?.getUserMedia) {
    throw pwaCameraError('camera_request', new Error('getUserMedia is unavailable in this browser'));
  }
  try {
    const stream = await nav.mediaDevices.getUserMedia(constraints || pwaVideoConstraints(nav));
    if (!stream?.getVideoTracks?.().length) {
      stream?.getTracks?.().forEach((track) => track.stop());
      throw new Error('camera stream has no video track');
    }
    return stream;
  } catch (error) {
    throw pwaCameraError('camera_request', error);
  }
}

export function waitForVideoReady(video, timeoutMs = 8000) {
  if (!video) return Promise.reject(pwaCameraError('video_ready', new Error('video element is unavailable')));
  if (video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('error', onError);
      callback(value);
    };
    const onReady = () => finish(resolve);
    const onError = () => finish(reject, pwaCameraError('video_ready', new Error('video failed before a frame was available')));
    const timer = setTimeout(() => finish(reject, pwaCameraError('video_ready', new Error('timed out waiting for the first camera frame'))), timeoutMs);
    video.addEventListener('loadeddata', onReady, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

export async function loadPwaModelAssetBuffer(uri, label, fetchLike) {
  const request = fetchLike || (typeof fetch === 'function' ? fetch : null);
  if (!request || !uri) throw pwaCameraError('model_asset', new Error(`${label || 'model'} asset URL is unavailable`));
  try {
    const response = await request(uri);
    if (!response?.ok) throw new Error(`${label || 'model'} asset request failed: ${response?.status || 'unknown'}`);
    const bytes = await response.arrayBuffer();
    if (!bytes?.byteLength) throw new Error(`${label || 'model'} asset is empty`);
    return new Uint8Array(bytes);
  } catch (error) {
    throw pwaCameraError('model_asset', error);
  }
}
