import type { CapturePoint, MazeDefinition, MazeAnalysisMetrics } from '../types';

/**
 * Check if two line segments (p1-p2) and (p3-p4) intersect.
 */
function segmentsIntersect(
  p1x: number, p1y: number, p2x: number, p2y: number,
  p3x: number, p3y: number, p4x: number, p4y: number,
): boolean {
  const d1x = p2x - p1x;
  const d1y = p2y - p1y;
  const d2x = p4x - p3x;
  const d2y = p4y - p3y;

  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return false;

  const t = ((p3x - p1x) * d2y - (p3y - p1y) * d2x) / denom;
  const u = ((p3x - p1x) * d1y - (p3y - p1y) * d1x) / denom;

  // Use small epsilon to avoid counting endpoint touches as crossings
  return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99;
}

/**
 * Minimum distance from a point to a line segment.
 */
function pointToSegmentDist(
  px: number, py: number,
  ax: number, ay: number, bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-10) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);

  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

interface WallSegment {
  x1: number; y1: number; x2: number; y2: number;
}

/**
 * Collect all wall segments as pixel coordinates.
 */
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

  // Deduplicate (shared walls appear twice)
  const unique = new Map<string, WallSegment>();
  for (const s of segments) {
    const key = [
      Math.min(s.x1, s.x2), Math.min(s.y1, s.y2),
      Math.max(s.x1, s.x2), Math.max(s.y1, s.y2),
    ].join(',');
    unique.set(key, s);
  }
  return [...unique.values()];
}

/**
 * Analyze the user's path through the maze.
 */
export function analyzeMazePath(
  points: CapturePoint[],
  maze: MazeDefinition,
  shortestPath: { row: number; col: number }[],
  offsetX: number,
  offsetY: number,
): MazeAnalysisMetrics {
  if (points.length < 2) {
    return {
      reachedExit: false,
      wallCrossings: 0,
      wallTouches: 0,
      pathStraightness: 1,
      optimalPathRatio: 0,
      backtrackCount: 0,
    };
  }

  const walls = getWallSegments(maze, offsetX, offsetY);
  const { cellSize, exit } = maze;
  const touchThreshold = 3; // pixels

  // Check if path reached exit zone
  const lastPt = points[points.length - 1];
  const exitX = offsetX + exit.col * cellSize + cellSize;
  const exitY = offsetY + exit.row * cellSize;
  const reachedExit =
    lastPt.x >= exitX - cellSize * 0.5 &&
    lastPt.y >= exitY &&
    lastPt.y <= exitY + cellSize;

  // Count wall crossings and wall touches
  let wallCrossings = 0;
  let wallTouches = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    for (const wall of walls) {
      if (segmentsIntersect(p1.x, p1.y, p2.x, p2.y, wall.x1, wall.y1, wall.x2, wall.y2)) {
        wallCrossings++;
      }
    }
  }

  // Wall touches: points close to walls without crossing
  for (const pt of points) {
    for (const wall of walls) {
      const d = pointToSegmentDist(pt.x, pt.y, wall.x1, wall.y1, wall.x2, wall.y2);
      if (d < touchThreshold && d > 0.5) {
        wallTouches++;
        break; // count each point only once
      }
    }
  }

  // Path straightness: euclidean distance / actual path length
  const first = points[0];
  const last = points[points.length - 1];
  const euclidean = Math.sqrt((last.x - first.x) ** 2 + (last.y - first.y) ** 2);
  let actualLength = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    actualLength += Math.sqrt(dx * dx + dy * dy);
  }
  const pathStraightness = actualLength > 0.01 ? euclidean / actualLength : 1;

  // Optimal path ratio
  const shortestLength = (shortestPath.length - 1) * cellSize;
  const optimalPathRatio = shortestLength > 0 ? actualLength / shortestLength : 0;

  // Backtrack count: direction reversals (>120° turns)
  let backtrackCount = 0;
  const step = Math.max(1, Math.floor(points.length / 50)); // sample every ~50 segments
  for (let i = step; i < points.length - step; i += step) {
    const prev = points[i - step];
    const curr = points[i];
    const next = points[i + step];

    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;

    const dot = v1x * v2x + v1y * v2y;
    const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);

    if (mag1 > 0.5 && mag2 > 0.5) {
      const cosAngle = dot / (mag1 * mag2);
      if (cosAngle < -0.5) { // >120° turn
        backtrackCount++;
      }
    }
  }

  return {
    reachedExit,
    wallCrossings,
    wallTouches,
    pathStraightness,
    optimalPathRatio,
    backtrackCount,
  };
}
