"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.faceLandmarkDetectionModuleConstants = faceLandmarkDetectionModuleConstants;
exports.faceLandmarkDetectionOnImage = faceLandmarkDetectionOnImage;
exports.useFaceLandmarkDetection = useFaceLandmarkDetection;
var _react = _interopRequireDefault(require("react"));
var _reactNative = require("react-native");
var _reactNativeVisionCamera = require("react-native-vision-camera");
var _types = require("../shared/types");
var _reactNativeWorkletsCore = require("react-native-worklets-core");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const {
  FaceLandmarkDetection
} = _reactNative.NativeModules;
const eventEmitter = new _reactNative.NativeEventEmitter(FaceLandmarkDetection);
const plugin = _reactNativeVisionCamera.VisionCameraProxy.initFrameProcessorPlugin("faceLandmarkDetection", {});
if (!plugin) {
  throw new Error("Failed to initialize faceLandmarkDetection plugin");
}

// Defines a connector with start and end points

// Defines landmarks as arrays of connectors

// Wraps the FaceLandmarks in a higher-level structure

function getFaceLandmarkDetectionModule() {
  if (FaceLandmarkDetection === undefined || FaceLandmarkDetection === null) {
    throw new Error("FaceLandmarkDetection module is not available");
  }
  return FaceLandmarkDetection;
}
function faceLandmarkDetectionModuleConstants() {
  if (FaceLandmarkDetection === undefined || FaceLandmarkDetection === null) {
    throw new Error("FaceLandmarkDetection module is not available");
  }
  return FaceLandmarkDetection.getConstants();
}

// Interface for the category, assuming this is part of the classifications

// Interface for classifications, which hold categories and additional metadata

// Interface for FaceLandmarkerResult

// TODO setup the general event callbacks
const detectorMap = new Map();
eventEmitter.addListener("onResults", args => {
  const callbacks = detectorMap.get(args.handle);
  if (callbacks) {
    callbacks.onResults(args, callbacks.viewSize, callbacks.mirrored);
  }
});
eventEmitter.addListener("onError", args => {
  const callbacks = detectorMap.get(args.handle);
  if (callbacks) {
    callbacks.onError(args);
  }
});
function useFaceLandmarkDetection(onResults, onError, runningMode, model, options) {
  const [detectorHandle, setDetectorHandle] = _react.default.useState();
  const [cameraViewDimensions, setCameraViewDimensions] = _react.default.useState({
    width: 1,
    height: 1
  });
  const outputOrientation = (0, _reactNativeWorkletsCore.useSharedValue)("portrait");
  const cameraViewLayoutChangeHandler = _react.default.useCallback(event => {
    setCameraViewDimensions({
      height: event.nativeEvent.layout.height,
      width: event.nativeEvent.layout.width
    });
  }, []);
  const mirrorMode = options?.mirrorMode ?? _reactNative.Platform.select({
    android: "mirror-front-only",
    default: "no-mirror"
  });
  const [cameraDevice, setCameraDevice] = _react.default.useState(undefined);
  const mirrored = _react.default.useMemo(() => {
    if (mirrorMode === "mirror-front-only" && cameraDevice?.position === "front" || mirrorMode === "mirror") {
      return true;
    } else {
      return false;
    }
  }, [cameraDevice?.position, mirrorMode]);
  // Remember the latest callback if it changes.
  _react.default.useLayoutEffect(() => {
    if (detectorHandle !== undefined) {
      detectorMap.set(detectorHandle, {
        onResults,
        onError,
        viewSize: cameraViewDimensions,
        mirrored
      });
    }
  }, [onResults, onError, detectorHandle, cameraViewDimensions, mirrored]);
  _react.default.useEffect(() => {
    let newHandle;
    console.log(`getFaceLandmarkDetectionModule: delegate = ${options?.delegate}, numFaces= ${options?.numFaces}, runningMode = ${runningMode}, model= ${model}`);
    getFaceLandmarkDetectionModule().createDetector(options?.numFaces ?? 1, options?.minFaceDetectionConfidence ?? 0.5, options?.minFacePresenceConfidence ?? 0.5, options?.minTrackingConfidence ?? 0.5, model, options?.delegate ?? _types.Delegate.GPU, runningMode).then(handle => {
      console.log("useFaceLandmarkDetection.createDetector", runningMode, model, handle);
      setDetectorHandle(handle);
      newHandle = handle;
    });
    return () => {
      console.log("useFaceLandmarkDetection.useEffect.unsub", "releaseDetector", newHandle);
      if (newHandle !== undefined) {
        getFaceLandmarkDetectionModule().releaseDetector(newHandle);
      }
    };
  }, [options?.delegate, runningMode, model, options?.numFaces, options?.minFaceDetectionConfidence, options?.minFacePresenceConfidence, options?.minTrackingConfidence]);
  const frameProcessor = (0, _reactNativeVisionCamera.useFrameProcessor)(frame => {
    "worklet";

    // console.log(frame.orientation, frame.width, frame.height);
    plugin?.call(frame, {
      detectorHandle
    });
  }, [detectorHandle]);
  return _react.default.useMemo(() => ({
    cameraViewLayoutChangeHandler,
    cameraDeviceChangeHandler: setCameraDevice,
    cameraOrientationChangedHandler: o => {
      outputOrientation.value = o;
    },
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    resizeModeChangeHandler: () => {},
    cameraViewDimensions,
    frameProcessor
  }), [cameraViewDimensions, cameraViewLayoutChangeHandler, frameProcessor, outputOrientation]);
}
function faceLandmarkDetectionOnImage(imagePath, model, options) {
  return getFaceLandmarkDetectionModule().detectOnImage(imagePath, options?.numFaces ?? 1, options?.minFaceDetectionConfidence ?? 0.5, options?.minFacePresenceConfidence ?? 0.5, options?.minTrackingConfidence ?? 0.5, model, options?.delegate ?? _types.Delegate.GPU);
}
//# sourceMappingURL=index.js.map