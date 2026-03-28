import type { CapturePoint, ShapePerfectionMetrics } from '../types';

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

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

export function analyzeSquare(points: CapturePoint[]): ShapePerfectionMetrics {
  const fail: ShapePerfectionMetrics = {
    shapeType: 'square',
    matchScore: 0,
    perfectionScore: 0,
    details: { angleDev: Math.PI, sideDev: 1, edgeStraightness: 100, parallelism: 0, closureGap: 1 },
  };

  if (points.length < 12) return fail;

  const smoothWindow = Math.max(2, Math.floor(points.length * 0.04));
  const curvatures = computeCurvature(points, smoothWindow);
  const minSep = Math.floor(points.length * 0.12);
  const corners = findPeaks(curvatures, 4, minSep);

  if (corners.length < 4) return fail;

  const vertices = corners.map(i => points[i]);

  // Interior angles (should be ~90 degrees = PI/2)
  const angles = [
    angleBetween(vertices[3], vertices[0], vertices[1]),
    angleBetween(vertices[0], vertices[1], vertices[2]),
    angleBetween(vertices[1], vertices[2], vertices[3]),
    angleBetween(vertices[2], vertices[3], vertices[0]),
  ];

  // Side lengths
  const sides = [
    dist(vertices[0], vertices[1]),
    dist(vertices[1], vertices[2]),
    dist(vertices[2], vertices[3]),
    dist(vertices[3], vertices[0]),
  ];

  const targetAngle = Math.PI / 2;
  const angleDev = Math.sqrt(angles.reduce((s, a) => s + (a - targetAngle) ** 2, 0) / 4);

  const meanSide = sides.reduce((s, l) => s + l, 0) / 4;
  const sideDev = meanSide > 0 ? Math.sqrt(sides.reduce((s, l) => s + (l - meanSide) ** 2, 0) / 4) / meanSide : 1;

  // Edge straightness
  const straightness: number[] = [];
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    straightness.push(edgeStraightness(points, corners[i], corners[next] > corners[i] ? corners[next] : points.length - 1));
  }
  const avgStraightness = straightness.reduce((s, v) => s + v, 0) / 4;

  // Parallelism: compare opposite side angles
  function sideAngle(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.atan2(b.y - a.y, b.x - a.x);
  }
  const a01 = sideAngle(vertices[0], vertices[1]);
  const a23 = sideAngle(vertices[2], vertices[3]);
  const a12 = sideAngle(vertices[1], vertices[2]);
  const a30 = sideAngle(vertices[3], vertices[0]);
  const par1 = Math.abs(Math.abs(a01 - a23) - Math.PI) < 0.5 ? 1 - Math.abs(Math.abs(a01 - a23) - Math.PI) * 2 : 0;
  const par2 = Math.abs(Math.abs(a12 - a30) - Math.PI) < 0.5 ? 1 - Math.abs(Math.abs(a12 - a30) - Math.PI) * 2 : 0;
  const parallelism = (par1 + par2) / 2;

  // Closure gap
  const closureGap = dist(points[0], points[points.length - 1]) / (meanSide || 1);

  // Match score
  const angleSum = angles.reduce((s, a) => s + a, 0);
  const angleSumDev = Math.abs(angleSum - 2 * Math.PI) / (2 * Math.PI);
  const matchScore = Math.max(0, Math.min(1,
    (1 - angleSumDev * 3) * 0.4 +
    (angleDev < 0.5 ? 1 : 0.5 / angleDev) * 0.3 +
    (avgStraightness < 10 ? 1 : 10 / avgStraightness) * 0.15 +
    parallelism * 0.15
  ));

  // Perfection score
  const anglePerf = Math.max(0, 1 - angleDev * 5);
  const sidePerf = Math.max(0, 1 - sideDev * 5);
  const edgePerf = Math.max(0, 1 - avgStraightness * 0.5);
  const perfectionScore = Math.min(1,
    anglePerf * 0.3 + sidePerf * 0.3 + edgePerf * 0.25 + parallelism * 0.15
  );

  return {
    shapeType: 'square',
    matchScore,
    perfectionScore,
    details: { angleDev, sideDev, edgeStraightness: avgStraightness, parallelism, closureGap },
  };
}
