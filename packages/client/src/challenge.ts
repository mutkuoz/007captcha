import type { ChallengeMethod, CapturePoint, AnalysisResult } from './types';

/** Context provided by the widget to each challenge */
export interface ChallengeContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  instructionEl: HTMLDivElement;
  strokeColor: string;
  /**
   * Challenge calls this when the actual measured tracking window begins
   * (after any click-to-start prompts and countdown). The widget uses
   * `durationMs` to reset the user-facing timer so users only see the
   * time budget for the part that actually matters.
   */
  onTrackingStart?: (durationMs: number) => void;
  /** Challenge calls this when it auto-completes (e.g., ball stream ended) */
  onComplete: () => void;
}

/** Interface that every challenge method must implement */
export interface ChallengeInstance {
  getMethod(): ChallengeMethod;
  /** Identifier for the token (currently always 'ball') */
  getChallengeId(): string;
  /** Header text shown during the challenge */
  getTitle(): string;
  /** Whether the "Done" button is shown (ball: false — auto-completes) */
  showDoneButton: boolean;
  /** Override time limit in ms, or null to use config default */
  timeLimit: number | null;

  start(ctx: ChallengeContext): void;
  stop(): void;
  reset(): void;
  analyze(): Promise<AnalysisResult>;
  getPoints(): CapturePoint[];
  /** For server-verified challenges, returns the signed token after analyze(). */
  getServerToken?(): string | null;
}
