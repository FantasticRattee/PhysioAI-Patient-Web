import {
  isIOSLike,
  loadPwaModelAssetBuffer,
  pwaCameraErrorDetail,
  pwaVideoConstraints,
  requestWebCameraStream,
  waitForVideoReady,
} from '../../Patient/src/pose/PwaCameraSupport.web.js';

describe('PWA camera support', () => {
  test('uses an iPhone-friendly front-camera profile without exact device constraints', () => {
    const ios = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)' };
    const desktop = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)' };

    expect(isIOSLike(ios)).toBe(true);
    expect(pwaVideoConstraints(ios)).toMatchObject({
      video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } },
      audio: false,
    });
    expect(pwaVideoConstraints(desktop).video.width.ideal).toBe(1280);
  });

  test('acquires a video stream through the direct browser-action seam', async () => {
    const stream = {
      getVideoTracks: () => [{ kind: 'video' }],
      getTracks: () => [],
    };
    const getUserMedia = jest.fn().mockResolvedValue(stream);
    const navigatorLike = { userAgent: 'iPhone', mediaDevices: { getUserMedia } };

    await expect(requestWebCameraStream({ navigatorLike })).resolves.toBe(stream);
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({
      video: expect.objectContaining({ facingMode: { ideal: 'user' } }),
      audio: false,
    }));
  });

  test('preserves the stage identifier for browser and model failures', async () => {
    await expect(requestWebCameraStream({ navigatorLike: {} }))
      .rejects.toThrow(/^camera_request:/);

    await expect(loadPwaModelAssetBuffer('/model.task', 'Pose', async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }))).resolves.toEqual(new Uint8Array([1, 2, 3]));

    expect(pwaCameraErrorDetail({ stage: 'pose_inference', message: 'frame failed' }))
      .toContain('pose_inference');
    await expect(waitForVideoReady({ readyState: 2 })).resolves.toBeUndefined();
  });
});
