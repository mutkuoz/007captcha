import type { BehavioralMetrics, MazeAnalysisMetrics, AnalysisResult, ShapePerfectionMetrics } from '../types';
import { scoreBehavioral } from '../analyze/scoring';

function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/**
 * Compute maze-specific challenge score from maze analysis metrics.
 * Returns 0 (bot) to 1 (human).
 */
function scoreMaze(m: MazeAnalysisMetrics): number {
  // Wall crossings: 0 = fine, 1-2 = mild penalty, >3 = strong bot signal
  const wallScore = m.wallCrossings === 0 ? 1.0
    : m.wallCrossings <= 2 ? 0.6
    : m.wallCrossings <= 5 ? 0.2
    : 0;

  // Path straightness: low = human (winding path), high = bot (direct path)
  // Inverted: human paths are winding (straightness < 0.5)
  const straightScore = 1 - normalize(m.pathStraightness, 0.3, 0.9);

  // Optimal path ratio: too close to 1.0 = suspiciously optimal (bot)
  // Humans: 1.5-4x optimal, bots: ~1.0
  const optimalScore = m.optimalPathRatio <= 0
    ? 0
    : m.optimalPathRatio < 1.2 ? 0.1     // suspiciously optimal
    : m.optimalPathRatio < 1.5 ? 0.5
    : m.optimalPathRatio < 4.0 ? 1.0     // human range
    : 0.7;                                // too inefficient but not bot-like

  // Backtracking: humans explore dead ends
  const backtrackScore = normalize(m.backtrackCount, 0, 5);

  // Did they even reach the exit?
  const exitFactor = m.reachedExit ? 1.0 : 0.0;

  const raw = (
    wallScore * 0.30 +
    straightScore * 0.25 +
    optimalScore * 0.25 +
    backtrackScore * 0.20
  );

  return raw * exitFactor;
}

/**
 * Combine behavioral and maze analysis into a final AnalysisResult.
 */
export function computeMazeScore(
  behavioral: BehavioralMetrics,
  mazeMetrics: MazeAnalysisMetrics,
): AnalysisResult {
  const behavScore = scoreBehavioral(behavioral);
  const mazeScore = scoreMaze(mazeMetrics);

  const score = Math.max(0, Math.min(1, 0.60 * behavScore + 0.40 * mazeScore));

  let verdict: 'bot' | 'human' | 'uncertain';
  if (score < 0.3) verdict = 'bot';
  else if (score > 0.7) verdict = 'human';
  else verdict = 'uncertain';

  // Pack maze metrics into ShapePerfectionMetrics for compatibility
  const shapePerfection: ShapePerfectionMetrics = {
    shapeType: 'circle', // placeholder — method field distinguishes
    matchScore: mazeMetrics.reachedExit ? 1 : 0,
    perfectionScore: 1 - mazeScore,
    details: {
      wallCrossings: mazeMetrics.wallCrossings,
      wallTouches: mazeMetrics.wallTouches,
      pathStraightness: mazeMetrics.pathStraightness,
      optimalPathRatio: mazeMetrics.optimalPathRatio,
      backtrackCount: mazeMetrics.backtrackCount,
      reachedExit: mazeMetrics.reachedExit ? 1 : 0,
    },
  };

  return { score, behavioral, shapePerfection, verdict };
}
