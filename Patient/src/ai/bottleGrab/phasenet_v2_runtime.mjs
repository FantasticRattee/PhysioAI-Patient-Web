// Dependency-free browser inference for the exact frozen Bottle Grab PhaseNet V2.
// The runtime exposes phase probabilities only; it cannot emit quality or cues.

import {
  PHASENET_V2_CLASS_ORDER,
  PHASENET_V2_FEATURE_NAMES,
  PHASENET_V2_SEQUENCE_LENGTH,
} from './phasenet_v2_features.mjs';


const EXPECTED_RUNTIME_CONTRACT_SHA256 = '6270c54c3750ad42138ffe5e94b30b8c6165a284873d3a9368aa9aa4e3f05ab6';
const EXPECTED_WEIGHT_SHA256 = 'b522a4e5f705594ccdfc400d24b11cc87677f39961698f95a63dfddcb1e1fd43';
const EXPECTED_MODEL_SHA256 = '020927a826c2d6e30efc791fe6b7b3ef95dd185bf6d25328617e7d7a1bbc7367';
const EXPECTED_MANIFEST_SHA256 = 'b76ed8f8a9d37e09c00254fbd28b40aef81c040e1ed03ad04f6d7a03bdb56669';
const EXPECTED_SOURCE_CONTRACT_SHA256 = '5e1a91b0fc0522e76e4d51b3d8ca483215ac9a68d461ac3d37baefde79c1672c';
const EXPECTED_GRAPH_SHA256 = '35b38a9e7ce95390b5bfb71ce90cd2f92b4d939388612247aba49585e71a5742';
const EXPECTED_FEATURE_ORDER_SHA256 = '3950a58caf69819fe048e3b2f355e814958b1d12d1241e7f6a17e2299cf05cff';
const EXPECTED_INPUT_CONTRACT_SHA256 = '4eb54bbee82c93b7d8377631c048e9c1e5393d9df02fa1a9c092c25f04b1b70d';
const EXPECTED_CLASS_ORDER_SHA256 = 'c689faf8be163142cb107f8faa2537ebdc5e9f0e0853a3e840acba6f27c9bdf0';
const EXPECTED_WEIGHT_BYTE_LENGTH = 55480;
const EXPECTED_WEIGHT_FLOAT_COUNT = 13870;

const EXPECTED_WEIGHT_LAYOUT = Object.freeze([
  ['pose_norm_gamma', [10], 0, 10],
  ['pose_norm_beta', [10], 10, 10],
  ['hand_norm_gamma', [10], 20, 10],
  ['hand_norm_beta', [10], 30, 10],
  ['pose_encoder_d1_kernel', [5, 10, 24], 40, 1200],
  ['pose_encoder_d1_bias', [24], 1240, 24],
  ['hand_encoder_d1_kernel', [5, 10, 24], 1264, 1200],
  ['hand_encoder_d1_bias', [24], 2464, 24],
  ['pose_projection_d1_kernel', [1, 24, 24], 2488, 576],
  ['pose_projection_d1_bias', [24], 3064, 24],
  ['pose_residual_d1_kernel', [1, 10, 24], 3088, 240],
  ['pose_residual_d1_bias', [24], 3328, 24],
  ['hand_projection_d1_kernel', [1, 24, 24], 3352, 576],
  ['hand_projection_d1_bias', [24], 3928, 24],
  ['hand_residual_d1_kernel', [1, 10, 24], 3952, 240],
  ['hand_residual_d1_bias', [24], 4192, 24],
  ['pose_encoder_d2_kernel', [5, 24, 24], 4216, 2880],
  ['pose_encoder_d2_bias', [24], 7096, 24],
  ['hand_encoder_d2_kernel', [5, 24, 24], 7120, 2880],
  ['hand_encoder_d2_bias', [24], 10000, 24],
  ['pose_projection_d2_kernel', [1, 24, 24], 10024, 576],
  ['pose_projection_d2_bias', [24], 10600, 24],
  ['hand_projection_d2_kernel', [1, 24, 24], 10624, 576],
  ['hand_projection_d2_bias', [24], 11200, 24],
  ['fusion_embedding_kernel', [48, 48], 11224, 2304],
  ['fusion_embedding_bias', [48], 13528, 48],
  ['phase_class_kernel', [48, 6], 13576, 288],
  ['phase_class_bias', [6], 13864, 6],
]);

function equalArray(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => (
      Array.isArray(value) ? equalArray(value, right[index]) : value === right[index]
    ));
}

function requireEqual(actual, expected, label) {
  const equal = Array.isArray(expected) ? equalArray(actual, expected) : actual === expected;
  if (!equal) throw new Error(`${label} mismatch`);
}

function bytesView(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError('weightBytes must be an ArrayBuffer or byte view');
}

async function sha256Hex(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : bytesView(value);
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto SHA-256 is unavailable');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validateContract(contract) {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    throw new Error('browser runtime contract must be an object');
  }
  requireEqual(contract.schema, 'physioai.bottle_grab_phasenet_v2_browser_runtime.v1', 'schema');
  requireEqual(contract.runtimeId, 'bottle_grab_phasenet_v2_browser_static_f32_v1', 'runtimeId');
  requireEqual(contract.status, 'experimental_phase_status_only_not_deployable', 'status');
  const source = contract.sourcePins || {};
  requireEqual(source.modelId, 'bottlegrab_posehand_phasenet_v2_same_lineage_video_expansion_train_only', 'modelId');
  requireEqual(source.contractId, 'bottle_grab_phasenet_v2_same_lineage_video_expansion', 'contractId');
  requireEqual(source.modelSha256, EXPECTED_MODEL_SHA256, 'model SHA-256');
  requireEqual(source.manifestSha256, EXPECTED_MANIFEST_SHA256, 'manifest SHA-256');
  requireEqual(source.contractSha256, EXPECTED_SOURCE_CONTRACT_SHA256, 'source contract SHA-256');
  requireEqual(source.modelGraphSha256, EXPECTED_GRAPH_SHA256, 'graph SHA-256');

  const input = contract.input || {};
  requireEqual(input.shape, [30, 20], 'input shape');
  requireEqual(input.samplingHz, 15, 'sampling rate');
  requireEqual(input.windowStrideFrames, 3, 'window stride');
  requireEqual(input.paddingAllowed, false, 'padding policy');
  requireEqual(input.staleFrameBridgingAllowed, false, 'stale-frame policy');
  requireEqual(input.featureOrder, PHASENET_V2_FEATURE_NAMES, 'feature order');
  requireEqual(input.featureOrderSha256, EXPECTED_FEATURE_ORDER_SHA256, 'feature-order SHA-256');
  requireEqual(input.inputContractSha256, EXPECTED_INPUT_CONTRACT_SHA256, 'input-contract SHA-256');
  requireEqual(input.anatomicalSide, 'left', 'anatomical side');
  requireEqual(input.interpolationOrPaddingInsideAccumulator, false, 'accumulator interpolation policy');

  const output = contract.output || {};
  requireEqual(output.classOrder, PHASENET_V2_CLASS_ORDER, 'class order');
  requireEqual(output.classOrderSha256, EXPECTED_CLASS_ORDER_SHA256, 'class-order SHA-256');
  requireEqual(output.classCount, 6, 'class count');
  requireEqual(output.decisionScope, 'phase_only', 'decision scope');
  requireEqual(output.supportedFaultTags, [], 'fault output policy');
  requireEqual(output.commentOrQualityOutputAllowed, false, 'comment output policy');

  const artifact = contract.browserArtifact || {};
  requireEqual(artifact.format, 'raw_float32_little_endian', 'browser weight format');
  requireEqual(artifact.sha256, EXPECTED_WEIGHT_SHA256, 'weight SHA-256');
  requireEqual(artifact.byteLength, EXPECTED_WEIGHT_BYTE_LENGTH, 'weight byte length');
  requireEqual(artifact.floatCount, EXPECTED_WEIGHT_FLOAT_COUNT, 'weight float count');
  if (!Array.isArray(artifact.weightLayout) || artifact.weightLayout.length !== EXPECTED_WEIGHT_LAYOUT.length) {
    throw new Error('weight layout mismatch');
  }
  artifact.weightLayout.forEach((entry, index) => {
    const [key, shape, offsetFloats, floatCount] = EXPECTED_WEIGHT_LAYOUT[index];
    requireEqual(entry.key, key, `weight layout ${index} key`);
    requireEqual(entry.shape, shape, `weight layout ${index} shape`);
    requireEqual(entry.offsetFloats, offsetFloats, `weight layout ${index} offset`);
    requireEqual(entry.floatCount, floatCount, `weight layout ${index} count`);
  });
  return contract;
}

function decodeWeights(weightBytes, contract) {
  const bytes = bytesView(weightBytes);
  if (bytes.byteLength !== EXPECTED_WEIGHT_BYTE_LENGTH) throw new Error('weight byte length mismatch');
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const all = new Float32Array(EXPECTED_WEIGHT_FLOAT_COUNT);
  for (let index = 0; index < all.length; index += 1) {
    all[index] = data.getFloat32(index * 4, true);
  }
  const tensors = new Map();
  for (const entry of contract.browserArtifact.weightLayout) {
    tensors.set(entry.key, {
      values: all.subarray(entry.offsetFloats, entry.offsetFloats + entry.floatCount),
      shape: entry.shape.slice(),
    });
  }
  return tensors;
}

export function validatePhaseNetV2Window(window) {
  if (!Array.isArray(window) || window.length !== PHASENET_V2_SEQUENCE_LENGTH) {
    throw new TypeError('PhaseNet V2 window must contain exactly 30 frames');
  }
  return window.map((row, frameIndex) => {
    if (!Array.isArray(row) || row.length !== PHASENET_V2_FEATURE_NAMES.length) {
      throw new TypeError(`PhaseNet V2 frame ${frameIndex} must contain exactly 20 features`);
    }
    return row.map((value, featureIndex) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`PhaseNet V2 feature ${frameIndex}:${featureIndex} must be finite`);
      }
      return value;
    });
  });
}

function layerNorm(input, gamma, beta) {
  return input.map((row) => {
    const mean = row.reduce((sum, value) => sum + value, 0) / row.length;
    const variance = row.reduce((sum, value) => sum + (value - mean) ** 2, 0) / row.length;
    const inverse = 1 / Math.sqrt(variance + 0.001);
    return Float32Array.from(row, (value, index) => Math.fround((value - mean) * inverse * gamma[index] + beta[index]));
  });
}

function conv1d(input, kernel, bias, { kernelSize, inChannels, outChannels, dilation = 1, relu = false }) {
  const output = Array.from({ length: input.length }, () => new Float32Array(outChannels));
  for (let time = 0; time < input.length; time += 1) {
    for (let out = 0; out < outChannels; out += 1) {
      let sum = bias[out];
      for (let k = 0; k < kernelSize; k += 1) {
        const sourceTime = time - dilation * (kernelSize - 1 - k);
        if (sourceTime < 0) continue;
        const source = input[sourceTime];
        const kernelBase = k * inChannels * outChannels + out;
        for (let channel = 0; channel < inChannels; channel += 1) {
          sum += source[channel] * kernel[kernelBase + channel * outChannels];
        }
      }
      output[time][out] = Math.fround(relu && sum < 0 ? 0 : sum);
    }
  }
  return output;
}

function addRelu(left, right) {
  return left.map((row, time) => Float32Array.from(
    row,
    (value, channel) => Math.fround(Math.max(0, value + right[time][channel])),
  ));
}

function dense(input, kernel, bias, units, relu = false) {
  const output = new Float32Array(units);
  for (let out = 0; out < units; out += 1) {
    let sum = bias[out];
    for (let index = 0; index < input.length; index += 1) {
      sum += input[index] * kernel[index * units + out];
    }
    output[out] = Math.fround(relu && sum < 0 ? 0 : sum);
  }
  return output;
}

function softmax(logits) {
  const maximum = Math.max(...logits);
  const exponentials = [...logits].map((value) => Math.exp(value - maximum));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return exponentials.map((value) => value / total);
}

function createRuntime(contract, tensors) {
  const tensor = (key) => {
    const value = tensors.get(key);
    if (!value) throw new Error(`missing frozen browser tensor: ${key}`);
    return value.values;
  };

  function encode(stream, prefix) {
    const normalized = layerNorm(stream, tensor(`${prefix}_norm_gamma`), tensor(`${prefix}_norm_beta`));
    const encodedD1 = conv1d(
      normalized,
      tensor(`${prefix}_encoder_d1_kernel`),
      tensor(`${prefix}_encoder_d1_bias`),
      { kernelSize: 5, inChannels: 10, outChannels: 24, dilation: 1, relu: true },
    );
    const projectedD1 = conv1d(
      encodedD1,
      tensor(`${prefix}_projection_d1_kernel`),
      tensor(`${prefix}_projection_d1_bias`),
      { kernelSize: 1, inChannels: 24, outChannels: 24 },
    );
    const residualD1 = conv1d(
      normalized,
      tensor(`${prefix}_residual_d1_kernel`),
      tensor(`${prefix}_residual_d1_bias`),
      { kernelSize: 1, inChannels: 10, outChannels: 24 },
    );
    const outputD1 = addRelu(projectedD1, residualD1);
    const encodedD2 = conv1d(
      outputD1,
      tensor(`${prefix}_encoder_d2_kernel`),
      tensor(`${prefix}_encoder_d2_bias`),
      { kernelSize: 5, inChannels: 24, outChannels: 24, dilation: 2, relu: true },
    );
    const projectedD2 = conv1d(
      encodedD2,
      tensor(`${prefix}_projection_d2_kernel`),
      tensor(`${prefix}_projection_d2_bias`),
      { kernelSize: 1, inChannels: 24, outChannels: 24 },
    );
    return addRelu(projectedD2, outputD1).at(-1);
  }

  function predict(window) {
    const validated = validatePhaseNetV2Window(window);
    const pose = validated.map((row) => Float32Array.from(row.slice(0, 10), Math.fround));
    const hand = validated.map((row) => Float32Array.from(row.slice(10), Math.fround));
    const poseContext = encode(pose, 'pose');
    const handContext = encode(hand, 'hand');
    const fusion = Float32Array.from([...poseContext, ...handContext]);
    const embedding = dense(
      fusion,
      tensor('fusion_embedding_kernel'),
      tensor('fusion_embedding_bias'),
      48,
      true,
    );
    const logits = dense(embedding, tensor('phase_class_kernel'), tensor('phase_class_bias'), 6);
    const probabilities = softmax(logits);
    const argmaxIndex = probabilities.reduce(
      (best, value, index) => (value > probabilities[best] ? index : best),
      0,
    );
    return Object.freeze({
      modelId: contract.sourcePins.modelId,
      endpointFrameIndex: 29,
      probabilities: Object.freeze(probabilities),
      argmaxIndex,
      phase: PHASENET_V2_CLASS_ORDER[argmaxIndex],
    });
  }

  return Object.freeze({
    modelId: contract.sourcePins.modelId,
    inputShape: Object.freeze([30, 20]),
    featureNames: Object.freeze([...PHASENET_V2_FEATURE_NAMES]),
    classOrder: Object.freeze([...PHASENET_V2_CLASS_ORDER]),
    decisionScope: 'phase_only',
    predict,
  });
}

export async function loadPhaseNetV2RuntimeFromBytes({ contractText, weightBytes }) {
  if (typeof contractText !== 'string') throw new TypeError('contractText must be a string');
  const contractHash = await sha256Hex(contractText);
  requireEqual(contractHash, EXPECTED_RUNTIME_CONTRACT_SHA256, 'browser runtime contract SHA-256');
  let contract;
  try {
    contract = JSON.parse(contractText);
  } catch (error) {
    throw new Error(`invalid browser runtime contract JSON: ${error.message}`);
  }
  validateContract(contract);
  const weightHash = await sha256Hex(weightBytes);
  requireEqual(weightHash, EXPECTED_WEIGHT_SHA256, 'weight artifact SHA-256');
  return createRuntime(contract, decodeWeights(weightBytes, contract));
}

// Native-device adapter: Metro exposes the frozen contract as a JSON module rather
// than preserving its source whitespace. Keep all semantic/source-pin validation,
// while allowing the app to load the exact bundled contract object without inventing
// a second model format. This remains phase-only and experimental.
export function loadPhaseNetV2RuntimeForDevice({ contract, weightBytes }) {
  validateContract(contract);
  const bytes = bytesView(weightBytes);
  return createRuntime(contract, decodeWeights(bytes, contract));
}

export async function loadPhaseNetV2Runtime({
  contractUrl,
  weightUrl,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('browser fetch is unavailable');
  if (!contractUrl || !weightUrl) throw new Error('contractUrl and weightUrl are required in the native bundle');
  const [contractResponse, weightResponse] = await Promise.all([
    fetchImpl(contractUrl),
    fetchImpl(weightUrl),
  ]);
  if (!contractResponse?.ok) throw new Error(`failed to load PhaseNet V2 runtime contract: ${contractResponse?.status}`);
  if (!weightResponse?.ok) throw new Error(`failed to load PhaseNet V2 browser weights: ${weightResponse?.status}`);
  const [contractText, weightBytes] = await Promise.all([
    contractResponse.text(),
    weightResponse.arrayBuffer(),
  ]);
  return loadPhaseNetV2RuntimeFromBytes({ contractText, weightBytes });
}
