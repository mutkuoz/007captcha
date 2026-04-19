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
  getTitle(): string { return 'Follow the target'; }

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
    icon.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9"/>
        <circle cx="12" cy="12" r="5"/>
        <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
      </svg>`;
    const text = document.createElement('span');
    text.className = 'instruction-text';
    text.innerHTML =
      'Track the <strong>largest object</strong> on the screen with your cursor.' +
      '<span class="hint">Smaller shapes may appear &mdash; ignore them. Click the canvas to begin.</span>';
    ctx.instructionEl.appendChild(icon);
    ctx.instructionEl.appendChild(text);

    // "Click to start" screen — dark surface with a subtle crosshair and
    // centered call-to-action matching the widget's surveillance aesthetic.
    const c = ctx.ctx;
    c.fillStyle = '#0a0a0a';
    c.fillRect(0, 0, 480, 400);

    // Subtle crosshair guides
    c.save();
    c.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(240, 80); c.lineTo(240, 160);
    c.moveTo(240, 240); c.lineTo(240, 320);
    c.moveTo(80, 200); c.lineTo(160, 200);
    c.moveTo(320, 200); c.lineTo(400, 200);
    c.stroke();
    c.restore();

    // Target ring
    c.save();
    c.strokeStyle = 'rgba(8, 145, 178, 0.55)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(240, 200, 30, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(240, 200, 18, 0, Math.PI * 2);
    c.stroke();
    c.restore();

    // Call-to-action text
    c.save();
    c.fillStyle = 'rgba(255, 255, 255, 0.92)';
    c.font = '600 15px ui-sans-serif, system-ui, -apple-system, Inter, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('Click anywhere to begin', 240, 260);
    c.fillStyle = 'rgba(255, 255, 255, 0.45)';
    c.font = '500 12px ui-monospace, Menlo, monospace';
    c.fillText('FOLLOW THE LARGEST OBJECT', 240, 282);
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
    if (textEl) {
      textEl.innerHTML =
        'Get ready &mdash; track the <strong>largest object</strong> for eight seconds.' +
        '<span class="hint">Decoys will appear alongside it. Stay locked on the biggest one.</span>';
    }

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

    // Let the widget reset its user-facing timer to the actual tracking
    // duration — the pre-tracking phases (click-to-start prompt + 3s
    // countdown) shouldn't consume the visible budget.
    this.challengeCtx.onTrackingStart?.(TRACKING_MS);

    const textEl = this.challengeCtx.instructionEl.querySelector('.instruction-text');
    if (textEl) {
      textEl.innerHTML =
        'Stay locked on the <strong>largest object</strong>.' +
        '<span class="hint">Ignore the smaller dots.</span>';
    }

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

    // Expand coalesced pointermove events for higher-resolution capture.
    // Browsers batch multiple hardware pointer updates into a single dispatch
    // — only the latest is `e`, the rest live in getCoalescedEvents(). Using
    // them can 2-3x the point density for fast-moving cursors. PointerEvent
    // timeStamps are DOMHighResTimeStamp (same origin as performance.now()),
    // so no time-base translation is needed.
    const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null;
    const events: PointerEvent[] = coalesced && coalesced.length > 0 ? coalesced : [e];

    let lastT = this.points.length > 0 ? this.points[this.points.length - 1].t : -Infinity;

    for (const ev of events) {
      // Server's isTimestampBotFlag requires strictly-increasing timestamps.
      // If the browser reports duplicate timeStamps for coalesced events
      // (rare but possible), skip rather than nudge to avoid creating
      // resolution-locked intervals that could trip the 80% duplicate check.
      const t = ev.timeStamp;
      if (t <= lastT) continue;

      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      this.lastCursor = { x, y };
      this.points.push({ x, y, t, pressure: ev.pressure });
      lastT = t;
    }
  }
}
