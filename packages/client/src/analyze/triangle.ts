import type { CapturePoint, ShapePerfectionMetrics } from '../types';

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

/**
 * Compute curvature at each point using angle formed by neighbors
 * within a smoothing window.
 */
function computeCurvature(points: CapturePoint[], window: number): number[] {
  const curvatures: number[] = new Array(points.length).fill(0);
  for (let i = window; i < points.length - window; i++) {
    const prev = points[i - window];
    const curr = points[i];
    const next = points[i + window];

    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;

    const dot = v1x * v2x + v1y * v2y;
    const cross = v1x * v2y - v1y * v2x;
    curvatures[i] = Math.abs(Math.atan2(cross, dot));
  }
  return curvatures;
}

/**
 * Find N peaks in curvature with minimum separation.
 */
function findPeaks(curvatures: number[], n: number, minSep: number): number[] {
  const indexed = curvatures.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => b.v - a.v);

  const peaks: number[] = [];
  for (const { i } of indexed) {
    if (peaks.length >= n) break;
    if (peaks.every(p => Math.abs(p - i) >= minSep)) {
      peaks.push(i);
    }
  }
  return peaks.sort((a, b) => a - b);
}

function angleBetween(a: { x: number; y: number }, vertex: { x: number; y: number }, b: { x: number; y: number }): number {
  const v1x = a.x - vertex.x;
  const v1y = a.y - vertex.y;
  const v2x = b.x - vertex.x;
  const v2y = b.y - vertex.y;
  const dot = v1x * v2x + v1y * v2y;
  const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
  const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
  if (mag1 < 0.001 || mag2 < 0.001) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2))));
}

/**
 * Compute RMS perpendicular deviation of points from a line segment.
 */
function edgeStraightness(points: CapturePoint[], from: number, to: number): number {
  const a = points[from];
  const b = points[to];
  const lineLen = dist(a, b);
  if (lineLen < 0.001) return 0;

  let sumSq = 0;
  let count = 0;
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  for (let i = start + 1; i < end; i++) {
    const p = points[i];
    const perpDist = Math.abs(
      (b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)
    ) / lineLen;
    sumSq += perpDist * perpDist;
    count++;
  }
  return count > 0 ? Math.sqrt(sumSq / count) : 0;
}

export function analyzeTriangle(points: CapturePoint[]): ShapePerfectionMetrics {
  const fail: ShapePerfectionMetrics = {
    shapeType: 'triangle',
    matchScore: 0,
    perfectionScore: 0,
    details: { angleDev: Math.PI, sideDev: 1, edgeStraightness: 100, closureGap: 1 },
  };

  if (points.length < 10) return fail;

  const smoothWindow = Math.max(2, Math.floor(points.length * 0.04));
  const curvatures = computeCurvature(points, smoothWindow);
  const minSep = Math.floor(points.length * 0.15);
  const corners = findPeaks(curvatures, 3, minSep);

  if (corners.length < 3) return fail;

  const vertices = corners.map(i => points[i]);

  // Interior angles
  const angles = [
    angleBetween(vertices[2], vertices[0], vertices[1]),
    angleBetween(vertices[0], vertices[1], vertices[2]),
    angleBetween(vertices[1], vertices[2], vertices[0]),
  ];

  // Side lengths
  const sides = [
    dist(vertices[0], vertices[1]),
    dist(vertices[1], vertices[2]),
    dist(vertices[2], vertices[0]),
  ];

  const meanAngle = angles.reduce((s, a) => s + a, 0) / 3;
  const angleDev = Math.sqrt(angles.reduce((s, a) => s + (a - meanAngle) ** 2, 0) / 3);

  const meanSide = sides.reduce((s, l) => s + l, 0) / 3;
  const sideDev = meanSide > 0 ? Math.sqrt(sides.reduce((s, l) => s + (l - meanSide) ** 2, 0) / 3) / meanSide : 1;

  // Edge straightness (average across 3 edges)
  const straightness = [
    edgeStraightness(points, corners[0], corners[1]),
    edgeStraightness(points, corners[1], corners[2]),
    edgeStraightness(points, corners[2], corners.length > 2 ? corners[0] + points.length : corners[0]),
  ];
  // For the wrap-around edge, we measure from corner[2] to end + start to corner[0]
  // Simplified: just measure the direct segment
  straightness[2] = edgeStraightness(points, corners[2], points.length - 1);

  const avgStraightness = straightness.reduce((s, v) => s + v, 0) / 3;

  // Closure gap
  const closureGap = dist(points[0], points[points.length - 1]) / (meanSide || 1);

  // Match score: does it look like a triangle?
  const angleSum = angles.reduce((s, a) => s + a, 0);
  const angleSumDev = Math.abs(angleSum - Math.PI) / Math.PI;
  const matchScore = Math.max(0, Math.min(1,
    (1 - angleSumDev * 3) * 0.5 +
    (angleDev < 0.5 ? 1 : 0.5 / angleDev) * 0.3 +
    (avgStraightness < 10 ? 1 : 10 / avgStraightness) * 0.2
  ));

  // Perfection score: how geometrically perfect
  // Perfect equilateral: angleDev=0, sideDev=0, straightness=0
  const anglePerf = Math.max(0, 1 - angleDev * 5);
  const sidePerf = Math.max(0, 1 - sideDev * 5);
  const edgePerf = Math.max(0, 1 - avgStraightness * 0.5);
  const perfectionScore = Math.min(1, anglePerf * 0.35 + sidePerf * 0.35 + edgePerf * 0.3);

  return {
    shapeType: 'triangle',
    matchScore,
    perfectionScore,
    details: { angleDev, sideDev, edgeStraightness: avgStraightness, closureGap },
  };
}
