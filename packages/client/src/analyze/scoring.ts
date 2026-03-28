import type { BehavioralMetrics, ShapePerfectionMetrics, AnalysisResult } from '../types';

/** Normalize a value to 0-1 range, clamped */
function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/**
 * Compute the behavioral "humanity" score from raw metrics.
 * Higher score = more human-like.
 */
function scoreBehavioral(m: BehavioralMetrics): number {
  // Point count: humans 200-600, bots <20
  const pointScore = normalize(m.pointCount, 10, 200);

  // Speed coefficient of variation: humans >0.4, bots <0.1
  const speedCV = m.averageSpeed > 0 ? m.speedStdDev / m.averageSpeed : 0;
  const speedScore = normalize(speedCV, 0.05, 0.6);

  // Acceleration variation: humans have high variation
  const accelScore = normalize(m.accelerationStdDev, 10, 2000);

  // Timestamp regularity: humans have irregular intervals (high std dev)
  // Bots have std dev < 1ms, humans 5-20ms
  const tsScore = normalize(m.timestampRegularity, 0.5, 10);

  // Micro-jitter: already normalized 0-1
  const jitterScore = m.microJitterScore;

  // Pauses: humans naturally pause at corners
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

export function computeScore(
  behavioral: BehavioralMetrics,
  shape: ShapePerfectionMetrics,
): AnalysisResult {
  const behavioralScore = scoreBehavioral(behavioral);

  // Shape perfection: high perfection = bot-like, so invert
  const shapeScore = 1.0 - shape.perfectionScore;

  // Weighted combination
  const finalScore = 0.60 * behavioralScore + 0.40 * shapeScore;

  // Clamp to 0-1
  const score = Math.max(0, Math.min(1, finalScore));

  let verdict: 'bot' | 'human' | 'uncertain';
  if (score < 0.3) verdict = 'bot';
  else if (score > 0.7) verdict = 'human';
  else verdict = 'uncertain';

  return { score, behavioral, shapePerfection: shape, verdict };
}
