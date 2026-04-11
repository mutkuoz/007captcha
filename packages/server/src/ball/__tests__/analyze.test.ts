import { describe, it, expect } from 'vitest';
import { analyzeBallTracking } from '../analyze';
import type { CursorPoint, BallFrame, TrajectoryChangeEvent } from '../../types';

function makeFrames(count: number): BallFrame[] {
  return Array.from({ length: count }, (_, i) => ({
    x: 100 + i * 2,
    y: 100,
    t: i * 16.667,
  }));
}

function makeCloseCursor(frames: BallFrame[], startT: number, offset: number): CursorPoint[] {
  return frames.map(f => ({ x: f.x + offset, y: f.y, t: startT + f.t }));
}

describe('analyzeBallTracking — frameWithinTight', () => {
  it('reports frameWithinTight near 1.0 for cursor that closely follows the ball', () => {
    const frames = makeFrames(120);
    const cursor = makeCloseCursor(frames, 1000, 30); // 30px offset, well within 80
    const metrics = analyzeBallTracking(cursor, frames, [] as TrajectoryChangeEvent[], 1000);
    expect(metrics.frameWithinTight).toBeGreaterThan(0.9);
  });

  it('reports frameWithinTight near 0 for cursor that is far from the ball', () => {
    const frames = makeFrames(120);
    const cursor = makeCloseCursor(frames, 1000, 200); // 200px offset, way beyond 80
    const metrics = analyzeBallTracking(cursor, frames, [] as TrajectoryChangeEvent[], 1000);
    expect(metrics.frameWithinTight).toBeLessThan(0.1);
  });
});
