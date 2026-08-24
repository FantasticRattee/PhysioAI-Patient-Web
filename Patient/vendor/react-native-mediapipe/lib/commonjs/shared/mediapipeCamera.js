"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MediapipeCamera = void 0;
var _react = _interopRequireDefault(require("react"));
var _reactNative = require("react-native");
var _reactNativeVisionCamera = require("react-native-vision-camera");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const MediapipeCamera = ({
  style,
  solution: {
    cameraDeviceChangeHandler,
    cameraViewLayoutChangeHandler,
    cameraOrientationChangedHandler,
    resizeModeChangeHandler,
    frameProcessor
  },
  activeCamera = "front",
  resizeMode = "cover"
}) => {
  const device = (0, _reactNativeVisionCamera.useCameraDevice)(activeCamera);
  _react.default.useEffect(() => {
    console.log(`camera device change. sensorOrientation:${device?.sensorOrientation}`);
    cameraDeviceChangeHandler(device);
  }, [cameraDeviceChangeHandler, device]);
  _react.default.useEffect(() => {
    resizeModeChangeHandler(resizeMode);
  }, [resizeModeChangeHandler, resizeMode]);
  return device !== undefined ? /*#__PURE__*/_react.default.createElement(_reactNativeVisionCamera.Camera, {
    resizeMode: resizeMode,
    style: style,
    device: device,
    pixelFormat: "rgb",
    outputOrientation: "preview",
    isActive: true,
    frameProcessor: frameProcessor,
    onLayout: cameraViewLayoutChangeHandler,
    onOutputOrientationChanged: o => {
      console.log(`output orientation change:${o}`);
      cameraOrientationChangedHandler(o);
    }
  }) : /*#__PURE__*/_react.default.createElement(_reactNative.Text, null, "no device");
};
exports.MediapipeCamera = MediapipeCamera;
//# sourceMappingURL=mediapipeCamera.js.map