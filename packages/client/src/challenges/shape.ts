import type { ChallengeContext, ChallengeInstance } from '../challenge';
import type { ChallengeMethod, CapturePoint, ShapeType, AnalysisResult } from '../types';

const SHAPE_ICONS: Record<ShapeType, string> = {
  circle: '\u25EF',
  triangle: '\u25B3',
  square: '\u25A1',
};

const SHAPE_INSTRUCTIONS: Record<ShapeType, string> = {
  circle: 'Draw a <strong>circle</strong> as precisely as you can \u2014 one continuous stroke!',
  triangle: 'Draw a <strong>triangle</strong> as precisely as you can \u2014 three connected sides!',
  square: 'Draw a <strong>square</strong> as precisely as you can \u2014 four connected sides!',
};

export class ShapeChallenge implements ChallengeInstance {
  showDoneButton = true;
  timeLimit = null;

  private serverUrl: string;
  private siteKey: string;
  private shape!: ShapeType;
  private sessionId: string | null = null;
  private points: CapturePoint[] = [];
  private drawing = false;
  private ctx!: ChallengeContext;
  private serverResult: { token: string; score: number; verdict: 'bot' | 'human' | 'uncertain' } | null = null;

  private handleDown!: (e: PointerEvent) => void;
  private handleMove!: (e: PointerEvent) => void;
  private handleUp!: (e: PointerEvent) => void;

  constructor(serverUrl: string, siteKey: string) {
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.siteKey = siteKey;
  }

  getMethod(): ChallengeMethod {
    return 'shape';
  }

  getChallengeId(): string {
    return this.shape;
  }

  getTitle(): string {
    return 'Draw the shape below';
  }

  async start(ctx: ChallengeContext): Promise<void> {
    this.ctx = ctx;
    this.points = [];
    this.drawing = false;
    this.serverResult = null;

    // Fetch shape assignment from server
    try {
      const res = await fetch(`${this.serverUrl}/captcha/shape/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteKey: this.siteKey }),
      });
      if (!res.ok) throw new Error('Failed to start shape challenge');
      const data = await res.json();
      this.sessionId = data.sessionId;
      this.shape = data.shape;
    } catch {
      throw new Error('Could not connect to captcha server.');
    }

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

    // Set up drawing handlers
    this.handleDown = this.onPointerDown.bind(this);
    this.handleMove = this.onPointerMove.bind(this);
    this.handleUp = this.onPointerUp.bind(this);

    ctx.canvas.addEventListener('pointerdown', this.handleDown);
    ctx.canvas.addEventListener('pointermove', this.handleMove);
    ctx.canvas.addEventListener('pointerup', this.handleUp);
    ctx.canvas.addEventListener('pointerleave', this.handleUp);
    ctx.canvas.style.touchAction = 'none';
    ctx.canvas.style.cursor = 'crosshair';
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
    if (this.points.length < 15) throw new Error('Not enough drawing \u2014 please draw the complete shape.');

    const res = await fetch(`${this.serverUrl}/captcha/shape/${this.sessionId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: this.points.map(p => ({ x: p.x, y: p.y, t: p.t })),
        origin: window.location.origin,
      }),
    });

    if (!res.ok) throw new Error('Server verification failed.');
    const data = await res.json();

    if (data.error && data.score === 0) {
      throw new Error(
        data.error.startsWith('shape_mismatch')
          ? `That didn\u2019t look like a ${this.shape}. Try again!`
          : 'Verification failed. Try again.'
      );
    }

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
        shapeType: this.shape,
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

  private onPointerDown(e: PointerEvent): void {
    this.drawing = true;
    this.ctx.canvas.setPointerCapture(e.pointerId);
    const { x, y } = this.getCoords(e);
    this.points.push({ x, y, t: performance.now(), pressure: e.pressure });

    this.ctx.ctx.strokeStyle = this.ctx.strokeColor;
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

    this.ctx.ctx.lineTo(x, y);
    this.ctx.ctx.stroke();
    this.ctx.ctx.beginPath();
    this.ctx.ctx.moveTo(x, y);
  }

  private onPointerUp(_e: PointerEvent): void {
    this.drawing = false;
  }
}
