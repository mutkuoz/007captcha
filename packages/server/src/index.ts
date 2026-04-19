export { verify } from './verify';
export { BallChallengeManager } from './ball/session';
export type { BallSession, BallSessionStartResult, BallChallengeManagerOptions, SessionStatus } from './ball/session';
export type {
  VerifyResult, TokenPayload, ChallengeMethod,
  BallVisuals, BallFrame, BallShape, CursorPoint, BallVerifyResult,
  FrameAck,
  ClientEnvironment, RequestMeta,
} from './types';
// Exposed for offline scoring evaluation (replay harnesses, calibration scripts).
export { computeBallScore } from './ball/scoring';
export type {
  BallScoreResult, PowerLawMetrics, SpectralMetrics, JerkMetrics,
  SubMovementMetrics, DriftMetrics, SpeedProfileMetrics, ReactionTimeMetrics,
  IntervalRegularityMetrics,
} from './ball/scoring';
