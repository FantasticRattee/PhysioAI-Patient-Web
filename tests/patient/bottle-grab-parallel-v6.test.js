jest.mock('react-native', () => ({
  Image: { resolveAssetSource: () => ({ uri: 'http://localhost/phasenet.f32' }) },
}), { virtual: true });
jest.mock('../../Patient/assets/models/phasenet_v2_browser_weights.f32', () => 1);

import {
  BOTTLE_GRAB_V6_CONTRACT,
  createBottleGrabParallelV6Tracker,
} from '../../Patient/src/ai/bottleGrab/BottleGrabParallelV6Tracker.js';

function point(x, y, visibility = 0.98) {
  return { x, y, z: 0, visibility };
}

function pose() {
  const landmarks = Array.from({ length: 33 }, () => point(0.5, 0.5));
  landmarks[11] = point(0.5, 0.4);
  landmarks[12] = point(0.6, 0.4);
  landmarks[13] = point(0.4, 0.5);
  landmarks[14] = point(0.7, 0.5);
  landmarks[15] = point(0.3, 0.6);
  landmarks[16] = point(0.8, 0.6);
  landmarks[17] = point(0.31, 0.58);
  landmarks[19] = point(0.32, 0.57);
  landmarks[21] = point(0.33, 0.56);
  landmarks[23] = point(0.48, 0.75);
  landmarks[24] = point(0.62, 0.75);
  return landmarks;
}

function hand({ closed = false } = {}) {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.3, y: 0.6, z: 0 }));
  landmarks[0] = { x: 0.3, y: 0.6, z: 0 };
  landmarks[9] = { x: 0.3, y: 0.5, z: 0 };
  if (!closed) {
    landmarks[1] = { x: 0.34, y: 0.58, z: 0 };
    landmarks[2] = { x: 0.38, y: 0.56, z: 0 };
    landmarks[3] = { x: 0.42, y: 0.54, z: 0 };
    landmarks[4] = { x: 0.46, y: 0.52, z: 0 };
    for (const [mcp, x] of [[5, 0.32], [9, 0.34], [13, 0.36], [17, 0.38]]) {
      landmarks[mcp] = { x, y: 0.56, z: 0 };
      landmarks[mcp + 1] = { x, y: 0.51, z: 0 };
      landmarks[mcp + 2] = { x, y: 0.46, z: 0 };
      landmarks[mcp + 3] = { x, y: 0.41, z: 0 };
    }
    landmarks[8] = { x: 0.32, y: 0.41, z: 0 };
    return landmarks;
  }
  landmarks[1] = { x: 0.32, y: 0.58, z: 0 };
  landmarks[2] = { x: 0.34, y: 0.56, z: 0 };
  landmarks[3] = { x: 0.36, y: 0.54, z: 0 };
  landmarks[4] = { x: 0.35, y: 0.52, z: 0 };
  for (const [mcp, x] of [[5, 0.32], [9, 0.34], [13, 0.36], [17, 0.38]]) {
    landmarks[mcp] = { x, y: 0.56, z: 0 };
    landmarks[mcp + 1] = { x: x + 0.03, y: 0.53, z: 0 };
    landmarks[mcp + 2] = { x: x + 0.04, y: 0.56, z: 0 };
    landmarks[mcp + 3] = { x: x + 0.01, y: 0.58, z: 0 };
  }
  landmarks[8] = { x: 0.36, y: 0.52, z: 0 };
  return landmarks;
}

function push(tracker, timestampMs, closed = false, overrides = {}) {
  return tracker.push({
    poseLandmarks: pose(),
    handLandmarks: hand({ closed }),
    handSide: 'Left',
    handScore: 0.99,
    timestampMs,
    countingEnabled: true,
    ...overrides,
  });
}

function completeOne(tracker, start = 0) {
  let timestampMs = start;
  let output;
  for (let i = 0; i < 3; i += 1) {
    timestampMs += 67;
    output = push(tracker, timestampMs, false);
  }
  for (let i = 0; i < 3; i += 1) {
    timestampMs += 67;
    output = push(tracker, timestampMs, true);
  }
  for (let i = 0; i < 3; i += 1) {
    timestampMs += 67;
    output = push(tracker, timestampMs, false);
  }
  return { output, timestampMs };
}

describe('App V6 PWA parallel Bottle Grab tracker', () => {
  test('uses an explicit parallel contract without mutating Baseline #4', () => {
    expect(BOTTLE_GRAB_V6_CONTRACT).toMatchObject({
      schema: 'physioai.bottle_grab_parallel_v6_pwa.v1',
      counterMode: 'parallel_geometry_first',
      geometryFirst: { ownerOf: 'experimental.repCount' },
      phaseContext: { canOwnRepCount: false, canBlockGeometryCount: false },
    });
  });

  test('Geometry First owns repCount while phase context is unavailable', () => {
    const tracker = createBottleGrabParallelV6Tracker();
    const { output } = completeOne(tracker);

    expect(output).toMatchObject({
      counterMode: 'parallel_geometry_first',
      repCount: 1,
      geometryRepCount: 1,
      geometryFirst: { repCount: 1 },
    });
    expect(output.phaseContext).toEqual(expect.objectContaining({
      status: expect.any(String),
    }));
    expect(output.phaseContextAvailable).toBe(false);
    expect(output.phaseContextUnavailableReason).toEqual(expect.any(String));
  });

  test('a PhaseNet/reset context does not erase a completed Geometry First rep', () => {
    const tracker = createBottleGrabParallelV6Tracker();
    const { timestampMs } = completeOne(tracker);

    const output = push(tracker, timestampMs + 500, false, {
      handLandmarks: null,
      handSide: null,
      handScore: 0,
    });

    expect(output).toMatchObject({
      counterMode: 'parallel_geometry_first',
      repCount: 1,
      geometryRepCount: 1,
    });
  });

  test('camera source reset clears partial state but retains completed totals', () => {
    const tracker = createBottleGrabParallelV6Tracker();
    const { timestampMs } = completeOne(tracker);
    push(tracker, timestampMs + 67, true);

    tracker.resetForNewCaptureSource('camera_lens_changed');
    const output = push(tracker, timestampMs + 134, false);

    expect(output).toMatchObject({
      counterMode: 'parallel_geometry_first',
      repCount: 1,
      geometryRepCount: 1,
      geometryFirst: { status: 'collecting_rest' },
    });
  });
});
