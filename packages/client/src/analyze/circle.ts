import type { CapturePoint, ShapePerfectionMetrics } from '../types';

/**
 * Kasa algebraic least-squares circle fitting.
 * Returns { cx, cy, r } for the best-fit circle.
 */
function fitCircle(points: CapturePoint[]): { cx: number; cy: number; r: number } {
  const n = points.length;
  const xMean = points.reduce((s, p) => s + p.x, 0) / n;
  const yMean = points.reduce((s, p) => s + p.y, 0) / n;

  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const p of points) {
    const u = p.x - xMean;
    const v = p.y - yMean;
    suu += u * u;
    svv += v * v;
    suv += u * v;
    suuu += u * u * u;
    svvv += v * v * v;
    suvv += u * v * v;
    svuu += v * u * u;
  }

  // Solve 2x2 linear system:
  // | suu  suv | | uc |   | 0.5*(suuu + suvv) |
  // | suv  svv | | vc | = | 0.5*(svvv + svuu) |
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-10) {
    return { cx: xMean, cy: yMean, r: 0 };
  }

  const rhs1 = 0.5 * (suuu + suvv);
  const rhs2 = 0.5 * (svvv + svuu);
  const uc = (svv * rhs1 - suv * rhs2) / det;
  const vc = (suu * rhs2 - suv * rhs1) / det;
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);

  return { cx: uc + xMean, cy: vc + yMean, r };
}

export function analyzeCircle(points: CapturePoint[]): ShapePerfectionMetrics {
  if (points.length < 5) {
    return {
      shapeType: 'circle',
      matchScore: 0,
      perfectionScore: 0,
      details: { rmsError: 1, closureGap: 1, radiusVariation: 1, angularCoverage: 0 },
    };
  }

  const { cx, cy, r } = fitCircle(points);
  if (r < 1) {
    return {
      shapeType: 'circle',
      matchScore: 0,
      perfectionScore: 0,
      details: { rmsError: 1, closureGap: 1, radiusVariation: 1, angularCoverage: 0 },
    };
  }

  // RMS error of points to fitted circle
  const radii = points.map(p => Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2));
  const errors = radii.map(ri => Math.abs(ri - r));
  const rmsError = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length);
  const normalizedRms = rmsError / r;

  // Closure gap: distance between first and last point relative to radius
  const first = points[0];
  const last = points[points.length - 1];
  const closureGap = Math.sqrt((last.x - first.x) ** 2 + (last.y - first.y) ** 2) / r;

  // Radius variation: std dev of per-point radii / mean radius
  const meanR = radii.reduce((s, ri) => s + ri, 0) / radii.length;
  const radiusStdDev = Math.sqrt(radii.reduce((s, ri) => s + (ri - meanR) ** 2, 0) / radii.length);
  const radiusVariation = radiusStdDev / meanR;

  // Angular coverage: fraction of 360 degrees covered
  const angles = points.map(p => Math.atan2(p.y - cy, p.x - cx));
  const sortedAngles = [...angles].sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 1; i < sortedAngles.length; i++) {
    maxGap = Math.max(maxGap, sortedAngles[i] - sortedAngles[i - 1]);
  }
  // Wrap-around gap
  maxGap = Math.max(maxGap, (2 * Math.PI) - (sortedAngles[sortedAngles.length - 1] - sortedAngles[0]));
  const angularCoverage = 1 - maxGap / (2 * Math.PI);

  // Closure: how close first and last points are (0 = perfectly closed, higher = open)
  // A closed circle should have closureGap < ~0.3 (relative to radius)
  // Hard fail: open shapes must not pass
  if (closureGap > 0.25) {
    return {
      shapeType: 'circle',
      matchScore: 0,
      perfectionScore: 0,
      details: { rmsError: normalizedRms, closureGap, radiusVariation, angularCoverage },
    };
  }

  const closureComponent = closureGap < 0.2 ? 1 : closureGap < 0.35 ? 0.6 : 0.2;

  // Match score: does this look like a circle?
  // Require low RMS error AND low radius variation AND closed shape
  const rmsComponent = normalizedRms < 0.15 ? 1 : normalizedRms < 0.3 ? 0.5 : 0.15 / normalizedRms;
  const rvComponent = radiusVariation < 0.1 ? 1 : radiusVariation < 0.25 ? 0.5 : 0.1 / radiusVariation;
  const matchScore = Math.max(0, Math.min(1,
    rmsComponent * 0.3 +
    rvComponent * 0.25 +
    Math.min(1, angularCoverage / 0.7) * 0.2 +
    closureComponent * 0.25
  ));

  // Perfection score: how geometrically perfect (low error = high perfection)
  // Human circles: normalizedRms ~0.03-0.08, bot circles: < 0.01
  const perfectionScore = Math.max(0, Math.min(1, 1 - normalizedRms * 12));

  return {
    shapeType: 'circle',
    matchScore,
    perfectionScore,
    details: { rmsError: normalizedRms, closureGap, radiusVariation, angularCoverage },
  };
}
