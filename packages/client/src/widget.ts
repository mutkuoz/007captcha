import type { CaptchaConfig, TokenPayload } from './types';
import type { ChallengeInstance } from './challenge';
import { createChallenge } from './challenges';
import { createToken, hashPoints } from './token';
import { STYLES } from './styles';

type WidgetState = 'ready' | 'drawing' | 'analyzing' | 'success' | 'fail';

const MAX_MAZE_REGENERATIONS = 3;

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
  private challengeId!: string;
  private challenge!: ChallengeInstance;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private timeLeft = 0;
  private regenerationCount = 0;

  // DOM refs
  private root!: HTMLDivElement;
  private titleEl!: HTMLSpanElement;
  private timerEl!: HTMLSpanElement;
  private instructionEl!: HTMLDivElement;
  private canvas!: HTMLCanvasElement;
  private overlay!: HTMLDivElement;
  private doneBtn!: HTMLButtonElement;
  private progressBar!: HTMLDivElement;
  private footerEl!: HTMLDivElement;
  private resultArea!: HTMLDivElement;
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

    // Place hidden input in light DOM so forms can access it
    this.hiddenInput = document.createElement('input');
    this.hiddenInput.type = 'hidden';
    this.hiddenInput.name = 'captcha-token';
    this.hiddenInput.value = '';
    container.appendChild(this.hiddenInput);

    const theme = this.config.theme || 'light';
    if (theme !== 'auto') {
      this.host.setAttribute('data-theme', theme);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.host.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }

    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.buildDOM();
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

    // Instruction bar (hidden initially)
    this.instructionEl = document.createElement('div');
    this.instructionEl.className = 'instruction hidden';
    this.root.appendChild(this.instructionEl);

    // Canvas wrapper
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'canvas-wrap';
    this.canvas = document.createElement('canvas');
    canvasWrap.appendChild(this.canvas);

    // Overlay (ready state)
    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay';

    const shield = document.createElement('div');
    shield.className = 'overlay-shield';
    shield.textContent = '\uD83D\uDEE1\uFE0F';

    const oTitle = document.createElement('div');
    oTitle.className = 'overlay-title';
    oTitle.textContent = 'Verify you\u2019re human';

    const oDesc = document.createElement('div');
    oDesc.className = 'overlay-desc';
    oDesc.textContent = 'You\u2019ll be asked to complete a quick challenge. Just act naturally!';

    const startBtn = document.createElement('button');
    startBtn.className = 'start-btn';
    startBtn.textContent = 'Start';
    startBtn.addEventListener('click', () => this.startChallenge());

    this.overlay.appendChild(shield);
    this.overlay.appendChild(oTitle);
    this.overlay.appendChild(oDesc);
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
    this.doneBtn.addEventListener('click', () => this.finishChallenge());
    const brand = document.createElement('span');
    brand.className = 'brand';
    brand.textContent = 'Protected by 007captcha';
    this.footerEl.appendChild(this.doneBtn);
    this.footerEl.appendChild(brand);
    this.root.appendChild(this.footerEl);

    // Result area (below footer)
    this.resultArea = document.createElement('div');
    this.root.appendChild(this.resultArea);

    this.shadow.appendChild(this.root);

    // Setup canvas dimensions
    this.setupCanvas();
  }

  private setupCanvas(): void {
    const dpr = window.devicePixelRatio || 1;
    const width = 308;
    const height = 260;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    const ctx = this.canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
  }

  private startChallenge(): void {
    const method = this.config.method ?? 'random';
    this.challenge = createChallenge(method, {
      serverUrl: this.config.serverUrl,
      siteKey: this.config.siteKey,
    });
    this.challengeId = generateId();
    this.state = 'drawing';
    this.regenerationCount = 0;

    this.titleEl.textContent = this.challenge.getTitle();

    // Show/hide Done button based on challenge type
    this.doneBtn.style.display = this.challenge.showDoneButton ? '' : 'none';
    this.doneBtn.disabled = !this.challenge.showDoneButton;

    this.overlay.classList.add('hidden');
    this.resultArea.innerHTML = '';

    const strokeColor = getComputedStyle(this.host).getPropertyValue('--captcha-stroke').trim() || '#374151';

    // Start the challenge
    this.challenge.start({
      canvas: this.canvas,
      ctx: this.canvas.getContext('2d')!,
      instructionEl: this.instructionEl,
      strokeColor,
      onComplete: () => this.finishChallenge(),
    });

    // Start timer
    const tl = this.challenge.timeLimit ?? this.config.timeLimit;
    this.timeLeft = tl;
    this.updateTimer(tl);
    this.timerInterval = setInterval(() => {
      this.timeLeft -= 100;
      this.updateTimer(tl);
      if (this.timeLeft <= 0) {
        this.handleTimeout();
      }
    }, 100);
  }

  private updateTimer(totalTime: number): void {
    const seconds = Math.max(0, Math.ceil(this.timeLeft / 1000));
    this.timerEl.textContent = `${seconds}s`;
    this.timerEl.className = seconds <= 3 ? 'timer warning' : 'timer';
    const pct = Math.max(0, (this.timeLeft / totalTime) * 100);
    this.progressBar.style.width = `${pct}%`;
    if (seconds <= 3) {
      this.progressBar.className = 'progress-bar danger';
    } else if (seconds <= 5) {
      this.progressBar.className = 'progress-bar warning';
    } else {
      this.progressBar.className = 'progress-bar';
    }
  }

  private handleTimeout(): void {
    // For maze challenges, regenerate instead of failing (up to MAX_MAZE_REGENERATIONS)
    if (this.challenge.getMethod() === 'maze' && this.regenerationCount < MAX_MAZE_REGENERATIONS) {
      this.regenerationCount++;
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }

      // Reset and regenerate
      this.challenge.reset();
      this.setupCanvas(); // reset canvas scaling
      const strokeColor = getComputedStyle(this.host).getPropertyValue('--captcha-stroke').trim() || '#374151';
      this.challenge.start({
        canvas: this.canvas,
        ctx: this.canvas.getContext('2d')!,
        instructionEl: this.instructionEl,
        strokeColor,
        onComplete: () => this.finishChallenge(),
      });

      // Restart timer
      const tl = this.challenge.timeLimit ?? this.config.timeLimit;
      this.timeLeft = tl;
      this.updateTimer(tl);
      this.timerInterval = setInterval(() => {
        this.timeLeft -= 100;
        this.updateTimer(tl);
        if (this.timeLeft <= 0) {
          this.handleTimeout();
        }
      }, 100);
      return;
    }

    // Otherwise finish (time ran out)
    this.finishChallenge();
  }

  private async finishChallenge(): Promise<void> {
    if (this.state !== 'drawing') return;
    this.state = 'analyzing';

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.challenge.stop();
    this.doneBtn.disabled = true;
    this.titleEl.textContent = 'Analyzing\u2026';
    this.instructionEl.classList.add('hidden');

    try {
      const result = await this.challenge.analyze();

      let token: string;

      if (this.challenge.getMethod() === 'ball') {
        // Ball challenge: token comes from server (set during analyze())
        const ballChallenge = this.challenge as import('./challenges/ball').BallChallenge;
        token = ballChallenge.getServerToken() || '';
      } else {
        // Shape/maze: token created client-side
        const points = this.challenge.getPoints();
        const ph = await hashPoints(points);

        const payload: TokenPayload = {
          cid: this.challengeId,
          method: this.challenge.getMethod(),
          challenge: this.challenge.getChallengeId(),
          score: result.score,
          verdict: result.verdict,
          ts: Date.now(),
          ph,
          origin: typeof window !== 'undefined' ? window.location.origin : '',
        };

        token = await createToken(payload, this.config.siteKey);
      }

      this.hiddenInput.value = token;

      const success = result.verdict !== 'bot';
      if (success) {
        this.showResult(true, 'Verification passed');
        this.config.onSuccess?.(token);
      } else {
        this.showResult(false, 'Verification failed \u2014 behavior appeared automated.');
        this.config.onFailure?.(new Error('Challenge failed: detected as bot'));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Try again.';
      this.showResult(false, message);
      this.config.onFailure?.(err instanceof Error ? err : new Error(message));
    }
  }

  private showResult(success: boolean, message: string): void {
    this.state = success ? 'success' : 'fail';
    this.titleEl.textContent = success ? '\u2705 Human verified' : '\u274C Challenge failed';
    this.timerEl.textContent = '';
    this.progressBar.style.width = '0%';

    this.resultArea.innerHTML = '';
    const banner = document.createElement('div');
    banner.className = `result-banner ${success ? 'success' : 'fail'}`;

    const icon = document.createElement('span');
    icon.className = 'result-icon';
    icon.textContent = success ? '\u2713' : '\u2717';

    const text = document.createElement('span');
    text.textContent = message;

    banner.appendChild(icon);
    banner.appendChild(text);

    if (!success) {
      const retry = document.createElement('button');
      retry.className = 'retry-btn';
      retry.textContent = 'Retry';
      retry.addEventListener('click', () => this.reset());
      banner.appendChild(retry);
    }

    this.resultArea.appendChild(banner);
  }

  destroy(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.challenge) this.challenge.stop();
    this.host.remove();
    this.hiddenInput.remove();
  }

  getToken(): string {
    return this.hiddenInput.value;
  }

  reset(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.challenge) this.challenge.stop();
    this.state = 'ready';
    this.titleEl.textContent = '007captcha';
    this.timerEl.textContent = '';
    this.progressBar.style.width = '100%';
    this.progressBar.className = 'progress-bar';
    this.doneBtn.disabled = true;
    this.doneBtn.style.display = '';
    this.overlay.classList.remove('hidden');
    this.instructionEl.classList.add('hidden');
    this.resultArea.innerHTML = '';
    this.hiddenInput.value = '';
    this.setupCanvas(); // reset canvas
  }
}
