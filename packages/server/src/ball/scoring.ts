import type { BallAnalysisMetrics, CursorPoint, ClientEnvironment, RequestMeta } from '../types';

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

  // Calibrated 2026-04-19 from 7 human traces (β 0.64-1.06, R² 0.19-0.46) and
  // 20 bot traces (β 0.19-0.35, R² 0.07-0.32). Bots mimic the literature
  // "1/3 power law" because it's the textbook value — but on this
  // ball-tracking task real humans operate at a much larger β. A power-law
  // fit landing near 1/3 is the bot signature here.
  //
  // R² threshold 0.05 chosen to catch noisy adaptive bots whose R² drops
  // below 0.10 after heavy noise injection — human floor is 0.19, so this
  // leaves a ~3.8× safety margin.
  if (m.beta < 0.40 && m.rSquared > 0.05) return true;

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

  // Re-calibrated from real traces (2026-04-19). On this ball-tracking task
  // humans cluster at β ≈ 0.65-1.10; the "textbook 1/3" value is what bots
  // produce when injecting gaussian noise on a spring-follower. Flipping the
  // target range fixes a scoring bug where bots were getting 1.0 and humans 0.
  let betaScore: number;
  if (m.beta < 0.40) betaScore = 0.0;          // classic 1/3-law bot
  else if (m.beta < 0.55) betaScore = 0.3;
  else if (m.beta <= 1.15) betaScore = 1.0;    // human range
  else betaScore = 0.5;                         // unusually high but possible

  let fitScore: number;
  if (m.rSquared < 0.05) fitScore = 0.2;       // no power-law relationship
  else if (m.rSquared < 0.15) fitScore = 0.5;
  else if (m.rSquared <= 0.85) fitScore = 1.0; // human range
  else if (m.rSquared <= 0.93) fitScore = 0.6; // suspiciously good
  else fitScore = 0.2;                          // too perfect

  // Penalize negative β (anti-human: speeding up in curves)
  if (m.beta < 0) return Math.max(0, fitScore * 0.2);

  return betaScore * 0.6 + fitScore * 0.4;
}

// --- Interval regularity ---
// Mechanical timing — events locked to a fixed tick rate with no natural
// pauses — is the residual signal that both CDP-driven and pure-HTTP bots
// leak. Real browsers produce highly variable inter-event intervals because
// pointer events fire on hardware polling + OS scheduling + rendering pacing,
// all of which add asymmetric noise that no ticker-based bot reproduces.

export interface IntervalRegularityMetrics {
  intervalCV: number;   // stdDev(intervals) / mean(intervals)
  pointCount: number;
  duration: number;     // ms
  pauseCount: number;   // saccade-like pauses (dt>50ms, d<2px)
}

export function analyzeIntervalRegularity(points: CursorPoint[]): IntervalRegularityMetrics {
  if (points.length < 2) {
    return { intervalCV: 0, pointCount: points.length, duration: 0, pauseCount: 0 };
  }

  const intervals: number[] = [];
  let pauseCount = 0;
  for (let i = 1; i < points.length; i++) {
    const dt = points[i].t - points[i - 1].t;
    if (dt > 0) intervals.push(dt);
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    if (dt > 50 && Math.sqrt(dx * dx + dy * dy) < 2) pauseCount++;
  }

  const duration = points[points.length - 1].t - points[0].t;
  if (intervals.length < 2) {
    return { intervalCV: 0, pointCount: points.length, duration, pauseCount };
  }

  const m = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  const sd = Math.sqrt(
    intervals.reduce((s, v) => s + (v - m) ** 2, 0) / intervals.length
  );
  return {
    intervalCV: m > 0 ? sd / m : 0,
    pointCount: points.length,
    duration,
    pauseCount,
  };
}

/**
 * Hard-flag a session whose timing is mechanically locked (CV below the
 * human floor) AND contains no saccade pauses over a long tracking window.
 *
 * Calibrated 2026-04-19 from 7 real human traces (CV 1.6–2.2, pauseCount 1–9)
 * and 20 bot traces (CV 0.13–0.22, pauseCount 0). Humans fall above 0.5 CV
 * *and* above 0 pauses; no bot trace in the attack corpus satisfies either.
 *
 * Both conditions required to trigger — a human could conceivably maintain
 * steady timing on a gaming mouse OR never pause for 8s, but not both.
 */
export function isIntervalRegularityBotFlag(m: IntervalRegularityMetrics): boolean {
  // Need enough data for CV to be meaningful and the tracking window long
  // enough that saccade pauses would normally occur.
  if (m.pointCount < 100 || m.duration < 6000) return false;
  // Strict: mechanical timing + zero saccades (original attacks).
  if (m.intervalCV < 0.5 && m.pauseCount === 0) return true;
  // Looser: near-mechanical timing with token saccade injection. CV < 0.7
  // is still 2.3× below the human floor (1.61 min across 7 calibration
  // traces); pauseCount ≤ 1 catches attackers who add only the bare-minimum
  // fake pauses. Requires pointCount ≥ 200 to avoid flagging short sessions.
  if (m.pointCount >= 200 && m.intervalCV < 0.7 && m.pauseCount <= 1) return true;
  return false;
}

function scoreIntervalRegularity(m: IntervalRegularityMetrics): number {
  if (m.pointCount < 30) return 0.5;

  // CV scoring calibrated from real traces. Bots sit at 0.13-0.22; humans at 1.6+.
  let cvScore: number;
  if (m.intervalCV < 0.3) cvScore = 0.05;
  else if (m.intervalCV < 0.5) cvScore = 0.2;
  else if (m.intervalCV < 0.8) cvScore = 0.5;
  else if (m.intervalCV < 1.2) cvScore = 0.8;
  else if (m.intervalCV <= 3.0) cvScore = 1.0;
  else cvScore = 0.7;

  // Pause density scoring. Humans produce ~1 saccade per second of tracking.
  // Zero pauses across a long window is a strong bot signal.
  const pausesPerSec = m.duration > 0 ? m.pauseCount / (m.duration / 1000) : 0;
  let pauseScore: number;
  if (m.duration < 4000) pauseScore = 0.5;             // too short to expect pauses
  else if (pausesPerSec === 0) pauseScore = 0.05;
  else if (pausesPerSec < 0.2) pauseScore = 0.6;
  else if (pausesPerSec <= 2.0) pauseScore = 1.0;
  else pauseScore = 0.8;

  return cvScore * 0.6 + pauseScore * 0.4;
}

// --- Residual noise after local detrending ---
// The strongest biomechanical signal a human cursor leaks is the unpredictable
// jitter around the local motion trend. Fit a sliding linear trend (window=10
// points each side, 21-point fit) at each position and measure the stddev of
// the residuals. Real humans produce ~3.6-4.8 px/axis; smoothly-interpolated
// bots (spring follower, gaussian cursor noise) produce 0.8-1.1 px/axis — a
// 3-4× gap. Insider-style bots with heavy noise injection overlap with humans
// on THIS signal but fail elsewhere; the two flags together close the gap.

export interface ResidualNoiseMetrics {
  /** Per-axis mean of the residual stddev across the session. */
  residualStd: number;
  sampleCount: number;
}

export function analyzeResidualNoise(points: CursorPoint[]): ResidualNoiseMetrics {
  if (points.length < 30) return { residualStd: 0, sampleCount: points.length };

  const ts = points.map(p => p.t);
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const W = 10;
  const rx: number[] = [];
  const ry: number[] = [];

  for (let i = 0; i < points.length; i++) {
    const lo = Math.max(0, i - W);
    const hi = Math.min(points.length, i + W + 1);
    let sumT = 0, sumX = 0, sumY = 0, sumTX = 0, sumTY = 0, sumT2 = 0;
    const n = hi - lo;
    for (let j = lo; j < hi; j++) {
      sumT += ts[j];
      sumX += xs[j];
      sumY += ys[j];
      sumTX += ts[j] * xs[j];
      sumTY += ts[j] * ys[j];
      sumT2 += ts[j] * ts[j];
    }
    const denom = n * sumT2 - sumT * sumT;
    if (Math.abs(denom) < 1e-6) {
      rx.push(0);
      ry.push(0);
      continue;
    }
    const mx = (n * sumTX - sumT * sumX) / denom;
    const bx = (sumX - mx * sumT) / n;
    const my = (n * sumTY - sumT * sumY) / denom;
    const by = (sumY - my * sumT) / n;
    rx.push(xs[i] - (mx * ts[i] + bx));
    ry.push(ys[i] - (my * ts[i] + by));
  }

  const meanX = rx.reduce((s, v) => s + v, 0) / rx.length;
  const meanY = ry.reduce((s, v) => s + v, 0) / ry.length;
  const varX = rx.reduce((s, v) => s + (v - meanX) ** 2, 0) / rx.length;
  const varY = ry.reduce((s, v) => s + (v - meanY) ** 2, 0) / ry.length;
  return {
    residualStd: (Math.sqrt(varX) + Math.sqrt(varY)) / 2,
    sampleCount: points.length,
  };
}

/**
 * Hard-flag as bot if the cursor motion has too little residual noise after
 * local detrending. This is the signature of smoothly-interpolated motion
 * (CDP mouse + spring follower + minimal noise).
 *
 * Calibrated 2026-04-19 from 7 human traces (residualStd 3.58-4.81) and 20
 * bot traces (blackbox 0.75-1.09, insider 2.96-4.30). A threshold of 1.5 px
 * leaves ~2× safety margin above blackbox max and catches the signature
 * cleanly. Insider-class bots with heavy noise injection are caught by the
 * distance-stddev flag instead.
 */
export function isResidualNoiseBotFlag(m: ResidualNoiseMetrics): boolean {
  if (m.sampleCount < 100) return false;
  return m.residualStd < 1.5;
}

function scoreResidualNoise(m: ResidualNoiseMetrics): number {
  if (m.sampleCount < 30) return 0.5;
  // Humans cluster at 3.5-5; deeply smooth bots under 1.5; noise-spoofing bots 2.5-4.5.
  if (m.residualStd < 1.0) return 0.05;
  if (m.residualStd < 1.8) return 0.2;
  if (m.residualStd < 2.8) return 0.5;
  if (m.residualStd <= 6) return 1.0;
  return 0.6;
}

// --- Spectral Timing Analysis ---
// Detects bots using setInterval/requestAnimationFrame by finding
// sharp frequency peaks in inter-event timing via DFT.

export interface SpectralMetrics {
  peakRatio: number;       // ratio of strongest DFT peak to mean magnitude
  dominantPeriodMs: number; // period of the dominant frequency
  sampleCount: number;
}

export function analyzeTimingSpectrum(points: CursorPoint[]): SpectralMetrics {
  const fail: SpectralMetrics = { peakRatio: 0, dominantPeriodMs: 0, sampleCount: 0 };
  if (points.length < 20) return fail;

  const intervals: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const dt = points[i].t - points[i - 1].t;
    if (dt > 0) intervals.push(dt);
  }
  if (intervals.length < 15) return { ...fail, sampleCount: intervals.length };

  // Remove mean (DC component)
  const n = intervals.length;
  const meanInterval = intervals.reduce((s, v) => s + v, 0) / n;
  const centered = intervals.map(v => v - meanInterval);

  // DFT — only compute magnitudes for frequencies up to N/2
  const numFreqs = Math.floor(n / 2);
  const magnitudes: number[] = [];

  for (let k = 1; k <= numFreqs; k++) {
    let re = 0, im = 0;
    for (let j = 0; j < n; j++) {
      const angle = (2 * Math.PI * k * j) / n;
      re += centered[j] * Math.cos(angle);
      im -= centered[j] * Math.sin(angle);
    }
    magnitudes.push(Math.sqrt(re * re + im * im) / n);
  }

  if (magnitudes.length === 0) return { ...fail, sampleCount: n };

  const meanMag = magnitudes.reduce((s, v) => s + v, 0) / magnitudes.length;
  let maxMag = 0, maxK = 1;
  for (let i = 0; i < magnitudes.length; i++) {
    if (magnitudes[i] > maxMag) {
      maxMag = magnitudes[i];
      maxK = i + 1;
    }
  }

  const peakRatio = meanMag > 0 ? maxMag / meanMag : 0;
  const dominantPeriodMs = (n * meanInterval) / maxK;

  return { peakRatio, dominantPeriodMs, sampleCount: n };
}

export function isSpectralBotFlag(m: SpectralMetrics): boolean {
  // For random human noise, peak/mean ≈ 2-5. For strong periodic signals, > 10.
  return m.sampleCount >= 30 && m.peakRatio > 8.0;
}

function scoreSpectral(m: SpectralMetrics): number {
  if (m.sampleCount < 15) return 0.5;
  // Random noise has peak/mean ≈ 2-5; periodic signals have much higher.
  if (m.peakRatio < 3.0) return 1.0;    // very noisy (human)
  if (m.peakRatio < 5.0) return 0.8;    // somewhat noisy
  if (m.peakRatio < 7.0) return 0.5;    // suspicious
  if (m.peakRatio < 9.0) return 0.3;    // likely periodic
  return 0.1;                              // strong periodicity (bot)
}

// --- Jerk Analysis ---
// Jerk = derivative of acceleration. Human movement follows minimum-jerk profiles
// producing smooth bell-shaped velocity curves. Bots have zero or discontinuous jerk.

export interface JerkMetrics {
  jerkStdDev: number;    // standard deviation of jerk values
  jerkZeroRatio: number; // fraction of near-zero jerk segments
  sampleCount: number;
}

export function analyzeJerk(points: CursorPoint[]): JerkMetrics {
  const fail: JerkMetrics = { jerkStdDev: 0, jerkZeroRatio: 1, sampleCount: 0 };
  if (points.length < 10) return fail;

  // Compute velocities
  const velocities: number[] = [];
  const times: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const dt = points[i].t - points[i - 1].t;
    if (dt <= 0) continue;
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    velocities.push(Math.sqrt(dx * dx + dy * dy) / dt * 1000);
    times.push((points[i].t + points[i - 1].t) / 2);
  }

  // Compute accelerations
  const accels: number[] = [];
  const accelTimes: number[] = [];
  for (let i = 1; i < velocities.length; i++) {
    const dt = times[i] - times[i - 1];
    if (dt <= 0) continue;
    accels.push((velocities[i] - velocities[i - 1]) / dt * 1000);
    accelTimes.push((times[i] + times[i - 1]) / 2);
  }

  // Compute jerk
  const jerks: number[] = [];
  for (let i = 1; i < accels.length; i++) {
    const dt = accelTimes[i] - accelTimes[i - 1];
    if (dt <= 0) continue;
    jerks.push((accels[i] - accels[i - 1]) / dt * 1000);
  }

  if (jerks.length < 5) return { ...fail, sampleCount: jerks.length };

  const jerkMean = jerks.reduce((s, v) => s + v, 0) / jerks.length;
  const jerkStdDev = Math.sqrt(jerks.reduce((s, v) => s + (v - jerkMean) ** 2, 0) / (jerks.length - 1));

  const JERK_ZERO_THRESHOLD = 50;
  const nearZero = jerks.filter(j => Math.abs(j) < JERK_ZERO_THRESHOLD).length;
  const jerkZeroRatio = nearZero / jerks.length;

  return { jerkStdDev, jerkZeroRatio, sampleCount: jerks.length };
}

function scoreJerk(m: JerkMetrics): number {
  if (m.sampleCount < 5) return 0.5;

  // High jerk variation = human (complex movement dynamics)
  const variationScore = normalize(m.jerkStdDev, 100, 50000);

  // Low zero-ratio = human (jerk is rarely exactly zero)
  // High zero-ratio = bot (constant acceleration segments)
  const zeroScore = m.jerkZeroRatio < 0.3 ? 1.0
    : m.jerkZeroRatio < 0.5 ? 0.7
    : m.jerkZeroRatio < 0.7 ? 0.4
    : 0.1;

  return variationScore * 0.6 + zeroScore * 0.4;
}

// --- Sub-movement Segmentation ---
// Human reaching movements consist of 15-40 velocity peaks in a typical 8-second task.
// Too few = smooth bot interpolation. Too regular = noise-injecting bot.

export interface SubMovementMetrics {
  peakCount: number;
  peakRegularity: number; // CV of inter-peak intervals (low = too regular)
  duration: number;       // total duration in ms
}

export function analyzeSubMovements(points: CursorPoint[]): SubMovementMetrics {
  const fail: SubMovementMetrics = { peakCount: 0, peakRegularity: 0, duration: 0 };
  if (points.length < 20) return fail;

  const duration = points[points.length - 1].t - points[0].t;
  if (duration < 500) return { ...fail, duration };

  // Compute smoothed speed profile
  const speeds: number[] = [];
  const speedTimes: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const dt = points[i].t - points[i - 1].t;
    if (dt <= 0) continue;
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    speeds.push(Math.sqrt(dx * dx + dy * dy) / dt * 1000);
    speedTimes.push(points[i].t);
  }

  if (speeds.length < 15) return { ...fail, duration };

  // Simple moving average smoothing (window=5)
  const smoothed: number[] = [];
  const SMOOTH_WIN = Math.min(5, Math.floor(speeds.length / 4));
  for (let i = 0; i < speeds.length; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - SMOOTH_WIN); j <= Math.min(speeds.length - 1, i + SMOOTH_WIN); j++) {
      sum += speeds[j];
      count++;
    }
    smoothed.push(sum / count);
  }

  // Find velocity peaks (local maxima above noise floor)
  const meanSpeed = smoothed.reduce((s, v) => s + v, 0) / smoothed.length;
  const noiseFloor = meanSpeed * 0.3;
  const peakIndices: number[] = [];

  for (let i = 1; i < smoothed.length - 1; i++) {
    if (smoothed[i] > smoothed[i - 1] && smoothed[i] > smoothed[i + 1] && smoothed[i] > noiseFloor) {
      peakIndices.push(i);
    }
  }

  if (peakIndices.length < 2) return { peakCount: peakIndices.length, peakRegularity: 0, duration };

  // Compute inter-peak interval regularity (CV)
  const peakIntervals: number[] = [];
  for (let i = 1; i < peakIndices.length; i++) {
    peakIntervals.push(speedTimes[peakIndices[i]] - speedTimes[peakIndices[i - 1]]);
  }
  const meanInterval = peakIntervals.reduce((s, v) => s + v, 0) / peakIntervals.length;
  const intervalStdDev = Math.sqrt(
    peakIntervals.reduce((s, v) => s + (v - meanInterval) ** 2, 0) / peakIntervals.length
  );
  const peakRegularity = meanInterval > 0 ? intervalStdDev / meanInterval : 0;

  return { peakCount: peakIndices.length, peakRegularity, duration };
}

function scoreSubMovements(m: SubMovementMetrics): number {
  if (m.duration < 500 || m.peakCount < 2) return 0.5;

  // Normalize peak count per second, expect ~2-5 peaks/sec for humans
  const peaksPerSec = m.peakCount / (m.duration / 1000);
  let countScore: number;
  if (peaksPerSec < 0.5) countScore = 0.1;       // too few (smooth bot)
  else if (peaksPerSec < 1.5) countScore = 0.5;
  else if (peaksPerSec <= 6) countScore = 1.0;    // human range
  else if (peaksPerSec <= 10) countScore = 0.6;
  else countScore = 0.2;                            // too many (noise bot)

  // Peak regularity: humans have irregular peaks (CV > 0.3)
  let regularityScore: number;
  if (m.peakRegularity < 0.1) regularityScore = 0.1;  // too regular (bot)
  else if (m.peakRegularity < 0.25) regularityScore = 0.4;
  else if (m.peakRegularity <= 1.0) regularityScore = 1.0;
  else regularityScore = 0.7;                           // very irregular but ok

  return countScore * 0.6 + regularityScore * 0.4;
}

// --- Drift/Bias Detection ---
// Human cursor movement has systematic biases. Perfectly symmetric error distributions
// suggest synthetic input.

export interface DriftMetrics {
  xSkewness: number;
  ySkewness: number;
  biasSymmetry: number; // |skewX - skewY| — low = suspiciously symmetric
}

export function analyzeDrift(points: CursorPoint[]): DriftMetrics {
  const fail: DriftMetrics = { xSkewness: 0, ySkewness: 0, biasSymmetry: 0 };
  if (points.length < 20) return fail;

  const dxs: number[] = [];
  const dys: number[] = [];
  for (let i = 1; i < points.length; i++) {
    dxs.push(points[i].x - points[i - 1].x);
    dys.push(points[i].y - points[i - 1].y);
  }

  function skewness(values: number[]): number {
    const n = values.length;
    if (n < 3) return 0;
    const m = values.reduce((s, v) => s + v, 0) / n;
    const s2 = values.reduce((s, v) => s + (v - m) ** 2, 0) / n;
    const s3 = values.reduce((s, v) => s + (v - m) ** 3, 0) / n;
    const sd = Math.sqrt(s2);
    if (sd < 1e-10) return 0;
    return s3 / (sd * sd * sd);
  }

  const xSkewness = skewness(dxs);
  const ySkewness = skewness(dys);
  const biasSymmetry = Math.abs(Math.abs(xSkewness) - Math.abs(ySkewness));

  return { xSkewness, ySkewness, biasSymmetry };
}

function scoreDrift(m: DriftMetrics): number {
  // Humans have asymmetric biases — some skewness is expected
  const hasSkew = Math.abs(m.xSkewness) > 0.1 || Math.abs(m.ySkewness) > 0.1;

  // biasSymmetry: higher = more asymmetric between axes = more human
  // Very low biasSymmetry + no skewness = suspicious
  if (!hasSkew && m.biasSymmetry < 0.05) return 0.2; // perfectly centered, symmetric

  if (m.biasSymmetry < 0.05) return 0.4; // symmetric but at least some skew
  if (m.biasSymmetry < 0.2) return 0.7;
  return 1.0; // good asymmetry
}

// --- Timestamp Validation ---
// Hard flag: non-monotonic timestamps, duplicates, or resolution-locked intervals.

export function isTimestampBotFlag(points: CursorPoint[]): boolean {
  if (points.length < 10) return false;

  // Check strictly increasing
  for (let i = 1; i < points.length; i++) {
    if (points[i].t <= points[i - 1].t) return true;
  }

  // Check for resolution-locked intervals (>80% identical ±0.1ms)
  const intervals: number[] = [];
  for (let i = 1; i < points.length; i++) {
    intervals.push(points[i].t - points[i - 1].t);
  }

  if (intervals.length < 10) return false;

  // Count how many intervals match the most common value
  const buckets = new Map<number, number>();
  for (const iv of intervals) {
    const key = Math.round(iv * 10); // 0.1ms precision
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  let maxCount = 0;
  for (const count of buckets.values()) {
    if (count > maxCount) maxCount = count;
  }

  return maxCount / intervals.length > 0.8;
}

// --- Environment Bot Detection ---
// Analyzes client-collected browser signals and HTTP request headers.

export function isEnvironmentBotFlag(env?: ClientEnvironment, meta?: RequestMeta): boolean {
  if (!env) return false;

  // navigator.webdriver is set by Selenium, Puppeteer, Playwright
  if (env.webdriver) return true;

  // Headless browsers often have 0 outer dimensions
  if (env.outerWidth === 0 && env.outerHeight === 0 && env.screenWidth > 0) return true;

  return false;
}

export function scoreEnvironment(env?: ClientEnvironment, meta?: RequestMeta): number {
  if (!env && !meta) return 0.5; // no data — neutral

  let score = 1.0;
  let signals = 0;

  if (env) {
    signals++;
    if (env.webdriver) return 0.0; // hard zero

    // Plugin count: real browsers typically have plugins
    if (env.pluginCount === 0) score -= 0.15;

    // Language count: headless browsers often have 0 or 1
    if (env.languageCount === 0) score -= 0.15;
    else if (env.languageCount === 1) score -= 0.05;

    // Outer dimensions: headless = 0
    if (env.outerWidth === 0 && env.outerHeight === 0) score -= 0.2;

    // Color depth: unusual values
    if (env.colorDepth < 16) score -= 0.1;

    // Device pixel ratio: 0 or extremely high is suspicious
    if (env.devicePixelRatio === 0) score -= 0.1;
  }

  if (meta) {
    signals++;
    // Missing User-Agent is very suspicious
    if (!meta.userAgent || meta.userAgent.length < 10) score -= 0.15;

    // Missing Accept-Language
    if (!meta.acceptLanguage) score -= 0.1;

    // Known headless indicators in User-Agent
    if (meta.userAgent) {
      const ua = meta.userAgent.toLowerCase();
      if (ua.includes('headless')) score -= 0.3;
      if (ua.includes('phantomjs')) score -= 0.3;
    }
  }

  if (signals === 0) return 0.5;
  return Math.max(0, Math.min(1, score));
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

export interface BehavioralSignals {
  powerLaw?: PowerLawMetrics;
  spectral?: SpectralMetrics;
  jerk?: JerkMetrics;
  subMovement?: SubMovementMetrics;
  drift?: DriftMetrics;
  intervalReg?: IntervalRegularityMetrics;
  residualNoise?: ResidualNoiseMetrics;
  envScore?: number; // pre-computed environment score (0-1)
}

export function scoreBehavioral(m: BehavioralMetrics, signals: BehavioralSignals = {}): number {
  const pointScore = normalize(m.pointCount, 10, 200);
  const speedCV = m.averageSpeed > 0 ? m.speedStdDev / m.averageSpeed : 0;
  const speedScore = normalize(speedCV, 0.05, 0.6);
  const accelScore = normalize(m.accelerationStdDev, 10, 2000);
  const tsScore = normalize(m.timestampRegularity, 0.5, 10);
  const jitterScore = m.microJitterScore;
  const pauseScore = normalize(m.pauseCount, 0, 5);
  const plScore = signals.powerLaw ? scorePowerLaw(signals.powerLaw) : 0.5;
  const specScore = signals.spectral ? scoreSpectral(signals.spectral) : 0.5;
  const jkScore = signals.jerk ? scoreJerk(signals.jerk) : 0.5;
  const smScore = signals.subMovement ? scoreSubMovements(signals.subMovement) : 0.5;
  const drScore = signals.drift ? scoreDrift(signals.drift) : 0.5;
  const regScore = signals.intervalReg ? scoreIntervalRegularity(signals.intervalReg) : 0.5;
  const rnScore = signals.residualNoise ? scoreResidualNoise(signals.residualNoise) : 0.5;
  const enScore = signals.envScore ?? 0.5;

  return (
    pointScore * 0.05 +
    speedScore * 0.05 +
    accelScore * 0.04 +
    tsScore * 0.05 +
    jitterScore * 0.05 +
    pauseScore * 0.05 +
    plScore * 0.11 +
    specScore * 0.09 +
    jkScore * 0.08 +
    smScore * 0.08 +
    drScore * 0.05 +
    regScore * 0.11 +
    rnScore * 0.14 +
    enScore * 0.05
  );
}

// --- Ball-specific scoring types (computed in analyze.ts) ---

export interface SpeedProfileMetrics {
  decelAccelRatio: number; // ratio of deceleration to acceleration phase around turns
  changeCount: number;     // number of direction changes analyzed
  avgAsymmetry: number;    // average asymmetry of speed profiles
}

export interface ReactionTimeMetrics {
  meanRT: number;       // mean reaction time in ms
  rtStdDev: number;     // std dev of reaction times
  rtSkewness: number;   // skewness (humans: positive/right-skewed)
  rtCV: number;         // coefficient of variation
  sampleCount: number;
}

function scoreSpeedProfile(m?: SpeedProfileMetrics): number {
  if (!m || m.changeCount < 3) return 0.5;
  // Humans decelerate longer than they accelerate (ratio > 1.0)
  let ratioScore: number;
  if (m.decelAccelRatio < 0.5) ratioScore = 0.2;      // no deceleration (bot)
  else if (m.decelAccelRatio < 0.8) ratioScore = 0.5;
  else if (m.decelAccelRatio <= 2.0) ratioScore = 1.0; // human range
  else ratioScore = 0.6;                                // excessive deceleration

  // Asymmetry should exist (humans have asymmetric speed curves)
  const asymScore = normalize(m.avgAsymmetry, 0.05, 0.5);

  return ratioScore * 0.6 + asymScore * 0.4;
}

function scoreReactionTime(m?: ReactionTimeMetrics, directionChangeCount = 0): number {
  if (!m) return 0.5;

  // No direction changes happened — reaction time doesn't apply
  if (directionChangeCount === 0) return 0.5;

  // Direction changes occurred but fewer than 3 RT samples captured
  if (m.sampleCount < 3) {
    if (m.sampleCount === 0) {
      // Should have been hard-flagged upstream, but be defensive
      return 0.0;
    }
    // 1-2 samples is insufficient — heavy penalty instead of neutral 0.5
    return 0.1;
  }

  // Mean RT: 100-500ms is human, <50ms is impossible
  let meanScore: number;
  if (m.meanRT < 50) meanScore = 0.0;       // impossibly fast
  else if (m.meanRT < 100) meanScore = 0.3;  // very fast
  else if (m.meanRT <= 500) meanScore = 1.0; // human range
  else meanScore = 0.5;                       // slow but could be human

  // Skewness: humans have positive skew (right tail, ex-Gaussian)
  let skewScore: number;
  if (m.rtSkewness < -0.2) skewScore = 0.2;   // negative skew = bot-like
  else if (m.rtSkewness < 0.1) skewScore = 0.5; // near-symmetric
  else if (m.rtSkewness <= 2.0) skewScore = 1.0; // healthy positive skew
  else skewScore = 0.7;                           // very skewed but ok

  // CV: humans have moderate variability (0.15-0.5)
  let cvScore: number;
  if (m.rtCV < 0.05) cvScore = 0.1;       // too consistent (bot)
  else if (m.rtCV < 0.15) cvScore = 0.5;
  else if (m.rtCV <= 0.6) cvScore = 1.0;  // human range
  else cvScore = 0.6;                       // very variable but ok

  return meanScore * 0.4 + skewScore * 0.3 + cvScore * 0.3;
}

function scoreBallTracking(
  m: BallAnalysisMetrics,
  speedProfile?: SpeedProfileMetrics,
  reactionTime?: ReactionTimeMetrics,
  directionChangeCount = 0,
): number {
  // Distance (Fix 3: tightened band)
  // Hard flags for <10px and >0.9 coverage are handled upstream in computeBallScore.
  let distanceScore: number;
  if (m.averageDistance < 10) distanceScore = 0.2;
  else if (m.averageDistance < 15) distanceScore = 0.6;
  else if (m.averageDistance <= 80) distanceScore = 1.0;
  else if (m.averageDistance <= 100) distanceScore = normalize(100 - m.averageDistance, 0, 20);
  else distanceScore = 0.0;

  // Distance variation unchanged
  const distVariationScore = normalize(m.distanceStdDev, 3, 25);

  // Lag unchanged
  let lagScore: number;
  if (m.estimatedLag < 20) lagScore = 0.0;
  else if (m.estimatedLag < 60) lagScore = 0.4;
  else if (m.estimatedLag <= 600) lagScore = 1.0;
  else lagScore = 0.4;

  const lagConsistencyScore = normalize(m.lagConsistency, 5, 60);
  const overshootScore = normalize(m.overshootCount, 0, 4);

  // Coverage (Fix 3: tightened, but hard flag upstream catches the extreme cases)
  let coverageScore: number;
  if (m.trackingCoverage < 0.15) coverageScore = 0.0;
  else if (m.trackingCoverage < 0.3) coverageScore = 0.4;
  else if (m.trackingCoverage <= 0.9) coverageScore = 1.0;
  else coverageScore = 0.5;

  // Fix 1: frame-within-tight fold-in (20% of ball score)
  const tightnessScore = normalize(m.frameWithinTight, 0.55, 0.85);

  const spScore = scoreSpeedProfile(speedProfile);
  const rtScore = scoreReactionTime(reactionTime, directionChangeCount);

  return (
    distanceScore * 0.10 +
    distVariationScore * 0.10 +
    lagScore * 0.12 +
    lagConsistencyScore * 0.10 +
    overshootScore * 0.08 +
    coverageScore * 0.12 +
    tightnessScore * 0.20 +
    spScore * 0.08 +
    rtScore * 0.10
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
  speedProfile?: SpeedProfileMetrics,
  reactionTime?: ReactionTimeMetrics,
  clientEnv?: ClientEnvironment,
  requestMeta?: RequestMeta,
  directionChangeCount = 0,
  frameAckFlag: string | null = null,
): BallScoreResult {
  // Fix 4 — frame ack validation (computed upstream by analyzeFrameAcks)
  if (frameAckFlag !== null) {
    return { score: 0, verdict: 'bot' };
  }

  // Hard flags — immediate bot verdict
  if (isTimestampBotFlag(cursorPoints)) return { score: 0, verdict: 'bot' };
  if (isEnvironmentBotFlag(clientEnv, requestMeta)) return { score: 0, verdict: 'bot' };

  const powerLaw = analyzePowerLaw(cursorPoints);
  if (isPowerLawBotFlag(powerLaw)) return { score: 0, verdict: 'bot' };

  const spectral = analyzeTimingSpectrum(cursorPoints);
  if (isSpectralBotFlag(spectral)) return { score: 0, verdict: 'bot' };

  // Fix 5 — mechanical timing / no-saccade hard flag. Catches CDP-driven
  // setTimeout bots and pure-HTTP ticker bots that leak a narrow inter-event
  // interval distribution with zero natural pauses.
  const intervalReg = analyzeIntervalRegularity(cursorPoints);
  if (isIntervalRegularityBotFlag(intervalReg)) {
    return { score: 0, verdict: 'bot' };
  }

  // Fix 6 — residual-noise hard flag. Catches smoothly-interpolated cursors
  // (CDP mouse dispatched to a spring follower with minimal noise) whose
  // motion, after local detrending, contains almost no biomechanical jitter.
  const residualNoise = analyzeResidualNoise(cursorPoints);
  if (isResidualNoiseBotFlag(residualNoise)) {
    return { score: 0, verdict: 'bot' };
  }

  // Fix 1 — frame-level tracking enforcement
  // Calibrated from real human traces (2026-04-12): precise tracking sits at
  // avgDistance ~9-13px with frameWithinTight=1.0 against R_TIGHT=80. The
  // original frameWithinTight>0.95 AND avg<12 flag and coverage>0.9 AND
  // avg<20 flag both false-positived real humans and have been removed —
  // frameWithinTight<0.55 alone catches "not tracking".
  if (ballMetrics.frameWithinTight < 0.55) {
    return { score: 0, verdict: 'bot' };
  }

  // Fix 3 — inhuman precision hard flag (tightened from <10/<3 to <5/<2).
  // Real human minimum observed: avg=8.98, stddev=4.06. Threshold leaves a
  // ~44% safety margin on avg and ~50% on stddev, while still catching both
  // perfect deterministic bots (avg~0, stddev~0) and lightly-noisy bots
  // (avg~3, stddev~1).
  if (ballMetrics.averageDistance < 5 && ballMetrics.distanceStdDev < 2) {
    return { score: 0, verdict: 'bot' };
  }

  // Fix 7 — too-precise-tracking hard flag. Insider-class bots that forge
  // cursor points against a known ball trajectory converge on avgDist 7-10
  // with stddev 3-4, inside the current <5/<2 band but below the real-human
  // floor (min avgD=9.9, stddev=7.3 across 7 traces). With tight frame-level
  // coverage, a narrow distance distribution over a long session is an
  // impossibility signal: hardware pointer noise alone produces stddev>6.
  if (
    cursorPoints.length >= 100 &&
    ballMetrics.frameWithinTight >= 0.9 &&
    ballMetrics.distanceStdDev < 5
  ) {
    return { score: 0, verdict: 'bot' };
  }

  // Fix 2 — zero reaction time when direction changes occurred
  if (directionChangeCount >= 3 && reactionTime && reactionTime.sampleCount === 0) {
    return { score: 0, verdict: 'bot' };
  }

  // Compute all behavioral signals
  const jerk = analyzeJerk(cursorPoints);
  const subMovement = analyzeSubMovements(cursorPoints);
  const drift = analyzeDrift(cursorPoints);
  const envScore = scoreEnvironment(clientEnv, requestMeta);

  // Fix 8 — aggregate-suspicion hard flag. An adaptive attacker can spoof any
  // one signal; making them spoof all four simultaneously is expensive.
  // Fires when the *combination* is deeply bot-like even if each individual
  // signal is borderline. Thresholds: plScore<0.3 means β<~0.45 (below human
  // floor 0.64); regScore<0.3 means CV<~0.5 with few pauses; pauseCount==0
  // over ≥150 pts means no natural saccades — and real humans from 7 traces
  // have ≥1 pause in every session.
  if (
    cursorPoints.length >= 150 &&
    scorePowerLaw(powerLaw) < 0.3 &&
    scoreIntervalRegularity(intervalReg) < 0.3 &&
    intervalReg.pauseCount === 0 &&
    scoreResidualNoise(residualNoise) < 0.5
  ) {
    return { score: 0, verdict: 'bot' };
  }

  const behavioral = analyzeBehavior(cursorPoints);
  const behavScore = scoreBehavioral(behavioral, {
    powerLaw, spectral, jerk, subMovement, drift, intervalReg, residualNoise, envScore,
  });
  const ballScore = scoreBallTracking(ballMetrics, speedProfile, reactionTime, directionChangeCount);

  const score = Math.max(0, Math.min(1, 0.45 * behavScore + 0.45 * ballScore + 0.10 * envScore));

  let verdict: 'bot' | 'human' | 'uncertain';
  if (score < 0.25) verdict = 'bot';
  else if (score > 0.45) verdict = 'human';
  else verdict = 'uncertain';

  return { score, verdict };
}
