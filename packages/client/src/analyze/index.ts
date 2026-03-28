import type { CapturePoint, ShapeType, AnalysisResult } from '../types';
import { analyzeBehavior } from './behavioral';
import { analyzeCircle } from './circle';
import { analyzeTriangle } from './triangle';
import { analyzeSquare } from './square';
import { computeScore } from './scoring';

const shapeAnalyzers = {
  circle: analyzeCircle,
  triangle: analyzeTriangle,
  square: analyzeSquare,
} as const;

export function analyzeDrawing(points: CapturePoint[], expectedShape: ShapeType): AnalysisResult {
  const behavioral = analyzeBehavior(points);
  const shapePerfection = shapeAnalyzers[expectedShape](points);
  return computeScore(behavioral, shapePerfection);
}
