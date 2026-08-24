// Convert normalized MediaPipe landmarks into the same pixel coordinate space
// as the VisionCamera preview.  Keeping this in one pure helper prevents the
// pose and hand overlays from silently using different rotation/crop logic.

const finite = (value) => Number.isFinite(Number(value));

export function mapLandmarksToView(points, viewCoordinator, result) {
  if (!Array.isArray(points) || !points.length || !viewCoordinator?.convertPoint) return null;

  let frame;
  try {
    frame = viewCoordinator.getFrameDims
      ? viewCoordinator.getFrameDims(result)
      : { width: Number(result?.inputImageWidth), height: Number(result?.inputImageHeight) };
  } catch {
    return null;
  }
  if (!finite(frame?.width) || !finite(frame?.height) || frame.width <= 0 || frame.height <= 0) return null;

  try {
    return points.map((point) => {
      if (!point || !finite(point.x) || !finite(point.y)) return null;
      const converted = viewCoordinator.convertPoint(frame, point);
      if (!finite(converted?.x) || !finite(converted?.y)) return null;
      return {
        x: Number(converted.x),
        y: Number(converted.y),
        visibility: point.visibility ?? point.presence ?? 1,
      };
    });
  } catch {
    return null;
  }
}
