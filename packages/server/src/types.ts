export type ChallengeMethod = 'ball';

export interface TokenPayload {
  cid: string;
  method: ChallengeMethod;
  challenge: string;
  score: number;
  verdict: 'bot' | 'human' | 'uncertain';
  ts: number;
  ph: string;
  origin: string;
}

/** Ball shape variants */
export type BallShape = 'circle' | 'square' | 'triangle' | 'diamond';

/** A single frame sent from server to client during ball challenge */
export interface BallFrame {
  x: number;
  y: number;
  t: number; // time offset in ms from animation start
}

/** A recorded direction change event (server-side only, for scoring) */
export interface TrajectoryChangeEvent {
  t: number;
  oldVx: number;
  oldVy: number;
  newVx: number;
  newVy: number;
}

/** Ball visual configuration sent to client at session start */
export interface BallVisuals {
  bgColor: string;
  ballColor: string;
  ballShape: BallShape;
}

/** Cursor point sent from client to server after challenge */
export interface CursorPoint {
  x: number;
  y: number;
  t: number; // client-side timestamp (performance.now based)
}

/** Ball-specific analysis metrics (server-side) */
export interface BallAnalysisMetrics {
  averageDistance: number;
  distanceStdDev: number;
  estimatedLag: number;
  lagConsistency: number;
  overshootCount: number;
  trackingCoverage: number;
}

/** Result from ball challenge verification */
export interface BallVerifyResult {
  success: boolean;
  score: number;
  verdict: 'bot' | 'human' | 'uncertain';
  token: string;
}

/** Browser environment signals collected client-side (can be spoofed — weighted, not definitive) */
export interface ClientEnvironment {
  webdriver: boolean;
  languageCount: number;
  screenWidth: number;
  screenHeight: number;
  outerWidth: number;
  outerHeight: number;
  pluginCount: number;
  touchSupport: boolean;
  devicePixelRatio: number;
  colorDepth: number;
}

/** HTTP request metadata extracted server-side */
export interface RequestMeta {
  userAgent?: string;
  acceptLanguage?: string;
}

export interface VerifyResult {
  success: boolean;
  score: number;
  method: ChallengeMethod;
  challenge: string;
  verdict: 'bot' | 'human' | 'uncertain';
  timestamp: number;
  error?: string;
}

/** Acknowledgement frame sent from client to server during ball tracking */
export interface FrameAck {
  i: number;
  t: number;
  x: number;
  y: number;
}
