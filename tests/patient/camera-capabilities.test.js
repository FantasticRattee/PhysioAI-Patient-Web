import {
  cameraCapabilityKey,
  cameraDeviceFilter,
  pickCameraLens,
  resolveCameraLenses,
} from '../../Patient/src/pose/cameraCapabilities.js';

const device = (overrides = {}) => ({
  id: 'back-triple',
  position: 'back',
  physicalDevices: ['ultra-wide-angle-camera', 'wide-angle-camera', 'telephoto-camera'],
  minZoom: 0.5,
  neutralZoom: 1,
  maxZoom: 6,
  ...overrides,
});

describe('native camera capability policy', () => {
  test('requests the logical multi-camera only for the rear position', () => {
    expect(cameraDeviceFilter('front')).toBeUndefined();
    expect(cameraDeviceFilter('back')).toEqual({
      physicalDevices: [
        'ultra-wide-angle-camera',
        'wide-angle-camera',
        'telephoto-camera',
      ],
    });
  });

  test('exposes only the hardware-reported rear lenses', () => {
    expect(resolveCameraLenses(device())).toMatchObject([
      { id: 'ultra-wide', label: '0.5×', zoom: 0.5 },
      { id: 'wide', label: '1×', zoom: 1 },
      { id: 'tele', label: '3×', zoom: 3 },
      { id: 'max', label: '6×', zoom: 6 },
    ]);
    expect(resolveCameraLenses(device({ physicalDevices: ['wide-angle-camera'], maxZoom: 1 })))
      .toEqual([{ id: 'wide', label: '1×', zoom: 1, physicalDevice: 'wide-angle-camera' }]);
  });

  test('does not advertise ultra-wide when the logical device cannot zoom to 0.5x', () => {
    expect(resolveCameraLenses(device({ minZoom: 1 }))).toEqual([
      { id: 'wide', label: '1×', zoom: 1, physicalDevice: 'wide-angle-camera' },
      { id: 'tele', label: '3×', zoom: 3, physicalDevice: 'telephoto-camera' },
      { id: 'max', label: '6×', zoom: 6, physicalDevice: 'digital-zoom' },
    ]);
  });

  test('front camera exposes its wide preset and reported runtime digital max', () => {
    expect(resolveCameraLenses({
      id: 'front', position: 'front', physicalDevices: ['wide-angle-camera'],
      minZoom: 1, neutralZoom: 1, maxZoom: 2,
    }, 'front')).toEqual([
      { id: 'wide', label: '1×', zoom: 1, physicalDevice: 'wide-angle-camera' },
      { id: 'max', label: '2×', zoom: 2, physicalDevice: 'digital-zoom' },
    ]);
  });

  test('falls back to wide when a saved lens is unavailable', () => {
    const lenses = resolveCameraLenses(device());
    expect(pickCameraLens(lenses, 'missing')).toMatchObject({ id: 'wide', zoom: 1 });
    expect(cameraCapabilityKey({ position: 'back', deviceId: 'back-triple', selectedLens: 'wide', lenses }))
      .toContain('back:back-triple:wide');
  });
});
