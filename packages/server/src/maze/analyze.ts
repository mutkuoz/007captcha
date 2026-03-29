import type { CursorPoint, MazeDefinition, MazeAnalysisMetrics } from '../types';

function segmentsIntersect(
  p1x: number, p1y: number, p2x: number, p2y: number,
  p3x: number, p3y: number, p4x: number, p4y: number,
): boolean {
  const d1x = p2x - p1x, d1y = p2y - p1y;
  const d2x = p4x - p3x, d2y = p4y - p3y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return false;
  const t = ((p3x - p1x) * d2y - (p3y - p1y) * d2x) / denom;
  const u = ((p3x - p1x) * d1y - (p3y - p1y) * d1x) / denom;
  return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99;
}

function pointToSegmentDist(
  px: number, py: number,
  ax: number, ay: number, bx: number, by: number,
): number {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-10) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * dx, projY = ay + t * dy;
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

interface WallSegment { x1: number; y1: number; x2: number; y2: number }

function getWallSegments(maze: MazeDefinition, offsetX: number, offsetY: number): WallSegment[] {
  const { rows, cols, cells, cellSize } = maze;
  const segments: WallSegment[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = offsetX + c * cellSize;
      const y = offsetY + r * cellSize;
      const w = cells[r][c].walls;
      if (w.top) segments.push({ x1: x, y1: y, x2: x + cellSize, y2: y });
      if (w.right) segments.push({ x1: x + cellSize, y1: y, x2: x + cellSize, y2: y + cellSize });
      if (w.bottom) segments.push({ x1: x, y1: y + cellSize, x2: x + cellSize, y2: y + cellSize });
      if (w.left) segments.push({ x1: x, y1: y, x2: x, y2: y + cellSize });
    }
  }
  const unique = new Map<string, WallSegment>();
  for (const s of segments) {
    const key = [Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.max(s.x1, s.x2), Math.max(s.y1, s.y2)].join(',');
    unique.set(key, s);
  }
  return [...unique.values()];
}

export function analyzeMazePath(
  points: CursorPoint[],
  maze: MazeDefinition,
  shortestPath: { row: number; col: number }[],
  offsetX: number,
  offsetY: number,
): MazeAnalysisMetrics {
  if (points.length < 2) {
    return { reachedExit: false, wallCrossings: 0, wallTouches: 0, pathStraightness: 1, optimalPathRatio: 0, backtrackCount: 0 };
  }

  const walls = getWallSegments(maze, offsetX, offsetY);
  const { cellSize, exit } = maze;
  const touchThreshold = 5;

  const lastPt = points[points.length - 1];
  const exitX = offsetX + exit.col * cellSize + cellSize;
  const exitY = offsetY + exit.row * cellSize;
  const reachedExit = lastPt.x >= exitX - cellSize * 0.5 && lastPt.y >= exitY && lastPt.y <= exitY + cellSize;

  let wallCrossings = 0;
  let wallTouches = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i], p2 = points[i + 1];
    for (const wall of walls) {
      if (segmentsIntersect(p1.x, p1.y, p2.x, p2.y, wall.x1, wall.y1, wall.x2, wall.y2)) {
        wallCrossings++;
      }
    }
  }

  // Count distinct wall-touch events (consecutive near-wall points = one touch)
  let inTouch = false;
  for (const pt of points) {
    let nearWall = false;
    for (const wall of walls) {
      const d = pointToSegmentDist(pt.x, pt.y, wall.x1, wall.y1, wall.x2, wall.y2);
      if (d < touchThreshold && d > 0.5) { nearWall = true; break; }
    }
    if (nearWall && !inTouch) wallTouches++;
    inTouch = nearWall;
  }

  const first = points[0], last = points[points.length - 1];
  const euclidean = Math.sqrt((last.x - first.x) ** 2 + (last.y - first.y) ** 2);
  let actualLength = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x, dy = points[i].y - points[i - 1].y;
    actualLength += Math.sqrt(dx * dx + dy * dy);
  }
  const pathStraightness = actualLength > 0.01 ? euclidean / actualLength : 1;

  const shortestLength = (shortestPath.length - 1) * cellSize;
  const optimalPathRatio = shortestLength > 0 ? actualLength / shortestLength : 0;

  let backtrackCount = 0;
  const step = Math.max(1, Math.floor(points.length / 50));
  for (let i = step; i < points.length - step; i += step) {
    const prev = points[i - step], curr = points[i], next = points[i + step];
    const v1x = curr.x - prev.x, v1y = curr.y - prev.y;
    const v2x = next.x - curr.x, v2y = next.y - curr.y;
    const dot = v1x * v2x + v1y * v2y;
    const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
    if (mag1 > 0.5 && mag2 > 0.5 && dot / (mag1 * mag2) < -0.5) backtrackCount++;
  }

  return { reachedExit, wallCrossings, wallTouches, pathStraightness, optimalPathRatio, backtrackCount };
}

// --- Fitts's Law Validation ---
// Human movement time correlates with log2(D/W + 1) where D=distance, W=target width.
// In maze corridors, W ≈ cellSize. Bots navigate all corridors at similar speeds.

export interface FittsMetrics {
  fittsR2: number;        // R² of movement time vs Fitts prediction
  fittsSampleCount: number;
}

export function analyzeFittsLaw(
  points: CursorPoint[],
  maze: MazeDefinition,
  offsetX: number,
  offsetY: number,
): FittsMetrics {
  const fail: FittsMetrics = { fittsR2: 0, fittsSampleCount: 0 };
  if (points.length < 20) return fail;

  const { cellSize } = maze;

  // Segment the path into cell-level traversals
  // Track which cell each point is in and measure time to traverse
  interface CellSegment {
    distance: number;
    time: number;
  }

  const segments: CellSegment[] = [];
  let segStart = 0;
  let prevCell = getCellCoord(points[0], offsetX, offsetY, cellSize);

  for (let i = 1; i < points.length; i++) {
    const cell = getCellCoord(points[i], offsetX, offsetY, cellSize);
    if (cell.r !== prevCell.r || cell.c !== prevCell.c) {
      // Crossed into a new cell — record the segment
      const dx = points[i].x - points[segStart].x;
      const dy = points[i].y - points[segStart].y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const time = points[i].t - points[segStart].t;

      if (time > 0 && distance > 2) {
        segments.push({ distance, time });
      }

      segStart = i;
      prevCell = cell;
    }
  }

  if (segments.length < 5) return { ...fail, fittsSampleCount: segments.length };

  // Fitts's Law regression: T = a + b * log2(D/W + 1)
  const W = cellSize;
  const fittsX: number[] = []; // log2(D/W + 1)
  const fittsY: number[] = []; // movement time T

  for (const seg of segments) {
    fittsX.push(Math.log2(seg.distance / W + 1));
    fittsY.push(seg.time);
  }

  // Linear regression
  const n = fittsX.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += fittsX[i];
    sumY += fittsY[i];
    sumXY += fittsX[i] * fittsY[i];
    sumX2 += fittsX[i] * fittsX[i];
  }

  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return { ...fail, fittsSampleCount: n };

  const b = (n * sumXY - sumX * sumY) / denom;
  const a = (sumY - b * sumX) / n;

  // R²
  const meanY = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    const predicted = a + b * fittsX[i];
    ssRes += (fittsY[i] - predicted) ** 2;
    ssTot += (fittsY[i] - meanY) ** 2;
  }
  const fittsR2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  return { fittsR2, fittsSampleCount: n };
}

function getCellCoord(
  p: CursorPoint, offsetX: number, offsetY: number, cellSize: number,
): { r: number; c: number } {
  return {
    r: Math.floor((p.y - offsetY) / cellSize),
    c: Math.floor((p.x - offsetX) / cellSize),
  };
}
