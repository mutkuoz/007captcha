export { CaptchaWidget } from './widget';
export { analyzeDrawing } from './analyze';
export type {
  CaptchaConfig,
  CapturePoint,
  ShapeType,
  AnalysisResult,
  BehavioralMetrics,
  ShapePerfectionMetrics,
  VerifyResult,
  TokenPayload,
} from './types';

import type { CaptchaConfig } from './types';
import { CaptchaWidget } from './widget';

/** Convenience function for quick integration */
export function render(config: CaptchaConfig): CaptchaWidget {
  return new CaptchaWidget(config);
}
