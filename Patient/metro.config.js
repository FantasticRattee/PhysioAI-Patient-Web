// PhysioAI · Patient — Metro config.
//
// react-native-mediapipe@0.5.1 declares its `react-native`/`source` entry as raw
// 0.73-era TypeScript, which Metro (SDK 54) tries to transpile against a Babel
// plugin that no longer exists (@babel/plugin-proposal-optional-chaining). The
// package also ships precompiled plain JS under lib/commonjs, so we redirect the
// bare import there — no TS transpile needed. Works both in Expo Go (native side
// absent → app falls back to the synthetic demo) and in a dev build (native present).

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
// Bottle Grab's frozen PhaseNet bundle is a raw little-endian Float32 asset.
// Keep it as an asset so the device loads the exact bytes without a JS rewrite.
if (!config.resolver.assetExts.includes('f32')) config.resolver.assetExts.push('f32');
// App V7's generic MediaPipe EfficientDet-Lite0 bottle detector is also a
// binary asset. Metro must preserve it for the browser export and native
// rollback builds rather than trying to parse it as JavaScript.
if (!config.resolver.assetExts.includes('tflite')) config.resolver.assetExts.push('tflite');
if (!config.resolver.sourceExts.includes('mjs')) config.resolver.sourceExts.push('mjs');

const MEDIAPIPE_CJS = path.resolve(
  __dirname,
  'vendor/react-native-mediapipe/lib/commonjs/index.js'
);
const MEDIAPIPE_VENDOR_ROOT = path.resolve(
  __dirname,
  'vendor/react-native-mediapipe'
);

// The reviewed vendor tree may have been copied from an npm install that
// contains its own peer dependencies. Those nested React/React Native copies
// must never enter the app bundle: the hook dispatcher must come from the same
// React 19 runtime that renders the Patient app. Resolve MediaPipe's peer
// imports from the Patient app root instead.
const APP_PEER_MODULES = new Map(
  ['react', 'react-native', 'react-native-vision-camera', 'react-native-worklets-core']
    .map((name) => [name, require.resolve(name, { paths: [__dirname] })]),
);

// Metro prefers a package's `react-native`/`source` entry for application
// imports, while the vendored MediaPipe bridge is intentionally redirected to
// its precompiled CommonJS build.  That split would put two copies of
// VisionCamera (and Worklets) in one bundle.  Both copies call
// requireNativeComponent('CameraView'), so React Native throws
// "Tried to register two views with the same name CameraView" when the live
// route is opened.  Keep one canonical JS entry for each native peer across
// app and vendored imports.
const CANONICAL_NATIVE_MODULES = new Set([
  'react-native-vision-camera',
  'react-native-worklets-core',
]);

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native-mediapipe') {
    return { type: 'sourceFile', filePath: MEDIAPIPE_CJS };
  }
  if (CANONICAL_NATIVE_MODULES.has(moduleName)) {
    return { type: 'sourceFile', filePath: APP_PEER_MODULES.get(moduleName) };
  }
  const origin = context.originModulePath || '';
  if (origin.startsWith(`${MEDIAPIPE_VENDOR_ROOT}${path.sep}`) && APP_PEER_MODULES.has(moduleName)) {
    return { type: 'sourceFile', filePath: APP_PEER_MODULES.get(moduleName) };
  }
  return (defaultResolveRequest || context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
