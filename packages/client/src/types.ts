/** A single captured input point from pointer events */
export interface CapturePoint {
  x: number;
  y: number;
  t: number; // timestamp in ms (performance.now())
  pressure?: number;
}

/** Challenge method discriminator */
export type ChallengeMethod = 'ball';

/** Raw behavioral metrics extracted from the point stream */
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

/** Ball shape variants for the ball-following challenge */
export type BallShape = 'circle' | 'square' | 'triangle' | 'diamond';

/** Ball visual configuration received from server */
export interface BallVisuals {
  bgColor: string;
  ballColor: string;
  ballShape: BallShape;
}

/** A single frame received from the server SSE stream */
export interface BallFrame {
  x: number;
  y: number;
  t: number;
}

/** Combined analysis result */
export interface AnalysisResult {
  score: number; // 0.0 (bot) to 1.0 (human)
  behavioral: BehavioralMetrics;
  verdict: 'bot' | 'human' | 'uncertain';
}

/** The token payload before signing */
export interface TokenPayload {
  cid: string; // challenge ID
  method: ChallengeMethod;
  challenge: string; // 'ball'
  score: number;
  verdict: 'bot' | 'human' | 'uncertain';
  ts: number; // timestamp
  ph: string; // points hash
  origin: string;
}

/** Configuration for the widget */
export interface CaptchaConfig {
  siteKey: string;
  container: string | HTMLElement;
  theme?: 'light' | 'dark' | 'auto';
  timeLimit?: number; // default 10000ms
  /** Server URL required for the ball challenge. */
  serverUrl?: string;
  onSuccess?: (token: string) => void;
  onFailure?: (error: Error) => void;
  onExpired?: () => void;
}

/** Server verification result */
export interface VerifyResult {
  success: boolean;
  score: number;
  method: ChallengeMethod;
  challenge: string;
  verdict: 'bot' | 'human' | 'uncertain';
  timestamp: number;
  error?: string;
}
