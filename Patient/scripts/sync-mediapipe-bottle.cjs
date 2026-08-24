/*
 * Keep the PWA's reviewed MediaPipe CommonJS bridge reproducible.
 *
 * The public react-native-mediapipe package does not contain this reviewed
 * bridge yet, so npm installs the pinned upstream package and this postinstall
 * step overlays the tracked `vendor/` copy before Metro runs. The PWA release
 * intentionally ships only the precompiled CommonJS bridge that
 * `metro.config.js` resolves; native iOS/Android bridge source remains outside
 * this isolated web deployment. Generated dependency folders are excluded so
 * a second React/React Native peer runtime cannot enter the bundle.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'vendor', 'react-native-mediapipe');
const destination = path.join(root, 'node_modules', 'react-native-mediapipe');

if (!fs.existsSync(source)) {
  throw new Error(`Missing vendored MediaPipe bridge: ${source}`);
}

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.cpSync(source, destination, {
  recursive: true,
  filter: (entry) => path.basename(entry) !== 'node_modules',
});
console.log('[physioai] synced vendored react-native-mediapipe Bottle Grab bridge');
