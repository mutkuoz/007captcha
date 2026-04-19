export const STYLES = `
:host {
  display: block;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    'Segoe UI', 'Inter', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --captcha-bg: #ffffff;
  --captcha-surface: #fafafa;
  --captcha-elevated: #ffffff;
  --captcha-fg: #09090b;
  --captcha-muted: #52525b;
  --captcha-subtle: #a1a1aa;
  --captcha-border: #e4e4e7;
  --captcha-border-strong: #d4d4d8;
  --captcha-accent: #09090b;
  --captcha-accent-hover: #27272a;
  --captcha-accent-fg: #fafafa;
  --captcha-electric: #0891b2;
  --captcha-electric-glow: rgba(8, 145, 178, 0.35);
  --captcha-canvas-bg: #0a0a0a;
  --captcha-canvas-border: #e4e4e7;
  --captcha-stroke: #27272a;
  --captcha-success: #10b981;
  --captcha-success-bg: #ecfdf5;
  --captcha-success-border: #a7f3d0;
  --captcha-error: #ef4444;
  --captcha-error-bg: #fef2f2;
  --captcha-error-border: #fecaca;
  --captcha-warn: #f59e0b;
  --captcha-radius-lg: 16px;
  --captcha-radius-md: 10px;
  --captcha-radius-sm: 6px;
  --captcha-shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
  --captcha-shadow-md: 0 4px 12px rgba(9,9,11,0.06), 0 1px 3px rgba(9,9,11,0.04);
  --captcha-shadow-lg: 0 12px 40px rgba(9,9,11,0.08), 0 2px 6px rgba(9,9,11,0.04);
  --captcha-mono: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
}

:host([data-theme="dark"]) {
  --captcha-bg: #09090b;
  --captcha-surface: #18181b;
  --captcha-elevated: #1f1f23;
  --captcha-fg: #fafafa;
  --captcha-muted: #a1a1aa;
  --captcha-subtle: #71717a;
  --captcha-border: #27272a;
  --captcha-border-strong: #3f3f46;
  --captcha-accent: #fafafa;
  --captcha-accent-hover: #e4e4e7;
  --captcha-accent-fg: #09090b;
  --captcha-electric: #22d3ee;
  --captcha-electric-glow: rgba(34, 211, 238, 0.45);
  --captcha-canvas-bg: #050507;
  --captcha-canvas-border: #27272a;
  --captcha-stroke: #d4d4d8;
  --captcha-success: #34d399;
  --captcha-success-bg: rgba(16,185,129,0.1);
  --captcha-success-border: rgba(16,185,129,0.25);
  --captcha-error: #f87171;
  --captcha-error-bg: rgba(239,68,68,0.12);
  --captcha-error-border: rgba(239,68,68,0.3);
  --captcha-warn: #fbbf24;
  --captcha-shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
  --captcha-shadow-md: 0 4px 12px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3);
  --captcha-shadow-lg: 0 12px 40px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.3);
}

* { box-sizing: border-box; }

/* ── Root ── */
.root {
  position: relative;
  background: var(--captcha-surface);
  border: 1px solid var(--captcha-border);
  border-radius: var(--captcha-radius-lg);
  padding: 18px;
  width: 512px;
  box-shadow: var(--captcha-shadow-md);
  isolation: isolate;
}

/* ── Header ── */
.header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  min-height: 28px;
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding-right: 10px;
  border-right: 1px solid var(--captcha-border);
  color: var(--captcha-fg);
}

.brand-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--captcha-subtle);
  transition: background 0.2s ease, box-shadow 0.2s ease;
  flex-shrink: 0;
}

.brand-dot.active {
  background: var(--captcha-electric);
  box-shadow: 0 0 0 3px var(--captcha-electric-glow);
  animation: pulse-dot 1.5s ease-in-out infinite;
}

.brand-dot.success {
  background: var(--captcha-success);
}

.brand-dot.fail {
  background: var(--captcha-error);
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

.brand-text {
  font-family: var(--captcha-mono);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--captcha-fg);
}

.title {
  color: var(--captcha-fg);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  flex: 1;
  letter-spacing: -0.01em;
}

.timer {
  color: var(--captcha-muted);
  font-family: var(--captcha-mono);
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  min-width: 40px;
  text-align: right;
  letter-spacing: 0.02em;
  flex-shrink: 0;
  padding: 2px 8px;
  background: var(--captcha-elevated);
  border: 1px solid var(--captcha-border);
  border-radius: var(--captcha-radius-sm);
}

.timer.warning {
  color: var(--captcha-error);
  border-color: var(--captcha-error-border);
  background: var(--captcha-error-bg);
  animation: pulse-warn 0.7s ease-in-out infinite alternate;
}

@keyframes pulse-warn {
  from { opacity: 1; }
  to { opacity: 0.65; }
}

/* ── Instruction bar ── */
.instruction {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 12px;
  background: var(--captcha-elevated);
  border: 1px solid var(--captcha-border);
  border-radius: var(--captcha-radius-md);
  font-size: 13px;
  color: var(--captcha-fg);
  line-height: 1.45;
}

.instruction-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--captcha-electric);
}

.instruction-icon svg {
  width: 18px;
  height: 18px;
}

.instruction-text {
  flex: 1;
  color: var(--captcha-fg);
}

.instruction-text strong {
  font-weight: 600;
  color: var(--captcha-fg);
}

.instruction-text .hint {
  display: block;
  margin-top: 3px;
  font-size: 12px;
  color: var(--captcha-muted);
  line-height: 1.4;
}

.instruction.hidden {
  display: none;
}

/* ── Canvas wrapper with surveillance-style brackets ── */
.canvas-wrap {
  position: relative;
  border-radius: var(--captcha-radius-md);
  overflow: hidden;
  border: 1px solid var(--captcha-canvas-border);
  background: var(--captcha-canvas-bg);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.02);
}

canvas {
  display: block;
  width: 480px;
  height: 400px;
  border-radius: inherit;
}

/* Four L-brackets that frame the canvas like a viewfinder during tracking. */
.bracket {
  position: absolute;
  width: 18px;
  height: 18px;
  border: 1.5px solid var(--captcha-electric);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s ease;
  filter: drop-shadow(0 0 4px var(--captcha-electric-glow));
}

.bracket.tl { top: 8px; left: 8px; border-right: none; border-bottom: none; border-top-left-radius: 3px; }
.bracket.tr { top: 8px; right: 8px; border-left: none; border-bottom: none; border-top-right-radius: 3px; }
.bracket.bl { bottom: 8px; left: 8px; border-right: none; border-top: none; border-bottom-left-radius: 3px; }
.bracket.br { bottom: 8px; right: 8px; border-left: none; border-top: none; border-bottom-right-radius: 3px; }

.canvas-wrap.tracking .bracket {
  opacity: 0.9;
  animation: bracket-pulse 1.4s ease-in-out infinite;
}

@keyframes bracket-pulse {
  0%, 100% { opacity: 0.9; }
  50% { opacity: 0.55; }
}

/* ── Overlay (ready state) ── */
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 24px;
  background: var(--captcha-surface);
  transition: opacity 0.25s ease;
}

.overlay.hidden {
  opacity: 0;
  pointer-events: none;
}

.overlay-shield {
  position: relative;
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--captcha-accent);
  color: var(--captcha-accent-fg);
  border-radius: 14px;
  margin-bottom: 4px;
  box-shadow:
    0 6px 20px rgba(9,9,11,0.15),
    inset 0 -1px 0 rgba(255,255,255,0.08),
    inset 0 1px 0 rgba(255,255,255,0.12);
}

.overlay-shield::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 16px;
  border: 1px solid var(--captcha-border);
  pointer-events: none;
}

.overlay-shield svg {
  width: 28px;
  height: 28px;
}

.overlay-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--captcha-fg);
  letter-spacing: -0.015em;
  text-align: center;
}

.overlay-desc {
  font-size: 13.5px;
  color: var(--captcha-muted);
  text-align: center;
  line-height: 1.55;
  max-width: 320px;
}

.overlay-desc strong {
  color: var(--captcha-fg);
  font-weight: 600;
}

.start-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--captcha-accent);
  color: var(--captcha-accent-fg);
  border: none;
  border-radius: var(--captcha-radius-md);
  padding: 11px 22px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition:
    background 0.15s ease,
    transform 0.1s ease,
    box-shadow 0.15s ease;
  margin-top: 6px;
  box-shadow:
    0 2px 5px rgba(9,9,11,0.12),
    inset 0 -1px 0 rgba(255,255,255,0.05);
  letter-spacing: -0.005em;
}

.start-btn:hover {
  background: var(--captcha-accent-hover);
  box-shadow:
    0 4px 10px rgba(9,9,11,0.18),
    inset 0 -1px 0 rgba(255,255,255,0.05);
}

.start-btn:active {
  transform: translateY(1px);
  box-shadow: 0 1px 2px rgba(9,9,11,0.08);
}

.start-btn:focus-visible {
  outline: 2px solid var(--captcha-electric);
  outline-offset: 2px;
}

.start-btn-arrow {
  display: inline-block;
  transition: transform 0.15s ease;
  font-family: var(--captcha-mono);
}

.start-btn:hover .start-btn-arrow {
  transform: translateX(2px);
}

/* ── Progress bar ── */
.progress {
  height: 3px;
  background: var(--captcha-border);
  border-radius: 999px;
  margin-top: 12px;
  overflow: hidden;
  position: relative;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg,
    var(--captcha-accent),
    var(--captcha-accent));
  border-radius: 999px;
  transition: width 0.1s linear;
  box-shadow: 0 0 8px rgba(9,9,11,0.15);
}

.progress-bar.warning {
  background: linear-gradient(90deg, var(--captcha-warn), #fbbf24);
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.3);
}

.progress-bar.danger {
  background: linear-gradient(90deg, var(--captcha-error), #f87171);
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.35);
}

/* ── Footer ── */
.footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 14px;
  gap: 12px;
}

.done-btn {
  background: var(--captcha-accent);
  color: var(--captcha-accent-fg);
  border: none;
  border-radius: var(--captcha-radius-md);
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease;
  letter-spacing: -0.005em;
}

.done-btn:hover { background: var(--captcha-accent-hover); }
.done-btn:active { transform: translateY(1px); }

.done-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  transform: none;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--captcha-subtle);
  font-family: var(--captcha-mono);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-left: auto;
}

.brand-lock {
  width: 11px;
  height: 11px;
  opacity: 0.7;
}

/* ── Result banner ── */
.result-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--captcha-radius-md);
  margin-top: 12px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid;
  animation: result-in 0.25s ease-out;
}

@keyframes result-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.result-banner.success {
  background: var(--captcha-success-bg);
  color: var(--captcha-success);
  border-color: var(--captcha-success-border);
}

.result-banner.fail {
  background: var(--captcha-error-bg);
  color: var(--captcha-error);
  border-color: var(--captcha-error-border);
}

.result-icon {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #fff;
}

.result-banner.success .result-icon { background: var(--captcha-success); }
.result-banner.fail .result-icon { background: var(--captcha-error); }

.result-icon svg {
  width: 13px;
  height: 13px;
}

.result-text {
  flex: 1;
  font-weight: 500;
  line-height: 1.4;
}

.retry-btn {
  background: transparent;
  border: 1px solid currentColor;
  border-radius: var(--captcha-radius-sm);
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  color: inherit;
  cursor: pointer;
  opacity: 0.85;
  transition: opacity 0.15s, background 0.15s;
  flex-shrink: 0;
}

.retry-btn:hover {
  opacity: 1;
  background: rgba(255,255,255,0.1);
}

:host([data-theme="dark"]) .retry-btn:hover {
  background: rgba(0,0,0,0.2);
}
`;
