import type { ChallengeContext, ChallengeInstance } from '../challenge';
import type { ChallengeMethod, CapturePoint, AnalysisResult } from '../types';

interface ZoneRect { x: number; y: number; width: number; height: number }

/**
 * Maze challenge that uses server-rendered maze images.
 * The maze structure, solution, and wall positions are server-side only.
 * The client receives a PNG image and entrance/exit zone coordinates.
 */
export class MazeChallenge implements ChallengeInstance {
  showDoneButton = false;
  timeLimit = 8000;

  private serverUrl: string;
  private siteKey: string;
  private points: CapturePoint[] = [];
  private ctx!: ChallengeContext;
  private drawing = false;
  private sessionId: string | null = null;
  private entrance: ZoneRect | null = null;
  private exit: ZoneRect | null = null;
  private serverResult: { token: string; score: number; verdict: 'bot' | 'human' | 'uncertain' } | null = null;

  private handleDown!: (e: PointerEvent) => void;
  private handleMove!: (e: PointerEvent) => void;
  private handleUp!: (e: PointerEvent) => void;

  constructor(serverUrl: string, siteKey: string) {
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.siteKey = siteKey;
  }

  getMethod(): ChallengeMethod { return 'maze'; }
  getChallengeId(): string { return 'maze'; }
  getTitle(): string { return 'Navigate the maze'; }

  async start(ctx: ChallengeContext): Promise<void> {
    this.ctx = ctx;
    this.points = [];
    this.drawing = false;
    this.serverResult = null;

    // Fetch maze image from server
    try {
      const res = await fetch(`${this.serverUrl}/captcha/maze/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteKey: this.siteKey }),
      });
      if (!res.ok) throw new Error('Failed to start maze challenge');
      const data = await res.json();
      this.sessionId = data.sessionId;
      this.entrance = data.entrance;
      this.exit = data.exit;

      // Draw maze image on canvas
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          ctx.ctx.drawImage(img, 0, 0, 480, 400);
          resolve();
        };
        img.onerror = reject;
        img.src = `data:image/png;base64,${data.image}`;
      });
    } catch {
      throw new Error('Could not connect to captcha server.');
    }

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
    this.sessionId = null;
    this.serverResult = null;
  }

  async analyze(): Promise<AnalysisResult> {
    if (!this.sessionId) throw new Error('Challenge did not start properly.');
    if (this.points.length < 5) throw new Error('Not enough movement \u2014 trace a path through the maze.');

    const res = await fetch(`${this.serverUrl}/captcha/maze/${this.sessionId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: this.points.map(p => ({ x: p.x, y: p.y, t: p.t })),
        origin: window.location.origin,
      }),
    });

    if (!res.ok) throw new Error('Server verification failed.');
    const data = await res.json();
    this.serverResult = data;

    return {
      score: data.score,
      behavioral: {
        pointCount: this.points.length,
        totalDuration: this.points.length > 1 ? this.points[this.points.length - 1].t - this.points[0].t : 0,
        averageSpeed: 0, speedStdDev: 0, accelerationStdDev: 0,
        timestampRegularity: 0, microJitterScore: 0, pauseCount: 0,
      },
      shapePerfection: {
        shapeType: 'circle',
        matchScore: data.score,
        perfectionScore: 1 - data.score,
        details: {},
      },
      verdict: data.verdict,
    };
  }

  getServerToken(): string | null {
    return this.serverResult?.token ?? null;
  }

  getPoints(): CapturePoint[] {
    return this.points;
  }

  // --- Pointer event handlers ---

  private getCoords(e: PointerEvent): { x: number; y: number } {
    const rect = this.ctx.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private isInZone(x: number, y: number, zone: ZoneRect): boolean {
    return x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height;
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.entrance) return;
    const { x, y } = this.getCoords(e);
    if (!this.isInZone(x, y, this.entrance)) return;

    this.drawing = true;
    this.ctx.canvas.setPointerCapture(e.pointerId);
    this.points = [];
    this.points.push({ x, y, t: performance.now(), pressure: e.pressure });

    this.ctx.ctx.strokeStyle = '#3b82f6';
    this.ctx.ctx.lineWidth = 2.5;
    this.ctx.ctx.lineCap = 'round';
    this.ctx.ctx.lineJoin = 'round';
    this.ctx.ctx.beginPath();
    this.ctx.ctx.moveTo(x, y);
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.drawing || !this.exit) return;
    const { x, y } = this.getCoords(e);
    this.points.push({ x, y, t: performance.now(), pressure: e.pressure });

    this.ctx.ctx.lineTo(x, y);
    this.ctx.ctx.stroke();
    this.ctx.ctx.beginPath();
    this.ctx.ctx.moveTo(x, y);

    if (this.isInZone(x, y, this.exit)) {
      this.drawing = false;
      this.ctx.onComplete();
    }
  }

  private onPointerUp(_e: PointerEvent): void {
    this.drawing = false;
  }
}
