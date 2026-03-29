import type { BallAnalysisMetrics, CursorPoint } from '../types';

function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

// --- Behavioral analysis (server-side version, same logic as client) ---

export interface BehavioralMetrics {
  pointCount: number;
  totalDuration: number;
  averageSpeed: number;
  speedStdDev: number;
  accelerationStdDev: number;
  timestampRegularity: number;
  microJitterScore: number;
  pauseCount: number;
}

// --- Velocity-Curvature Power Law (one-third power law) ---
// Natural human movement obeys V = k * R^(1/3) where V is tangential velocity
// and R is radius of curvature. The exponent β ≈ 0.33 for humans.
// Bots typically show β ≈ 0 (constant speed) or impossibly perfect adherence.

export interface PowerLawMetrics {
  beta: number;        // power law exponent (human ≈ 0.33)
  rSquared: number;    // goodness of fit in log-log space
  sampleCount: number; // number of valid velocity-curvature pairs used
}

export function analyzePowerLaw(points: CursorPoint[]): PowerLawMetrics {
  const fail: PowerLawMetrics = { beta: 0, rSquared: 0, sampleCount: 0 };
  if (points.length < 20) return fail;

  const logV: number[] = [];
  const logR: number[] = [];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1], curr = points[i], next = points[i + 1];

    const dt = next.t - prev.t;
    if (dt <= 0) continue;

    // Tangential velocity (px/s)
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const v = Math.sqrt(dx * dx + dy * dy) / dt * 1000;

    // Menger curvature from three consecutive points
    const ax = curr.x - prev.x, ay = curr.y - prev.y;
    const bx = next.x - curr.x, by = next.y - curr.y;
    const cross = Math.abs(ax * by - ay * bx);
    const dA = Math.sqrt(ax * ax + ay * ay);
    const dB = Math.sqrt(bx * bx + by * by);
    const dC = Math.sqrt(dx * dx + dy * dy);

    // Skip near-stationary or near-straight segments
    if (dA < 0.5 || dB < 0.5 || dC < 0.5) continue;

    const curvature = 2 * cross / (dA * dB * dC);
    if (curvature < 1e-6 || v < 1) continue;

    const R = 1 / curvature;
    logV.push(Math.log(v));
    logR.push(Math.log(R));
  }

  if (logV.length < 15) return { ...fail, sampleCount: logV.length };

  // Linear regression in log-log space: log(V) = a + β * log(R)
  const n = logV.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += logR[i];
    sumY += logV[i];
    sumXY += logR[i] * logV[i];
    sumX2 += logR[i] * logR[i];
  }

  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return { ...fail, sampleCount: n };

  const beta = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - beta * sumX) / n;

  // R² (coefficient of determination)
  const meanY = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    const predicted = intercept + beta * logR[i];
    ssRes += (logV[i] - predicted) ** 2;
    ssTot += (logV[i] - meanY) ** 2;
  }
  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  return { beta, rSquared, sampleCount: n };
}

/**
 * Hard-flag as bot if the power law metrics are extreme outliers.
 * Returns true if the movement is definitively non-human.
 */
export function isPowerLawBotFlag(m: PowerLawMetrics): boolean {
  // Need sufficient samples for a reliable determination
  if (m.sampleCount < 20) return false;

  // Constant velocity regardless of curvature — classic bot signature.
  // Human β is ~0.33; a value near 0 means speed doesn't vary with path curvature.
  if (Math.abs(m.beta) < 0.03 && m.rSquared > 0.3) return true;

  // Impossibly perfect power law adherence — bot explicitly mimicking the law.
  // Even skilled humans produce noisy data with R² rarely above 0.90.
  if (m.rSquared > 0.97) return true;

  // Negative β with good fit — speed increases with tighter curves (anti-human)
  if (m.beta < -0.05 && m.rSquared > 0.25) return true;

  return false;
}

/**
 * Score the power law adherence. Returns 0 (bot-like) to 1 (human-like).
 */
function scorePowerLaw(m: PowerLawMetrics): number {
  // Insufficient data — return neutral score
  if (m.sampleCount < 15) return 0.5;

  // Score based on how close β is to the expected 1/3
  const betaDeviation = Math.abs(m.beta - 1 / 3);
  const betaScore = Math.max(0, 1 - betaDeviation * 4); // 0 at β≈0.58 or β≈0.08

  // R² should be moderate (humans: 0.2-0.85 typically)
  let fitScore: number;
  if (m.rSquared < 0.1) fitScore = 0.2;       // no relationship at all
  else if (m.rSquared < 0.2) fitScore = 0.5;
  else if (m.rSquared <= 0.85) fitScore = 1.0; // human range
  else if (m.rSquared <= 0.93) fitScore = 0.6; // suspiciously good
  else fitScore = 0.2;                          // too perfect

  // Penalize negative β (anti-human: speeding up in curves)
  if (m.beta < 0) return Math.max(0, fitScore * 0.2);

  return betaScore * 0.6 + fitScore * 0.4;
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

export function scoreBehavioral(m: BehavioralMetrics, powerLaw?: PowerLawMetrics): number {
  const pointScore = normalize(m.pointCount, 10, 200);
  const speedCV = m.averageSpeed > 0 ? m.speedStdDev / m.averageSpeed : 0;
  const speedScore = normalize(speedCV, 0.05, 0.6);
  const accelScore = normalize(m.accelerationStdDev, 10, 2000);
  const tsScore = normalize(m.timestampRegularity, 0.5, 10);
  const jitterScore = m.microJitterScore;
  const pauseScore = normalize(m.pauseCount, 0, 5);
  const plScore = powerLaw ? scorePowerLaw(powerLaw) : 0.5;

  return (
    pointScore * 0.15 +
    speedScore * 0.15 +
    accelScore * 0.12 +
    tsScore * 0.13 +
    jitterScore * 0.13 +
    pauseScore * 0.12 +
    plScore * 0.20
  );
}

function scoreBallTracking(m: BallAnalysisMetrics): number {
  // Distance: humans are imprecise — average 30-120px is normal.
  // Only penalize very tight (bot-like) or very far (not following).
  let distanceScore: number;
  if (m.averageDistance < 5) distanceScore = 0.1;       // suspiciously accurate
  else if (m.averageDistance < 15) distanceScore = 0.6;  // maybe bot, maybe skilled
  else if (m.averageDistance <= 140) distanceScore = 1.0; // human range
  else if (m.averageDistance <= 220) distanceScore = 0.5; // poor tracking but trying
  else distanceScore = 0.0;                               // not following

  // Distance variation: humans have variable distance, bots are steady
  const distVariationScore = normalize(m.distanceStdDev, 3, 25);

  // Lag: humans react in 100-500ms. With 20fps frames there's inherent display lag.
  let lagScore: number;
  if (m.estimatedLag < 20) lagScore = 0.0;        // bot — reacting before seeing
  else if (m.estimatedLag < 60) lagScore = 0.4;   // suspicious
  else if (m.estimatedLag <= 600) lagScore = 1.0;  // human range (wide)
  else lagScore = 0.4;                              // very delayed but still moving

  const lagConsistencyScore = normalize(m.lagConsistency, 5, 60);
  const overshootScore = normalize(m.overshootCount, 0, 4);

  // Coverage: fraction of time within tracking range (150px).
  // Humans casually following will be within range most of the time.
  let coverageScore: number;
  if (m.trackingCoverage < 0.15) coverageScore = 0.0;  // not following at all
  else if (m.trackingCoverage < 0.3) coverageScore = 0.4;
  else if (m.trackingCoverage <= 0.97) coverageScore = 1.0;
  else coverageScore = 0.4; // suspiciously perfect

  return (
    distanceScore * 0.20 +
    distVariationScore * 0.15 +
    lagScore * 0.20 +
    lagConsistencyScore * 0.15 +
    overshootScore * 0.10 +
    coverageScore * 0.20
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
  // Power law hard-flag: immediate bot verdict if movement violates the law
  const powerLaw = analyzePowerLaw(cursorPoints);
  if (isPowerLawBotFlag(powerLaw)) {
    return { score: 0, verdict: 'bot' };
  }

  const behavioral = analyzeBehavior(cursorPoints);
  const behavScore = scoreBehavioral(behavioral, powerLaw);
  const ballScore = scoreBallTracking(ballMetrics);

  const score = Math.max(0, Math.min(1, 0.50 * behavScore + 0.50 * ballScore));

  let verdict: 'bot' | 'human' | 'uncertain';
  if (score < 0.25) verdict = 'bot';
  else if (score > 0.45) verdict = 'human';
  else verdict = 'uncertain';

  return { score, verdict };
}
