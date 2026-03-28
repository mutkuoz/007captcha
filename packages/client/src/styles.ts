export const STYLES = `
:host {
  display: block;
  font-family: system-ui, -apple-system, sans-serif;
  --captcha-bg: #ffffff;
  --captcha-fg: #1a1a1a;
  --captcha-muted: #6b7280;
  --captcha-accent: #2563eb;
  --captcha-canvas-bg: #f9fafb;
  --captcha-canvas-border: #e5e7eb;
  --captcha-stroke: #1f2937;
  --captcha-success: #16a34a;
  --captcha-error: #dc2626;
  --captcha-radius: 12px;
}

:host([data-theme="dark"]) {
  --captcha-bg: #1f2937;
  --captcha-fg: #f9fafb;
  --captcha-muted: #9ca3af;
  --captcha-accent: #3b82f6;
  --captcha-canvas-bg: #111827;
  --captcha-canvas-border: #374151;
  --captcha-stroke: #e5e7eb;
  --captcha-success: #22c55e;
  --captcha-error: #ef4444;
}

.root {
  background: var(--captcha-bg);
  border: 1px solid var(--captcha-canvas-border);
  border-radius: var(--captcha-radius);
  padding: 16px;
  width: 320px;
  box-sizing: border-box;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.title {
  color: var(--captcha-fg);
  font-size: 14px;
  font-weight: 600;
}

.timer {
  color: var(--captcha-muted);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.timer.warning {
  color: var(--captcha-error);
  font-weight: 600;
}

.canvas-wrap {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--captcha-canvas-border);
  background: var(--captcha-canvas-bg);
}

canvas {
  display: block;
  width: 288px;
  height: 288px;
}

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--captcha-canvas-bg);
  transition: opacity 0.2s;
}

.overlay.hidden {
  opacity: 0;
  pointer-events: none;
}

.overlay-icon {
  font-size: 48px;
  margin-bottom: 8px;
}

.overlay-text {
  color: var(--captcha-muted);
  font-size: 13px;
}

.start-btn {
  background: var(--captcha-accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.start-btn:hover {
  opacity: 0.9;
}

.footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
}

.done-btn {
  background: var(--captcha-accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.done-btn:hover {
  opacity: 0.9;
}

.done-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.brand {
  color: var(--captcha-muted);
  font-size: 11px;
  text-decoration: none;
}

.progress {
  height: 3px;
  background: var(--captcha-canvas-border);
  border-radius: 2px;
  margin-top: 12px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: var(--captcha-accent);
  border-radius: 2px;
  transition: width 0.1s linear;
}

.result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  font-size: 14px;
  font-weight: 500;
}

.result.success {
  color: var(--captcha-success);
}

.result.fail {
  color: var(--captcha-error);
}

.result-icon {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #fff;
}

.result.success .result-icon {
  background: var(--captcha-success);
}

.result.fail .result-icon {
  background: var(--captcha-error);
}
`;
