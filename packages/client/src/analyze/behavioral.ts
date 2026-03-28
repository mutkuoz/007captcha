import type { CapturePoint, BehavioralMetrics } from '../types';

function dist(a: CapturePoint, b: CapturePoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function analyzeBehavior(points: CapturePoint[]): BehavioralMetrics {
  if (points.length < 2) {
    return {
      pointCount: points.length,
      totalDuration: 0,
      averageSpeed: 0,
      speedStdDev: 0,
      accelerationStdDev: 0,
      timestampRegularity: 0,
      microJitterScore: 0,
      pauseCount: 0,
    };
  }

  const totalDuration = points[points.length - 1].t - points[0].t;

  // Speeds between consecutive points
  const speeds: number[] = [];
  const intervals: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const dt = points[i].t - points[i - 1].t;
    const d = dist(points[i - 1], points[i]);
    intervals.push(dt);
    speeds.push(dt > 0 ? (d / dt) * 1000 : 0); // px/s
  }

  const averageSpeed = mean(speeds);
  const speedSD = stdDev(speeds);

  // Accelerations between consecutive speed measurements
  const accelerations: number[] = [];
  for (let i = 1; i < speeds.length; i++) {
    const dt = intervals[i];
    accelerations.push(dt > 0 ? ((speeds[i] - speeds[i - 1]) / dt) * 1000 : 0);
  }
  const accelSD = stdDev(accelerations);

  // Timestamp regularity: std dev of inter-event intervals
  // Low std dev = suspiciously regular = bot-like
  const tsRegularity = stdDev(intervals);

  // Micro-jitter: perpendicular deviation from line between neighbors
  const jitterValues: number[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    // Perpendicular distance from curr to line(prev, next)
    const lineLen = dist(prev, next);
    if (lineLen < 0.001) continue;
    const perpDist = Math.abs(
      (next.x - prev.x) * (prev.y - curr.y) - (prev.x - curr.x) * (next.y - prev.y)
    ) / lineLen;
    jitterValues.push(perpDist);
  }
  const avgJitter = mean(jitterValues);
  // Humans have jitter 0.5-3px, normalize to 0-1 score
  const microJitterScore = Math.min(1, avgJitter / 3);

  // Pause detection: intervals where time > 50ms and distance < 2px
  let pauseCount = 0;
  for (let i = 1; i < points.length; i++) {
    const dt = points[i].t - points[i - 1].t;
    const d = dist(points[i - 1], points[i]);
    if (dt > 50 && d < 2) pauseCount++;
  }

  return {
    pointCount: points.length,
    totalDuration,
    averageSpeed,
    speedStdDev: speedSD,
    accelerationStdDev: accelSD,
    timestampRegularity: tsRegularity,
    microJitterScore,
    pauseCount,
  };
}
