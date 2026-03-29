import type { CursorPoint, BallFrame, TrajectoryChangeEvent, BallAnalysisMetrics } from '../types';
import type { SpeedProfileMetrics, ReactionTimeMetrics } from './scoring';

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

function findFrameAtTime(frames: BallFrame[], t: number): BallFrame {
  if (t <= frames[0].t) return frames[0];
  if (t >= frames[frames.length - 1].t) return frames[frames.length - 1];

  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t <= t) lo = mid;
    else hi = mid;
  }
  return Math.abs(frames[lo].t - t) <= Math.abs(frames[hi].t - t) ? frames[lo] : frames[hi];
}

function interpolateCursor(points: CursorPoint[], t: number): { x: number; y: number } | null {
  if (points.length === 0) return null;
  if (t <= points[0].t) return { x: points[0].x, y: points[0].y };
  if (t >= points[points.length - 1].t) {
    const last = points[points.length - 1];
    return { x: last.x, y: last.y };
  }

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= t) lo = mid;
    else hi = mid;
  }

  const p0 = points[lo];
  const p1 = points[hi];
  const dt = p1.t - p0.t;
  if (dt === 0) return { x: p0.x, y: p0.y };
  const frac = (t - p0.t) / dt;
  return {
    x: p0.x + (p1.x - p0.x) * frac,
    y: p0.y + (p1.y - p0.y) * frac,
  };
}

function estimateLag(
  cursorSamples: Array<{ x: number; y: number }>,
  ballSamples: Array<{ x: number; y: number }>,
  sampleIntervalMs: number,
): number {
  if (cursorSamples.length < 5 || ballSamples.length < 5) return 0;

  const n = Math.min(cursorSamples.length, ballSamples.length);
  const maxLagSteps = Math.min(Math.floor(600 / sampleIntervalMs), Math.floor(n / 3));
  let bestCorr = -Infinity;
  let bestLag = 0;

  for (let lag = 0; lag <= maxLagSteps; lag++) {
    let sum = 0;
    let count = 0;
    for (let i = lag; i < n; i++) {
      const cx = cursorSamples[i].x;
      const cy = cursorSamples[i].y;
      const bx = ballSamples[i - lag].x;
      const by = ballSamples[i - lag].y;
      sum += -((cx - bx) ** 2 + (cy - by) ** 2);
      count++;
    }
    if (count === 0) continue;
    const corr = sum / count;
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  return bestLag * sampleIntervalMs;
}

/**
 * Compare cursor path against the server's recorded ball trajectory.
 * cursorStartT is the client's timestamp when the animation began (for alignment).
 */
export function analyzeBallTracking(
  cursorPoints: CursorPoint[],
  frames: BallFrame[],
  changeEvents: TrajectoryChangeEvent[],
  cursorStartT: number,
): BallAnalysisMetrics {
  if (cursorPoints.length < 10 || frames.length < 10) {
    return {
      averageDistance: Infinity,
      distanceStdDev: 0,
      estimatedLag: 0,
      lagConsistency: 0,
      overshootCount: 0,
      trackingCoverage: 0,
    };
  }

  // --- Average distance & coverage ---
  const distances: number[] = [];
  let withinRange = 0;
  const TRACKING_RANGE = 150;

  for (const p of cursorPoints) {
    const offset = p.t - cursorStartT;
    if (offset < 0) continue;
    const frame = findFrameAtTime(frames, offset);
    const d = dist(p.x, p.y, frame.x, frame.y);
    distances.push(d);
    if (d < TRACKING_RANGE) withinRange++;
  }

  const averageDistance = mean(distances);
  const distanceSD = stdDev(distances);
  const trackingCoverage = distances.length > 0 ? withinRange / distances.length : 0;

  // --- Lag estimation via cross-correlation ---
  const SAMPLE_INTERVAL = 50;
  const totalDuration = frames[frames.length - 1].t;
  const numSamples = Math.floor(totalDuration / SAMPLE_INTERVAL);

  const cursorSamples: Array<{ x: number; y: number }> = [];
  const ballSamples: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < numSamples; i++) {
    const tOffset = i * SAMPLE_INTERVAL;
    const absoluteT = cursorStartT + tOffset;

    const cursor = interpolateCursor(cursorPoints, absoluteT);
    if (!cursor) continue;
    cursorSamples.push(cursor);

    const frame = findFrameAtTime(frames, tOffset);
    ballSamples.push({ x: frame.x, y: frame.y });
  }

  const overallLag = estimateLag(cursorSamples, ballSamples, SAMPLE_INTERVAL);

  // --- Lag consistency per 2-second window ---
  const WINDOW_MS = 2000;
  const windowLags: number[] = [];
  const windowSamples = Math.floor(WINDOW_MS / SAMPLE_INTERVAL);

  for (let wStart = 0; wStart + windowSamples <= cursorSamples.length; wStart += windowSamples) {
    const wCursor = cursorSamples.slice(wStart, wStart + windowSamples);
    const wBall = ballSamples.slice(wStart, wStart + windowSamples);
    const wLag = estimateLag(wCursor, wBall, SAMPLE_INTERVAL);
    windowLags.push(wLag);
  }

  const lagConsistency = stdDev(windowLags);

  // --- Overshoot detection ---
  let overshootCount = 0;
  const OVERSHOOT_WINDOW = 200;

  for (const event of changeEvents) {
    const windowStart = cursorStartT + event.t;
    const windowEnd = windowStart + OVERSHOOT_WINDOW;

    const windowPoints = cursorPoints.filter(p => p.t >= windowStart && p.t <= windowEnd);
    if (windowPoints.length < 3) continue;

    const first = windowPoints[0];
    const last = windowPoints[windowPoints.length - 1];
    const cursorDx = last.x - first.x;
    const cursorDy = last.y - first.y;
    const cursorMag = Math.sqrt(cursorDx * cursorDx + cursorDy * cursorDy);
    if (cursorMag < 2) continue;

    const cdx = cursorDx / cursorMag;
    const cdy = cursorDy / cursorMag;

    const oldMag = Math.sqrt(event.oldVx ** 2 + event.oldVy ** 2);
    if (oldMag < 1) continue;
    const odx = event.oldVx / oldMag;
    const ody = event.oldVy / oldMag;

    const newMag = Math.sqrt(event.newVx ** 2 + event.newVy ** 2);
    if (newMag < 1) continue;
    const ndx = event.newVx / newMag;
    const ndy = event.newVy / newMag;

    const dotOld = cdx * odx + cdy * ody;
    const dotNew = cdx * ndx + cdy * ndy;

    if (dotOld > dotNew && dotOld > 0.3) {
      overshootCount++;
    }
  }

  return {
    averageDistance,
    distanceStdDev: distanceSD,
    estimatedLag: overallLag,
    lagConsistency,
    overshootCount,
    trackingCoverage,
  };
}

/**
 * Analyze speed profiles around trajectory direction changes.
 * Humans decelerate before turns (longer) and accelerate after (shorter).
 */
export function analyzeSpeedAtDirectionChanges(
  cursorPoints: CursorPoint[],
  changeEvents: TrajectoryChangeEvent[],
  cursorStartT: number,
): SpeedProfileMetrics {
  const fail: SpeedProfileMetrics = { decelAccelRatio: 1, changeCount: 0, avgAsymmetry: 0 };
  if (cursorPoints.length < 20 || changeEvents.length < 2) return fail;

  const WINDOW_MS = 300;
  const ratios: number[] = [];
  const asymmetries: number[] = [];

  for (const event of changeEvents) {
    const eventAbsT = cursorStartT + event.t;

    // Get speeds before and after the direction change
    const beforeSpeeds: number[] = [];
    const afterSpeeds: number[] = [];

    for (let i = 1; i < cursorPoints.length; i++) {
      const dt = cursorPoints[i].t - cursorPoints[i - 1].t;
      if (dt <= 0) continue;
      const dx = cursorPoints[i].x - cursorPoints[i - 1].x;
      const dy = cursorPoints[i].y - cursorPoints[i - 1].y;
      const speed = Math.sqrt(dx * dx + dy * dy) / dt * 1000;
      const midT = (cursorPoints[i].t + cursorPoints[i - 1].t) / 2;

      if (midT >= eventAbsT - WINDOW_MS && midT < eventAbsT) {
        beforeSpeeds.push(speed);
      } else if (midT >= eventAbsT && midT <= eventAbsT + WINDOW_MS) {
        afterSpeeds.push(speed);
      }
    }

    if (beforeSpeeds.length < 3 || afterSpeeds.length < 3) continue;

    // Find speed minimum (the turn point) in each window
    const beforeMin = Math.min(...beforeSpeeds);
    const afterMin = Math.min(...afterSpeeds);
    const beforeMax = Math.max(...beforeSpeeds);
    const afterMax = Math.max(...afterSpeeds);

    // Deceleration magnitude vs acceleration magnitude
    const decel = beforeMax - beforeMin;
    const accel = afterMax - afterMin;
    if (accel > 0) {
      ratios.push(decel / accel);
    }

    // Asymmetry: difference in speed profiles
    const beforeMean = beforeSpeeds.reduce((s, v) => s + v, 0) / beforeSpeeds.length;
    const afterMean = afterSpeeds.reduce((s, v) => s + v, 0) / afterSpeeds.length;
    const totalMean = (beforeMean + afterMean) / 2;
    if (totalMean > 0) {
      asymmetries.push(Math.abs(beforeMean - afterMean) / totalMean);
    }
  }

  if (ratios.length < 2) return { ...fail, changeCount: ratios.length };

  const decelAccelRatio = ratios.reduce((s, v) => s + v, 0) / ratios.length;
  const avgAsymmetry = asymmetries.length > 0
    ? asymmetries.reduce((s, v) => s + v, 0) / asymmetries.length
    : 0;

  return { decelAccelRatio, changeCount: ratios.length, avgAsymmetry };
}

/**
 * Analyze reaction times to trajectory direction changes.
 * Humans follow an ex-Gaussian distribution (right-skewed, mean ~200-350ms).
 */
export function analyzeReactionTimes(
  cursorPoints: CursorPoint[],
  changeEvents: TrajectoryChangeEvent[],
  cursorStartT: number,
): ReactionTimeMetrics {
  const fail: ReactionTimeMetrics = { meanRT: 0, rtStdDev: 0, rtSkewness: 0, rtCV: 0, sampleCount: 0 };
  if (cursorPoints.length < 20 || changeEvents.length < 2) return fail;

  const reactionTimes: number[] = [];

  for (const event of changeEvents) {
    const eventAbsT = cursorStartT + event.t;
    const newDirMag = Math.sqrt(event.newVx ** 2 + event.newVy ** 2);
    if (newDirMag < 1) continue;
    const ndx = event.newVx / newDirMag;
    const ndy = event.newVy / newDirMag;

    // Find when cursor direction aligns with new ball direction
    for (let i = 1; i < cursorPoints.length; i++) {
      if (cursorPoints[i].t < eventAbsT) continue;
      if (cursorPoints[i].t > eventAbsT + 800) break; // max 800ms window

      const cdx = cursorPoints[i].x - cursorPoints[i - 1].x;
      const cdy = cursorPoints[i].y - cursorPoints[i - 1].y;
      const cmag = Math.sqrt(cdx * cdx + cdy * cdy);
      if (cmag < 1) continue;

      const dot = (cdx / cmag) * ndx + (cdy / cmag) * ndy;
      if (dot > 0.5) {
        reactionTimes.push(cursorPoints[i].t - eventAbsT);
        break;
      }
    }
  }

  if (reactionTimes.length < 3) return { ...fail, sampleCount: reactionTimes.length };

  const n = reactionTimes.length;
  const meanRT = reactionTimes.reduce((s, v) => s + v, 0) / n;
  const rtStdDev = Math.sqrt(reactionTimes.reduce((s, v) => s + (v - meanRT) ** 2, 0) / (n - 1));
  const rtCV = meanRT > 0 ? rtStdDev / meanRT : 0;

  // Skewness
  const s3 = reactionTimes.reduce((s, v) => s + ((v - meanRT) / (rtStdDev || 1)) ** 3, 0) / n;

  return { meanRT, rtStdDev, rtSkewness: s3, rtCV, sampleCount: n };
}
