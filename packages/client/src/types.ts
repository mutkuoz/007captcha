/** A single captured input point from pointer events */
export interface CapturePoint {
  x: number;
  y: number;
  t: number; // timestamp in ms (performance.now())
  pressure?: number;
}

/** Which shape the user was asked to draw */
export type ShapeType = 'circle' | 'triangle' | 'square';

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

/** Shape-specific perfection metrics */
export interface ShapePerfectionMetrics {
  shapeType: ShapeType;
  matchScore: number; // 0-1, how well the drawing matches the target shape
  perfectionScore: number; // 0-1, how geometrically perfect (higher = more perfect = more bot-like)
  details: Record<string, number>;
}

/** Combined analysis result */
export interface AnalysisResult {
  score: number; // 0.0 (bot) to 1.0 (human)
  behavioral: BehavioralMetrics;
  shapePerfection: ShapePerfectionMetrics;
  verdict: 'bot' | 'human' | 'uncertain';
}

/** The token payload before signing */
export interface TokenPayload {
  cid: string; // challenge ID
  shape: ShapeType;
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
  onSuccess?: (token: string) => void;
  onFailure?: (error: Error) => void;
  onExpired?: () => void;
}

/** Server verification result */
export interface VerifyResult {
  success: boolean;
  score: number;
  shape: ShapeType;
  verdict: 'bot' | 'human' | 'uncertain';
  timestamp: number;
  error?: string;
}
