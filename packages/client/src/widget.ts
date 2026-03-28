import type { CaptchaConfig, ShapeType, TokenPayload } from './types';
import { DrawingCapture } from './capture';
import { analyzeDrawing } from './analyze';
import { createToken, hashPoints } from './token';
import { STYLES } from './styles';

const SHAPES: ShapeType[] = ['circle', 'triangle', 'square'];
const SHAPE_LABELS: Record<ShapeType, string> = {
  circle: 'Draw a circle as good as you can',
  triangle: 'Draw a triangle as good as you can',
  square: 'Draw a square as good as you can',
};

type WidgetState = 'ready' | 'drawing' | 'analyzing' | 'success' | 'fail';

function generateId(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

export class CaptchaWidget {
  private config: Required<Pick<CaptchaConfig, 'siteKey' | 'timeLimit'>> & CaptchaConfig;
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private state: WidgetState = 'ready';
  private shape!: ShapeType;
  private challengeId!: string;
  private capture!: DrawingCapture;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private timeLeft = 0;

  // DOM refs
  private root!: HTMLDivElement;
  private titleEl!: HTMLSpanElement;
  private timerEl!: HTMLSpanElement;
  private canvas!: HTMLCanvasElement;
  private overlay!: HTMLDivElement;
  private doneBtn!: HTMLButtonElement;
  private progressBar!: HTMLDivElement;
  private footerEl!: HTMLDivElement;
  private hiddenInput!: HTMLInputElement;

  constructor(config: CaptchaConfig) {
    this.config = {
      timeLimit: 10000,
      ...config,
    };

    const container = typeof config.container === 'string'
      ? document.querySelector<HTMLElement>(config.container)
      : config.container;
    if (!container) throw new Error('007captcha: container not found');

    this.host = document.createElement('div');
    container.appendChild(this.host);

    const theme = this.config.theme || 'light';
    if (theme !== 'auto') {
      this.host.setAttribute('data-theme', theme);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.host.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }

    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.buildDOM();
    this.setupCanvas();
  }

  private buildDOM(): void {
    const style = document.createElement('style');
    style.textContent = STYLES;
    this.shadow.appendChild(style);

    this.root = document.createElement('div');
    this.root.className = 'root';

    // Header
    const header = document.createElement('div');
    header.className = 'header';
    this.titleEl = document.createElement('span');
    this.titleEl.className = 'title';
    this.titleEl.textContent = '007captcha';
    this.timerEl = document.createElement('span');
    this.timerEl.className = 'timer';
    header.appendChild(this.titleEl);
    header.appendChild(this.timerEl);
    this.root.appendChild(header);

    // Canvas wrapper
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'canvas-wrap';
    this.canvas = document.createElement('canvas');
    canvasWrap.appendChild(this.canvas);

    // Overlay (ready state)
    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay';
    const startBtn = document.createElement('button');
    startBtn.className = 'start-btn';
    startBtn.textContent = 'Start Challenge';
    startBtn.addEventListener('click', () => this.startChallenge());
    this.overlay.appendChild(startBtn);
    canvasWrap.appendChild(this.overlay);

    this.root.appendChild(canvasWrap);

    // Progress bar
    const progress = document.createElement('div');
    progress.className = 'progress';
    this.progressBar = document.createElement('div');
    this.progressBar.className = 'progress-bar';
    this.progressBar.style.width = '100%';
    progress.appendChild(this.progressBar);
    this.root.appendChild(progress);

    // Footer
    this.footerEl = document.createElement('div');
    this.footerEl.className = 'footer';
    this.doneBtn = document.createElement('button');
    this.doneBtn.className = 'done-btn';
    this.doneBtn.textContent = 'Done';
    this.doneBtn.disabled = true;
    this.doneBtn.addEventListener('click', () => this.finishDrawing());
    const brand = document.createElement('span');
    brand.className = 'brand';
    brand.textContent = '007captcha';
    this.footerEl.appendChild(this.doneBtn);
    this.footerEl.appendChild(brand);
    this.root.appendChild(this.footerEl);

    // Hidden input for form submission
    this.hiddenInput = document.createElement('input');
    this.hiddenInput.type = 'hidden';
    this.hiddenInput.name = 'captcha-token';
    this.root.appendChild(this.hiddenInput);

    this.shadow.appendChild(this.root);
  }

  private setupCanvas(): void {
    const dpr = window.devicePixelRatio || 1;
    const size = 288;
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    const ctx = this.canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const strokeColor = getComputedStyle(this.host).getPropertyValue('--captcha-stroke').trim() || '#1f2937';
    this.capture = new DrawingCapture(this.canvas, strokeColor, 3);
  }

  private startChallenge(): void {
    this.shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    this.challengeId = generateId();
    this.state = 'drawing';

    this.titleEl.textContent = SHAPE_LABELS[this.shape];
    this.overlay.classList.add('hidden');
    this.doneBtn.disabled = false;
    this.capture.enable();

    // Start timer
    this.timeLeft = this.config.timeLimit;
    this.updateTimer();
    this.timerInterval = setInterval(() => {
      this.timeLeft -= 100;
      this.updateTimer();
      if (this.timeLeft <= 0) {
        this.finishDrawing();
      }
    }, 100);
  }

  private updateTimer(): void {
    const seconds = Math.max(0, Math.ceil(this.timeLeft / 1000));
    this.timerEl.textContent = `${seconds}s`;
    this.timerEl.className = seconds <= 3 ? 'timer warning' : 'timer';
    const pct = Math.max(0, (this.timeLeft / this.config.timeLimit) * 100);
    this.progressBar.style.width = `${pct}%`;
  }

  private async finishDrawing(): Promise<void> {
    if (this.state !== 'drawing') return;
    this.state = 'analyzing';

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.capture.disable();
    this.doneBtn.disabled = true;
    this.titleEl.textContent = 'Analyzing...';

    const points = this.capture.getPoints();

    if (points.length < 5) {
      this.showResult(false);
      this.config.onFailure?.(new Error('Not enough drawing data'));
      return;
    }

    const result = analyzeDrawing(points, this.shape);
    const ph = await hashPoints(points);

    const payload: TokenPayload = {
      cid: this.challengeId,
      shape: this.shape,
      score: result.score,
      verdict: result.verdict,
      ts: Date.now(),
      ph,
      origin: typeof window !== 'undefined' ? window.location.origin : '',
    };

    const token = await createToken(payload, this.config.siteKey);
    this.hiddenInput.value = token;

    const success = result.verdict !== 'bot';
    this.showResult(success);

    if (success) {
      this.config.onSuccess?.(token);
    } else {
      this.config.onFailure?.(new Error('Challenge failed: detected as bot'));
    }
  }

  private showResult(success: boolean): void {
    this.state = success ? 'success' : 'fail';

    const resultDiv = document.createElement('div');
    resultDiv.className = `result ${success ? 'success' : 'fail'}`;

    const icon = document.createElement('span');
    icon.className = 'result-icon';
    icon.textContent = success ? '\u2713' : '\u2717';

    const text = document.createElement('span');
    text.textContent = success ? 'Verification passed' : 'Verification failed';

    resultDiv.appendChild(icon);
    resultDiv.appendChild(text);

    this.titleEl.textContent = '';
    this.titleEl.appendChild(resultDiv);
    this.timerEl.textContent = '';
    this.progressBar.style.width = '0%';
  }

  destroy(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.capture.disable();
    this.host.remove();
  }

  getToken(): string {
    return this.hiddenInput.value;
  }

  reset(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.capture.disable();
    this.capture.reset();
    this.state = 'ready';
    this.titleEl.textContent = '007captcha';
    this.timerEl.textContent = '';
    this.progressBar.style.width = '100%';
    this.doneBtn.disabled = true;
    this.overlay.classList.remove('hidden');
    this.hiddenInput.value = '';
  }
}
