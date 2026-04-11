import { describe, it, expect } from 'vitest';
import { computeBallScore } from '../scoring';
import type { BallAnalysisMetrics, CursorPoint } from '../../types';

function makeHumanCursorPoints(): CursorPoint[] {
  const points: CursorPoint[] = [];
  let t = 0;
  for (let i = 0; i < 300; i++) {
    t += 8 + Math.random() * 14;
    points.push({
      x: 100 + Math.sin(i / 20) * 50 + (Math.random() - 0.5) * 10,
      y: 100 + Math.cos(i / 20) * 50 + (Math.random() - 0.5) * 10,
      t,
    });
  }
  return points;
}

function makeBotCursorPoints(): CursorPoint[] {
  return Array.from({ length: 15 }, (_, i) => ({
    x: 100 + Math.sin(i / 5) * 50,
    y: 100 + Math.cos(i / 5) * 50,
    t: i * 16.667,
  }));
}

function makeHumanBallMetrics(): BallAnalysisMetrics {
  return {
    averageDistance: 65,
    distanceStdDev: 20,
    estimatedLag: 200,
    lagConsistency: 40,
    overshootCount: 3,
    trackingCoverage: 0.70,
    frameWithinTight: 0.75,
  };
}

function makeBotBallMetrics(): BallAnalysisMetrics {
  return {
    averageDistance: 2,
    distanceStdDev: 1,
    estimatedLag: 10,
    lagConsistency: 2,
    overshootCount: 0,
    trackingCoverage: 0.99,
    frameWithinTight: 1.0,
  };
}

describe('computeBallScore', () => {
  it('should score human-like input as non-bot', () => {
    const result = computeBallScore(makeHumanCursorPoints(), makeHumanBallMetrics());
    expect(result.score).toBeGreaterThan(0.5);
    expect(result.verdict).not.toBe('bot');
  });

  it('should score bot-like input lower', () => {
    const result = computeBallScore(makeBotCursorPoints(), makeBotBallMetrics());
    expect(result.score).toBeLessThan(0.4);
  });

  it('should clamp score between 0 and 1', () => {
    const result = computeBallScore(makeHumanCursorPoints(), makeHumanBallMetrics());
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});

describe('computeBallScore — hard flags from ball tracking', () => {
  it('returns bot verdict when frameWithinTight < 0.55 (not tracking)', () => {
    const metrics: BallAnalysisMetrics = {
      ...makeHumanBallMetrics(),
      frameWithinTight: 0.30,
    };
    const result = computeBallScore(makeHumanCursorPoints(), metrics);
    expect(result.verdict).toBe('bot');
    expect(result.score).toBe(0);
  });

  it('returns bot verdict when frameWithinTight > 0.95 AND avgDistance < 12 (too tight)', () => {
    const metrics: BallAnalysisMetrics = {
      ...makeHumanBallMetrics(),
      averageDistance: 8,
      distanceStdDev: 2,
      frameWithinTight: 0.98,
    };
    const result = computeBallScore(makeHumanCursorPoints(), metrics);
    expect(result.verdict).toBe('bot');
    expect(result.score).toBe(0);
  });

  it('returns bot verdict when avgDistance < 10 with tiny stddev (inhuman precision)', () => {
    const metrics: BallAnalysisMetrics = {
      ...makeHumanBallMetrics(),
      averageDistance: 5,
      distanceStdDev: 1,
      frameWithinTight: 0.85,
    };
    const result = computeBallScore(makeHumanCursorPoints(), metrics);
    expect(result.verdict).toBe('bot');
    expect(result.score).toBe(0);
  });

  it('accepts moderately tracking cursor (frameWithinTight ~0.75)', () => {
    const result = computeBallScore(makeHumanCursorPoints(), makeHumanBallMetrics());
    expect(result.verdict).not.toBe('bot');
  });
});
