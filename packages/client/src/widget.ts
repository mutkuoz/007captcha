import type { CaptchaConfig } from './types';
import type { ChallengeInstance } from './challenge';
import { BallChallenge } from './challenges/ball';
import { STYLES } from './styles';

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
  private challengeId!: string;
  private challenge!: ChallengeInstance;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private timeLeft = 0;

  // DOM refs
  private root!: HTMLDivElement;
  private statusDot!: HTMLSpanElement;
  private titleEl!: HTMLSpanElement;
  private timerEl!: HTMLSpanElement;
  private instructionEl!: HTMLDivElement;
  private canvas!: HTMLCanvasElement;
  private canvasWrap!: HTMLDivElement;
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

    // Header: brand mark (status dot + wordmark) · title · timer
    const header = document.createElement('div');
    header.className = 'header';

    const brandMark = document.createElement('span');
    brandMark.className = 'brand-mark';
    this.statusDot = document.createElement('span');
    this.statusDot.className = 'brand-dot';
    const brandText = document.createElement('span');
    brandText.className = 'brand-text';
    brandText.textContent = '007';
    brandMark.appendChild(this.statusDot);
    brandMark.appendChild(brandText);

    this.titleEl = document.createElement('span');
    this.titleEl.className = 'title';
    this.titleEl.textContent = 'Human Verification';

    this.timerEl = document.createElement('span');
    this.timerEl.className = 'timer';
    this.timerEl.textContent = '—';

    header.appendChild(brandMark);
    header.appendChild(this.titleEl);
    header.appendChild(this.timerEl);
    this.root.appendChild(header);

    // Instruction bar (hidden initially)
    this.instructionEl = document.createElement('div');
    this.instructionEl.className = 'instruction hidden';
    this.root.appendChild(this.instructionEl);

    // Canvas wrapper with L-bracket viewfinder frame
    this.canvasWrap = document.createElement('div');
    this.canvasWrap.className = 'canvas-wrap';
    this.canvas = document.createElement('canvas');
    this.canvasWrap.appendChild(this.canvas);
    for (const pos of ['tl', 'tr', 'bl', 'br']) {
      const b = document.createElement('span');
      b.className = `bracket ${pos}`;
      this.canvasWrap.appendChild(b);
    }

    // Overlay (ready state)
    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay';

    const shield = document.createElement('div');
    shield.className = 'overlay-shield';
    shield.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 2 4 5v7c0 4.4 3.1 8.6 8 10 4.9-1.4 8-5.6 8-10V5l-8-3z"/>
        <path d="m9 12 2 2 4-4"/>
      </svg>`;

    const oTitle = document.createElement('div');
    oTitle.className = 'overlay-title';
    oTitle.textContent = 'Verify you\u2019re human';

    const oDesc = document.createElement('div');
    oDesc.className = 'overlay-desc';
    oDesc.innerHTML =
      'Follow the <strong>largest object</strong> on the screen ' +
      'with your cursor for eight seconds.';

    const startBtn = document.createElement('button');
    startBtn.className = 'start-btn';
    startBtn.innerHTML =
      'Begin verification <span class="start-btn-arrow">\u2192</span>';
    startBtn.addEventListener('click', () => this.startChallenge());

    this.overlay.appendChild(shield);
    this.overlay.appendChild(oTitle);
    this.overlay.appendChild(oDesc);
    this.overlay.appendChild(startBtn);
    this.canvasWrap.appendChild(this.overlay);

    this.root.appendChild(this.canvasWrap);

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
    brand.innerHTML = `
      <svg class="brand-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="4" y="11" width="16" height="10" rx="2"/>
        <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
      </svg>
      <span>Secured by 007captcha</span>`;

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
    const width = 480;
    const height = 400;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    const ctx = this.canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
  }

  private startChallenge(): void {
    this.challenge = new BallChallenge(
      this.config.serverUrl ?? '',
      this.config.siteKey,
    );
    this.challengeId = generateId();
    this.state = 'drawing';

    this.titleEl.textContent = this.challenge.getTitle();
    this.statusDot.className = 'brand-dot active';
    this.canvasWrap.classList.add('tracking');

    this.doneBtn.style.display = this.challenge.showDoneButton ? '' : 'none';
    this.doneBtn.disabled = !this.challenge.showDoneButton;

    this.overlay.classList.add('hidden');
    this.resultArea.innerHTML = '';

    const strokeColor = getComputedStyle(this.host).getPropertyValue('--captcha-stroke').trim() || '#374151';

    this.challenge.start({
      canvas: this.canvas,
      ctx: this.canvas.getContext('2d')!,
      instructionEl: this.instructionEl,
      strokeColor,
      onComplete: () => this.finishChallenge(),
    });

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
    this.timerEl.textContent = '';
    this.instructionEl.classList.add('hidden');
    this.canvasWrap.classList.remove('tracking');

    try {
      const result = await this.challenge.analyze();

      // All challenges are server-verified — token comes from the server
      const token = this.challenge.getServerToken?.() ?? '';

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
    this.titleEl.textContent = success ? 'Verification passed' : 'Verification failed';
    this.statusDot.className = `brand-dot ${success ? 'success' : 'fail'}`;
    this.timerEl.textContent = '';
    this.progressBar.style.width = '0%';

    this.resultArea.innerHTML = '';
    const banner = document.createElement('div');
    banner.className = `result-banner ${success ? 'success' : 'fail'}`;

    const icon = document.createElement('span');
    icon.className = 'result-icon';
    icon.innerHTML = success
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

    const text = document.createElement('span');
    text.className = 'result-text';
    text.textContent = message;

    banner.appendChild(icon);
    banner.appendChild(text);

    if (!success) {
      const retry = document.createElement('button');
      retry.className = 'retry-btn';
      retry.textContent = 'Try again';
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
    this.titleEl.textContent = 'Human Verification';
    this.timerEl.textContent = '\u2014';
    this.statusDot.className = 'brand-dot';
    this.canvasWrap.classList.remove('tracking');
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
