import type { BallAnalysisMetrics, CursorPoint } from '../types';

function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

// --- Behavioral analysis (server-side version, same logic as client) ---

interface BehavioralMetrics {
  pointCount: number;
  totalDuration: number;
  averageSpeed: number;
  speedStdDev: number;
  accelerationStdDev: number;
  timestampRegularity: number;
  microJitterScore: number;
  pauseCount: number;
}

function dist(a: CursorPoint, b: CursorPoint): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
}

export function analyzeBehavior(points: CursorPoint[]): BehavioralMetrics {
  if (points.length < 2) {
    return {
      pointCount: points.length, totalDuration: 0, averageSpeed: 0,
      speedStdDev: 0, accelerationStdDev: 0, timestampRegularity: 0,
      microJitterScore: 0, pauseCount: 0,
    };
  }

  const totalDuration = points[points.length - 1].t - points[0].t;
  const speeds: number[] = [];
  const intervals: number[] = [];

  for (let i = 1; i < points.length; i++) {
    const dt = points[i].t - points[i - 1].t;
    const d = dist(points[i - 1], points[i]);
    intervals.push(dt);
    speeds.push(dt > 0 ? (d / dt) * 1000 : 0);
  }

  const accelerations: number[] = [];
  for (let i = 1; i < speeds.length; i++) {
    const dt = intervals[i];
    accelerations.push(dt > 0 ? ((speeds[i] - speeds[i - 1]) / dt) * 1000 : 0);
  }

  const jitterValues: number[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1], curr = points[i], next = points[i + 1];
    const lineLen = dist(prev, next);
    if (lineLen < 0.001) continue;
    const perpDist = Math.abs(
      (next.x - prev.x) * (prev.y - curr.y) - (prev.x - curr.x) * (next.y - prev.y)
    ) / lineLen;
    jitterValues.push(perpDist);
  }

  let pauseCount = 0;
  for (let i = 1; i < points.length; i++) {
    const dt = points[i].t - points[i - 1].t;
    const d = dist(points[i - 1], points[i]);
    if (dt > 50 && d < 2) pauseCount++;
  }

  return {
    pointCount: points.length,
    totalDuration,
    averageSpeed: mean(speeds),
    speedStdDev: stdDev(speeds),
    accelerationStdDev: stdDev(accelerations),
    timestampRegularity: stdDev(intervals),
    microJitterScore: Math.min(1, mean(jitterValues) / 3),
    pauseCount,
  };
}

function scoreBehavioral(m: BehavioralMetrics): number {
  const pointScore = normalize(m.pointCount, 10, 200);
  const speedCV = m.averageSpeed > 0 ? m.speedStdDev / m.averageSpeed : 0;
  const speedScore = normalize(speedCV, 0.05, 0.6);
  const accelScore = normalize(m.accelerationStdDev, 10, 2000);
  const tsScore = normalize(m.timestampRegularity, 0.5, 10);
  const jitterScore = m.microJitterScore;
  const pauseScore = normalize(m.pauseCount, 0, 5);

  return (
    pointScore * 0.20 +
    speedScore * 0.20 +
    accelScore * 0.15 +
    tsScore * 0.15 +
    jitterScore * 0.15 +
    pauseScore * 0.15
  );
}

function scoreBallTracking(m: BallAnalysisMetrics): number {
  let distanceScore: number;
  if (m.averageDistance < 5) distanceScore = 0.1;
  else if (m.averageDistance < 10) distanceScore = 0.5;
  else if (m.averageDistance <= 50) distanceScore = 1.0;
  else if (m.averageDistance <= 100) distanceScore = 0.5;
  else distanceScore = 0.0;

  const distVariationScore = normalize(m.distanceStdDev, 5, 30);

  let lagScore: number;
  if (m.estimatedLag < 30) lagScore = 0.0;
  else if (m.estimatedLag < 80) lagScore = 0.3;
  else if (m.estimatedLag <= 500) lagScore = 1.0;
  else lagScore = 0.3;

  const lagConsistencyScore = normalize(m.lagConsistency, 5, 60);
  const overshootScore = normalize(m.overshootCount, 0, 5);

  let coverageScore: number;
  if (m.trackingCoverage < 0.3) coverageScore = 0.0;
  else if (m.trackingCoverage < 0.4) coverageScore = 0.4;
  else if (m.trackingCoverage <= 0.95) coverageScore = 1.0;
  else coverageScore = 0.3;

  return (
    distanceScore * 0.25 +
    distVariationScore * 0.15 +
    lagScore * 0.25 +
    lagConsistencyScore * 0.15 +
    overshootScore * 0.10 +
    coverageScore * 0.10
  );
}

export interface BallScoreResult {
  score: number;
  verdict: 'bot' | 'human' | 'uncertain';
}

/**
 * Compute the final score for a ball challenge.
 * Called server-side with the recorded ball frames and submitted cursor points.
 */
export function computeBallScore(
  cursorPoints: CursorPoint[],
  ballMetrics: BallAnalysisMetrics,
): BallScoreResult {
  const behavioral = analyzeBehavior(cursorPoints);
  const behavScore = scoreBehavioral(behavioral);
  const ballScore = scoreBallTracking(ballMetrics);

  const score = Math.max(0, Math.min(1, 0.50 * behavScore + 0.50 * ballScore));

  let verdict: 'bot' | 'human' | 'uncertain';
  if (score < 0.3) verdict = 'bot';
  else if (score > 0.7) verdict = 'human';
  else verdict = 'uncertain';

  return { score, verdict };
}
