import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  computeBallScore,
  analyzeIntervalRegularity,
  isIntervalRegularityBotFlag,
} from '../scoring';
import type { ReactionTimeMetrics } from '../scoring';
import type { BallAnalysisMetrics, CursorPoint } from '../../types';

// Real human traces captured 2026-04-12, used as ground truth for scoring tests.
// Using synthetic data here caused false positives on hard flags calibrated from
// real traces — specifically the power-law β range. Loading a real record keeps
// the test honest against production scoring rules.
const HUMAN_TRACE_PATH = resolve(__dirname, '../../../../../training/data/2026-04-12_human.jsonl');
let cachedHumanPoints: CursorPoint[] | null = null;
function makeHumanCursorPoints(): CursorPoint[] {
  if (cachedHumanPoints) return cachedHumanPoints.slice();
  const lines = readFileSync(HUMAN_TRACE_PATH, 'utf8').trim().split('\n');
  const rec = JSON.parse(lines[0]);
  cachedHumanPoints = rec.points.map((p: { x: number; y: number; t: number }) => ({
    x: p.x, y: p.y, t: p.t,
  }));
  return cachedHumanPoints!.slice();
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

describe('computeBallScore — attack-replay regressions (Fix 5: mechanical timing)', () => {
  // Mechanical-timing signature: locked inter-event interval + zero saccade
  // pauses over a long tracking window. Both the CDP-driven and pure-HTTP
  // bypass attacks (2026-04-19) produce this shape. See
  // 007captcha-bypass-experiment/3-traces/ for the originals.

  function makeTickerBotPoints(
    intervalMs: number,
    cvRatio: number,
    durationMs: number,
    noiseAmp = 1,
  ): CursorPoint[] {
    // Simulates a bot ticking at `intervalMs` with `cvRatio * intervalMs` jitter
    // and no pauses — the pattern both attack scripts produce. `noiseAmp`
    // controls per-sample positional jitter; increase to test cases that
    // should NOT trip the residual-noise flag.
    const pts: CursorPoint[] = [];
    let t = 0;
    let cx = 240, cy = 200, angle = 0;
    while (t < durationMs) {
      const jitter = (Math.random() - 0.5) * intervalMs * cvRatio * 2;
      t += intervalMs + jitter;
      angle += 0.08;
      cx += Math.cos(angle) * 2 + (Math.random() - 0.5) * noiseAmp;
      cy += Math.sin(angle) * 2 + (Math.random() - 0.5) * noiseAmp;
      pts.push({ x: cx, y: cy, t });
    }
    return pts;
  }

  it('flags 60Hz CDP-style ticker with 0 pauses (blackbox attack signature)', () => {
    // blackbox trace characteristics: ~16.7ms interval, CV ~0.13, 0 pauses,
    // ~480 points over 8s.
    const points = makeTickerBotPoints(16.7, 0.13, 8100);
    const metrics: BallAnalysisMetrics = {
      averageDistance: 48, distanceStdDev: 6, estimatedLag: 250,
      lagConsistency: 200, overshootCount: 9,
      trackingCoverage: 1.0, frameWithinTight: 1.0,
    };
    const result = computeBallScore(points, metrics);
    expect(result.verdict).toBe('bot');
    expect(result.score).toBe(0);
  });

  it('flags 90Hz pure-HTTP ticker with 0 pauses (insider attack signature)', () => {
    // insider trace characteristics: ~11.5ms interval, CV ~0.21, 0 pauses,
    // ~700 points over 8s, plus inhumanly tight tracking (avgD≈8, sdD≈4).
    const points = makeTickerBotPoints(11.5, 0.21, 8100);
    const metrics: BallAnalysisMetrics = {
      averageDistance: 8.5, distanceStdDev: 4.0, estimatedLag: 200,
      lagConsistency: 18, overshootCount: 7,
      trackingCoverage: 1.0, frameWithinTight: 1.0,
    };
    const result = computeBallScore(points, metrics);
    expect(result.verdict).toBe('bot');
    expect(result.score).toBe(0);
  });

  it('CV flag does not fire on a short (<6s) session', () => {
    // Direct unit test of the CV-flag duration gate in isolation —
    // other hard flags are orthogonal and are tested separately.
    const shortPoints = makeTickerBotPoints(16.7, 0.13, 3000);
    const metrics = analyzeIntervalRegularity(shortPoints);
    expect(metrics.duration).toBeLessThan(6000);
    expect(isIntervalRegularityBotFlag(metrics)).toBe(false);
  });

  it('CV flag fires on a long mechanical session even with pauseCount=0', () => {
    const longPoints = makeTickerBotPoints(16.7, 0.13, 8000);
    const metrics = analyzeIntervalRegularity(longPoints);
    expect(metrics.duration).toBeGreaterThan(6000);
    expect(metrics.pauseCount).toBe(0);
    expect(isIntervalRegularityBotFlag(metrics)).toBe(true);
  });
});

describe('computeBallScore — residual-noise hard flag (Fix 6)', () => {
  it('flags smoothly-interpolated cursor with near-zero residual noise', () => {
    // Pure sine-wave motion at 60Hz — after local detrending, residuals are
    // near-zero. Signature of a CDP mouse + spring follower without noise
    // injection. Calibrated from blackbox attack traces (residualStd 0.75-1.09).
    const points: CursorPoint[] = [];
    let t = 0;
    for (let i = 0; i < 480; i++) {
      t += 16.7;
      points.push({
        x: 240 + 100 * Math.sin(t / 500),
        y: 200 + 80 * Math.cos(t / 600),
        t,
      });
    }
    const metrics: BallAnalysisMetrics = {
      averageDistance: 40, distanceStdDev: 8, estimatedLag: 200,
      lagConsistency: 30, overshootCount: 5,
      trackingCoverage: 1.0, frameWithinTight: 0.95,
    };
    const result = computeBallScore(points, metrics);
    expect(result.verdict).toBe('bot');
    expect(result.score).toBe(0);
  });
});

describe('computeBallScore — too-precise-tracking hard flag (Fix 7)', () => {
  it('flags insider-style tight tracking (sdD<5 with full tight coverage)', () => {
    // Insider attack signature: avgDist 7-10px, distanceStdDev 3-4.6,
    // frameWithinTight 1.0. Real humans: sdD ≥ 7.3.
    const human = makeHumanCursorPoints();
    const metrics: BallAnalysisMetrics = {
      averageDistance: 8.5, distanceStdDev: 4.0, estimatedLag: 200,
      lagConsistency: 18, overshootCount: 7,
      trackingCoverage: 1.0, frameWithinTight: 1.0,
    };
    const result = computeBallScore(human, metrics);
    expect(result.verdict).toBe('bot');
    expect(result.score).toBe(0);
  });

  it('does NOT flag human-baseline precise tracking (sdD=5.73)', () => {
    // From the real-trace baseline: avg 9.54, sdD 5.73 — must still pass.
    const human = makeHumanCursorPoints();
    const metrics: BallAnalysisMetrics = {
      averageDistance: 9.54, distanceStdDev: 5.73, estimatedLag: 100,
      lagConsistency: 132, overshootCount: 3,
      trackingCoverage: 1.0, frameWithinTight: 1.0,
    };
    const result = computeBallScore(human, metrics);
    expect(result.verdict).not.toBe('bot');
  });
});

describe('computeBallScore — power-law calibration (Fix 5: β range)', () => {
  it('flags textbook 1/3 power-law (classic bot mimic)', () => {
    // Construct points where speed ∝ R^(1/3) — exactly what a bot would
    // produce to mimic the Lacquaniti law. Real humans on this task show
    // β ≈ 0.65-1.05, so β=0.33 is now the bot signature.
    const points: CursorPoint[] = [];
    let t = 0;
    // Generate a path with varying curvature and explicitly correlated β=1/3 speed.
    for (let i = 0; i < 300; i++) {
      const phase = i * 0.05;
      const R = 40 + 30 * Math.sin(phase);          // varying radius of curvature
      const V = 200 * Math.pow(R, 1 / 3);             // β=1/3 relationship
      const dt = 1000 / V * 5;                        // step so segment length tracks V
      t += Math.max(5, Math.min(30, dt));
      const cx = 240 + R * Math.cos(phase);
      const cy = 200 + R * Math.sin(phase);
      points.push({ x: cx + (Math.random() - 0.5) * 0.5, y: cy + (Math.random() - 0.5) * 0.5, t });
    }
    const metrics: BallAnalysisMetrics = {
      averageDistance: 40, distanceStdDev: 8, estimatedLag: 150,
      lagConsistency: 25, overshootCount: 5,
      trackingCoverage: 1.0, frameWithinTight: 1.0,
    };
    const result = computeBallScore(points, metrics);
    expect(result.verdict).toBe('bot');
  });
});
