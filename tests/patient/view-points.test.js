import { mapLandmarksToView } from '../../Patient/src/pose/viewPoints.js';

describe('MediaPipe view-point mapping', () => {
  test('uses the SDK coordinator for rotation, mirror, and cover crop', () => {
    const calls = [];
    const coordinator = {
      getFrameDims: () => ({ width: 100, height: 200 }),
      convertPoint: (frame, point) => {
        calls.push({ frame, point });
        return { x: point.x * 10 + 4, y: point.y * 20 + 8 };
      },
    };
    expect(mapLandmarksToView([{ x: 0.2, y: 0.3, visibility: 0.9 }], coordinator, {
      inputImageWidth: 200,
      inputImageHeight: 100,
    })).toEqual([{ x: 6, y: 14, visibility: 0.9 }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].frame).toEqual({ width: 100, height: 200 });
  });

  test('fails closed when frame dimensions or points are invalid', () => {
    const coordinator = { getFrameDims: () => ({ width: 0, height: 0 }), convertPoint: jest.fn() };
    expect(mapLandmarksToView([{ x: 0.2, y: 0.3 }], coordinator, {})).toBeNull();
    expect(coordinator.convertPoint).not.toHaveBeenCalled();
  });
});
