import type { ChallengeMethod, CapturePoint, AnalysisResult } from './types';

/** Context provided by the widget to each challenge */
export interface ChallengeContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  instructionEl: HTMLDivElement;
  strokeColor: string;
  /** Challenge calls this when it auto-completes (e.g., maze exit reached) */
  onComplete: () => void;
}

/** Interface that every challenge method must implement */
export interface ChallengeInstance {
  getMethod(): ChallengeMethod;
  /** Identifier for the token: 'circle', 'triangle', 'square', 'maze' */
  getChallengeId(): string;
  /** Header text shown during the challenge */
  getTitle(): string;
  /** Whether the "Done" button is shown (shape: true, maze: false) */
  showDoneButton: boolean;
  /** Override time limit in ms, or null to use config default */
  timeLimit: number | null;

  start(ctx: ChallengeContext): void;
  stop(): void;
  reset(): void;
  analyze(): Promise<AnalysisResult>;
  getPoints(): CapturePoint[];
}
