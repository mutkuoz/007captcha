import type { ChallengeContext, ChallengeInstance } from '../challenge';
import type { ChallengeMethod, CapturePoint, MazeDefinition, AnalysisResult } from '../types';
import { generateMaze } from '../maze/generate';
import { renderMaze, getMazeOffset } from '../maze/render';
import { solveMaze } from '../maze/solve';
import { analyzeMazePath } from '../maze/analyze';
import { analyzeBehavior } from '../analyze/behavioral';
import { computeMazeScore } from '../maze/scoring';

const MAZE_ROWS = 13;
const MAZE_COLS = 15;
const CELL_SIZE = 18;

export class MazeChallenge implements ChallengeInstance {
  showDoneButton = false;
  timeLimit = 8000;

  private maze!: MazeDefinition;
  private shortestPath!: { row: number; col: number }[];
  private points: CapturePoint[] = [];
  private ctx!: ChallengeContext;
  private drawing = false;
  private offsetX = 0;
  private offsetY = 0;

  // Bound handlers
  private handleDown!: (e: PointerEvent) => void;
  private handleMove!: (e: PointerEvent) => void;
  private handleUp!: (e: PointerEvent) => void;

  getMethod(): ChallengeMethod {
    return 'maze';
  }

  getChallengeId(): string {
    return 'maze';
  }

  getTitle(): string {
    return 'Navigate the maze';
  }

  start(ctx: ChallengeContext): void {
    this.ctx = ctx;
    this.points = [];
    this.drawing = false;

    // Generate maze
    this.maze = generateMaze(MAZE_ROWS, MAZE_COLS, CELL_SIZE);
    const solution = solveMaze(this.maze);
    this.shortestPath = solution || [];

    // Render maze
    const wallColor = ctx.strokeColor;
    const bgColor = '#ffffff';
    const entranceColor = 'rgba(34, 197, 94, 0.3)';
    const exitColor = 'rgba(239, 68, 68, 0.3)';
    renderMaze(ctx.ctx, this.maze, wallColor, bgColor, entranceColor, exitColor);

    // Get offset for coordinate mapping
    const offset = getMazeOffset(ctx.ctx, this.maze);
    this.offsetX = offset.offsetX;
    this.offsetY = offset.offsetY;

    // Show instruction
    ctx.instructionEl.innerHTML = '';
    ctx.instructionEl.classList.remove('hidden');
    const icon = document.createElement('span');
    icon.className = 'instruction-icon';
    icon.textContent = '\uD83D\uDDFA\uFE0F';
    const text = document.createElement('span');
    text.className = 'instruction-text';
    text.innerHTML = 'Click the <strong>green zone</strong> and drag to the <strong>red zone</strong>. Stay within the paths!';
    ctx.instructionEl.appendChild(icon);
    ctx.instructionEl.appendChild(text);

    // Set up pointer events
    this.handleDown = this.onPointerDown.bind(this);
    this.handleMove = this.onPointerMove.bind(this);
    this.handleUp = this.onPointerUp.bind(this);

    ctx.canvas.addEventListener('pointerdown', this.handleDown);
    ctx.canvas.addEventListener('pointermove', this.handleMove);
    ctx.canvas.addEventListener('pointerup', this.handleUp);
    ctx.canvas.addEventListener('pointerleave', this.handleUp);
    ctx.canvas.style.touchAction = 'none';
    ctx.canvas.style.cursor = 'pointer';
  }

  stop(): void {
    this.drawing = false;
    if (this.ctx) {
      this.ctx.canvas.removeEventListener('pointerdown', this.handleDown);
      this.ctx.canvas.removeEventListener('pointermove', this.handleMove);
      this.ctx.canvas.removeEventListener('pointerup', this.handleUp);
      this.ctx.canvas.removeEventListener('pointerleave', this.handleUp);
      this.ctx.canvas.style.cursor = 'default';
    }
  }

  reset(): void {
    this.stop();
    this.points = [];
    this.drawing = false;
  }

  async analyze(): Promise<AnalysisResult> {
    if (this.points.length < 5) {
      throw new Error('Not enough movement \u2014 trace a path through the maze.');
    }

    const behavioral = analyzeBehavior(this.points);
    const mazeMetrics = analyzeMazePath(
      this.points, this.maze, this.shortestPath, this.offsetX, this.offsetY,
    );

    if (!mazeMetrics.reachedExit) {
      throw new Error('You didn\u2019t reach the exit. Try again!');
    }

    return computeMazeScore(behavioral, mazeMetrics);
  }

  getPoints(): CapturePoint[] {
    return this.points;
  }

  // --- Pointer event handlers ---

  private getCoords(e: PointerEvent): { x: number; y: number } {
    const rect = this.ctx.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  private isInEntranceZone(x: number, y: number): boolean {
    const { entrance, cellSize } = this.maze;
    const zoneX = this.offsetX - cellSize * 0.5;
    const zoneY = this.offsetY + entrance.row * cellSize;
    return x >= zoneX && x <= this.offsetX + cellSize * 0.5 &&
           y >= zoneY && y <= zoneY + cellSize;
  }

  private isInExitZone(x: number, y: number): boolean {
    const { exit, cols, cellSize } = this.maze;
    const zoneX = this.offsetX + cols * cellSize;
    const zoneY = this.offsetY + exit.row * cellSize;
    return x >= zoneX - cellSize * 0.5 && x <= zoneX + cellSize * 0.5 &&
           y >= zoneY && y <= zoneY + cellSize;
  }

  private onPointerDown(e: PointerEvent): void {
    const { x, y } = this.getCoords(e);
    if (!this.isInEntranceZone(x, y)) return;

    this.drawing = true;
    this.ctx.canvas.setPointerCapture(e.pointerId);
    this.points = [];
    this.points.push({ x, y, t: performance.now(), pressure: e.pressure });

    // Start drawing path
    this.ctx.ctx.strokeStyle = '#3b82f6';
    this.ctx.ctx.lineWidth = 2.5;
    this.ctx.ctx.lineCap = 'round';
    this.ctx.ctx.lineJoin = 'round';
    this.ctx.ctx.beginPath();
    this.ctx.ctx.moveTo(x, y);
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.drawing) return;
    const { x, y } = this.getCoords(e);
    this.points.push({ x, y, t: performance.now(), pressure: e.pressure });

    // Draw path
    this.ctx.ctx.lineTo(x, y);
    this.ctx.ctx.stroke();
    this.ctx.ctx.beginPath();
    this.ctx.ctx.moveTo(x, y);

    // Check if exit reached
    if (this.isInExitZone(x, y)) {
      this.drawing = false;
      this.ctx.onComplete();
    }
  }

  private onPointerUp(_e: PointerEvent): void {
    this.drawing = false;
  }
}
