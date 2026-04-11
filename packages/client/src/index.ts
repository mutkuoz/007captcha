export { CaptchaWidget } from './widget';
export type {
  CaptchaConfig,
  CapturePoint,
  ChallengeMethod,
  AnalysisResult,
  BehavioralMetrics,
  BallShape,
  BallFrame,
  BallVisuals,
  VerifyResult,
  TokenPayload,
} from './types';

import type { CaptchaConfig } from './types';
import { CaptchaWidget } from './widget';

/** Convenience function for quick integration */
export function render(config: CaptchaConfig): CaptchaWidget {
  return new CaptchaWidget(config);
}
