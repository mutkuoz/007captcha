import type { CursorPoint, ShapeType } from '../types';

// --- Circle analysis ---

function fitCircle(points: CursorPoint[]): { cx: number; cy: number; r: number } {
  const n = points.length;
  const xMean = points.reduce((s, p) => s + p.x, 0) / n;
  const yMean = points.reduce((s, p) => s + p.y, 0) / n;

  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const p of points) {
    const u = p.x - xMean;
    const v = p.y - yMean;
    suu += u * u; svv += v * v; suv += u * v;
    suuu += u * u * u; svvv += v * v * v;
    suvv += u * v * v; svuu += v * u * u;
  }

  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-10) return { cx: xMean, cy: yMean, r: 0 };

  const rhs1 = 0.5 * (suuu + suvv);
  const rhs2 = 0.5 * (svvv + svuu);
  const uc = (svv * rhs1 - suv * rhs2) / det;
  const vc = (suu * rhs2 - suv * rhs1) / det;
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
  return { cx: uc + xMean, cy: vc + yMean, r };
}

function analyzeCircle(points: CursorPoint[]): ShapeAnalysisResult {
  const fail: ShapeAnalysisResult = { matchScore: 0, perfectionScore: 0 };
  if (points.length < 5) return fail;

  const { cx, cy, r } = fitCircle(points);
  if (r < 1) return fail;

  const radii = points.map(p => Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2));
  const errors = radii.map(ri => Math.abs(ri - r));
  const rmsError = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length);
  const normalizedRms = rmsError / r;

  const first = points[0], last = points[points.length - 1];
  const closureGap = Math.sqrt((last.x - first.x) ** 2 + (last.y - first.y) ** 2) / r;

  const meanR = radii.reduce((s, ri) => s + ri, 0) / radii.length;
  const radiusStdDev = Math.sqrt(radii.reduce((s, ri) => s + (ri - meanR) ** 2, 0) / radii.length);
  const radiusVariation = radiusStdDev / meanR;

  const angles = points.map(p => Math.atan2(p.y - cy, p.x - cx));
  const sortedAngles = [...angles].sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 1; i < sortedAngles.length; i++) {
    maxGap = Math.max(maxGap, sortedAngles[i] - sortedAngles[i - 1]);
  }
  maxGap = Math.max(maxGap, (2 * Math.PI) - (sortedAngles[sortedAngles.length - 1] - sortedAngles[0]));
  const angularCoverage = 1 - maxGap / (2 * Math.PI);

  if (closureGap > 0.25) return fail;

  const closureComponent = closureGap < 0.2 ? 1 : closureGap < 0.35 ? 0.6 : 0.2;
  const rmsComponent = normalizedRms < 0.15 ? 1 : normalizedRms < 0.3 ? 0.5 : 0.15 / normalizedRms;
  const rvComponent = radiusVariation < 0.1 ? 1 : radiusVariation < 0.25 ? 0.5 : 0.1 / radiusVariation;
  const matchScore = Math.max(0, Math.min(1,
    rmsComponent * 0.3 + rvComponent * 0.25 + Math.min(1, angularCoverage / 0.7) * 0.2 + closureComponent * 0.25
  ));
  const perfectionScore = Math.max(0, Math.min(1, 1 - normalizedRms * 12));

  return { matchScore, perfectionScore };
}

// --- Triangle / Square shared utilities ---

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

function computeCurvature(points: CursorPoint[], window: number): number[] {
  const curvatures: number[] = new Array(points.length).fill(0);
  for (let i = window; i < points.length - window; i++) {
    const prev = points[i - window], curr = points[i], next = points[i + window];
    const v1x = curr.x - prev.x, v1y = curr.y - prev.y;
    const v2x = next.x - curr.x, v2y = next.y - curr.y;
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
    if (peaks.every(p => Math.abs(p - i) >= minSep)) peaks.push(i);
  }
  return peaks.sort((a, b) => a - b);
}

function angleBetween(a: { x: number; y: number }, vertex: { x: number; y: number }, b: { x: number; y: number }): number {
  const v1x = a.x - vertex.x, v1y = a.y - vertex.y;
  const v2x = b.x - vertex.x, v2y = b.y - vertex.y;
  const dot = v1x * v2x + v1y * v2y;
  const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
  const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
  if (mag1 < 0.001 || mag2 < 0.001) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2))));
}

function edgeStraightness(points: CursorPoint[], from: number, to: number): number {
  const a = points[from], b = points[to];
  if (!a || !b) return 0;
  const lineLen = dist(a, b);
  if (lineLen < 0.001) return 0;
  let sumSq = 0, count = 0;
  const start = Math.min(from, to), end = Math.max(from, to);
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

// --- Triangle analysis ---

function analyzeTriangle(points: CursorPoint[]): ShapeAnalysisResult {
  const fail: ShapeAnalysisResult = { matchScore: 0, perfectionScore: 0 };
  if (points.length < 10) return fail;

  const smoothWindow = Math.max(2, Math.floor(points.length * 0.04));
  const curvatures = computeCurvature(points, smoothWindow);
  const minSep = Math.floor(points.length * 0.15);
  const corners = findPeaks(curvatures, 3, minSep);
  if (corners.length < 3) return fail;

  const vertices = corners.map(i => points[i]);
  const angles = [
    angleBetween(vertices[2], vertices[0], vertices[1]),
    angleBetween(vertices[0], vertices[1], vertices[2]),
    angleBetween(vertices[1], vertices[2], vertices[0]),
  ];
  const sides = [dist(vertices[0], vertices[1]), dist(vertices[1], vertices[2]), dist(vertices[2], vertices[0])];

  const meanAngle = angles.reduce((s, a) => s + a, 0) / 3;
  const angleDev = Math.sqrt(angles.reduce((s, a) => s + (a - meanAngle) ** 2, 0) / 3);
  const meanSide = sides.reduce((s, l) => s + l, 0) / 3;
  const sideDev = meanSide > 0 ? Math.sqrt(sides.reduce((s, l) => s + (l - meanSide) ** 2, 0) / 3) / meanSide : 1;

  const straightness = [
    edgeStraightness(points, corners[0], corners[1]),
    edgeStraightness(points, corners[1], corners[2]),
    edgeStraightness(points, corners[2], points.length - 1),
  ];
  const avgStraightness = straightness.reduce((s, v) => s + v, 0) / 3;

  const closureGap = dist(points[0], points[points.length - 1]) / (meanSide || 1);
  if (closureGap > 0.25) return fail;

  const closureComponent = closureGap < 0.2 ? 1 : closureGap < 0.35 ? 0.6 : 0.2;
  const angleSum = angles.reduce((s, a) => s + a, 0);
  const angleSumDev = Math.abs(angleSum - Math.PI) / Math.PI;
  const matchScore = Math.max(0, Math.min(1,
    (1 - angleSumDev * 3) * 0.4 +
    (angleDev < 0.5 ? 1 : 0.5 / angleDev) * 0.2 +
    (avgStraightness < 10 ? 1 : 10 / avgStraightness) * 0.15 +
    closureComponent * 0.25
  ));

  const anglePerf = Math.max(0, 1 - angleDev * 5);
  const sidePerf = Math.max(0, 1 - sideDev * 5);
  const edgePerf = Math.max(0, 1 - avgStraightness * 0.5);
  const perfectionScore = Math.min(1, anglePerf * 0.35 + sidePerf * 0.35 + edgePerf * 0.3);

  return { matchScore, perfectionScore };
}

// --- Square analysis ---

function analyzeSquare(points: CursorPoint[]): ShapeAnalysisResult {
  const fail: ShapeAnalysisResult = { matchScore: 0, perfectionScore: 0 };
  if (points.length < 12) return fail;

  const smoothWindow = Math.max(2, Math.floor(points.length * 0.04));
  const curvatures = computeCurvature(points, smoothWindow);
  const minSep = Math.floor(points.length * 0.12);
  const corners = findPeaks(curvatures, 4, minSep);
  if (corners.length < 4) return fail;

  const vertices = corners.map(i => points[i]);
  const angles = [
    angleBetween(vertices[3], vertices[0], vertices[1]),
    angleBetween(vertices[0], vertices[1], vertices[2]),
    angleBetween(vertices[1], vertices[2], vertices[3]),
    angleBetween(vertices[2], vertices[3], vertices[0]),
  ];
  const sides = [
    dist(vertices[0], vertices[1]), dist(vertices[1], vertices[2]),
    dist(vertices[2], vertices[3]), dist(vertices[3], vertices[0]),
  ];

  const targetAngle = Math.PI / 2;
  const angleDev = Math.sqrt(angles.reduce((s, a) => s + (a - targetAngle) ** 2, 0) / 4);
  const meanSide = sides.reduce((s, l) => s + l, 0) / 4;
  const sideDev = meanSide > 0 ? Math.sqrt(sides.reduce((s, l) => s + (l - meanSide) ** 2, 0) / 4) / meanSide : 1;

  const straightness: number[] = [];
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    straightness.push(edgeStraightness(points, corners[i], corners[next] > corners[i] ? corners[next] : points.length - 1));
  }
  const avgStraightness = straightness.reduce((s, v) => s + v, 0) / 4;

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

  const closureGap = dist(points[0], points[points.length - 1]) / (meanSide || 1);
  if (closureGap > 0.25) return fail;

  const closureComponent = closureGap < 0.2 ? 1 : closureGap < 0.35 ? 0.6 : 0.2;
  const angleSum = angles.reduce((s, a) => s + a, 0);
  const angleSumDev = Math.abs(angleSum - 2 * Math.PI) / (2 * Math.PI);
  const matchScore = Math.max(0, Math.min(1,
    (1 - angleSumDev * 3) * 0.3 +
    (angleDev < 0.5 ? 1 : 0.5 / angleDev) * 0.2 +
    (avgStraightness < 10 ? 1 : 10 / avgStraightness) * 0.1 +
    parallelism * 0.15 +
    closureComponent * 0.25
  ));

  const anglePerf = Math.max(0, 1 - angleDev * 5);
  const sidePerf = Math.max(0, 1 - sideDev * 5);
  const edgePerf = Math.max(0, 1 - avgStraightness * 0.5);
  const perfectionScore = Math.min(1, anglePerf * 0.3 + sidePerf * 0.3 + edgePerf * 0.25 + parallelism * 0.15);

  return { matchScore, perfectionScore };
}

// --- Public API ---

export interface ShapeAnalysisResult {
  matchScore: number;
  perfectionScore: number;
}

const analyzers: Record<ShapeType, (points: CursorPoint[]) => ShapeAnalysisResult> = {
  circle: analyzeCircle,
  triangle: analyzeTriangle,
  square: analyzeSquare,
};

export function analyzeShape(points: CursorPoint[], shape: ShapeType): ShapeAnalysisResult {
  return analyzers[shape](points);
}
