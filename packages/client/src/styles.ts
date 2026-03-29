export const STYLES = `
:host {
  display: block;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --captcha-bg: #ffffff;
  --captcha-fg: #111827;
  --captcha-muted: #6b7280;
  --captcha-subtle: #9ca3af;
  --captcha-accent: #2563eb;
  --captcha-accent-hover: #1d4ed8;
  --captcha-canvas-bg: #fafafa;
  --captcha-canvas-border: #e5e7eb;
  --captcha-stroke: #374151;
  --captcha-success: #059669;
  --captcha-success-bg: #ecfdf5;
  --captcha-error: #dc2626;
  --captcha-error-bg: #fef2f2;
  --captcha-warn: #d97706;
  --captcha-radius: 12px;
  --captcha-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
}

:host([data-theme="dark"]) {
  --captcha-bg: #1f2937;
  --captcha-fg: #f9fafb;
  --captcha-muted: #9ca3af;
  --captcha-subtle: #6b7280;
  --captcha-accent: #3b82f6;
  --captcha-accent-hover: #2563eb;
  --captcha-canvas-bg: #111827;
  --captcha-canvas-border: #374151;
  --captcha-stroke: #d1d5db;
  --captcha-success: #34d399;
  --captcha-success-bg: rgba(16,185,129,0.1);
  --captcha-error: #f87171;
  --captcha-error-bg: rgba(239,68,68,0.1);
  --captcha-warn: #fbbf24;
  --captcha-shadow: 0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2);
}

* { box-sizing: border-box; }

.root {
  background: var(--captcha-bg);
  border: 1px solid var(--captcha-canvas-border);
  border-radius: var(--captcha-radius);
  padding: 16px;
  width: 512px;
  box-shadow: var(--captcha-shadow);
}

/* ── Header ── */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  min-height: 28px;
}

.title {
  color: var(--captcha-fg);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  flex: 1;
}

.timer {
  color: var(--captcha-muted);
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  min-width: 28px;
  text-align: right;
  flex-shrink: 0;
  margin-left: 12px;
}

.timer.warning {
  color: var(--captcha-error);
  animation: pulse 0.6s ease-in-out infinite alternate;
}

@keyframes pulse {
  from { opacity: 1; }
  to { opacity: 0.5; }
}

/* ── Instruction bar ── */
.instruction {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  margin-bottom: 10px;
  background: var(--captcha-canvas-bg);
  border: 1px solid var(--captcha-canvas-border);
  border-radius: 8px;
  font-size: 13px;
  color: var(--captcha-fg);
  line-height: 1.4;
}

.instruction-icon {
  font-size: 20px;
  flex-shrink: 0;
  line-height: 1;
}

.instruction-text {
  flex: 1;
}

.instruction-text strong {
  font-weight: 600;
}

.instruction.hidden {
  display: none;
}

/* ── Canvas ── */
.canvas-wrap {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--captcha-canvas-border);
  background: var(--captcha-canvas-bg);
}

canvas {
  display: block;
  width: 480px;
  height: 400px;
}

/* ── Overlay (start screen) ── */
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: var(--captcha-canvas-bg);
  transition: opacity 0.2s ease;
}

.overlay.hidden {
  opacity: 0;
  pointer-events: none;
}

.overlay-shield {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  background: var(--captcha-accent);
  color: #fff;
  border-radius: 12px;
  margin-bottom: 2px;
}

.overlay-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--captcha-fg);
  letter-spacing: -0.01em;
}

.overlay-desc {
  font-size: 13px;
  color: var(--captcha-muted);
  text-align: center;
  line-height: 1.5;
  max-width: 240px;
}

.start-btn {
  background: var(--captcha-accent);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 28px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease;
  margin-top: 4px;
}

.start-btn:hover {
  background: var(--captcha-accent-hover);
}

.start-btn:active {
  transform: scale(0.97);
}

/* ── Progress bar ── */
.progress {
  height: 3px;
  background: var(--captcha-canvas-border);
  border-radius: 2px;
  margin-top: 10px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: var(--captcha-accent);
  border-radius: 2px;
  transition: width 0.1s linear;
}

.progress-bar.warning {
  background: var(--captcha-warn);
}

.progress-bar.danger {
  background: var(--captcha-error);
}

/* ── Footer ── */
.footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
}

.done-btn {
  background: var(--captcha-accent);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease;
}

.done-btn:hover {
  background: var(--captcha-accent-hover);
}

.done-btn:active {
  transform: scale(0.97);
}

.done-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  transform: none;
}

.brand {
  color: var(--captcha-subtle);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
}

/* ── Result banner ── */
.result-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  margin-top: 10px;
  font-size: 13px;
  font-weight: 600;
}

.result-banner.success {
  background: var(--captcha-success-bg);
  color: var(--captcha-success);
}

.result-banner.fail {
  background: var(--captcha-error-bg);
  color: var(--captcha-error);
}

.result-icon {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.result-banner.success .result-icon {
  background: var(--captcha-success);
}

.result-banner.fail .result-icon {
  background: var(--captcha-error);
}

.retry-btn {
  margin-left: auto;
  background: none;
  border: 1px solid currentColor;
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 600;
  color: inherit;
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.15s;
}

.retry-btn:hover {
  opacity: 1;
}
`;
