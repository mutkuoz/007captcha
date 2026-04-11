import { describe, it, expect } from 'vitest';
import { computeBallScore } from '../scoring';
import type { ReactionTimeMetrics } from '../scoring';
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

  it('returns bot verdict when avgDistance < 5 with tiny stddev (inhuman precision)', () => {
    const metrics: BallAnalysisMetrics = {
      ...makeHumanBallMetrics(),
      averageDistance: 3,
      distanceStdDev: 1,
    };
    const result = computeBallScore(makeHumanCursorPoints(), metrics);
    expect(result.verdict).toBe('bot');
    expect(result.score).toBe(0);
  });

  it('accepts precise human tracking (cov=1.0, avg≈10px, stddev≈5) — real trace baseline', () => {
    // Calibrated from real human traces 2026-04-12: precise mouse users
    // produce cov=1.0, avg=9-13, stddev=4-8, frameWithinTight=1.0 naturally.
    // These values must not trigger any hard flag.
    const metrics: BallAnalysisMetrics = {
      averageDistance: 9.54,
      distanceStdDev: 5.73,
      estimatedLag: 100,
      lagConsistency: 132,
      overshootCount: 3,
      trackingCoverage: 1.0,
      frameWithinTight: 1.0,
    };
    const result = computeBallScore(makeHumanCursorPoints(), metrics);
    expect(result.verdict).not.toBe('bot');
  });

  it('accepts moderately tracking cursor (frameWithinTight ~0.75)', () => {
    const result = computeBallScore(makeHumanCursorPoints(), makeHumanBallMetrics());
    expect(result.verdict).not.toBe('bot');
  });
});

describe('computeBallScore — reaction time hard flag (Fix 2)', () => {
  it('returns bot verdict when ball had >=3 direction changes but 0 RT samples', () => {
    const rt: ReactionTimeMetrics = { meanRT: 0, rtStdDev: 0, rtSkewness: 0, rtCV: 0, sampleCount: 0 };
    const result = computeBallScore(
      makeHumanCursorPoints(),
      makeHumanBallMetrics(),
      undefined,
      rt,
      undefined,
      undefined,
      /* directionChangeCount */ 5,
    );
    expect(result.verdict).toBe('bot');
  });

  it('does not hard-flag when ball had 0 direction changes and 0 RT samples', () => {
    const rt: ReactionTimeMetrics = { meanRT: 0, rtStdDev: 0, rtSkewness: 0, rtCV: 0, sampleCount: 0 };
    const result = computeBallScore(
      makeHumanCursorPoints(),
      makeHumanBallMetrics(),
      undefined,
      rt,
      undefined,
      undefined,
      /* directionChangeCount */ 0,
    );
    expect(result.verdict).not.toBe('bot');
  });
});
