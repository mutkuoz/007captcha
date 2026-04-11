import { describe, it, expect } from 'vitest';
import { analyzeBallTracking, analyzeFrameAcks } from '../analyze';
import type { CursorPoint, BallFrame, TrajectoryChangeEvent, FrameAck } from '../../types';

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

function makeServerFrames(count: number, startTime: number, frameInterval = 50): {
  frames: BallFrame[];
  dispatchTimes: number[];
} {
  const frames: BallFrame[] = [];
  const dispatchTimes: number[] = [];
  for (let i = 0; i < count; i++) {
    frames.push({ x: 100 + i * 2, y: 100, t: i * frameInterval });
    dispatchTimes.push(startTime + i * frameInterval);
  }
  return { frames, dispatchTimes };
}

function makeGoodAcks(
  frames: BallFrame[],
  dispatchTimes: number[],
  cursorClockOffset: number,
  networkLatMean = 30,
  networkLatJitter = 5,
): FrameAck[] {
  // Client clock = server clock + cursorClockOffset
  return frames.map((f, i) => {
    const lat = networkLatMean + (Math.random() - 0.5) * networkLatJitter * 2;
    return {
      i,
      t: dispatchTimes[i] + cursorClockOffset + lat,
      x: f.x + (Math.random() - 0.5) * 20, // within 90px of ball
      y: f.y + (Math.random() - 0.5) * 20,
    };
  });
}

function makePointsFromAcks(acks: FrameAck[]): CursorPoint[] {
  return acks.map(a => ({ x: a.x, y: a.y, t: a.t }));
}

describe('analyzeFrameAcks', () => {
  it('returns null (pass) for realistic human frame acks', () => {
    const { frames, dispatchTimes } = makeServerFrames(60, 1_700_000_000_000);
    const acks = makeGoodAcks(frames, dispatchTimes, 5_000_000);
    const points = makePointsFromAcks(acks);
    const result = analyzeFrameAcks(acks, frames, dispatchTimes, points);
    expect(result).toBeNull();
  });

  it('returns "missing_acks" when less than 90% of frames are acked', () => {
    const { frames, dispatchTimes } = makeServerFrames(60, 1_700_000_000_000);
    const acks = makeGoodAcks(frames, dispatchTimes, 5_000_000).slice(0, 40); // only 40/60
    const points = makePointsFromAcks(acks);
    const result = analyzeFrameAcks(acks, frames, dispatchTimes, points);
    expect(result).toBe('missing_acks');
  });

  it('returns "non_monotonic_acks" when ack indices are out of order', () => {
    const { frames, dispatchTimes } = makeServerFrames(60, 1_700_000_000_000);
    const acks = makeGoodAcks(frames, dispatchTimes, 5_000_000);
    // Swap two indices
    [acks[10].i, acks[11].i] = [acks[11].i, acks[10].i];
    const points = makePointsFromAcks(acks);
    const result = analyzeFrameAcks(acks, frames, dispatchTimes, points);
    expect(result).toBe('non_monotonic_acks');
  });

  it('returns "constant_latency" when latency has zero variance (replay signature)', () => {
    const { frames, dispatchTimes } = makeServerFrames(60, 1_700_000_000_000);
    // Zero jitter — perfect constant offset
    const acks = frames.map((f, i) => ({
      i,
      t: dispatchTimes[i] + 5_000_000 + 50, // exactly 50ms lat every time
      x: f.x + 10,
      y: f.y + 10,
    }));
    const points = makePointsFromAcks(acks);
    const result = analyzeFrameAcks(acks, frames, dispatchTimes, points);
    expect(result).toBe('constant_latency');
  });

  it('returns "ack_far_from_ball" when committed positions are nowhere near the ball', () => {
    const { frames, dispatchTimes } = makeServerFrames(60, 1_700_000_000_000);
    const acks = makeGoodAcks(frames, dispatchTimes, 5_000_000).map(a => ({
      ...a,
      x: a.x + 300, // way beyond 90px
      y: a.y + 300,
    }));
    const points = makePointsFromAcks(acks);
    const result = analyzeFrameAcks(acks, frames, dispatchTimes, points);
    expect(result).toBe('ack_far_from_ball');
  });

  it('returns "ack_points_mismatch" when acks do not match the points trace', () => {
    const { frames, dispatchTimes } = makeServerFrames(60, 1_700_000_000_000);
    const acks = makeGoodAcks(frames, dispatchTimes, 5_000_000);
    // Forge the points array to be a straight line — unrelated to acks
    const points: CursorPoint[] = acks.map(a => ({ x: 0, y: 0, t: a.t }));
    const result = analyzeFrameAcks(acks, frames, dispatchTimes, points);
    expect(result).toBe('ack_points_mismatch');
  });
});
