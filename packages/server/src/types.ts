export type ChallengeMethod = 'shape' | 'maze' | 'ball';
export type ShapeType = 'circle' | 'triangle' | 'square';

export interface TokenPayload {
  cid: string;
  method: ChallengeMethod;
  challenge: string;
  score: number;
  verdict: 'bot' | 'human' | 'uncertain';
  ts: number;
  ph: string;
  origin: string;
  // Legacy field from old tokens
  shape?: ShapeType;
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

export interface VerifyResult {
  success: boolean;
  score: number;
  method: ChallengeMethod;
  challenge: string;
  verdict: 'bot' | 'human' | 'uncertain';
  timestamp: number;
  error?: string;
}
