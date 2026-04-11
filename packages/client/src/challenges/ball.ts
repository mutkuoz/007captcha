import type { ChallengeContext, ChallengeInstance } from '../challenge';
import type { ChallengeMethod, CapturePoint, AnalysisResult, BallVisuals } from '../types';
import { drawCountdown } from '../ball/render';
import { collectEnvironment } from '../env';

const COUNTDOWN_MS = 3000;
const TRACKING_MS = 8000;
const BUFFER_MS = 3000;

/**
 * Ball challenge that consumes server-streamed frames via SSE.
 * The trajectory is generated server-side in real-time — the client
 * never knows future ball positions.
 */
export class BallChallenge implements ChallengeInstance {
  showDoneButton = false;
  timeLimit = COUNTDOWN_MS + TRACKING_MS + BUFFER_MS;

  private serverUrl: string;
  private siteKey: string;
  private points: CapturePoint[] = [];
  private frameAcks: Array<{ i: number; t: number; x: number; y: number }> = [];
  private lastCursor: { x: number; y: number } = { x: 0, y: 0 };
  private challengeCtx: ChallengeContext | null = null;
  private visuals: BallVisuals | null = null;
  private sessionId: string | null = null;
  private eventSource: EventSource | null = null;
  private tracking = false;
  private clickStarted = false;
  private trackingStartT = 0;
  private countdownTimers: ReturnType<typeof setTimeout>[] = [];

  private boundClick: ((e: MouseEvent) => void) | null = null;
  private boundMove: ((e: PointerEvent) => void) | null = null;

  // Store the server's verdict/token after submission
  private serverResult: { token: string; score: number; verdict: 'bot' | 'human' | 'uncertain' } | null = null;

  constructor(serverUrl: string, siteKey: string) {
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.siteKey = siteKey;
  }

  getMethod(): ChallengeMethod { return 'ball'; }
  getChallengeId(): string { return 'ball'; }
  getTitle(): string { return 'Follow the ball'; }

  start(ctx: ChallengeContext): void {
    this.challengeCtx = ctx;
    this.points = [];
    this.tracking = false;
    this.clickStarted = false;
    this.serverResult = null;

    ctx.instructionEl.innerHTML = '';
    ctx.instructionEl.classList.remove('hidden');
    const icon = document.createElement('span');
    icon.className = 'instruction-icon';
    icon.textContent = '\u25CF';
    const text = document.createElement('span');
    text.className = 'instruction-text';
    text.innerHTML = 'Follow the ball with your cursor. <strong>Click to begin.</strong>';
    ctx.instructionEl.appendChild(icon);
    ctx.instructionEl.appendChild(text);

    // Show "click to start" on a neutral background
    const c = ctx.ctx;
    c.fillStyle = '#1a1a2e';
    c.fillRect(0, 0, 480, 400);
    c.save();
    c.fillStyle = '#e94560';
    c.font = 'bold 18px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('Click to start', 480 / 2, 400 / 2);
    c.restore();

    this.boundClick = this.onCanvasClick.bind(this);
    ctx.canvas.addEventListener('click', this.boundClick);
    ctx.canvas.style.cursor = 'pointer';
  }

  stop(): void {
    this.tracking = false;
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    for (const t of this.countdownTimers) clearTimeout(t);
    this.countdownTimers = [];
    if (this.challengeCtx) {
      if (this.boundClick) this.challengeCtx.canvas.removeEventListener('click', this.boundClick);
      if (this.boundMove) this.challengeCtx.canvas.removeEventListener('pointermove', this.boundMove);
      this.challengeCtx.canvas.style.cursor = 'default';
    }
  }

  reset(): void {
    this.stop();
    this.points = [];
    this.frameAcks = [];
    this.sessionId = null;
    this.visuals = null;
    this.clickStarted = false;
    this.serverResult = null;
  }

  async analyze(): Promise<AnalysisResult> {
    // Submit cursor points to server for scoring
    if (!this.sessionId) throw new Error('Challenge did not start properly.');
    if (this.points.length < 10) throw new Error('Not enough movement \u2014 follow the ball with your cursor.');

    const res = await fetch(`${this.serverUrl}/captcha/ball/${this.sessionId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: this.points.map(p => ({ x: p.x, y: p.y, t: p.t })),
        cursorStartT: this.trackingStartT,
        frameAcks: this.frameAcks,
        origin: window.location.origin,
        clientEnv: collectEnvironment(),
      }),
    });

    if (!res.ok) throw new Error('Server verification failed.');
    const data = await res.json();
    this.serverResult = data;

    // Build an AnalysisResult for the widget's token flow
    // The real token comes from the server — score/verdict are informational
    return {
      score: data.score,
      behavioral: {
        pointCount: this.points.length,
        totalDuration: this.points.length > 1 ? this.points[this.points.length - 1].t - this.points[0].t : 0,
        averageSpeed: 0, speedStdDev: 0, accelerationStdDev: 0,
        timestampRegularity: 0, microJitterScore: 0, pauseCount: 0,
      },
      verdict: data.verdict,
    };
  }

  /** Returns the server-signed token (set after analyze()). */
  getServerToken(): string | null {
    return this.serverResult?.token ?? null;
  }

  getPoints(): CapturePoint[] {
    return this.points;
  }

  // --- Internal ---

  private async onCanvasClick(): Promise<void> {
    if (this.clickStarted || !this.challengeCtx) return;
    this.clickStarted = true;

    if (this.boundClick) {
      this.challengeCtx.canvas.removeEventListener('click', this.boundClick);
      this.boundClick = null;
    }

    // Step 1: Create session on server
    try {
      const res = await fetch(`${this.serverUrl}/captcha/ball/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteKey: this.siteKey }),
      });
      if (!res.ok) throw new Error('Failed to start ball challenge');
      const data = await res.json();
      this.sessionId = data.sessionId;
      this.visuals = data.visuals;
    } catch {
      this.clickStarted = false;
      throw new Error('Could not connect to captcha server.');
    }

    // Step 2: Show countdown
    const ctx2d = this.challengeCtx.ctx;
    const bg = this.visuals!.bgColor;
    const ballColor = this.visuals!.ballColor;

    const textEl = this.challengeCtx.instructionEl.querySelector('.instruction-text');
    if (textEl) textEl.innerHTML = 'Get ready\u2026 keep your cursor on the ball!';

    drawCountdown(ctx2d, bg, ballColor, '3');
    this.countdownTimers.push(setTimeout(() => drawCountdown(ctx2d, bg, ballColor, '2'), 1000));
    this.countdownTimers.push(setTimeout(() => drawCountdown(ctx2d, bg, ballColor, '1'), 2000));
    this.countdownTimers.push(setTimeout(() => drawCountdown(ctx2d, bg, ballColor, 'GO!'), 2700));
    this.countdownTimers.push(setTimeout(() => this.startStreaming(), COUNTDOWN_MS));
  }

  private startStreaming(): void {
    if (!this.challengeCtx || !this.visuals || !this.sessionId) return;

    this.tracking = true;
    this.points = [];
    this.frameAcks = [];
    this.lastCursor = { x: 240, y: 200 }; // canvas center fallback
    this.trackingStartT = performance.now();

    const textEl = this.challengeCtx.instructionEl.querySelector('.instruction-text');
    if (textEl) textEl.innerHTML = 'Follow the ball!';

    // Bind pointer move for cursor tracking
    this.boundMove = this.onPointerMove.bind(this);
    this.challengeCtx.canvas.addEventListener('pointermove', this.boundMove);
    this.challengeCtx.canvas.style.touchAction = 'none';
    this.challengeCtx.canvas.style.cursor = 'crosshair';

    // Open SSE stream to receive frames from server
    this.eventSource = new EventSource(
      `${this.serverUrl}/captcha/ball/${this.sessionId}/stream`
    );

    this.eventSource.addEventListener('frame', (e: MessageEvent) => {
      if (!this.tracking || !this.challengeCtx) return;
      const data = JSON.parse(e.data);

      // Record frame ack: commit to our current cursor position at this moment
      const now = performance.now();
      this.frameAcks.push({
        i: this.frameAcks.length,
        t: now,
        x: this.lastCursor.x,
        y: this.lastCursor.y,
      });

      // Server sends pre-rendered PNG frames — draw directly to canvas
      const img = new Image();
      img.onload = () => {
        if (this.challengeCtx) {
          this.challengeCtx.ctx.drawImage(img, 0, 0, 480, 400);
        }
      };
      img.src = `data:image/png;base64,${data.img}`;
    });

    this.eventSource.addEventListener('end', () => {
      this.tracking = false;
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }
      this.challengeCtx?.onComplete();
    });

    this.eventSource.onerror = () => {
      // Stream error — stop tracking
      this.tracking = false;
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }
    };
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.tracking || !this.challengeCtx) return;
    const rect = this.challengeCtx.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.lastCursor = { x, y };
    this.points.push({
      x,
      y,
      t: performance.now(),
      pressure: e.pressure,
    });
  }
}
