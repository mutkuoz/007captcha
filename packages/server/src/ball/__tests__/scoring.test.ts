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
    averageDistance: 25,
    distanceStdDev: 18,
    estimatedLag: 200,
    lagConsistency: 40,
    overshootCount: 4,
    trackingCoverage: 0.75,
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
