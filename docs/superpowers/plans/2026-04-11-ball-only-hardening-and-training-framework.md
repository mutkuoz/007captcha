# Ball-Only Hardening and Training Framework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a 0.2.0 release of `@007captcha/{server,client,react}` that (a) deletes shape and maze challenges, (b) closes four audit holes in the ball challenge scoring, (c) adds opt-in server-side trace logging, and (d) adds a self-contained Python training pipeline.

**Architecture:** Ball is the only supported method. The scoring fix centers on a new `frameAcks` protocol: the client records `(frameIndex, clientReceivedT, cursorX, cursorY)` as SSE frames arrive, the server validates those against its own record of when it dispatched each frame. This binds the cursor trace to the real-time ball positions and cannot be forged by adjusting a single `cursorStartT` anchor. The Python training pipeline lives outside the pnpm workspace in a new top-level `training/` directory with its own `requirements.txt`; it reads JSONL traces that the opt-in logger writes from the server's `verify()` paths.

**Tech Stack:** TypeScript (pnpm workspaces, tsup, vitest), Node.js `node:crypto`/`node:fs`/`node:path` only for server runtime, Python 3.10+ with numpy + scikit-learn + pytest for training.

**Branch strategy:** All work lands on `main`. Design spec approval (2026-04-11) permits direct commits. Each task is a separate commit.

---

## File Structure

### Deletions (Workstream 1A)

| Path | Reason |
|---|---|
| `packages/server/src/shape/` (entire dir) | Shape challenge removed |
| `packages/server/src/maze/` (entire dir) | Maze challenge removed |
| `packages/client/src/maze/` (entire dir) | Maze client renderer removed |
| `packages/client/src/challenges/shape.ts` | Shape challenge class removed |
| `packages/client/src/challenges/maze.ts` | Maze challenge class removed |
| `packages/client/src/analyze/` (entire dir) | Shape drawing analysis removed |

### New files (Workstream 2)

| Path | Responsibility |
|---|---|
| `packages/server/src/logger.ts` | Opt-in JSONL trace writer (~80 lines) |
| `packages/server/src/__tests__/logger.test.ts` | Logger unit tests |
| `training/README.md` | How to install & run the pipeline |
| `training/requirements.txt` | numpy, scikit-learn, pytest |
| `training/pyproject.toml` | Ruff config |
| `training/.gitignore` | Ignores data/, models/, __pycache__/ |
| `training/ooseven_training/__init__.py` | Package marker |
| `training/ooseven_training/schema.py` | TypedDict matching JSONL schema |
| `training/ooseven_training/loader.py` | `load_traces(dir) -> list[Trace]` |
| `training/ooseven_training/features.py` | `extract_features(trace) -> (np.ndarray, list[str])` |
| `training/ooseven_training/model.py` | sklearn wrapper with fit/predict/save/load |
| `training/ooseven_training/metrics.py` | Accuracy/precision/recall/F1/importance report |
| `training/scripts/__init__.py` | Empty, makes scripts importable |
| `training/scripts/train.py` | CLI: train a model from JSONL data |
| `training/scripts/eval.py` | CLI: evaluate a saved model on JSONL data |
| `training/scripts/gen_fixture.py` | Generate synthetic human/bot traces for smoke tests |
| `training/tests/__init__.py` | Empty, makes tests discoverable |
| `training/tests/test_pipeline.py` | pytest smoke test: gen → train → eval → assert |

### Modifications (Workstream 1)

| Path | Change |
|---|---|
| `packages/server/src/types.ts` | Remove shape/maze types; add `FrameAck`; update `ChallengeMethod` to just `'ball'` |
| `packages/server/src/index.ts` | Remove `MazeChallengeManager`, `ShapeChallengeManager` exports |
| `packages/server/src/verify.ts` | Update `fail()` helper default method |
| `packages/server/src/ball/physics.ts` | Expose frame dispatch timestamps (server wall clock) |
| `packages/server/src/ball/session.ts` | Record `serverSentT` per SSE emit; accept `frameAcks` in `verify()` |
| `packages/server/src/ball/analyze.ts` | Add `frameWithinTight` metric; add `analyzeFrameAcks()` returning validation flags; expose direction-change count |
| `packages/server/src/ball/scoring.ts` | Fixes 1–4: hard flags and tightened bands |
| `packages/server/src/ball/__tests__/scoring.test.ts` | Update existing fixtures; add tests for each new hard flag |
| `packages/server/src/ball/__tests__/session.test.ts` | Update for new verify signature |
| `packages/client/src/types.ts` | Remove shape/maze types; remove `method` from `CaptchaConfig` |
| `packages/client/src/index.ts` | Remove shape/maze type exports |
| `packages/client/src/challenges/index.ts` | Delete file (only ball remains) |
| `packages/client/src/challenges/ball.ts` | Capture `frameAcks` from SSE; send in verify |
| `packages/client/src/widget.ts` | Remove method selection logic; always use `BallChallenge` |
| `packages/client/src/challenge.ts` | Likely no change — interface stays |
| `packages/react/src/OOSevenCaptcha.tsx` | Remove `method` prop |
| `examples/express-server/server.js` | Delete shape/maze endpoints; delete method picker HTML |
| `examples/react-app/src/App.tsx` | Delete method picker |
| `examples/vanilla-html/index.html` | Delete `method:` from render call |
| `README.md` | Ball-only rewrite |
| `packages/server/package.json` | Bump to 0.2.0 |
| `packages/client/package.json` | Bump to 0.2.0 |
| `packages/react/package.json` | Bump to 0.2.0; update peer dep version |
| `.gitignore` (repo root) | Add `training/data/`, `training/models/`, `training/**/__pycache__/`, `training/.venv/` |

---

## Tasks

Tasks are grouped by workstream. Within a workstream they should generally run in order, but `W1A-*` tasks (deletion) can parallelize with each other, and the Python tasks in Workstream 2 are independent of the TS logger tasks.

---

### Task W1A-1: Delete shape & maze server packages

**Files:**
- Delete: `packages/server/src/shape/` (entire dir)
- Delete: `packages/server/src/maze/` (entire dir)
- Modify: `packages/server/src/types.ts`
- Modify: `packages/server/src/index.ts`
- Modify: `packages/server/src/verify.ts`

- [ ] **Step 1: Delete the directories**

```bash
rm -rf packages/server/src/shape packages/server/src/maze
```

- [ ] **Step 2: Update `packages/server/src/types.ts` — remove shape/maze types**

Delete these exports entirely:
- `ShapeType`
- `MazeCell`
- `MazeDefinition`
- `MazeAnalysisMetrics`
- `ZoneRect`
- `MazeVerifyResult`
- `ShapeVerifyResult`

Change `ChallengeMethod` from `'shape' | 'maze' | 'ball'` to just `'ball'`.

In `TokenPayload`, remove the `shape?: ShapeType;` field.

The final file should only contain ball-relevant types plus `ClientEnvironment`, `RequestMeta`, `CursorPoint`, `VerifyResult`, `TokenPayload`, `BallShape`, `BallFrame`, `TrajectoryChangeEvent`, `BallVisuals`, `BallAnalysisMetrics`, `BallVerifyResult`.

- [ ] **Step 3: Update `packages/server/src/index.ts` — remove deleted exports**

Replace entire file contents with:

```ts
export { verify } from './verify';
export { BallChallengeManager } from './ball/session';
export type { BallSession, BallSessionStartResult, BallChallengeManagerOptions, SessionStatus } from './ball/session';
export type {
  VerifyResult, TokenPayload, ChallengeMethod,
  BallVisuals, BallFrame, BallShape, CursorPoint, BallVerifyResult,
  FrameAck,
  ClientEnvironment, RequestMeta,
} from './types';
```

Note: `FrameAck` is defined in Task W1C-1 but the export line is added now.

- [ ] **Step 4: Update `packages/server/src/verify.ts` — default method**

At lines 17-25, change the `fail()` helper's `method: 'shape'` default to `method: 'ball'`. At lines 62-63, remove the backward-compat line `const method: ChallengeMethod = payload.method ?? 'shape';` and replace with `const method: ChallengeMethod = 'ball';` — and remove the `payload.shape` fallback in the `challenge` assignment; just use `payload.challenge ?? ''`.

The full updated `verify()` function body (lines 16-73) should be:

```ts
export async function verify(token: string, secretKey: string): Promise<VerifyResult> {
  const fail = (error: string): VerifyResult => ({
    success: false,
    score: 0,
    method: 'ball',
    challenge: '',
    verdict: 'bot',
    timestamp: 0,
    error,
  });

  if (!token || typeof token !== 'string') return fail('Invalid token');

  const parts = token.split('.');
  if (parts.length !== 2) return fail('Malformed token');

  const [payloadB64, signatureB64] = parts;

  const expectedSig = base64urlEncode(
    createHmac('sha256', secretKey).update(payloadB64).digest()
  );

  const sigBuffer = Buffer.from(signatureB64);
  const expectedBuffer = Buffer.from(expectedSig);

  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    return fail('Invalid signature');
  }

  let payload: TokenPayload;
  try {
    const json = base64urlDecode(payloadB64).toString('utf-8');
    payload = JSON.parse(json);
  } catch {
    return fail('Invalid payload');
  }

  const age = Date.now() - payload.ts;
  if (age > TOKEN_MAX_AGE_MS || age < -60000) {
    return fail('Token expired');
  }

  return {
    success: payload.verdict !== 'bot',
    score: payload.score,
    method: 'ball',
    challenge: payload.challenge ?? '',
    verdict: payload.verdict,
    timestamp: payload.ts,
  };
}
```

- [ ] **Step 5: Run server tests to verify nothing references deleted code**

Run: `pnpm --filter @007captcha/server test`
Expected: some test files may fail (they reference deleted shape/maze). Note which tests fail — these will be cleaned up in Task W1A-2.

It's OK if tests fail here. Do NOT fix them yet. Just capture the list of failing files.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/shape packages/server/src/maze packages/server/src/types.ts packages/server/src/index.ts packages/server/src/verify.ts
git commit -m "$(cat <<'EOF'
Delete shape and maze challenge modules from server

Removes packages/server/src/shape/ and packages/server/src/maze/ entirely,
along with their types and index exports. Ball becomes the only challenge
method. Tests for deleted modules will be removed in a follow-up task.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task W1A-2: Delete server tests for shape & maze

**Files:**
- Audit: `packages/server/src/__tests__/` for shape/maze references
- Delete any test files that only test deleted modules

- [ ] **Step 1: Find tests that reference deleted modules**

Use Grep to search:
```
pattern: "from.*shape|from.*maze|ShapeChallengeManager|MazeChallengeManager|MazeAnalysisMetrics"
path: packages/server/src/__tests__
```

For each matching file, either:
- Delete the file entirely if its whole purpose is shape/maze
- Remove the specific tests that reference deleted types, keeping ball-specific tests

The current `verify.test.ts` likely tests shape-based tokens. Ball tokens must still verify correctly; rewrite any tests that constructed shape-format tokens to construct ball-format tokens.

- [ ] **Step 2: Run tests to confirm server package is green**

Run: `pnpm --filter @007captcha/server test`
Expected: PASS (or only ball-related failures, which are addressed later). Shape/maze references should be gone.

- [ ] **Step 3: Commit**

```bash
git add -u packages/server/src/__tests__
git commit -m "$(cat <<'EOF'
Remove server tests for deleted shape and maze modules

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task W1A-3: Delete shape & maze client modules

**Files:**
- Delete: `packages/client/src/maze/` (entire dir)
- Delete: `packages/client/src/analyze/` (entire dir — it's the shape drawing analysis)
- Delete: `packages/client/src/challenges/shape.ts`
- Delete: `packages/client/src/challenges/maze.ts`
- Delete: `packages/client/src/challenges/index.ts` (no longer needed — only one challenge)
- Modify: `packages/client/src/types.ts`
- Modify: `packages/client/src/index.ts`

- [ ] **Step 1: Delete the directories and files**

```bash
rm -rf packages/client/src/maze packages/client/src/analyze
rm packages/client/src/challenges/shape.ts packages/client/src/challenges/maze.ts packages/client/src/challenges/index.ts
```

- [ ] **Step 2: Update `packages/client/src/types.ts`**

Remove these types entirely:
- `ShapeType`
- `ShapePerfectionMetrics`
- `MazeCell`
- `MazeDefinition`
- `MazeAnalysisMetrics`

Change `ChallengeMethod` from `'shape' | 'maze' | 'ball'` to just `'ball'`.

Remove from `CaptchaConfig` the `method?: ChallengeMethod | 'random';` field entirely.

Update `AnalysisResult` to remove `shapePerfection: ShapePerfectionMetrics`. The ball challenge only needs `score`, `behavioral`, and `verdict`. Final shape:

```ts
export interface AnalysisResult {
  score: number;
  behavioral: BehavioralMetrics;
  verdict: 'bot' | 'human' | 'uncertain';
}
```

Remove `challenge: string; // 'circle'|'triangle'|'square' for shape, 'maze' for maze` from `TokenPayload` — keep the `challenge: string` field but fix the comment to `challenge: 'ball'`.

- [ ] **Step 3: Update `packages/client/src/index.ts`**

Replace file contents with:

```ts
export { CaptchaWidget } from './widget';
export type {
  CaptchaConfig,
  CapturePoint,
  ChallengeMethod,
  AnalysisResult,
  BehavioralMetrics,
  BallShape,
  BallFrame,
  BallVisuals,
  VerifyResult,
  TokenPayload,
} from './types';

import type { CaptchaConfig } from './types';
import { CaptchaWidget } from './widget';

/** Convenience function for quick integration */
export function render(config: CaptchaConfig): CaptchaWidget {
  return new CaptchaWidget(config);
}
```

- [ ] **Step 4: Commit**

```bash
git add -A packages/client/src
git commit -m "$(cat <<'EOF'
Delete shape and maze challenge modules from client

Removes packages/client/src/{maze,analyze}/, shape/maze challenge classes,
and the challenge factory (which is unnecessary now that only one challenge
exists). Types file drops ShapeType, ShapePerfectionMetrics, MazeCell,
MazeDefinition, and the method field from CaptchaConfig.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task W1A-4: Simplify widget.ts — ball only

**Files:**
- Modify: `packages/client/src/widget.ts`

Remove method selection, method-based regeneration, `MAX_MAZE_REGENERATIONS`, and all references to deleted modules. The widget now always instantiates `BallChallenge` directly.

- [ ] **Step 1: Rewrite `startChallenge()` method**

Replace the current `startChallenge()` method (lines 179-220) with:

```ts
  private startChallenge(): void {
    this.challenge = new BallChallenge(
      this.config.serverUrl ?? '',
      this.config.siteKey,
    );
    this.challengeId = generateId();
    this.state = 'drawing';

    this.titleEl.textContent = this.challenge.getTitle();

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
```

- [ ] **Step 2: Replace the `handleTimeout()` method**

Remove the maze-regeneration branch. Replace `handleTimeout()` (lines 237-274) with:

```ts
  private handleTimeout(): void {
    this.finishChallenge();
  }
```

- [ ] **Step 3: Remove `MAX_MAZE_REGENERATIONS` constant**

Delete line 8: `const MAX_MAZE_REGENERATIONS = 3;`

Also delete line 25: `private regenerationCount = 0;`

- [ ] **Step 4: Update imports**

At the top of the file (line 3), remove the `createChallenge` import. Replace with:

```ts
import { BallChallenge } from './challenges/ball';
```

- [ ] **Step 5: Build client to check for compile errors**

Run: `pnpm --filter @007captcha/client build`
Expected: build succeeds.

If build fails due to leftover references to `createChallenge` or `regenerationCount`, fix them.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/widget.ts
git commit -m "$(cat <<'EOF'
Simplify client widget to ball-only

Removes method selection, maze regeneration logic, and challenge factory
indirection. Widget now instantiates BallChallenge directly.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task W1A-5: Update React wrapper — remove `method` prop

**Files:**
- Modify: `packages/react/src/OOSevenCaptcha.tsx`

- [ ] **Step 1: Replace file contents**

Replace with:

```tsx
import { useRef, useEffect } from 'react';
import type { CaptchaConfig } from '@007captcha/client';
import { CaptchaWidget } from '@007captcha/client';

export interface OOSevenCaptchaProps extends Omit<CaptchaConfig, 'container'> {
  className?: string;
}

export function OOSevenCaptcha({
  className,
  siteKey,
  serverUrl,
  theme,
  timeLimit,
  onSuccess,
  onFailure,
  onExpired,
}: OOSevenCaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<CaptchaWidget | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const widget = new CaptchaWidget({
      siteKey,
      container: containerRef.current,
      serverUrl,
      theme,
      timeLimit,
      onSuccess,
      onFailure,
      onExpired,
    });

    widgetRef.current = widget;
    return () => {
      widget.destroy();
      widgetRef.current = null;
    };
  }, [siteKey, serverUrl, theme, timeLimit]);

  return <div ref={containerRef} className={className} />;
}
```

- [ ] **Step 2: Build React package**

Run: `pnpm --filter @007captcha/react build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/react/src/OOSevenCaptcha.tsx
git commit -m "$(cat <<'EOF'
Remove method prop from React wrapper

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task W1A-6: Update examples

**Files:**
- Modify: `examples/express-server/server.js`
- Modify: `examples/react-app/src/App.tsx`
- Modify: `examples/vanilla-html/index.html`

- [ ] **Step 1: Rewrite `examples/express-server/server.js`**

The new file should have:
- Only `BallChallengeManager` imported, no shape/maze
- Only the three ball endpoints (`start`, `stream`, `verify`)
- Main page HTML with no method picker — just a single "Verify" button and the captcha widget initialized with ball

Full new contents:

```js
import express from 'express';
import { verify, BallChallengeManager } from '../../packages/server/dist/index.mjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const SECRET_KEY = 'demo-site-key-change-me';

const ballManager = new BallChallengeManager(SECRET_KEY);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use('/captcha', express.static(join(__dirname, '../../packages/client/dist/umd')));

app.post('/captcha/ball/start', (req, res) => {
  const { sessionId, visuals } = ballManager.createSession();
  res.json({ sessionId, visuals });
});

app.get('/captcha/ball/:id/stream', (req, res) => {
  const sessionId = req.params.id;
  const session = ballManager.getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  let streamCompleted = false;

  const started = ballManager.startStreaming(
    sessionId,
    (frame) => {
      res.write(`event: frame\ndata: ${JSON.stringify(frame)}\n\n`);
    },
    () => {
      streamCompleted = true;
      res.write('event: end\ndata: {}\n\n');
      res.end();
    },
  );

  if (!started) {
    res.write('event: error\ndata: {"error":"Session already started or expired"}\n\n');
    res.end();
    return;
  }

  req.on('close', () => {
    if (!streamCompleted) {
      ballManager.cancelSession(sessionId);
    }
  });
});

app.post('/captcha/ball/:id/verify', (req, res) => {
  const sessionId = req.params.id;
  const { points, cursorStartT, frameAcks, origin, clientEnv } = req.body;
  const requestMeta = {
    userAgent: req.headers['user-agent'],
    acceptLanguage: req.headers['accept-language'],
  };

  const result = ballManager.verify(
    sessionId,
    points || [],
    cursorStartT || 0,
    frameAcks || [],
    origin || '',
    clientEnv,
    requestMeta,
  );
  res.json(result);
});

app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>007captcha Express Example</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      padding: 48px 16px;
      background: #f3f4f6;
      min-height: 100vh;
    }
    .card {
      background: #fff;
      padding: 32px;
      border-radius: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.04);
      width: 100%;
      max-width: 580px;
      align-self: flex-start;
    }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; color: #111827; }
    .subtitle { font-size: 13px; color: #6b7280; margin-bottom: 24px; }
    #captcha { margin-bottom: 16px; }
    button[type="submit"] {
      width: 100%;
      background: #111827;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 10px 20px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    button[type="submit"]:hover { background: #1f2937; }
    button[type="submit"]:disabled { opacity: 0.4; cursor: not-allowed; }
    #result {
      margin-top: 16px;
      padding: 12px;
      border-radius: 8px;
      font-size: 13px;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
      white-space: pre-wrap;
      word-break: break-all;
      display: none;
    }
    #result.show { display: block; }
    .success { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; }
    .error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
  </style>
</head>
<body>
  <div class="card">
    <h1>007captcha + Express</h1>
    <p class="subtitle">Follow the ball with your cursor, then click Verify.</p>
    <form id="form" method="POST" action="/verify">
      <div id="captcha"></div>
      <button type="submit" id="submit-btn" disabled>Verify</button>
    </form>
    <div id="result"></div>
  </div>
  <script src="/captcha/index.global.js"></script>
  <script>
    let captchaToken = null;

    const widget = OOSevenCaptcha.render({
      siteKey: '${SECRET_KEY}',
      container: '#captcha',
      serverUrl: window.location.origin,
      onSuccess(token) {
        captchaToken = token;
        document.getElementById('submit-btn').disabled = false;
      },
      onFailure() {
        captchaToken = null;
        document.getElementById('submit-btn').disabled = true;
      }
    });

    document.getElementById('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!captchaToken) {
        const el = document.getElementById('result');
        el.className = 'error show';
        el.textContent = 'Please complete the captcha challenge first.';
        return;
      }
      const res = await fetch('/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: captchaToken })
      });
      const data = await res.json();
      const el = document.getElementById('result');
      el.className = (data.success ? 'success' : 'error') + ' show';
      el.textContent = JSON.stringify(data, null, 2);
    });
  </script>
</body>
</html>`);
});

app.post('/verify', async (req, res) => {
  const { token } = req.body;
  const result = await verify(token || '', SECRET_KEY);
  res.json(result);
});

const PORT = process.env.PORT || 3007;
app.listen(PORT, () => {
  console.log(`007captcha demo running at http://localhost:${PORT}`);
});
```

Note: the `verify()` call on line for `/captcha/ball/:id/verify` passes `frameAcks` — this is the new 5-parameter verify signature set up in Task W1C-2.

- [ ] **Step 2: Rewrite `examples/react-app/src/App.tsx`**

Replace with:

```tsx
import { useState } from 'react';
import { OOSevenCaptcha } from '@007captcha/react';

interface VerifyResult {
  success: boolean;
  score: number;
  method: string;
  verdict: string;
  error?: string;
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [key, setKey] = useState(0);

  const handleSuccess = (t: string) => {
    setToken(t);
    setResult(null);
  };

  const handleFailure = () => {
    setToken(null);
    setResult(null);
  };

  const handleVerify = async () => {
    if (!token) return;
    setVerifying(true);
    try {
      const res = await fetch('/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      setResult(await res.json());
    } catch {
      setResult({ success: false, score: 0, method: '', verdict: 'bot', error: 'Network error' });
    } finally {
      setVerifying(false);
    }
  };

  const handleReset = () => {
    setToken(null);
    setResult(null);
    setKey((k) => k + 1);
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>007captcha + React</h1>
        <p style={styles.subtitle}>
          Follow the ball with your cursor, then click Verify.
        </p>

        <OOSevenCaptcha
          key={key}
          siteKey="demo-site-key-change-me"
          serverUrl={window.location.origin}
          onSuccess={handleSuccess}
          onFailure={handleFailure}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            onClick={handleVerify}
            disabled={!token || verifying}
            style={{
              ...styles.verifyBtn,
              opacity: !token || verifying ? 0.4 : 1,
              cursor: !token || verifying ? 'not-allowed' : 'pointer',
            }}
          >
            {verifying ? 'Verifying...' : 'Verify'}
          </button>
          <button onClick={handleReset} style={styles.resetBtn}>Reset</button>
        </div>

        {result && (
          <pre
            style={{
              ...styles.result,
              background: result.success ? '#ecfdf5' : '#fef2f2',
              borderColor: result.success ? '#a7f3d0' : '#fecaca',
              color: result.success ? '#065f46' : '#991b1b',
            }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f3f4f6',
    display: 'flex',
    justifyContent: 'center',
    padding: '48px 16px',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  card: {
    background: '#fff',
    padding: 32,
    borderRadius: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.04)',
    width: '100%',
    maxWidth: 580,
    alignSelf: 'flex-start',
  },
  title: { fontSize: 20, fontWeight: 700, margin: 0, marginBottom: 4, color: '#111827' },
  subtitle: { fontSize: 13, color: '#6b7280', margin: 0, marginBottom: 24 },
  verifyBtn: {
    flex: 1,
    background: '#111827',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 600,
  },
  resetBtn: {
    background: '#fff',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  result: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    fontSize: 13,
    fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace",
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
    border: '1px solid',
  },
};
```

- [ ] **Step 3: Update `examples/vanilla-html/index.html`**

In the `<script>` at line 77, change the render call. Remove the `method: 'random'` line and the corresponding comment on line 78. Final render block:

```html
  <script src="../../packages/client/dist/umd/index.global.js"></script>
  <script>
    const widget = OOSevenCaptcha.render({
      siteKey: 'demo-site-key-change-me',
      container: '#captcha-container',
      theme: 'light',
      onSuccess: function(token) {
        console.log('Captcha passed! Token:', token);
      },
      onFailure: function(err) {
        console.log('Captcha failed:', err.message);
      }
    });

    document.getElementById('demo-form').addEventListener('submit', function(e) {
      e.preventDefault();
      var token = widget.getToken();
      var resultEl = document.getElementById('result');
      if (token) {
        resultEl.className = 'show';
        resultEl.textContent = 'Token: ' + token.substring(0, 80) + '...';
      } else {
        resultEl.className = 'show';
        resultEl.textContent = 'No token — complete the captcha first!';
      }
    });
  </script>
```

- [ ] **Step 4: Commit**

```bash
git add examples/
git commit -m "$(cat <<'EOF'
Update examples to ball-only

Removes method pickers, deletes shape/maze endpoints from the Express
example, simplifies App.tsx and the vanilla HTML demo. Express /verify
endpoint now passes frameAcks through to the manager.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task W1A-7: Rewrite README.md for ball-only

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite README**

The current README has sections for all three challenge methods. The new version removes all shape/maze content. Replace the entire contents with:

```markdown
<p align="center">
  <img src="007-logo.png" alt="007captcha" width="180">
</p>

<h1 align="center">007captcha</h1>

<p align="center">
  Behavioral captcha that catches bots through real-time ball-tracking analysis.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@007captcha/client"><img src="https://img.shields.io/npm/v/@007captcha/client?label=%40007captcha%2Fclient&color=111827" alt="npm"></a>
  <a href="https://www.npmjs.com/package/@007captcha/server"><img src="https://img.shields.io/npm/v/@007captcha/server?label=%40007captcha%2Fserver&color=111827" alt="npm"></a>
  <a href="https://github.com/mutkuoz/007captcha/blob/main/LICENSE"><img src="https://img.shields.io/github/license/mutkuoz/007captcha?color=111827" alt="license"></a>
  <a href="https://github.com/mutkuoz/007captcha/stargazers"><img src="https://img.shields.io/github/stars/mutkuoz/007captcha?style=flat&color=111827" alt="stars"></a>
</p>

---

Users follow a ball moving unpredictably across a canvas for 8 seconds. The trajectory is generated server-side in real-time and streamed as rendered images &mdash; future positions never exist on the client. The server runs a deep multi-layered analysis of the cursor trace: per-frame tracking enforcement, velocity-curvature power law fitting, spectral timing analysis, jerk profiling, sub-movement segmentation, reaction time modeling, drift detection, and environment fingerprinting &mdash; signals that are extremely difficult for automated agents to replicate convincingly.

All verification runs **server-side**. The client never holds scoring logic, detection parameters, or signing secrets. Tokens are HMAC-SHA256 signed, single-use, and expire automatically.

**Zero runtime dependencies** across all packages.

## Features

- **Real-time ball streaming** &mdash; Ball trajectories are computed tick-by-tick on the server and streamed as rendered images via SSE. Future positions don't exist until generated. No video, no DOM elements, no extractable assets.
- **Frame-level tracking enforcement** &mdash; The client commits to its cursor position at the moment each frame is received. The server validates those commitments against the real ball positions it sent. Pre-computed cursor paths cannot pass.
- **Fully server-side verification** &mdash; All scoring, detection, and token signing run on your server. The browser is a thin input-capture layer with no access to scoring logic or detection parameters.
- **Multi-layered behavioral analysis** &mdash; 12+ scoring signals including spectral timing analysis (DFT on inter-event intervals), velocity-curvature power law (1/3 power law), jerk profiling (3rd derivative of position), sub-movement segmentation, drift/bias detection, reaction time distribution modeling, and environment fingerprinting.
- **Hard bot flags** &mdash; Certain signals (non-monotonic timestamps, `navigator.webdriver`, impossible power law fits, unnaturally precise tracking, missing frame acknowledgments) trigger an immediate bot verdict, bypassing scoring entirely.
- **HMAC-SHA256 tokens** &mdash; Single-use, signed server-side, auto-expire after 5 minutes. Verified with one function call.
- **Zero runtime dependencies** &mdash; Server package uses only Node.js built-in `crypto`. No native modules, no C++ bindings, no external services.
- **Framework-agnostic** &mdash; Vanilla JS via script tag, ES modules, or the `@007captcha/react` component. Works with any backend framework.
- **Light & dark themes** &mdash; Built-in `'light'`, `'dark'`, and `'auto'` (follows system preference) themes.
- **TypeScript-first** &mdash; Full type definitions shipped with every package.

## Quick Start

### 1. Install

\`\`\`bash
pnpm add @007captcha/client @007captcha/server
\`\`\`

### 2. Server (Express)

\`\`\`js
import express from 'express';
import { verify, BallChallengeManager } from '@007captcha/server';

const app = express();
const SECRET = process.env.CAPTCHA_SECRET || 'change-me';

const ball = new BallChallengeManager(SECRET);

app.use(express.json());

// Start a new session
app.post('/captcha/ball/start', (req, res) => {
  res.json(ball.createSession());
});

// Stream ball frames as SSE
app.get('/captcha/ball/:id/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  let done = false;
  const ok = ball.startStreaming(
    req.params.id,
    (frame) => res.write(\`event: frame\\ndata: \${JSON.stringify(frame)}\\n\\n\`),
    ()      => { done = true; res.write('event: end\\ndata: {}\\n\\n'); res.end(); },
  );
  if (!ok) { res.end(); return; }
  req.on('close', () => { if (!done) ball.cancelSession(req.params.id); });
});

// Verify the submitted cursor trace and frame acks
app.post('/captcha/ball/:id/verify', (req, res) => {
  const { points, cursorStartT, frameAcks, origin, clientEnv } = req.body;
  const requestMeta = {
    userAgent: req.headers['user-agent'],
    acceptLanguage: req.headers['accept-language'],
  };
  res.json(ball.verify(
    req.params.id,
    points || [],
    cursorStartT || 0,
    frameAcks || [],
    origin || '',
    clientEnv,
    requestMeta,
  ));
});

// Token verification
app.post('/verify', async (req, res) => {
  res.json(await verify(req.body.token || '', SECRET));
});

app.listen(3007);
\`\`\`

### 3. Client (vanilla)

\`\`\`html
<div id="captcha"></div>
<script src="https://unpkg.com/@007captcha/client/dist/umd/index.global.js"></script>
<script>
  OOSevenCaptcha.render({
    siteKey: 'change-me',
    container: '#captcha',
    serverUrl: window.location.origin,
    onSuccess(token) {
      fetch('/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
    },
  });
</script>
\`\`\`

Or with ES modules:

\`\`\`ts
import { render } from '@007captcha/client';

const widget = render({
  siteKey: 'change-me',
  container: '#captcha',
  serverUrl: window.location.origin,
  onSuccess: (token) => { /* send to server */ },
});
\`\`\`

### 4. React

\`\`\`bash
pnpm add @007captcha/client @007captcha/react
\`\`\`

\`\`\`tsx
import { OOSevenCaptcha } from '@007captcha/react';

function App() {
  return (
    <OOSevenCaptcha
      siteKey="change-me"
      serverUrl={window.location.origin}
      onSuccess={(token) => { /* send to server */ }}
    />
  );
}
\`\`\`

## Server-Side Verification

After the challenge completes, the client receives a signed token. Send it to your backend and verify:

\`\`\`ts
import { verify } from '@007captcha/server';

const result = await verify(token, SECRET);

if (result.success) {
  // result.score    — 0.0 (bot) to 1.0 (human)
  // result.verdict  — 'human', 'uncertain', or 'bot'
  // result.method   — 'ball'
}
\`\`\`

Tokens are single-use and expire after 5 minutes.

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| \`siteKey\` | \`string\` | *required* | Shared secret for HMAC token signing |
| \`container\` | \`string \\| HTMLElement\` | *required* | CSS selector or DOM element to mount the widget |
| \`serverUrl\` | \`string\` | *required* | Base URL for challenge endpoints |
| \`theme\` | \`'light' \\| 'dark' \\| 'auto'\` | \`'light'\` | Color theme |
| \`timeLimit\` | \`number\` | \`14000\` | Time limit in ms |
| \`onSuccess\` | \`(token: string) => void\` | &mdash; | Called when challenge passes |
| \`onFailure\` | \`(error: Error) => void\` | &mdash; | Called when challenge fails |
| \`onExpired\` | \`() => void\` | &mdash; | Called when token expires |

### Widget Instance

\`\`\`ts
const widget = render({ ... });

widget.getToken()   // Current verification token
widget.reset()      // Reset for a new challenge
widget.destroy()    // Remove widget from DOM
\`\`\`

## Packages

| Package | Description |
|---------|-------------|
| [\`@007captcha/client\`](packages/client) | Browser widget &mdash; renders the ball, captures cursor input and frame acks, communicates with server |
| [\`@007captcha/server\`](packages/server) | Node.js backend &mdash; session management, analysis, token signing & verification |
| [\`@007captcha/react\`](packages/react) | React component wrapper |

## Security Model

- **Server-side analysis** &mdash; All scoring, detection, and token signing happen on the server. The client is a thin rendering layer that captures cursor input and sends it back along with per-frame commitments.
- **Frame-level temporal binding** &mdash; For every streamed ball frame, the client sends a \`frameAck\` with its cursor position at the moment the frame was received. The server checks that these commitments align with the real ball positions it sent, that the latency distribution looks like network jitter (not a constant replay offset), and that the committed positions match the main cursor trace. A pre-computed cursor path cannot satisfy all three constraints.
- **No client secrets** &mdash; The browser never holds detection logic, scoring thresholds, or signing keys.
- **Multi-signal behavioral analysis** &mdash; Each challenge evaluates 12+ independent signals: spectral timing analysis, velocity-curvature power law, jerk profiling, sub-movement segmentation, drift/bias detection, and more.
- **Hard bot flags** &mdash; Spectral peak ratios above 8.0, non-monotonic/duplicate timestamps, \`navigator.webdriver === true\`, headless browser signatures, impossible power law fits, missing frame acknowledgments, unnaturally precise tracking, and zero reaction time on ball-direction changes trigger immediate bot verdicts that bypass scoring.
- **Environment fingerprinting** &mdash; Client-collected browser signals (webdriver, plugins, screen dimensions, touch support) combined with server-side HTTP header analysis (User-Agent, Accept-Language).
- **Real-time streaming** &mdash; Ball positions are computed tick-by-tick on the server and streamed as rendered images. Future positions don't exist until each frame is generated.
- **HMAC-SHA256 tokens** &mdash; Single-use, signed server-side, 5-minute expiry.
- **Canvas rendering** &mdash; No \`<video>\`, no extractable DOM assets, no readable coordinates in the markup.

## Examples

| Example | Description |
|---------|-------------|
| [\`examples/express-server/\`](examples/express-server/) | Express.js with the ball challenge, SSE streaming, and full verification |
| [\`examples/react-app/\`](examples/react-app/) | Vite + React with server-side verification |
| [\`examples/vanilla-html/\`](examples/vanilla-html/) | Minimal HTML page with script tag |

### Run the Express Demo

\`\`\`bash
pnpm install
pnpm demo
# → http://localhost:3007
\`\`\`

### Run the React Demo

\`\`\`bash
pnpm build
cd examples/react-app
pnpm install
pnpm dev
# → Vite on http://localhost:5173, API on http://localhost:3007
\`\`\`

## Development

\`\`\`bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm test             # Run tests
pnpm test:watch       # Watch mode
pnpm demo             # Build + start demo server
\`\`\`

## Star History

<a href="https://star-history.com/#mutkuoz/007captcha&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=mutkuoz/007captcha&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=mutkuoz/007captcha&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=mutkuoz/007captcha&type=Date" />
 </picture>
</a>

## License

[MIT](LICENSE)
```

Note on the escaped backticks: when actually writing the file, use literal backticks (`` ` ``) not `\``. The escapes above are just for including code blocks inside a code block in this plan document.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
Rewrite README for ball-only 0.2.0

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task W1B: Bump package versions to 0.2.0

**Files:**
- Modify: `packages/server/package.json`
- Modify: `packages/client/package.json`
- Modify: `packages/react/package.json`

- [ ] **Step 1: Bump `packages/server/package.json`**

Change `"version": "0.1.0"` to `"version": "0.2.0"`.

- [ ] **Step 2: Bump `packages/client/package.json`**

Change `"version": "0.1.0"` to `"version": "0.2.0"`.

- [ ] **Step 3: Bump `packages/react/package.json`**

Change `"version": "0.1.0"` to `"version": "0.2.0"`. Also update the peer dependency: `"@007captcha/client": ">=0.1.0"` → `"@007captcha/client": ">=0.2.0"`.

- [ ] **Step 4: Commit**

```bash
git add packages/server/package.json packages/client/package.json packages/react/package.json
git commit -m "$(cat <<'EOF'
Bump all packages to 0.2.0 for ball-only breaking change

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task W1C-1: Add `FrameAck` type & extend physics/session to record dispatch times

**Files:**
- Modify: `packages/server/src/types.ts`
- Modify: `packages/server/src/ball/physics.ts`
- Modify: `packages/server/src/ball/session.ts`

This task adds the server-side infrastructure the validator needs but does not yet accept frameAcks in the `verify()` method or enforce anything — that happens in W1C-2 and W1D-1.

- [ ] **Step 1: Add `FrameAck` type to `packages/server/src/types.ts`**

Add this near the other ball types:

```ts
/** Client's commitment that at serverFrameIndex i, at local time t, its cursor was at (x,y). */
export interface FrameAck {
  i: number; // frame index
  t: number; // client receive time (performance.now-based)
  x: number;
  y: number;
}
```

- [ ] **Step 2: Record dispatch times in `packages/server/src/ball/physics.ts`**

Add a new readonly array alongside `frames` to record wall-clock time when each frame is dispatched. Near line 62:

```ts
  readonly frames: BallFrame[] = [];
  readonly frameDispatchTimes: number[] = []; // Date.now() at onFrame call, parallel to frames
  readonly changeEvents: TrajectoryChangeEvent[] = [];
```

In `tick()` at line 187-189, change:

```ts
    const frame: BallFrame = { x: this.x, y: this.y, t: this.t };
    this.frames.push(frame);
    this.onFrame?.(frame);
```

to:

```ts
    const frame: BallFrame = { x: this.x, y: this.y, t: this.t };
    this.frames.push(frame);
    this.frameDispatchTimes.push(Date.now());
    this.onFrame?.(frame);
```

Also expose the number of direction changes that actually occurred:

```ts
  /** Number of direction-change events recorded during the run. */
  get directionChangeCount(): number {
    return this.changeEvents.length;
  }
```

(Add anywhere in the class body.)

- [ ] **Step 3: No change to `session.ts` in this task — the dispatch times are captured by physics automatically.** The session will read `session.physics.frameDispatchTimes` in the next task.

- [ ] **Step 4: Write failing test for FrameAck type**

Create `packages/server/src/ball/__tests__/frameack.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { FrameAck } from '../../types';

describe('FrameAck type', () => {
  it('should accept well-formed ack objects', () => {
    const ack: FrameAck = { i: 0, t: 100, x: 240, y: 200 };
    expect(ack.i).toBe(0);
    expect(ack.t).toBe(100);
    expect(ack.x).toBe(240);
    expect(ack.y).toBe(200);
  });
});
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @007captcha/server test frameack`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/types.ts packages/server/src/ball/physics.ts packages/server/src/ball/__tests__/frameack.test.ts
git commit -m "$(cat <<'EOF'
Add FrameAck type and record per-frame dispatch times in physics

Physics engine now stores Date.now() alongside each dispatched frame in
frameDispatchTimes, parallel to the frames array. This is the server-side
reference clock the upcoming frameAck validator will compare against.
Direction change count is exposed as a getter.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task W1C-2: Accept `frameAcks` in `BallChallengeManager.verify()` signature

**Files:**
- Modify: `packages/server/src/ball/session.ts`
- Modify: `packages/server/src/ball/__tests__/session.test.ts` (if it exists and is not gated on old signature)

This is a pure signature change. Validation logic comes in W1D-3.

- [ ] **Step 1: Update verify signature**

In `packages/server/src/ball/session.ts`, change the `verify` method signature (line 142-149) to:

```ts
  verify(
    sessionId: string,
    cursorPoints: CursorPoint[],
    cursorStartT: number,
    frameAcks: FrameAck[],
    origin: string,
    clientEnv?: ClientEnvironment,
    requestMeta?: RequestMeta,
  ): BallVerifyResult {
```

Add the `FrameAck` import at the top of the file:

```ts
import type { BallVisuals, BallShape, CursorPoint, BallVerifyResult, ClientEnvironment, RequestMeta, FrameAck } from '../types';
```

- [ ] **Step 2: Thread `frameAcks` into analyze call (placeholder)**

For now, just capture `frameAcks` as a local. The analyzer changes come in Task W1D-1. Add a temporary unused reference so the argument isn't dropped:

```ts
    // frameAcks will be validated in analyzeBallTracking
    void frameAcks;
```

(This `void frameAcks;` line gets replaced in W1D-1. It exists here only so TypeScript doesn't complain about an unused parameter if strict mode flags it.)

- [ ] **Step 3: Update any existing `session.test.ts` tests that call `verify()`**

If `packages/server/src/ball/__tests__/session.test.ts` calls `verify()` with the old 6-arg signature, update each call site to pass `[]` as the 4th argument (empty frameAcks). Example transformation:

```ts
// Before:
manager.verify(sessionId, points, 0, 'http://localhost', env, meta);
// After:
manager.verify(sessionId, points, 0, [], 'http://localhost', env, meta);
```

If there's no such file or it doesn't call `verify()`, skip this step.

- [ ] **Step 4: Run server tests**

Run: `pnpm --filter @007captcha/server test`
Expected: PASS (behavior unchanged because the parameter is unused; validation comes later).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/ball/session.ts packages/server/src/ball/__tests__
git commit -m "$(cat <<'EOF'
Add frameAcks parameter to BallChallengeManager.verify()

Signature-only change. Validation logic lands in a subsequent task. The
parameter is threaded in now so the client and server can both compile
against the new protocol shape.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task W1D-1: Analyzer — per-frame tracking tightness metric (Fix 1)

**Files:**
- Modify: `packages/server/src/types.ts`
- Modify: `packages/server/src/ball/analyze.ts`
- Modify: `packages/server/src/ball/__tests__/scoring.test.ts` (new fixture needs the new field)

- [ ] **Step 1: Extend `BallAnalysisMetrics` in types**

In `packages/server/src/types.ts`, update the `BallAnalysisMetrics` interface:

```ts
export interface BallAnalysisMetrics {
  averageDistance: number;
  distanceStdDev: number;
  estimatedLag: number;
  lagConsistency: number;
  overshootCount: number;
  trackingCoverage: number;
  /** Fraction of cursor samples whose nearest-in-time ball frame is within R_TIGHT (80px). */
  frameWithinTight: number;
}
```

- [ ] **Step 2: Write failing test for `analyzeBallTracking` with frameWithinTight**

Add to `packages/server/src/ball/__tests__/analyze.test.ts` (create the file if it doesn't exist):

```ts
import { describe, it, expect } from 'vitest';
import { analyzeBallTracking } from '../analyze';
import type { CursorPoint, BallFrame, TrajectoryChangeEvent } from '../../types';

function makeFrames(count: number): BallFrame[] {
  return Array.from({ length: count }, (_, i) => ({
    x: 100 + i * 2,
    y: 100,
    t: i * 16.667,
  }));
}

function makeCloseCursor(frames: BallFrame[], startT: number, offset: number): CursorPoint[] {
  return frames.map(f => ({ x: f.x + offset, y: f.y, t: startT + f.t }));
}

describe('analyzeBallTracking — frameWithinTight', () => {
  it('reports frameWithinTight near 1.0 for cursor that closely follows the ball', () => {
    const frames = makeFrames(120);
    const cursor = makeCloseCursor(frames, 1000, 30); // 30px offset, well within 80
    const metrics = analyzeBallTracking(cursor, frames, [] as TrajectoryChangeEvent[], 1000);
    expect(metrics.frameWithinTight).toBeGreaterThan(0.9);
  });

  it('reports frameWithinTight near 0 for cursor that is far from the ball', () => {
    const frames = makeFrames(120);
    const cursor = makeCloseCursor(frames, 1000, 200); // 200px offset, way beyond 80
    const metrics = analyzeBallTracking(cursor, frames, [] as TrajectoryChangeEvent[], 1000);
    expect(metrics.frameWithinTight).toBeLessThan(0.1);
  });
});
```

- [ ] **Step 3: Run test to confirm it fails**

Run: `pnpm --filter @007captcha/server test analyze`
Expected: FAIL with something like `frameWithinTight is undefined` or type error.

- [ ] **Step 4: Implement frameWithinTight in `analyze.ts`**

In `packages/server/src/ball/analyze.ts`, add a constant near the top:

```ts
const R_TIGHT = 80;
```

In `analyzeBallTracking()`, modify the distance computation loop (lines 119-130). Add a counter:

```ts
  // --- Average distance & coverage ---
  const distances: number[] = [];
  let withinRange = 0;
  let withinTight = 0;
  const TRACKING_RANGE = 150;

  for (const p of cursorPoints) {
    const offset = p.t - cursorStartT;
    if (offset < 0) continue;
    const frame = findFrameAtTime(frames, offset);
    const d = dist(p.x, p.y, frame.x, frame.y);
    distances.push(d);
    if (d < TRACKING_RANGE) withinRange++;
    if (d < R_TIGHT) withinTight++;
  }

  const averageDistance = mean(distances);
  const distanceSD = stdDev(distances);
  const trackingCoverage = distances.length > 0 ? withinRange / distances.length : 0;
  const frameWithinTight = distances.length > 0 ? withinTight / distances.length : 0;
```

At the return statement (lines 211-218), add the new field:

```ts
  return {
    averageDistance,
    distanceStdDev: distanceSD,
    estimatedLag: overallLag,
    lagConsistency,
    overshootCount,
    trackingCoverage,
    frameWithinTight,
  };
```

Also update the early-return at lines 107-116 to include the new field:

```ts
  if (cursorPoints.length < 10 || frames.length < 10) {
    return {
      averageDistance: Infinity,
      distanceStdDev: 0,
      estimatedLag: 0,
      lagConsistency: 0,
      overshootCount: 0,
      trackingCoverage: 0,
      frameWithinTight: 0,
    };
  }
```

- [ ] **Step 5: Run test to confirm it passes**

Run: `pnpm --filter @007captcha/server test analyze`
Expected: PASS on both new tests.

- [ ] **Step 6: Update any other test helpers that build `BallAnalysisMetrics`**

In `packages/server/src/ball/__tests__/scoring.test.ts` lines 27-47, `makeHumanBallMetrics` and `makeBotBallMetrics` must include the new field:

```ts
function makeHumanBallMetrics(): BallAnalysisMetrics {
  return {
    averageDistance: 65,
    distanceStdDev: 20,
    estimatedLag: 200,
    lagConsistency: 40,
    overshootCount: 3,
    trackingCoverage: 0.70,
    frameWithinTight: 0.75,
  };
}

function makeBotBallMetrics(): BallAnalysisMetrics {
  return {
    averageDistance: 2,
    distanceStdDev: 1,
    estimatedLag: 10,
    lagConsistency: 2,
    overshootCount: 0,
    trackingCoverage: 0.99,
    frameWithinTight: 1.0,
  };
}
```

- [ ] **Step 7: Run full server tests**

Run: `pnpm --filter @007captcha/server test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/types.ts packages/server/src/ball/analyze.ts packages/server/src/ball/__tests__/analyze.test.ts packages/server/src/ball/__tests__/scoring.test.ts
git commit -m "$(cat <<'EOF'
Add frameWithinTight metric — fraction of samples within 80px of ball

Foundation for Fix 1 (frame-level tracking enforcement). The metric is
computed but not yet enforced by scoring — that's the next task.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task W1D-2: Scoring — Fix 1 hard flags & Fix 3 distance tightening

**Files:**
- Modify: `packages/server/src/ball/scoring.ts`
- Modify: `packages/server/src/ball/__tests__/scoring.test.ts`

- [ ] **Step 1: Write failing tests for new hard flags**

Add to `packages/server/src/ball/__tests__/scoring.test.ts`:

```ts
describe('computeBallScore — hard flags from ball tracking', () => {
  it('returns bot verdict when frameWithinTight < 0.55 (not tracking)', () => {
    const metrics: BallAnalysisMetrics = {
      ...makeHumanBallMetrics(),
      frameWithinTight: 0.30,
    };
    const result = computeBallScore(makeHumanCursorPoints(), metrics);
    expect(result.verdict).toBe('bot');
    expect(result.score).toBe(0);
  });

  it('returns bot verdict when frameWithinTight > 0.95 AND avgDistance < 12 (too tight)', () => {
    const metrics: BallAnalysisMetrics = {
      ...makeHumanBallMetrics(),
      averageDistance: 8,
      distanceStdDev: 2,
      frameWithinTight: 0.98,
    };
    const result = computeBallScore(makeHumanCursorPoints(), metrics);
    expect(result.verdict).toBe('bot');
    expect(result.score).toBe(0);
  });

  it('returns bot verdict when avgDistance < 10 with tiny stddev (inhuman precision)', () => {
    const metrics: BallAnalysisMetrics = {
      ...makeHumanBallMetrics(),
      averageDistance: 5,
      distanceStdDev: 1,
      frameWithinTight: 0.85,
    };
    const result = computeBallScore(makeHumanCursorPoints(), metrics);
    expect(result.verdict).toBe('bot');
    expect(result.score).toBe(0);
  });

  it('accepts moderately tracking cursor (frameWithinTight ~0.75)', () => {
    const result = computeBallScore(makeHumanCursorPoints(), makeHumanBallMetrics());
    expect(result.verdict).not.toBe('bot');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm --filter @007captcha/server test scoring`
Expected: the first three hard-flag tests FAIL (current code doesn't enforce them). The fourth should PASS.

- [ ] **Step 3: Add hard flags to `computeBallScore`**

In `packages/server/src/ball/scoring.ts`, update `computeBallScore` (lines 754-792). Insert new hard-flag checks after the existing ones:

```ts
export function computeBallScore(
  cursorPoints: CursorPoint[],
  ballMetrics: BallAnalysisMetrics,
  speedProfile?: SpeedProfileMetrics,
  reactionTime?: ReactionTimeMetrics,
  clientEnv?: ClientEnvironment,
  requestMeta?: RequestMeta,
): BallScoreResult {
  // Hard flags — immediate bot verdict
  if (isTimestampBotFlag(cursorPoints)) return { score: 0, verdict: 'bot' };
  if (isEnvironmentBotFlag(clientEnv, requestMeta)) return { score: 0, verdict: 'bot' };

  const powerLaw = analyzePowerLaw(cursorPoints);
  if (isPowerLawBotFlag(powerLaw)) return { score: 0, verdict: 'bot' };

  const spectral = analyzeTimingSpectrum(cursorPoints);
  if (isSpectralBotFlag(spectral)) return { score: 0, verdict: 'bot' };

  // Fix 1 — frame-level tracking enforcement
  if (ballMetrics.frameWithinTight < 0.55) {
    return { score: 0, verdict: 'bot' };
  }
  if (ballMetrics.frameWithinTight > 0.95 && ballMetrics.averageDistance < 12) {
    return { score: 0, verdict: 'bot' };
  }

  // Fix 3 — too-tight hard flag
  if (ballMetrics.averageDistance < 10 && ballMetrics.distanceStdDev < 3) {
    return { score: 0, verdict: 'bot' };
  }
  if (ballMetrics.trackingCoverage > 0.9 && ballMetrics.averageDistance < 20) {
    return { score: 0, verdict: 'bot' };
  }

  // ... rest of the function unchanged ...
  const jerk = analyzeJerk(cursorPoints);
  const subMovement = analyzeSubMovements(cursorPoints);
  const drift = analyzeDrift(cursorPoints);
  const envScore = scoreEnvironment(clientEnv, requestMeta);

  const behavioral = analyzeBehavior(cursorPoints);
  const behavScore = scoreBehavioral(behavioral, {
    powerLaw, spectral, jerk, subMovement, drift, envScore,
  });
  const ballScore = scoreBallTracking(ballMetrics, speedProfile, reactionTime);

  const score = Math.max(0, Math.min(1, 0.45 * behavScore + 0.45 * ballScore + 0.10 * envScore));

  let verdict: 'bot' | 'human' | 'uncertain';
  if (score < 0.25) verdict = 'bot';
  else if (score > 0.45) verdict = 'human';
  else verdict = 'uncertain';

  return { score, verdict };
}
```

- [ ] **Step 4: Tighten distance band in `scoreBallTracking`**

Also in `scoring.ts`, update the `scoreBallTracking` distance band (lines 699-707) and coverage band (lines 722-728):

```ts
function scoreBallTracking(m: BallAnalysisMetrics, speedProfile?: SpeedProfileMetrics, reactionTime?: ReactionTimeMetrics): number {
  // Distance (Fix 3: tightened band)
  // Hard flags for <10px and >0.9 coverage are handled upstream in computeBallScore.
  let distanceScore: number;
  if (m.averageDistance < 10) distanceScore = 0.2;
  else if (m.averageDistance < 15) distanceScore = 0.6;
  else if (m.averageDistance <= 80) distanceScore = 1.0;
  else if (m.averageDistance <= 100) distanceScore = normalize(100 - m.averageDistance, 0, 20);
  else distanceScore = 0.0;

  // Distance variation unchanged
  const distVariationScore = normalize(m.distanceStdDev, 3, 25);

  // Lag unchanged
  let lagScore: number;
  if (m.estimatedLag < 20) lagScore = 0.0;
  else if (m.estimatedLag < 60) lagScore = 0.4;
  else if (m.estimatedLag <= 600) lagScore = 1.0;
  else lagScore = 0.4;

  const lagConsistencyScore = normalize(m.lagConsistency, 5, 60);
  const overshootScore = normalize(m.overshootCount, 0, 4);

  // Coverage (Fix 3: tightened, but hard flag upstream catches the extreme cases)
  let coverageScore: number;
  if (m.trackingCoverage < 0.15) coverageScore = 0.0;
  else if (m.trackingCoverage < 0.3) coverageScore = 0.4;
  else if (m.trackingCoverage <= 0.9) coverageScore = 1.0;
  else coverageScore = 0.5;

  // Fix 1: frame-within-tight fold-in (20% of ball score)
  const tightnessScore = normalize(m.frameWithinTight, 0.55, 0.85);

  const spScore = scoreSpeedProfile(speedProfile);
  const rtScore = scoreReactionTime(reactionTime);

  return (
    distanceScore * 0.10 +
    distVariationScore * 0.10 +
    lagScore * 0.12 +
    lagConsistencyScore * 0.10 +
    overshootScore * 0.08 +
    coverageScore * 0.12 +
    tightnessScore * 0.20 +
    spScore * 0.08 +
    rtScore * 0.10
  );
}
```

Note: weights now sum to 1.00 (0.10 + 0.10 + 0.12 + 0.10 + 0.08 + 0.12 + 0.20 + 0.08 + 0.10 = 1.00). Double-check when editing.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @007captcha/server test scoring`
Expected: all tests PASS including the four new ones.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/ball/scoring.ts packages/server/src/ball/__tests__/scoring.test.ts
git commit -m "$(cat <<'EOF'
Scoring fixes 1 & 3: frame-level tracking enforcement and tight distance band

- Hard flag when frameWithinTight < 0.55 (not actually tracking)
- Hard flag when frameWithinTight > 0.95 AND avgDistance < 12 (inhuman precision)
- Hard flag when avgDistance < 10 AND distanceStdDev < 3 (too tight)
- Hard flag when trackingCoverage > 0.9 AND avgDistance < 20
- Tightened distance band: upper bound 140 → 80 with linear falloff to 100
- Folded frameWithinTight into scoreBallTracking at 20% weight

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task W1D-3: Scoring — Fix 2 (zero-RT hard flag)

**Files:**
- Modify: `packages/server/src/ball/scoring.ts`
- Modify: `packages/server/src/ball/session.ts` (pass direction change count)
- Modify: `packages/server/src/ball/__tests__/scoring.test.ts`

`scoreReactionTime` takes a `ReactionTimeMetrics` that already contains `sampleCount`. To hard-flag "direction changes occurred but no RT samples," we need to know the number of direction changes that actually happened. We pass this in as a new parameter.

- [ ] **Step 1: Write failing tests**

Add to `packages/server/src/ball/__tests__/scoring.test.ts`:

```ts
describe('computeBallScore — reaction time hard flag (Fix 2)', () => {
  it('returns bot verdict when ball had >=3 direction changes but 0 RT samples', () => {
    const rt: ReactionTimeMetrics = { meanRT: 0, rtStdDev: 0, rtSkewness: 0, rtCV: 0, sampleCount: 0 };
    const result = computeBallScore(
      makeHumanCursorPoints(),
      makeHumanBallMetrics(),
      undefined,
      rt,
      undefined,
      undefined,
      /* directionChangeCount */ 5,
    );
    expect(result.verdict).toBe('bot');
  });

  it('does not hard-flag when ball had 0 direction changes and 0 RT samples', () => {
    const rt: ReactionTimeMetrics = { meanRT: 0, rtStdDev: 0, rtSkewness: 0, rtCV: 0, sampleCount: 0 };
    const result = computeBallScore(
      makeHumanCursorPoints(),
      makeHumanBallMetrics(),
      undefined,
      rt,
      undefined,
      undefined,
      /* directionChangeCount */ 0,
    );
    expect(result.verdict).not.toBe('bot');
  });
});
```

Also add the import at the top if not already there:
```ts
import type { ReactionTimeMetrics } from '../scoring';
```

- [ ] **Step 2: Update `computeBallScore` signature**

In `packages/server/src/ball/scoring.ts`, add `directionChangeCount` as a new parameter:

```ts
export function computeBallScore(
  cursorPoints: CursorPoint[],
  ballMetrics: BallAnalysisMetrics,
  speedProfile?: SpeedProfileMetrics,
  reactionTime?: ReactionTimeMetrics,
  clientEnv?: ClientEnvironment,
  requestMeta?: RequestMeta,
  directionChangeCount = 0,
): BallScoreResult {
```

Insert the Fix 2 hard flag after the other ball-tracking hard flags, before the soft-scoring section:

```ts
  // Fix 2 — zero reaction time when direction changes occurred
  if (directionChangeCount >= 3 && reactionTime && reactionTime.sampleCount === 0) {
    return { score: 0, verdict: 'bot' };
  }
```

- [ ] **Step 3: Update `scoreReactionTime` for 1-2 sample penalty**

In `packages/server/src/ball/scoring.ts`, update `scoreReactionTime` (lines 672-697). The signature gains a directionChangeCount parameter to know if reaction was expected:

```ts
function scoreReactionTime(m?: ReactionTimeMetrics, directionChangeCount = 0): number {
  if (!m) return 0.5;

  // No direction changes happened — reaction time doesn't apply
  if (directionChangeCount === 0) return 0.5;

  // Direction changes occurred but fewer than 3 RT samples captured
  if (m.sampleCount < 3) {
    if (m.sampleCount === 0) {
      // Should have been hard-flagged upstream, but be defensive
      return 0.0;
    }
    // 1-2 samples is insufficient — heavy penalty instead of neutral 0.5
    return 0.1;
  }

  // Mean RT: 100-500ms is human, <50ms is impossible
  let meanScore: number;
  if (m.meanRT < 50) meanScore = 0.0;
  else if (m.meanRT < 100) meanScore = 0.3;
  else if (m.meanRT <= 500) meanScore = 1.0;
  else meanScore = 0.5;

  let skewScore: number;
  if (m.rtSkewness < -0.2) skewScore = 0.2;
  else if (m.rtSkewness < 0.1) skewScore = 0.5;
  else if (m.rtSkewness <= 2.0) skewScore = 1.0;
  else skewScore = 0.7;

  let cvScore: number;
  if (m.rtCV < 0.05) cvScore = 0.1;
  else if (m.rtCV < 0.15) cvScore = 0.5;
  else if (m.rtCV <= 0.6) cvScore = 1.0;
  else cvScore = 0.6;

  return meanScore * 0.4 + skewScore * 0.3 + cvScore * 0.3;
}
```

Update the single call site of `scoreReactionTime` inside `scoreBallTracking` to pass `directionChangeCount`:

```ts
function scoreBallTracking(
  m: BallAnalysisMetrics,
  speedProfile?: SpeedProfileMetrics,
  reactionTime?: ReactionTimeMetrics,
  directionChangeCount = 0,
): number {
  // ... existing body ...
  const rtScore = scoreReactionTime(reactionTime, directionChangeCount);
  // ... existing body ...
}
```

And in `computeBallScore`, pass `directionChangeCount` to `scoreBallTracking`:

```ts
  const ballScore = scoreBallTracking(ballMetrics, speedProfile, reactionTime, directionChangeCount);
```

- [ ] **Step 4: Thread directionChangeCount through session.verify()**

In `packages/server/src/ball/session.ts`, update the call to `computeBallScore` (around lines 173-175):

```ts
    const { score, verdict } = computeBallScore(
      cursorPoints, ballMetrics, speedProfile, reactionTime, clientEnv, requestMeta,
      session.physics.directionChangeCount,
    );
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @007captcha/server test scoring`
Expected: all tests PASS including the two new reaction-time tests.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/ball/scoring.ts packages/server/src/ball/session.ts packages/server/src/ball/__tests__/scoring.test.ts
git commit -m "$(cat <<'EOF'
Scoring fix 2: hard flag on zero reaction time with direction changes

- computeBallScore now takes directionChangeCount from the physics engine.
- If ball changed direction >=3 times and the cursor produced 0 RT samples,
  return bot verdict immediately.
- scoreReactionTime falls back to 0.5 only when 0 direction changes occurred;
  1-2 samples now score 0.1 (heavy penalty) instead of neutral.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task W1D-4: FrameAck validation (Fix 4)

**Files:**
- Modify: `packages/server/src/ball/analyze.ts`
- Modify: `packages/server/src/ball/scoring.ts`
- Modify: `packages/server/src/ball/session.ts`
- Modify: `packages/server/src/ball/__tests__/analyze.test.ts`

This is the largest scoring task. We add a new `analyzeFrameAcks` function that returns either `null` (pass) or a string reason (hard flag).

- [ ] **Step 1: Write failing tests**

Add to `packages/server/src/ball/__tests__/analyze.test.ts`:

```ts
import { analyzeFrameAcks } from '../analyze';
import type { FrameAck } from '../../types';

function makeServerFrames(count: number, startTime: number, frameInterval = 50): {
  frames: BallFrame[];
  dispatchTimes: number[];
} {
  const frames: BallFrame[] = [];
  const dispatchTimes: number[] = [];
  for (let i = 0; i < count; i++) {
    frames.push({ x: 100 + i * 2, y: 100, t: i * frameInterval });
    dispatchTimes.push(startTime + i * frameInterval);
  }
  return { frames, dispatchTimes };
}

function makeGoodAcks(
  frames: BallFrame[],
  dispatchTimes: number[],
  cursorClockOffset: number,
  networkLatMean = 30,
  networkLatJitter = 5,
): FrameAck[] {
  // Client clock = server clock + cursorClockOffset
  return frames.map((f, i) => {
    const lat = networkLatMean + (Math.random() - 0.5) * networkLatJitter * 2;
    return {
      i,
      t: dispatchTimes[i] + cursorClockOffset + lat,
      x: f.x + (Math.random() - 0.5) * 20, // within 90px of ball
      y: f.y + (Math.random() - 0.5) * 20,
    };
  });
}

function makePointsFromAcks(acks: FrameAck[]): CursorPoint[] {
  return acks.map(a => ({ x: a.x, y: a.y, t: a.t }));
}

describe('analyzeFrameAcks', () => {
  it('returns null (pass) for realistic human frame acks', () => {
    const { frames, dispatchTimes } = makeServerFrames(60, 1_700_000_000_000);
    const acks = makeGoodAcks(frames, dispatchTimes, 5_000_000);
    const points = makePointsFromAcks(acks);
    const result = analyzeFrameAcks(acks, frames, dispatchTimes, points);
    expect(result).toBeNull();
  });

  it('returns "missing_acks" when less than 90% of frames are acked', () => {
    const { frames, dispatchTimes } = makeServerFrames(60, 1_700_000_000_000);
    const acks = makeGoodAcks(frames, dispatchTimes, 5_000_000).slice(0, 40); // only 40/60
    const points = makePointsFromAcks(acks);
    const result = analyzeFrameAcks(acks, frames, dispatchTimes, points);
    expect(result).toBe('missing_acks');
  });

  it('returns "non_monotonic_acks" when ack indices are out of order', () => {
    const { frames, dispatchTimes } = makeServerFrames(60, 1_700_000_000_000);
    const acks = makeGoodAcks(frames, dispatchTimes, 5_000_000);
    // Swap two indices
    [acks[10].i, acks[11].i] = [acks[11].i, acks[10].i];
    const points = makePointsFromAcks(acks);
    const result = analyzeFrameAcks(acks, frames, dispatchTimes, points);
    expect(result).toBe('non_monotonic_acks');
  });

  it('returns "constant_latency" when latency has zero variance (replay signature)', () => {
    const { frames, dispatchTimes } = makeServerFrames(60, 1_700_000_000_000);
    // Zero jitter — perfect constant offset
    const acks = frames.map((f, i) => ({
      i,
      t: dispatchTimes[i] + 5_000_000 + 50, // exactly 50ms lat every time
      x: f.x + 10,
      y: f.y + 10,
    }));
    const points = makePointsFromAcks(acks);
    const result = analyzeFrameAcks(acks, frames, dispatchTimes, points);
    expect(result).toBe('constant_latency');
  });

  it('returns "ack_far_from_ball" when committed positions are nowhere near the ball', () => {
    const { frames, dispatchTimes } = makeServerFrames(60, 1_700_000_000_000);
    const acks = makeGoodAcks(frames, dispatchTimes, 5_000_000).map(a => ({
      ...a,
      x: a.x + 300, // way beyond 90px
      y: a.y + 300,
    }));
    const points = makePointsFromAcks(acks);
    const result = analyzeFrameAcks(acks, frames, dispatchTimes, points);
    expect(result).toBe('ack_far_from_ball');
  });

  it('returns "ack_points_mismatch" when acks do not match the points trace', () => {
    const { frames, dispatchTimes } = makeServerFrames(60, 1_700_000_000_000);
    const acks = makeGoodAcks(frames, dispatchTimes, 5_000_000);
    // Forge the points array to be a straight line — unrelated to acks
    const points: CursorPoint[] = acks.map(a => ({ x: 0, y: 0, t: a.t }));
    const result = analyzeFrameAcks(acks, frames, dispatchTimes, points);
    expect(result).toBe('ack_points_mismatch');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm --filter @007captcha/server test analyze`
Expected: tests FAIL with `analyzeFrameAcks is not a function` (not yet exported).

- [ ] **Step 3: Implement `analyzeFrameAcks` in `analyze.ts`**

Add at the bottom of `packages/server/src/ball/analyze.ts`:

```ts
import type { FrameAck } from '../types';

/**
 * Validates the client's per-frame cursor commitments against the server's
 * record of what it sent when. Returns null if the acks are consistent with
 * a real, live-rendering client. Returns a string reason if any hard-flag
 * condition is met.
 *
 * This is the core defense against pre-computed cursor traces: a bot that
 * generates `points` offline cannot simultaneously satisfy (a) latency
 * variance matching network jitter, (b) per-frame proximity to the real
 * ball positions, and (c) integrity between the ack commitments and the
 * main cursor trace.
 */
export function analyzeFrameAcks(
  frameAcks: FrameAck[],
  frames: BallFrame[],
  dispatchTimes: number[],
  cursorPoints: CursorPoint[],
): string | null {
  if (frames.length === 0) return 'missing_acks';

  // 1. Coverage: at least 90% of frames must be acked
  if (frameAcks.length < 0.9 * frames.length) {
    return 'missing_acks';
  }

  // 2. Monotonic indices
  for (let k = 1; k < frameAcks.length; k++) {
    if (frameAcks[k].i <= frameAcks[k - 1].i) {
      return 'non_monotonic_acks';
    }
  }

  // 3. Bounds check: all indices must refer to real frames
  for (const a of frameAcks) {
    if (a.i < 0 || a.i >= frames.length || a.i >= dispatchTimes.length) {
      return 'non_monotonic_acks';
    }
  }

  // 4. Clock alignment via median offset
  const offsets: number[] = [];
  for (const a of frameAcks) {
    offsets.push(a.t - dispatchTimes[a.i]);
  }
  offsets.sort((p, q) => p - q);
  const medianOffset = offsets[Math.floor(offsets.length / 2)];

  // 5. Latency sanity after alignment
  const latencies: number[] = [];
  for (const a of frameAcks) {
    latencies.push(a.t - dispatchTimes[a.i] - medianOffset);
  }
  const meanLat = latencies.reduce((s, v) => s + v, 0) / latencies.length;
  const latVar = latencies.reduce((s, v) => s + (v - meanLat) ** 2, 0) / latencies.length;
  const latStd = Math.sqrt(latVar);

  // Absolute latency must be plausible (post-alignment: in range around 0, but
  // we'd expect a small positive mean because dispatchTime is before client
  // receive by some network delay).
  if (meanLat > 500 || meanLat < -500) {
    return 'bad_latency';
  }

  // Zero variance (< 0.5ms stddev) is a replay signature
  if (latStd < 0.5) {
    return 'constant_latency';
  }

  // 6. Per-ack proximity to ball
  let farCount = 0;
  for (const a of frameAcks) {
    const frame = frames[a.i];
    const d = Math.sqrt((a.x - frame.x) ** 2 + (a.y - frame.y) ** 2);
    if (d > 90) farCount++;
  }
  if (farCount > 0.2 * frameAcks.length) {
    return 'ack_far_from_ball';
  }

  // 7. Integrity cross-check: committed (x,y) must match interpolated cursor
  // from points array at the same client-clock timestamp
  let mismatchCount = 0;
  for (const a of frameAcks) {
    const cursor = interpolateCursor(cursorPoints, a.t);
    if (!cursor) continue;
    const d = Math.sqrt((cursor.x - a.x) ** 2 + (cursor.y - a.y) ** 2);
    if (d > 5) mismatchCount++;
  }
  if (mismatchCount > 0.1 * frameAcks.length) {
    return 'ack_points_mismatch';
  }

  return null;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @007captcha/server test analyze`
Expected: all tests PASS including the 6 new frameAck tests.

- [ ] **Step 5: Hook up validation in `computeBallScore`**

In `packages/server/src/ball/scoring.ts`, add a new parameter to `computeBallScore`:

```ts
export function computeBallScore(
  cursorPoints: CursorPoint[],
  ballMetrics: BallAnalysisMetrics,
  speedProfile?: SpeedProfileMetrics,
  reactionTime?: ReactionTimeMetrics,
  clientEnv?: ClientEnvironment,
  requestMeta?: RequestMeta,
  directionChangeCount = 0,
  frameAckFlag: string | null = null,
): BallScoreResult {
```

Insert the check at the top of the hard-flag block:

```ts
  // Fix 4 — frame ack validation (computed upstream by analyzeFrameAcks)
  if (frameAckFlag !== null) {
    return { score: 0, verdict: 'bot' };
  }

  // Existing hard flags
  if (isTimestampBotFlag(cursorPoints)) return { score: 0, verdict: 'bot' };
  // ... etc
```

- [ ] **Step 6: Thread frameAck validation through session.verify()**

In `packages/server/src/ball/session.ts`, replace the `void frameAcks;` placeholder from Task W1C-2. Before the call to `computeBallScore`, add:

```ts
    const frameAckFlag = analyzeFrameAcks(
      frameAcks,
      frames,
      session.physics.frameDispatchTimes,
      cursorPoints,
    );
```

Import it at the top:

```ts
import { analyzeBallTracking, analyzeSpeedAtDirectionChanges, analyzeReactionTimes, analyzeFrameAcks } from './analyze';
```

Then pass `frameAckFlag` into the `computeBallScore` call:

```ts
    const { score, verdict } = computeBallScore(
      cursorPoints, ballMetrics, speedProfile, reactionTime, clientEnv, requestMeta,
      session.physics.directionChangeCount,
      frameAckFlag,
    );
```

- [ ] **Step 7: Write a test that validates the session.verify() frameAck plumbing**

Add to `packages/server/src/ball/__tests__/session.test.ts` (or create it):

```ts
import { describe, it, expect, vi } from 'vitest';
import { BallChallengeManager } from '../session';
import type { FrameAck, CursorPoint } from '../../types';

describe('BallChallengeManager.verify with frameAcks', () => {
  it('returns bot verdict when frameAcks are empty but frames were streamed', async () => {
    const mgr = new BallChallengeManager('test-secret', { durationMs: 500 });
    const { sessionId } = mgr.createSession();

    // Start streaming and let it complete
    await new Promise<void>((resolve) => {
      mgr.startStreaming(
        sessionId,
        () => {},
        () => resolve(),
      );
    });

    // Submit empty frameAcks — should fail coverage check
    const points: CursorPoint[] = Array.from({ length: 30 }, (_, i) => ({
      x: 200, y: 200, t: i * 16,
    }));
    const result = mgr.verify(sessionId, points, 0, [], 'test-origin');
    expect(result.verdict).toBe('bot');

    mgr.destroy();
  });
});
```

- [ ] **Step 8: Run full server tests**

Run: `pnpm --filter @007captcha/server test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/ball/analyze.ts packages/server/src/ball/scoring.ts packages/server/src/ball/session.ts packages/server/src/ball/__tests__/
git commit -m "$(cat <<'EOF'
Scoring fix 4: frameAck validation binds cursor to streamed ball positions

analyzeFrameAcks enforces:
- >=90% of frames must be acked (headless skip detection)
- Monotonic ack indices
- Post-alignment latency variance > 0.5ms (rejects constant-offset replay)
- >=80% of acks within 90px of real ball position
- Committed (x,y) must match interpolated points-array cursor within 5px

Any failure returns a string reason that BallChallengeManager.verify()
passes to computeBallScore for immediate bot verdict.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task W1E: Client — capture and send `frameAcks`

**Files:**
- Modify: `packages/client/src/challenges/ball.ts`

- [ ] **Step 1: Add frameAcks buffer and capture logic**

In `packages/client/src/challenges/ball.ts`, add a new field on the class near the other state (around line 29):

```ts
  private frameAcks: Array<{ i: number; t: number; x: number; y: number }> = [];
  private lastCursor: { x: number; y: number } = { x: 0, y: 0 };
```

Update `reset()` (lines 96-103) to also clear `frameAcks`:

```ts
  reset(): void {
    this.stop();
    this.points = [];
    this.frameAcks = [];
    this.sessionId = null;
    this.visuals = null;
    this.clickStarted = false;
    this.serverResult = null;
  }
```

Update `startStreaming()` to also reset `frameAcks` and initialize `lastCursor` (after line 200):

```ts
    this.tracking = true;
    this.points = [];
    this.frameAcks = [];
    this.lastCursor = { x: 240, y: 200 }; // canvas center fallback
    this.trackingStartT = performance.now();
```

Update `onPointerMove` (lines 249-258) to also update `lastCursor`:

```ts
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
```

In the SSE frame handler (lines 217-228), push a new ack every time a frame arrives:

```ts
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

      // Render the frame
      const img = new Image();
      img.onload = () => {
        if (this.challengeCtx) {
          this.challengeCtx.ctx.drawImage(img, 0, 0, 480, 400);
        }
      };
      img.src = `data:image/png;base64,${data.img}`;
    });
```

Note: `ack.i` is assigned sequentially from the client's perspective, matching the order of frames as received. This is what the server expects — per-dispatch index.

- [ ] **Step 2: Send `frameAcks` in the verify request**

In `analyze()` (lines 105-143), update the fetch body:

```ts
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
```

Also simplify the returned `AnalysisResult` — remove the `shapePerfection` field entirely (it was removed from the type in Task W1A-3). Replace lines 127-142 with:

```ts
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
```

- [ ] **Step 3: Build client**

Run: `pnpm --filter @007captcha/client build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/challenges/ball.ts
git commit -m "$(cat <<'EOF'
Client: capture and send frameAcks per streamed SSE frame

Each frame event pushes {i, t, x, y} where (x,y) is the cursor position at
the moment the client received the frame. Acks are sent alongside points
in the verify POST body. lastCursor is updated on every pointermove so an
ack can always commit to a current position even if no move happened since
the last frame.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task W1F: Build everything & run full test suite

**Files:** none

- [ ] **Step 1: Clean build of all packages**

Run: `pnpm build`
Expected: all three packages build successfully.

- [ ] **Step 2: Full test suite**

Run: `pnpm test`
Expected: all tests PASS.

- [ ] **Step 3: Smoke-test the demo server**

Run: `pnpm demo` in the background.
Open `http://localhost:3007` in a browser and manually complete the ball challenge.
Expected: the widget loads, the ball streams, following it with the mouse produces a success verdict.

If you cannot open a browser from this environment, explicitly report "browser not available, demo smoke test deferred" — do not claim success.

- [ ] **Step 4: Stop the demo server**

Kill the background process.

- [ ] **Step 5: Commit (only if anything was fixed during smoke test)**

```bash
git status
# If clean, skip. Otherwise commit any smoke-test fixes.
```

---

## Workstream 2 — Training framework

### Task W2A: Server logger module

**Files:**
- Create: `packages/server/src/logger.ts`
- Create: `packages/server/src/__tests__/logger.test.ts`
- Modify: `packages/server/src/ball/session.ts` (hook call at end of verify)

- [ ] **Step 1: Write failing tests**

Create `packages/server/src/__tests__/logger.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('logger', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ooseven-logger-'));
    delete process.env.LOG_TRACES;
    delete process.env.LABEL;
    delete process.env.LOG_DIR;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.LOG_TRACES;
    delete process.env.LABEL;
    delete process.env.LOG_DIR;
  });

  it('is a no-op when LOG_TRACES is not set', async () => {
    const { logTrace } = await import('../logger');
    logTrace({ v: 1, sessionId: 'x', ts: 0, label: 'human', points: [], clientEnv: {}, requestMeta: {}, verdictAtCapture: 'human', scoreAtCapture: 1, signals: {} } as any);
    expect(readdirSync(tmpDir)).toEqual([]);
  });

  it('throws at module import when LOG_TRACES=1 but LABEL is unset', async () => {
    process.env.LOG_TRACES = '1';
    process.env.LOG_DIR = tmpDir;
    // dynamic import so env vars apply
    await expect(import('../logger' + '?nocache=' + Math.random())).rejects.toThrow(/LABEL/);
  });

  it('writes a JSONL line when LOG_TRACES=1 and LABEL=human', async () => {
    process.env.LOG_TRACES = '1';
    process.env.LABEL = 'human';
    process.env.LOG_DIR = tmpDir;
    // Re-import to pick up env
    const mod = await import('../logger' + '?v=' + Math.random());
    const trace = {
      v: 1 as const,
      sessionId: 'abc',
      ts: 1712000000000,
      label: 'human' as const,
      points: [{ x: 1, y: 2, t: 3 }],
      ballFrames: [{ i: 0, x: 10, y: 20, t: 0 }],
      frameAcks: [{ i: 0, t: 5, x: 1, y: 2 }],
      clientEnv: {},
      requestMeta: {},
      verdictAtCapture: 'human' as const,
      scoreAtCapture: 0.9,
      signals: {},
    };
    mod.logTrace(trace);
    const files = readdirSync(tmpDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/_human\.jsonl$/);
    const content = readFileSync(join(tmpDir, files[0]), 'utf-8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.sessionId).toBe('abc');
    expect(parsed.label).toBe('human');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm --filter @007captcha/server test logger`
Expected: FAIL — `logger.ts` does not exist.

- [ ] **Step 3: Implement `packages/server/src/logger.ts`**

```ts
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export interface TraceRecord {
  v: 1;
  sessionId: string;
  ts: number;
  label: 'bot' | 'human';
  points: Array<{ x: number; y: number; t: number }>;
  ballFrames?: Array<{ i: number; x: number; y: number; t: number }>;
  frameAcks?: Array<{ i: number; t: number; x: number; y: number }>;
  clientEnv: unknown;
  requestMeta: unknown;
  verdictAtCapture: 'human' | 'bot' | 'uncertain';
  scoreAtCapture: number;
  signals: Record<string, unknown>;
}

const ENABLED = process.env.LOG_TRACES === '1';
const LABEL = process.env.LABEL;
const LOG_DIR = process.env.LOG_DIR ?? './traces';

if (ENABLED && LABEL !== 'bot' && LABEL !== 'human') {
  throw new Error(
    '007captcha logger: LOG_TRACES=1 requires LABEL=bot or LABEL=human. ' +
    'This prevents silent unlabeled data collection.',
  );
}

let dirEnsured = false;

function ensureDir(): void {
  if (dirEnsured) return;
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
  dirEnsured = true;
}

function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function logTrace(trace: TraceRecord): void {
  if (!ENABLED) return;
  ensureDir();
  const filename = `${todayString()}_${LABEL}.jsonl`;
  const filepath = join(LOG_DIR, filename);
  appendFileSync(filepath, JSON.stringify(trace) + '\n', 'utf-8');
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `pnpm --filter @007captcha/server test logger`
Expected: all logger tests PASS.

Note: the test that uses `?nocache=` query string to force re-import may need Node/Vitest cooperation; if it flakes, simplify to rely on `vi.resetModules()` between tests instead. The point of the test is "throws at import when LOG_TRACES=1 without LABEL," so find whatever mechanism vitest provides to re-execute the module.

- [ ] **Step 5: Hook `logTrace` into `ball/session.ts` verify()**

In `packages/server/src/ball/session.ts`, after the final `computeBallScore` call and before creating the token, add:

```ts
    // Optional: log the trace for offline ML training
    try {
      const { logTrace } = await import('../logger');
      logTrace({
        v: 1,
        sessionId,
        ts: Date.now(),
        label: (process.env.LABEL === 'bot' || process.env.LABEL === 'human') ? process.env.LABEL : 'human',
        points: cursorPoints.map(p => ({ x: p.x, y: p.y, t: p.t })),
        ballFrames: frames.map((f, i) => ({ i, x: f.x, y: f.y, t: f.t })),
        frameAcks,
        clientEnv: clientEnv ?? {},
        requestMeta: requestMeta ?? {},
        verdictAtCapture: verdict,
        scoreAtCapture: score,
        signals: {
          ballMetrics,
          speedProfile,
          reactionTime,
          frameAckFlag,
        },
      });
    } catch {
      // Logging must never break verification
    }
```

**Problem:** `verify()` is currently synchronous. Dynamic `import()` requires async. Two options:
  1. Make `verify()` return `Promise<BallVerifyResult>` — this is a public API break.
  2. Use a static `import { logTrace } from '../logger'` at the top and call it synchronously.

Pick **option 2**. Replace the dynamic import: add a static import at the top of `session.ts`:

```ts
import { logTrace } from '../logger';
```

Then the block inside verify() becomes synchronous:

```ts
    // Optional: log the trace for offline ML training
    try {
      logTrace({
        v: 1,
        sessionId,
        ts: Date.now(),
        label: (process.env.LABEL === 'bot' || process.env.LABEL === 'human') ? process.env.LABEL : 'human',
        points: cursorPoints.map(p => ({ x: p.x, y: p.y, t: p.t })),
        ballFrames: frames.map((f, i) => ({ i, x: f.x, y: f.y, t: f.t })),
        frameAcks,
        clientEnv: clientEnv ?? {},
        requestMeta: requestMeta ?? {},
        verdictAtCapture: verdict,
        scoreAtCapture: score,
        signals: { ballMetrics, speedProfile, reactionTime, frameAckFlag },
      });
    } catch {
      // Never break verification because of logging
    }
```

- [ ] **Step 6: Run all server tests**

Run: `pnpm --filter @007captcha/server test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/logger.ts packages/server/src/__tests__/logger.test.ts packages/server/src/ball/session.ts
git commit -m "$(cat <<'EOF'
Add opt-in server-side trace logger

LOG_TRACES=1 LABEL=bot|human LOG_DIR=./traces enables JSONL-per-day output
from BallChallengeManager.verify(). No-op when disabled. Throws at module
import if LOG_TRACES=1 without LABEL to prevent silent unlabeled data.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task W2B: Python training dir — scaffolding + dependencies

**Files:**
- Create: `training/README.md`
- Create: `training/requirements.txt`
- Create: `training/pyproject.toml`
- Create: `training/.gitignore`
- Create: `training/ooseven_training/__init__.py`
- Create: `training/scripts/__init__.py`
- Create: `training/tests/__init__.py`
- Modify: root `.gitignore`

- [ ] **Step 1: Create `training/README.md`**

```markdown
# 007captcha training

Python pipeline for training a binary classifier (human vs bot) from JSONL
traces collected by the server's opt-in logger.

## Setup

```bash
cd training
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Collecting data

Run the server with:

```bash
LOG_TRACES=1 LABEL=human LOG_DIR=./training/data pnpm demo
```

and again with `LABEL=bot` for bot runs. The logger writes one JSONL per
day per label to `./training/data/`.

## Training

```bash
python -m scripts.train --data data --out models/v1.joblib
```

## Evaluating

```bash
python -m scripts.eval --model models/v1.joblib --data data/holdout
```

## Smoke test

```bash
pytest tests/
```

This generates synthetic human/bot traces, runs the full pipeline, and
asserts model accuracy > 0.9 on the held-out split.
```

- [ ] **Step 2: Create `training/requirements.txt`**

```
numpy>=1.24
scikit-learn>=1.3
joblib>=1.3
pytest>=7.0
```

- [ ] **Step 3: Create `training/pyproject.toml`**

```toml
[tool.ruff]
line-length = 100
target-version = "py310"

[tool.ruff.lint]
select = ["E", "F", "W", "I", "B"]
ignore = []
```

- [ ] **Step 4: Create `training/.gitignore`**

```
data/
models/
__pycache__/
*.pyc
.venv/
.pytest_cache/
*.egg-info/
```

- [ ] **Step 5: Create package markers**

```bash
touch training/ooseven_training/__init__.py
touch training/scripts/__init__.py
touch training/tests/__init__.py
```

- [ ] **Step 6: Update root `.gitignore`**

Append:

```
training/data/
training/models/
training/**/__pycache__/
training/.venv/
training/.pytest_cache/
```

- [ ] **Step 7: Commit**

```bash
git add training/README.md training/requirements.txt training/pyproject.toml training/.gitignore training/ooseven_training/__init__.py training/scripts/__init__.py training/tests/__init__.py .gitignore
git commit -m "$(cat <<'EOF'
Scaffold Python training directory

Adds training/ at repo root, outside the pnpm workspace, with its own
requirements.txt (numpy, scikit-learn, joblib, pytest only), empty package
markers, and gitignore rules for data/, models/, and __pycache__/.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task W2C: Python — schema, loader, gen_fixture

**Files:**
- Create: `training/ooseven_training/schema.py`
- Create: `training/ooseven_training/loader.py`
- Create: `training/scripts/gen_fixture.py`

- [ ] **Step 1: `training/ooseven_training/schema.py`**

```python
"""TypedDict schema matching the JSONL format written by @007captcha/server."""
from typing import TypedDict, Literal, Any


class Point(TypedDict):
    x: float
    y: float
    t: float


class BallFrame(TypedDict):
    i: int
    x: float
    y: float
    t: float


class FrameAck(TypedDict):
    i: int
    t: float
    x: float
    y: float


class Trace(TypedDict, total=False):
    v: int
    sessionId: str
    ts: int
    label: Literal["bot", "human"]
    points: list[Point]
    ballFrames: list[BallFrame]
    frameAcks: list[FrameAck]
    clientEnv: dict[str, Any]
    requestMeta: dict[str, Any]
    verdictAtCapture: Literal["bot", "human", "uncertain"]
    scoreAtCapture: float
    signals: dict[str, Any]
```

- [ ] **Step 2: `training/ooseven_training/loader.py`**

```python
"""Load JSONL trace files written by @007captcha/server."""
import json
from pathlib import Path
from .schema import Trace


REQUIRED_FIELDS = {"label", "points"}


def load_traces(data_dir: str | Path) -> list[Trace]:
    """Read all *.jsonl files under data_dir and return a list of traces.

    Records missing required fields are dropped and counted.
    """
    data_dir = Path(data_dir)
    traces: list[Trace] = []
    dropped = 0
    for jsonl_path in sorted(data_dir.glob("*.jsonl")):
        with jsonl_path.open("r", encoding="utf-8") as f:
            for line_num, line in enumerate(f, start=1):
                line = line.strip()
                if not line:
                    continue
                try:
                    trace = json.loads(line)
                except json.JSONDecodeError:
                    dropped += 1
                    continue
                if not REQUIRED_FIELDS.issubset(trace.keys()):
                    dropped += 1
                    continue
                if trace["label"] not in ("bot", "human"):
                    dropped += 1
                    continue
                traces.append(trace)
    if dropped:
        print(f"[loader] dropped {dropped} malformed records")
    return traces
```

- [ ] **Step 3: `training/scripts/gen_fixture.py`**

```python
"""Generate synthetic human and bot traces for smoke-testing the pipeline.

These are deliberately simple — the smoke test just needs to verify that
the training loop runs end-to-end. Real data will come from the server's
opt-in logger.
"""
import argparse
import json
import math
import random
from pathlib import Path


def gen_human_trace(sid: str, n_points: int = 120) -> dict:
    """Smooth curvy path with timing jitter — passes basic human checks."""
    t = 0.0
    points = []
    ball_frames = []
    frame_acks = []
    for i in range(n_points):
        t += 8 + random.random() * 14  # 8-22ms jitter
        angle = i / 20
        bx = 240 + 80 * math.sin(angle)
        by = 200 + 60 * math.cos(angle)
        # Cursor lags by 30-80px with random jitter
        cx = bx + random.gauss(0, 20)
        cy = by + random.gauss(0, 20)
        points.append({"x": cx, "y": cy, "t": t})
        ball_frames.append({"i": i, "x": bx, "y": by, "t": i * 16.67})
        # Add network-like jitter to frame ack latency
        frame_acks.append({
            "i": i,
            "t": t - random.uniform(5, 40),
            "x": cx,
            "y": cy,
        })

    return {
        "v": 1,
        "sessionId": sid,
        "ts": 1712000000000,
        "label": "human",
        "points": points,
        "ballFrames": ball_frames,
        "frameAcks": frame_acks,
        "clientEnv": {
            "webdriver": False,
            "languageCount": 2,
            "screenWidth": 1920,
            "screenHeight": 1080,
            "outerWidth": 1920,
            "outerHeight": 1080,
            "pluginCount": 3,
            "touchSupport": False,
            "devicePixelRatio": 1,
            "colorDepth": 24,
        },
        "requestMeta": {
            "userAgent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit",
            "acceptLanguage": "en-US,en;q=0.9",
        },
        "verdictAtCapture": "human",
        "scoreAtCapture": 0.8,
        "signals": {},
    }


def gen_bot_trace(sid: str, n_points: int = 120) -> dict:
    """Straight line with perfectly uniform timing — should fail human checks."""
    points = []
    ball_frames = []
    frame_acks = []
    for i in range(n_points):
        t = i * 16.667
        bx = 240 + i * 2
        by = 200
        cx = bx  # perfect tracking
        cy = by
        points.append({"x": cx, "y": cy, "t": t})
        ball_frames.append({"i": i, "x": bx, "y": by, "t": t})
        # Constant latency — replay signature
        frame_acks.append({"i": i, "t": t - 50, "x": cx, "y": cy})
    return {
        "v": 1,
        "sessionId": sid,
        "ts": 1712000000000,
        "label": "bot",
        "points": points,
        "ballFrames": ball_frames,
        "frameAcks": frame_acks,
        "clientEnv": {
            "webdriver": True,
            "languageCount": 1,
            "screenWidth": 1280,
            "screenHeight": 720,
            "outerWidth": 0,
            "outerHeight": 0,
            "pluginCount": 0,
            "touchSupport": False,
            "devicePixelRatio": 1,
            "colorDepth": 24,
        },
        "requestMeta": {
            "userAgent": "HeadlessChrome/120",
            "acceptLanguage": "en-US",
        },
        "verdictAtCapture": "bot",
        "scoreAtCapture": 0.1,
        "signals": {},
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, help="Output directory")
    parser.add_argument("--n-human", type=int, default=20)
    parser.add_argument("--n-bot", type=int, default=20)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    random.seed(args.seed)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    human_path = out_dir / "2026-04-11_human.jsonl"
    bot_path = out_dir / "2026-04-11_bot.jsonl"

    with human_path.open("w", encoding="utf-8") as f:
        for i in range(args.n_human):
            f.write(json.dumps(gen_human_trace(f"human-{i}")) + "\n")

    with bot_path.open("w", encoding="utf-8") as f:
        for i in range(args.n_bot):
            f.write(json.dumps(gen_bot_trace(f"bot-{i}")) + "\n")

    print(f"[gen_fixture] wrote {args.n_human} human and {args.n_bot} bot traces to {out_dir}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Commit**

```bash
git add training/ooseven_training/schema.py training/ooseven_training/loader.py training/scripts/gen_fixture.py
git commit -m "$(cat <<'EOF'
Training: schema, loader, and synthetic fixture generator

schema.py — TypedDicts matching the server JSONL format.
loader.py — reads *.jsonl from a directory, drops malformed records.
gen_fixture.py — generates hand-coded human and bot traces for smoke tests.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task W2D: Python — feature extractor

**Files:**
- Create: `training/ooseven_training/features.py`

- [ ] **Step 1: Implement `features.py`**

```python
"""Scalar feature extractor for cursor traces.

Reimplements (in numpy) the same mathematical signals the server's scoring
code computes in TypeScript, plus a few more. Returns a fixed-size feature
vector so sklearn models can train on it.
"""
from __future__ import annotations

import math
import numpy as np
from .schema import Trace


FEATURE_NAMES: list[str] = [
    # Kinematics
    "duration_ms",
    "point_count",
    "speed_mean",
    "speed_std",
    "speed_max",
    "speed_cv",
    "accel_mean",
    "accel_std",
    "accel_max",
    "jerk_std",
    "jerk_zero_ratio",
    # Geometry
    "power_law_beta",
    "power_law_r2",
    "path_length",
    "bbox_w",
    "bbox_h",
    "bbox_diag",
    # Spectral
    "dft_peak_ratio",
    "timing_cv",
    "timing_dup_frac",
    # Submovements
    "submvmt_per_sec",
    "submvmt_cv",
    # Drift
    "skew_x",
    "skew_y",
    "bias_sym",
    # Ball tracking (from signals block if present)
    "avg_distance",
    "distance_std",
    "tracking_coverage",
    "frame_within_tight",
    "estimated_lag",
    "lag_consistency",
    # Reaction time
    "rt_count",
    "rt_mean",
    "rt_std",
    "rt_cv",
    "rt_skew",
    # FrameAck derived
    "ack_coverage",
    "ack_lat_mean",
    "ack_lat_std",
    "ack_far_ratio",
    # Environment
    "env_webdriver",
    "env_plugin_count",
    "env_language_count",
    "env_touch",
    "env_outer_zero",
    "env_headless_ua",
]


def _mean(a: np.ndarray) -> float:
    return float(a.mean()) if a.size > 0 else 0.0


def _std(a: np.ndarray) -> float:
    return float(a.std(ddof=1)) if a.size > 1 else 0.0


def _skew(a: np.ndarray) -> float:
    if a.size < 3:
        return 0.0
    m = a.mean()
    s = a.std()
    if s < 1e-10:
        return 0.0
    return float(((a - m) ** 3).mean() / (s ** 3))


def _kinematics(points: list[dict]) -> dict[str, float]:
    if len(points) < 2:
        return {
            "duration_ms": 0, "point_count": len(points),
            "speed_mean": 0, "speed_std": 0, "speed_max": 0, "speed_cv": 0,
            "accel_mean": 0, "accel_std": 0, "accel_max": 0,
            "jerk_std": 0, "jerk_zero_ratio": 1,
            "path_length": 0,
        }
    x = np.array([p["x"] for p in points])
    y = np.array([p["y"] for p in points])
    t = np.array([p["t"] for p in points])
    dx = np.diff(x)
    dy = np.diff(y)
    dt = np.diff(t)
    dt_safe = np.where(dt > 0, dt, 1)
    dist = np.sqrt(dx ** 2 + dy ** 2)
    speed = dist / dt_safe * 1000  # px/s
    speed_mean = _mean(speed)
    speed_std = _std(speed)
    if speed.size > 1:
        accel = np.diff(speed) / dt_safe[1:] * 1000
    else:
        accel = np.array([])
    if accel.size > 1:
        jerk = np.diff(accel) / dt_safe[2:] * 1000
    else:
        jerk = np.array([])
    jerk_zero_ratio = float((np.abs(jerk) < 50).mean()) if jerk.size > 0 else 1.0

    return {
        "duration_ms": float(t[-1] - t[0]),
        "point_count": float(len(points)),
        "speed_mean": speed_mean,
        "speed_std": speed_std,
        "speed_max": float(speed.max()) if speed.size else 0,
        "speed_cv": speed_std / speed_mean if speed_mean > 0 else 0,
        "accel_mean": _mean(accel),
        "accel_std": _std(accel),
        "accel_max": float(np.abs(accel).max()) if accel.size else 0,
        "jerk_std": _std(jerk),
        "jerk_zero_ratio": jerk_zero_ratio,
        "path_length": float(dist.sum()),
    }


def _power_law(points: list[dict]) -> tuple[float, float]:
    if len(points) < 20:
        return 0.0, 0.0
    log_v: list[float] = []
    log_r: list[float] = []
    for i in range(1, len(points) - 1):
        prev, curr, nxt = points[i - 1], points[i], points[i + 1]
        dt = nxt["t"] - prev["t"]
        if dt <= 0:
            continue
        dx = nxt["x"] - prev["x"]
        dy = nxt["y"] - prev["y"]
        v = math.sqrt(dx * dx + dy * dy) / dt * 1000
        ax = curr["x"] - prev["x"]
        ay = curr["y"] - prev["y"]
        bx = nxt["x"] - curr["x"]
        by = nxt["y"] - curr["y"]
        cross = abs(ax * by - ay * bx)
        da = math.sqrt(ax * ax + ay * ay)
        db = math.sqrt(bx * bx + by * by)
        dc = math.sqrt(dx * dx + dy * dy)
        if da < 0.5 or db < 0.5 or dc < 0.5:
            continue
        curvature = 2 * cross / (da * db * dc)
        if curvature < 1e-6 or v < 1:
            continue
        r = 1 / curvature
        log_v.append(math.log(v))
        log_r.append(math.log(r))
    if len(log_v) < 15:
        return 0.0, 0.0
    lv = np.array(log_v)
    lr = np.array(log_r)
    n = lv.size
    sum_x = lr.sum()
    sum_y = lv.sum()
    sum_xy = (lr * lv).sum()
    sum_x2 = (lr * lr).sum()
    denom = n * sum_x2 - sum_x * sum_x
    if abs(denom) < 1e-10:
        return 0.0, 0.0
    beta = (n * sum_xy - sum_x * sum_y) / denom
    intercept = (sum_y - beta * sum_x) / n
    predicted = intercept + beta * lr
    ss_res = ((lv - predicted) ** 2).sum()
    ss_tot = ((lv - lv.mean()) ** 2).sum()
    r2 = max(0.0, 1 - ss_res / ss_tot) if ss_tot > 0 else 0.0
    return float(beta), float(r2)


def _spectral(points: list[dict]) -> tuple[float, float, float]:
    """Returns (peak_ratio, timing_cv, duplicate_fraction)."""
    if len(points) < 20:
        return 0.0, 0.0, 0.0
    intervals = np.array([points[i]["t"] - points[i - 1]["t"] for i in range(1, len(points))])
    intervals = intervals[intervals > 0]
    if intervals.size < 15:
        return 0.0, 0.0, 0.0
    mean_iv = float(intervals.mean())
    std_iv = float(intervals.std())
    timing_cv = std_iv / mean_iv if mean_iv > 0 else 0
    # Duplicate fraction — round to 0.1ms buckets
    rounded = np.round(intervals * 10)
    _, counts = np.unique(rounded, return_counts=True)
    dup_frac = float(counts.max() / intervals.size)
    # DFT peak/mean ratio
    centered = intervals - mean_iv
    fft = np.fft.fft(centered)
    mags = np.abs(fft[1 : len(fft) // 2 + 1]) / len(fft)
    mean_mag = float(mags.mean()) if mags.size else 0
    max_mag = float(mags.max()) if mags.size else 0
    peak_ratio = max_mag / mean_mag if mean_mag > 0 else 0
    return peak_ratio, timing_cv, dup_frac


def _submovements(points: list[dict]) -> tuple[float, float]:
    if len(points) < 20:
        return 0.0, 0.0
    t = np.array([p["t"] for p in points])
    duration = float(t[-1] - t[0])
    if duration < 500:
        return 0.0, 0.0
    x = np.array([p["x"] for p in points])
    y = np.array([p["y"] for p in points])
    dx = np.diff(x)
    dy = np.diff(y)
    dt = np.diff(t)
    dt_safe = np.where(dt > 0, dt, 1)
    speeds = np.sqrt(dx ** 2 + dy ** 2) / dt_safe * 1000
    if speeds.size < 15:
        return 0.0, 0.0
    # Smooth with window 5
    win = max(1, min(5, speeds.size // 4))
    kernel = np.ones(2 * win + 1) / (2 * win + 1)
    padded = np.pad(speeds, (win, win), mode="edge")
    smoothed = np.convolve(padded, kernel, mode="valid")
    mean_speed = float(smoothed.mean())
    noise_floor = mean_speed * 0.3
    peaks: list[int] = []
    for i in range(1, len(smoothed) - 1):
        if smoothed[i] > smoothed[i - 1] and smoothed[i] > smoothed[i + 1] and smoothed[i] > noise_floor:
            peaks.append(i)
    peak_count = len(peaks)
    per_sec = peak_count / (duration / 1000)
    if len(peaks) < 2:
        return per_sec, 0.0
    speed_times = t[1:]
    intervals = np.array([speed_times[peaks[i]] - speed_times[peaks[i - 1]] for i in range(1, len(peaks))])
    mean_iv = float(intervals.mean())
    std_iv = float(intervals.std())
    cv = std_iv / mean_iv if mean_iv > 0 else 0
    return per_sec, cv


def _drift(points: list[dict]) -> tuple[float, float, float]:
    if len(points) < 20:
        return 0.0, 0.0, 0.0
    x = np.array([p["x"] for p in points])
    y = np.array([p["y"] for p in points])
    dx = np.diff(x)
    dy = np.diff(y)
    sx = _skew(dx)
    sy = _skew(dy)
    bias_sym = abs(abs(sx) - abs(sy))
    return sx, sy, bias_sym


def _bbox(points: list[dict]) -> tuple[float, float, float]:
    if not points:
        return 0.0, 0.0, 0.0
    xs = np.array([p["x"] for p in points])
    ys = np.array([p["y"] for p in points])
    w = float(xs.max() - xs.min())
    h = float(ys.max() - ys.min())
    diag = math.sqrt(w * w + h * h)
    return w, h, diag


def _ball_tracking(trace: Trace) -> dict[str, float]:
    """Extract ball-tracking metrics from the signals block, or compute from raw."""
    signals = trace.get("signals", {})
    ball = signals.get("ballMetrics") if isinstance(signals, dict) else None
    if isinstance(ball, dict):
        return {
            "avg_distance": float(ball.get("averageDistance", 0) or 0),
            "distance_std": float(ball.get("distanceStdDev", 0) or 0),
            "tracking_coverage": float(ball.get("trackingCoverage", 0) or 0),
            "frame_within_tight": float(ball.get("frameWithinTight", 0) or 0),
            "estimated_lag": float(ball.get("estimatedLag", 0) or 0),
            "lag_consistency": float(ball.get("lagConsistency", 0) or 0),
        }
    # Fall back: compute from raw points + ballFrames
    points = trace.get("points", [])
    frames = trace.get("ballFrames", [])
    if not points or not frames:
        return {
            "avg_distance": 0, "distance_std": 0,
            "tracking_coverage": 0, "frame_within_tight": 0,
            "estimated_lag": 0, "lag_consistency": 0,
        }
    # Simple compute: match each point to nearest frame by time
    frame_ts = np.array([f["t"] for f in frames])
    frame_xs = np.array([f["x"] for f in frames])
    frame_ys = np.array([f["y"] for f in frames])
    start_t = points[0]["t"]
    distances: list[float] = []
    for p in points:
        offset = p["t"] - start_t
        idx = int(np.clip(np.searchsorted(frame_ts, offset), 0, len(frames) - 1))
        dx = p["x"] - frame_xs[idx]
        dy = p["y"] - frame_ys[idx]
        distances.append(math.sqrt(dx * dx + dy * dy))
    arr = np.array(distances)
    return {
        "avg_distance": float(arr.mean()),
        "distance_std": float(arr.std()),
        "tracking_coverage": float((arr < 150).mean()),
        "frame_within_tight": float((arr < 80).mean()),
        "estimated_lag": 0.0,  # not computed in fallback
        "lag_consistency": 0.0,
    }


def _reaction_time(trace: Trace) -> dict[str, float]:
    signals = trace.get("signals", {})
    rt = signals.get("reactionTime") if isinstance(signals, dict) else None
    if not isinstance(rt, dict):
        return {"rt_count": 0, "rt_mean": 0, "rt_std": 0, "rt_cv": 0, "rt_skew": 0}
    return {
        "rt_count": float(rt.get("sampleCount", 0) or 0),
        "rt_mean": float(rt.get("meanRT", 0) or 0),
        "rt_std": float(rt.get("rtStdDev", 0) or 0),
        "rt_cv": float(rt.get("rtCV", 0) or 0),
        "rt_skew": float(rt.get("rtSkewness", 0) or 0),
    }


def _frame_acks(trace: Trace) -> dict[str, float]:
    acks = trace.get("frameAcks", []) or []
    frames = trace.get("ballFrames", []) or []
    if not acks or not frames:
        return {"ack_coverage": 0, "ack_lat_mean": 0, "ack_lat_std": 0, "ack_far_ratio": 1}
    ack_coverage = len(acks) / max(1, len(frames))
    frame_ts = {f["i"]: f["t"] for f in frames}
    frame_pos = {f["i"]: (f["x"], f["y"]) for f in frames}
    latencies: list[float] = []
    far_count = 0
    for a in acks:
        if a["i"] in frame_ts:
            latencies.append(a["t"] - frame_ts[a["i"]])
        if a["i"] in frame_pos:
            fx, fy = frame_pos[a["i"]]
            if math.sqrt((a["x"] - fx) ** 2 + (a["y"] - fy) ** 2) > 90:
                far_count += 1
    lat_arr = np.array(latencies) if latencies else np.array([0.0])
    # De-mean to get jitter-only stddev
    demean_std = float((lat_arr - lat_arr.mean()).std())
    return {
        "ack_coverage": ack_coverage,
        "ack_lat_mean": float(lat_arr.mean()),
        "ack_lat_std": demean_std,
        "ack_far_ratio": far_count / max(1, len(acks)),
    }


def _env(trace: Trace) -> dict[str, float]:
    env = trace.get("clientEnv", {}) or {}
    meta = trace.get("requestMeta", {}) or {}
    ua = (meta.get("userAgent") or "").lower() if isinstance(meta, dict) else ""
    headless_ua = 1.0 if ("headless" in ua or "phantomjs" in ua or "puppeteer" in ua or "playwright" in ua) else 0.0
    return {
        "env_webdriver": 1.0 if env.get("webdriver") else 0.0,
        "env_plugin_count": float(env.get("pluginCount", 0) or 0),
        "env_language_count": float(env.get("languageCount", 0) or 0),
        "env_touch": 1.0 if env.get("touchSupport") else 0.0,
        "env_outer_zero": 1.0 if (env.get("outerWidth") == 0 and env.get("outerHeight") == 0) else 0.0,
        "env_headless_ua": headless_ua,
    }


def extract_features(trace: Trace) -> tuple[np.ndarray, list[str]]:
    points = trace.get("points", [])
    kin = _kinematics(points)
    beta, r2 = _power_law(points)
    peak_ratio, timing_cv, dup_frac = _spectral(points)
    submvmt_per_sec, submvmt_cv = _submovements(points)
    skew_x, skew_y, bias_sym = _drift(points)
    bbox_w, bbox_h, bbox_diag = _bbox(points)
    bt = _ball_tracking(trace)
    rt = _reaction_time(trace)
    fa = _frame_acks(trace)
    env = _env(trace)

    values: dict[str, float] = {
        **kin,
        "power_law_beta": beta,
        "power_law_r2": r2,
        "bbox_w": bbox_w,
        "bbox_h": bbox_h,
        "bbox_diag": bbox_diag,
        "dft_peak_ratio": peak_ratio,
        "timing_cv": timing_cv,
        "timing_dup_frac": dup_frac,
        "submvmt_per_sec": submvmt_per_sec,
        "submvmt_cv": submvmt_cv,
        "skew_x": skew_x,
        "skew_y": skew_y,
        "bias_sym": bias_sym,
        **bt,
        **rt,
        **fa,
        **env,
    }

    vec = np.array([values.get(name, 0.0) for name in FEATURE_NAMES], dtype=np.float64)
    return vec, FEATURE_NAMES
```

- [ ] **Step 2: Commit**

```bash
git add training/ooseven_training/features.py
git commit -m "$(cat <<'EOF'
Training: scalar feature extractor

Reimplements the server's scoring signals (power law, DFT peak, jerk,
submovements, drift, ball tracking, reaction time, frameAck latency) as
numpy-only Python, producing a fixed-size feature vector for sklearn.
FEATURE_NAMES is the canonical ordering.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task W2E: Python — model, metrics, train/eval scripts

**Files:**
- Create: `training/ooseven_training/model.py`
- Create: `training/ooseven_training/metrics.py`
- Create: `training/scripts/train.py`
- Create: `training/scripts/eval.py`

- [ ] **Step 1: `training/ooseven_training/model.py`**

```python
"""Thin wrapper around sklearn's GradientBoostingClassifier.

Swapping to a different algorithm (PyTorch transformer, etc.) only requires
changing this one file — loader, features, and metrics stay identical.
"""
from __future__ import annotations

from pathlib import Path
import joblib
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier


class BotClassifier:
    def __init__(self, **kwargs):
        self.clf = GradientBoostingClassifier(
            n_estimators=kwargs.get("n_estimators", 200),
            max_depth=kwargs.get("max_depth", 3),
            learning_rate=kwargs.get("learning_rate", 0.1),
            random_state=kwargs.get("random_state", 42),
        )
        self.feature_names: list[str] = []

    def fit(self, X: np.ndarray, y: np.ndarray, feature_names: list[str]) -> None:
        self.feature_names = feature_names
        self.clf.fit(X, y)

    def predict(self, X: np.ndarray) -> np.ndarray:
        return self.clf.predict(X)

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        return self.clf.predict_proba(X)

    def feature_importances(self) -> list[tuple[str, float]]:
        imps = self.clf.feature_importances_
        return sorted(zip(self.feature_names, imps), key=lambda p: p[1], reverse=True)

    def save(self, path: str | Path) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump({"clf": self.clf, "features": self.feature_names}, path)

    @classmethod
    def load(cls, path: str | Path) -> "BotClassifier":
        data = joblib.load(path)
        obj = cls()
        obj.clf = data["clf"]
        obj.feature_names = data["features"]
        return obj
```

- [ ] **Step 2: `training/ooseven_training/metrics.py`**

```python
"""Evaluation metrics for the bot classifier."""
from __future__ import annotations

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    precision_recall_fscore_support,
    confusion_matrix,
)


def report(y_true: np.ndarray, y_pred: np.ndarray, feature_importances: list[tuple[str, float]] | None = None) -> dict:
    acc = float(accuracy_score(y_true, y_pred))
    prec, rec, f1, _ = precision_recall_fscore_support(
        y_true, y_pred, average="binary", pos_label=1, zero_division=0
    )
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1]).tolist()
    result = {
        "accuracy": acc,
        "precision": float(prec),
        "recall": float(rec),
        "f1": float(f1),
        "confusion_matrix": cm,  # rows = actual [bot, human], cols = predicted
    }
    if feature_importances:
        result["top_features"] = [(n, float(v)) for n, v in feature_importances[:20]]
    return result


def print_report(r: dict) -> None:
    print(f"  accuracy : {r['accuracy']:.4f}")
    print(f"  precision: {r['precision']:.4f}")
    print(f"  recall   : {r['recall']:.4f}")
    print(f"  f1       : {r['f1']:.4f}")
    print("  confusion matrix (rows=actual, cols=predicted; [0]=bot [1]=human):")
    for row in r["confusion_matrix"]:
        print(f"    {row}")
    if "top_features" in r:
        print("  top 20 feature importances:")
        for name, imp in r["top_features"]:
            print(f"    {name:30s} {imp:.4f}")
```

- [ ] **Step 3: `training/scripts/train.py`**

```python
"""CLI: train a bot classifier from JSONL traces."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from sklearn.model_selection import train_test_split

# Add parent directory to path so ooseven_training imports work
sys.path.insert(0, str(Path(__file__).parent.parent))

from ooseven_training.loader import load_traces  # noqa: E402
from ooseven_training.features import extract_features, FEATURE_NAMES  # noqa: E402
from ooseven_training.model import BotClassifier  # noqa: E402
from ooseven_training.metrics import report, print_report  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, help="Directory containing *.jsonl traces")
    parser.add_argument("--out", required=True, help="Output model path (.joblib)")
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    traces = load_traces(args.data)
    if not traces:
        print(f"[train] no traces found in {args.data}", file=sys.stderr)
        sys.exit(1)

    print(f"[train] loaded {len(traces)} traces")
    labels = [t["label"] for t in traces]
    n_human = labels.count("human")
    n_bot = labels.count("bot")
    print(f"[train]   {n_human} human, {n_bot} bot")

    if n_human < 5 or n_bot < 5:
        print("[train] need at least 5 of each class", file=sys.stderr)
        sys.exit(1)

    X = np.array([extract_features(t)[0] for t in traces])
    y = np.array([1 if t["label"] == "human" else 0 for t in traces])

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=args.test_size, random_state=args.seed, stratify=y
    )

    model = BotClassifier(random_state=args.seed)
    model.fit(X_train, y_train, FEATURE_NAMES)

    y_pred = model.predict(X_test)
    r = report(y_test, y_pred, model.feature_importances())
    print("[train] held-out metrics:")
    print_report(r)

    model.save(args.out)
    print(f"[train] saved model to {args.out}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: `training/scripts/eval.py`**

```python
"""CLI: evaluate a trained bot classifier on a directory of traces."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from ooseven_training.loader import load_traces  # noqa: E402
from ooseven_training.features import extract_features  # noqa: E402
from ooseven_training.model import BotClassifier  # noqa: E402
from ooseven_training.metrics import report, print_report  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, help="Path to .joblib model file")
    parser.add_argument("--data", required=True, help="Directory of *.jsonl traces")
    args = parser.parse_args()

    model = BotClassifier.load(args.model)
    traces = load_traces(args.data)
    if not traces:
        print(f"[eval] no traces found in {args.data}", file=sys.stderr)
        sys.exit(1)

    X = np.array([extract_features(t)[0] for t in traces])
    y = np.array([1 if t["label"] == "human" else 0 for t in traces])
    y_pred = model.predict(X)

    r = report(y, y_pred, model.feature_importances())
    print(f"[eval] metrics on {len(traces)} traces:")
    print_report(r)


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Commit**

```bash
git add training/ooseven_training/model.py training/ooseven_training/metrics.py training/scripts/train.py training/scripts/eval.py
git commit -m "$(cat <<'EOF'
Training: sklearn model wrapper, metrics, and train/eval CLIs

BotClassifier wraps GradientBoostingClassifier with save/load. Swapping to
a different algorithm only requires changing model.py. train.py and eval.py
are thin CLIs exposing fit-and-report and load-and-report respectively.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task W2F: Python — smoke test

**Files:**
- Create: `training/tests/test_pipeline.py`

- [ ] **Step 1: Write the test**

```python
"""End-to-end smoke test for the training pipeline.

Generates synthetic human and bot traces, trains a classifier, and asserts
accuracy > 0.9 on a held-out split. Does not say anything about real-world
quality — it just validates that loader → features → model → metrics runs
without errors.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from sklearn.model_selection import train_test_split

sys.path.insert(0, str(Path(__file__).parent.parent))

from ooseven_training.loader import load_traces  # noqa: E402
from ooseven_training.features import extract_features, FEATURE_NAMES  # noqa: E402
from ooseven_training.model import BotClassifier  # noqa: E402
from scripts.gen_fixture import gen_human_trace, gen_bot_trace  # noqa: E402

import json
import random


def test_pipeline_smoke(tmp_path):
    random.seed(0)
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    # Write synthetic fixture
    human_path = data_dir / "2026-04-11_human.jsonl"
    bot_path = data_dir / "2026-04-11_bot.jsonl"
    with human_path.open("w") as f:
        for i in range(40):
            f.write(json.dumps(gen_human_trace(f"h{i}")) + "\n")
    with bot_path.open("w") as f:
        for i in range(40):
            f.write(json.dumps(gen_bot_trace(f"b{i}")) + "\n")

    traces = load_traces(data_dir)
    assert len(traces) == 80

    X = np.array([extract_features(t)[0] for t in traces])
    y = np.array([1 if t["label"] == "human" else 0 for t in traces])
    assert X.shape == (80, len(FEATURE_NAMES))

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=0, stratify=y
    )

    model = BotClassifier(random_state=0)
    model.fit(X_train, y_train, FEATURE_NAMES)
    y_pred = model.predict(X_test)
    acc = float((y_pred == y_test).mean())
    assert acc > 0.9, f"smoke test accuracy {acc:.3f} should be > 0.9"

    # Save + load round-trip
    model_path = tmp_path / "model.joblib"
    model.save(model_path)
    loaded = BotClassifier.load(model_path)
    y_pred2 = loaded.predict(X_test)
    assert (y_pred == y_pred2).all()
```

- [ ] **Step 2: Install Python deps**

```bash
cd training
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

- [ ] **Step 3: Run the smoke test**

```bash
cd training
source .venv/bin/activate
pytest tests/ -v
```

Expected: `test_pipeline_smoke` PASSES. Accuracy should be well above 0.9 because the synthetic traces are trivially separable.

If the test fails, debug by:
- Printing the feature vectors for one human and one bot trace
- Checking that discriminative features (env_webdriver, timing_cv, env_plugin_count) actually differ
- Not adjusting thresholds until you understand why

- [ ] **Step 4: Commit**

```bash
git add training/tests/test_pipeline.py
git commit -m "$(cat <<'EOF'
Training: end-to-end smoke test

Generates 40 synthetic human traces and 40 bot traces using gen_fixture,
runs loader → features → train → eval, asserts held-out accuracy > 0.9.
Proves the pipeline plumbing is correct; says nothing about real-world
performance (that requires real data).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task W2G: Final verification

**Files:** none

- [ ] **Step 1: Run full TypeScript test suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 2: Run full Python smoke test**

```bash
cd training
source .venv/bin/activate
pytest tests/ -v
```
Expected: PASS.

- [ ] **Step 3: Build all TypeScript packages**

Run: `pnpm build`
Expected: all three packages build.

- [ ] **Step 4: Test the logger end-to-end against the live demo server**

```bash
rm -rf /tmp/ooseven-traces
LOG_TRACES=1 LABEL=human LOG_DIR=/tmp/ooseven-traces pnpm demo
```

The server should start normally (no crash because LABEL is set). Open http://localhost:3007, complete the ball challenge once as a human, then check:

```bash
ls /tmp/ooseven-traces/
# expect: 2026-04-11_human.jsonl
head -1 /tmp/ooseven-traces/2026-04-11_human.jsonl | python3 -m json.tool
# expect: valid JSON with points, ballFrames, frameAcks, signals
```

Stop the server.

If you cannot run a browser from this environment, report "browser smoke test deferred" — do not claim success.

- [ ] **Step 5: Test the logger crash-on-missing-LABEL**

```bash
LOG_TRACES=1 pnpm demo
# Expected: server crashes with "LOG_TRACES=1 requires LABEL=bot or LABEL=human"
```

- [ ] **Step 6: Final commit if any fixups**

```bash
git status
# If dirty, commit. Otherwise, done.
```

- [ ] **Step 7: Report completion**

Summarize:
- Tasks completed
- Any deferred items (e.g., manual browser testing)
- Any known caveats or edge cases you noticed during implementation

---

## Self-Review

### Spec coverage

| Spec section | Implementing task(s) |
|---|---|
| 1A Delete shape/maze | W1A-1, W1A-2, W1A-3 |
| 1B Simplify client API | W1A-3 (types), W1A-4 (widget), W1A-5 (react) |
| 1C Fix 1 frame-level enforcement | W1D-1, W1D-2 |
| 1D Fix 2 zero-RT hard flag | W1D-3 |
| 1E Fix 3 tighten distance | W1D-2 |
| 1F Fix 4 frameAcks | W1C-1, W1C-2, W1D-4, W1E |
| 1G Files touched list | covered across W1* |
| 2A Server logger | W2A |
| 2B Python pipeline | W2B (scaffold), W2C (loader/fixture), W2D (features), W2E (model/train/eval), W2F (smoke) |
| Testing strategy | tests live in each scoring/analyze task |
| Version plan | W1B |
| Risks / open questions | enumerated in spec, not in plan |
| Rollout | handled by W1F |

All spec sections have tasks. ✓

### Placeholder scan

Searched for "TBD", "TODO", "implement later". None found. ✓

### Type consistency

- `FrameAck`: defined once in `types.ts` (W1C-1), used in session, scoring, analyze, client, logger, Python schema. Same field names `{i, t, x, y}` throughout. ✓
- `BallAnalysisMetrics.frameWithinTight`: added in W1D-1, referenced in W1D-2 scoring, test fixtures updated. ✓
- `computeBallScore` signature gained parameters in W1D-3 (directionChangeCount) and W1D-4 (frameAckFlag). Both default values, calls updated in session.ts. ✓
- `verify()` in `BallChallengeManager` gains `frameAcks: FrameAck[]` parameter in W1C-2. Test update step included. ✓
- Python `FEATURE_NAMES` list is the canonical ordering referenced by features.py, train.py, and eval.py. ✓
- `TraceRecord` (TS logger) and `Trace` (Python schema) must have matching fields. Both have: v, sessionId, ts, label, points, ballFrames, frameAcks, clientEnv, requestMeta, verdictAtCapture, scoreAtCapture, signals. ✓

### Scope check

The plan covers 12 discrete tasks in Workstream 1 and 7 in Workstream 2. Each task produces a self-contained commit with a clear purpose. No task is larger than a single day of work. Tasks are ordered so each builds on the previous — no forward references to undefined types or functions. ✓

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-11-ball-only-hardening-and-training-framework.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

**Which approach?**
