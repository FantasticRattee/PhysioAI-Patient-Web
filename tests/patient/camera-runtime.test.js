import fs from 'fs';
import path from 'path';

const appRoot = path.resolve(__dirname, '../..');
const source = (...parts) => fs.readFileSync(path.join(appRoot, ...parts), 'utf8');

describe('Bottle Grab camera runtime wiring', () => {
  test('vendored MediaPipe peer imports use the Patient React runtime', () => {
    const metro = source('Patient', 'metro.config.js');

    expect(metro).toContain('MEDIAPIPE_VENDOR_ROOT');
    expect(metro).toContain('APP_PEER_MODULES');
    expect(metro).toContain("['react', 'react-native', 'react-native-vision-camera', 'react-native-worklets-core']");
    expect(metro).toContain('CANONICAL_NATIVE_MODULES');
    expect(metro).toContain("'react-native-vision-camera'");
    expect(metro).toContain("'react-native-worklets-core'");
    expect(metro).toContain('CANONICAL_NATIVE_MODULES.has(moduleName)');
    expect(metro).toContain('origin.startsWith(`${MEDIAPIPE_VENDOR_ROOT}${path.sep}`)');
  });

  test('postinstall does not copy nested React dependencies into the bridge', () => {
    const syncScript = source('Patient', 'scripts', 'sync-mediapipe-bottle.cjs');

    expect(syncScript).toContain("path.basename(entry) !== 'node_modules'");
  });

  test('Bottle Grab uses the device-safe CPU delegate for the iOS preview', () => {
    const camera = source('Patient', 'src', 'pose', 'BottleGrabCamera.js');

    expect(camera).toContain('MP.Delegate?.CPU ?? 0');
    expect(camera).not.toContain('delegate: MP.Delegate?.GPU ?? 1');
  });

  test('MediaPipe frame processor skips frames until its native handle exists', () => {
    const bridge = source('Patient', 'vendor', 'react-native-mediapipe', 'lib', 'commonjs', 'poseDetection', 'index.js');

    expect(bridge).toContain('typeof detectorHandle !== "number"');
    expect(bridge).toContain('Number.isFinite(detectorHandle)');
    expect(bridge).toContain('try {');
    expect(bridge).toContain('frame.timestamp');
    expect(bridge).toContain('lastProcessedFrameTimestamp');
  });

  test('web Bottle Grab uses the MacBook camera and Baseline #4 adapter', () => {
    const camera = source('Patient', 'src', 'pose', 'MacCamera.web.js');
    const practice = source('Patient', 'src', 'screens', 'PracticeScreen.js');
    const hook = source('Patient', 'src', 'pose', 'usePractice.js');
    const contract = JSON.parse(source(
      'Patient', 'src', 'ai', 'bottleGrab', 'ruleWrapHybrid',
      'rule_wrap_hybrid_device_preview.contract.json',
    ));

    expect(camera).toContain('navigator.mediaDevices.getUserMedia');
    expect(camera).toContain('HandLandmarker');
    expect(camera).toContain('ObjectDetector');
    expect(camera).toContain('efficientdet_lite0.tflite');
    expect(camera).toContain('normalizeBottleDetections');
    expect(camera).toContain('nativeUnmirrored');
    expect(practice).toContain("require('../pose/MacCamera.web.js').default");
    expect(hook).toContain('createBottleGrabV7PwaTracker');
    expect(hook).toContain('Platform.OS === \'web\'');
    expect(practice).toContain('App V7.3.3 PWA · Bottle Detector + Pose');
    expect(practice).toContain('App V7.3.3 PWA · Experimental');
    expect(practice).toContain('Bottle Detector Diagnostics');
    expect(practice).toContain('phaseContext');
    expect(practice).toContain('PhaseNet:');
    expect(contract).toMatchObject({
      baselineNumber: 4,
      modelModuleId: 'bottle_grab_rule_wrap_hybrid_v1_baseline_4',
      parentBaseline: 'bottle_grab_calibration_3_core_baseline_3',
      status: 'experimental_mac_web_preview_not_deployable',
    });
  });

  test('web Bottle Grab exposes the App V7 detector contract separately', () => {
    const v7 = JSON.parse(source(
      'Patient', 'src', 'ai', 'bottleGrab', 'v7', 'bottle_grab_v7_pwa.contract.json',
    ));
    const tracker = source('Patient', 'src', 'ai', 'bottleGrab', 'BottleGrabV7PwaTracker.js');

    expect(v7).toMatchObject({
      schema: 'physioai.bottle_grab_v7_pwa.v1',
      counterMode: 'bottle_detector_proximity',
      phaseAuthority: 'none_context_only',
    });
    expect(tracker).toContain('BOTTLE_GRAB_V7_MODULE_ID');
    expect(tracker).toContain('proximityRepCount');
    expect(tracker).toContain('phaseContextUnavailableReason');
    expect(tracker).toContain('resetForNewCaptureSource');
  });

  test('MacBook camera initializes layout state before a ref reads it', () => {
    const camera = source('Patient', 'src', 'pose', 'MacCamera.web.js');
    const stateOffset = camera.indexOf('const [layout, setLayout] = useState');
    const refOffset = camera.indexOf('const layoutRef = useRef(layout)');

    expect(stateOffset).toBeGreaterThanOrEqual(0);
    expect(refOffset).toBeGreaterThanOrEqual(0);
    expect(stateOffset).toBeLessThan(refOffset);
  });

  test('web Bottle Grab maps and forwards body plus selected hand view points', () => {
    const camera = source('Patient', 'src', 'pose', 'MacCamera.web.js');
    const screen = source('Patient', 'src', 'screens', 'PracticeScreen.js');

    expect(camera).toContain('const handViewPts = selectedHand?.landmarks &&');
    expect(camera).toContain('onLandmarksRef.current?.(landmarks, points, selectedHand ?');
    expect(camera).toContain('handViewPts, bottleSelection.detection, sourceGeneration, bottleDiagnostics, {');
    expect(screen).toContain('<Skeleton');
    expect(screen).toContain('points={mode === \'live\' ? livePts : null}');
    expect(screen).toContain('experimentalBottle && mode === \'live\' && liveHandPts');
  });

  test('native live cameras use the shared camera presenter and expose controls', () => {
    const pose = source('Patient', 'src', 'pose', 'PoseCamera.js');
    const bottle = source('Patient', 'src', 'pose', 'BottleGrabCamera.js');
    const presenter = source('Patient', 'src', 'pose', 'NativeCameraView.js');
    const screen = source('Patient', 'src', 'screens', 'PracticeScreen.js');

    expect(pose).toContain("./NativeCameraView.js");
    expect(bottle).toContain("./NativeCameraView.js");
    expect(pose).not.toContain('activeCamera="front"');
    expect(bottle).not.toContain('activeCamera="front"');
    expect(presenter).toContain('useCameraDevice');
    expect(presenter).toContain('useCameraPermission');
    expect(presenter).toContain('requestPermission');
    expect(presenter).toContain('Linking.openSettings');
    expect(presenter).toContain('zoom={selectedLens.zoom}');
    expect(screen).toContain('cameraPosition={cameraPosition}');
    expect(screen).toContain('<CameraControls');
    expect(screen).toContain('Platform.OS !== \'web\'');
    expect(bottle).toContain('mapLandmarksToView');
    expect(bottle).toContain('handViewPts');
    expect(screen).toContain('<HandSkeleton');
  });

  test('camera startup is retriable and secondary HUD surfaces wait for readiness', () => {
    const pose = source('Patient', 'src', 'pose', 'PoseCamera.js');
    const bottle = source('Patient', 'src', 'pose', 'BottleGrabCamera.js');
    const presenter = source('Patient', 'src', 'pose', 'NativeCameraView.js');
    const screen = source('Patient', 'src', 'screens', 'PracticeScreen.js');

    expect(pose).toContain('setTimeout(attempt, 0)');
    expect(bottle).toContain('setTimeout(attempt, 0)');
    expect(presenter).toContain('loadVisionCamera');
    expect(presenter).toContain("onCameraStatus?.('permission')");
    expect(screen).toContain("cameraStatus.kind === 'ready'");
    expect(screen).toContain('cameraFailureLayer');
    expect(screen).toContain("cameraStatus.kind !== 'permission'");
  });
});
