import type { ChallengeContext, ChallengeInstance } from '../challenge';
import type { ChallengeMethod, CapturePoint, ShapeType, AnalysisResult } from '../types';
import { DrawingCapture } from '../capture';
import { analyzeDrawing } from '../analyze';

const SHAPES: ShapeType[] = ['circle', 'triangle', 'square'];

const SHAPE_ICONS: Record<ShapeType, string> = {
  circle: '\u25EF',
  triangle: '\u25B3',
  square: '\u25A1',
};

const SHAPE_INSTRUCTIONS: Record<ShapeType, string> = {
  circle: 'Draw a <strong>circle</strong> \u2014 freehand, one continuous stroke. Don\u2019t try to be perfect!',
  triangle: 'Draw a <strong>triangle</strong> \u2014 three sides, connected corners. Don\u2019t lift your cursor!',
  square: 'Draw a <strong>square</strong> \u2014 four sides, connected corners. Keep it in one stroke!',
};

const MIN_MATCH_SCORE = 0.25;
const MIN_POINTS = 15;

export class ShapeChallenge implements ChallengeInstance {
  showDoneButton = true;
  timeLimit = null;

  private shape!: ShapeType;
  private capture!: DrawingCapture;

  getMethod(): ChallengeMethod {
    return 'shape';
  }

  getChallengeId(): string {
    return this.shape;
  }

  getTitle(): string {
    return 'Draw the shape below';
  }

  start(ctx: ChallengeContext): void {
    this.shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    this.capture = new DrawingCapture(ctx.canvas, ctx.strokeColor, 2.5);

    // Show instruction
    ctx.instructionEl.innerHTML = '';
    ctx.instructionEl.classList.remove('hidden');
    const icon = document.createElement('span');
    icon.className = 'instruction-icon';
    icon.textContent = SHAPE_ICONS[this.shape];
    const text = document.createElement('span');
    text.className = 'instruction-text';
    text.innerHTML = SHAPE_INSTRUCTIONS[this.shape];
    ctx.instructionEl.appendChild(icon);
    ctx.instructionEl.appendChild(text);

    this.capture.enable();
  }

  stop(): void {
    this.capture.disable();
  }

  reset(): void {
    this.capture.disable();
    this.capture.reset();
  }

  async analyze(): Promise<AnalysisResult> {
    const points = this.capture.getPoints();

    if (points.length < MIN_POINTS) {
      throw new Error('Not enough drawing \u2014 please draw the complete shape.');
    }

    const result = analyzeDrawing(points, this.shape);

    if (result.shapePerfection.matchScore < MIN_MATCH_SCORE) {
      throw new Error(`That didn\u2019t look like a ${this.shape}. Try again!`);
    }

    return result;
  }

  getPoints(): CapturePoint[] {
    return this.capture.getPoints();
  }
}
