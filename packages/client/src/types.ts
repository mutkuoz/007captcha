/** A single captured input point from pointer events */
export interface CapturePoint {
  x: number;
  y: number;
  t: number; // timestamp in ms (performance.now())
  pressure?: number;
  movementX?: number;
  movementY?: number;
  tiltX?: number;
  tiltY?: number;
  pointerType?: string;
}

/** Challenge method discriminator */
export type ChallengeMethod = 'shape' | 'maze' | 'ball';

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

/** Maze cell with walls */
export interface MazeCell {
  row: number;
  col: number;
  walls: { top: boolean; right: boolean; bottom: boolean; left: boolean };
}

/** Complete maze definition */
export interface MazeDefinition {
  rows: number;
  cols: number;
  cells: MazeCell[][];
  entrance: { row: number; col: number };
  exit: { row: number; col: number };
  cellSize: number;
}

/** Maze-specific analysis metrics */
export interface MazeAnalysisMetrics {
  reachedExit: boolean;
  wallCrossings: number;
  wallTouches: number;
  pathStraightness: number; // 0=winding, 1=perfectly straight (bot signal)
  optimalPathRatio: number; // userPath / shortestPath (1.0 = suspiciously optimal)
  backtrackCount: number;
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
  shapePerfection: ShapePerfectionMetrics;
  verdict: 'bot' | 'human' | 'uncertain';
}

/** The token payload before signing */
export interface TokenPayload {
  cid: string; // challenge ID
  method: ChallengeMethod;
  challenge: string; // 'circle'|'triangle'|'square' for shape, 'maze' for maze
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
  method?: ChallengeMethod | 'random'; // default 'random'
  theme?: 'light' | 'dark' | 'auto';
  timeLimit?: number; // default 10000ms
  /** Server URL for ball challenge (required when method is 'ball' or 'random'). */
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
