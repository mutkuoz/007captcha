<p align="center">
  <img src="../../007-logo.png" alt="007captcha" width="120">
</p>

<h1 align="center">@007captcha/server</h1>

<p align="center">
  Server-side session management, analysis, and token verification for 007captcha.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@007captcha/server"><img src="https://img.shields.io/npm/v/@007captcha/server?color=111827" alt="npm"></a>
  <a href="https://github.com/mutkuoz/007captcha/blob/main/LICENSE"><img src="https://img.shields.io/github/license/mutkuoz/007captcha?color=111827" alt="license"></a>
</p>

---

Handles everything security-sensitive: challenge generation, behavioral analysis, scoring, and HMAC-SHA256 token signing. The client widget acts as a thin rendering layer &mdash; all verification logic runs here.

**Zero runtime dependencies.** Uses only Node.js built-in `crypto`.

## Installation

```bash
pnpm add @007captcha/server
```

## Token Verification

Verify signed tokens from any challenge method:

```ts
import { verify } from '@007captcha/server';

const result = await verify(token, SECRET);

if (result.success) {
  // Allow the request
}
```

### `verify(token, secretKey): Promise<VerifyResult>`

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | `true` if valid signature and not flagged as bot |
| `score` | `number` | 0.0 (bot) to 1.0 (human) |
| `method` | `string` | `'shape'`, `'maze'`, or `'ball'` |
| `challenge` | `string` | Specific challenge identifier |
| `verdict` | `string` | `'human'`, `'uncertain'`, or `'bot'` |
| `timestamp` | `number` | When the challenge was completed |
| `error` | `string?` | Reason if verification failed |

Tokens are single-use and expire after 5 minutes.

## Challenge Managers

Each challenge method has a session manager that handles the full lifecycle: session creation, challenge delivery, input analysis, and token signing. Create one instance per server process.

### Ball &mdash; `BallChallengeManager`

The ball challenge generates a physics-based trajectory in real-time and streams rendered frames to the client via SSE. After the challenge, the user's cursor path is analyzed against the recorded trajectory.

```ts
import { BallChallengeManager } from '@007captcha/server';
const ball = new BallChallengeManager(SECRET);
```

**Endpoints required:**

| Method | Path | Handler |
|--------|------|---------|
| `POST` | `/captcha/ball/start` | `ball.createSession()` |
| `GET` | `/captcha/ball/:id/stream` | `ball.startStreaming(id, onFrame, onEnd)` |
| `POST` | `/captcha/ball/:id/verify` | `ball.verify(id, points, cursorStartT, origin)` |

### Maze &mdash; `MazeChallengeManager`

Generates a procedural maze, renders it as a PNG, and solves it server-side. The client receives only the image and zone coordinates. Cursor path analysis runs entirely on the server.

```ts
import { MazeChallengeManager } from '@007captcha/server';
const maze = new MazeChallengeManager(SECRET);
```

**Endpoints required:**

| Method | Path | Handler |
|--------|------|---------|
| `POST` | `/captcha/maze/start` | `maze.createSession()` |
| `POST` | `/captcha/maze/:id/verify` | `maze.verify(id, points, origin)` |

### Shape &mdash; `ShapeChallengeManager`

Assigns a random shape (circle, triangle, or square) and analyzes the user's drawing server-side. The client only knows which shape to draw &mdash; scoring and detection run here.

```ts
import { ShapeChallengeManager } from '@007captcha/server';
const shape = new ShapeChallengeManager(SECRET);
```

**Endpoints required:**

| Method | Path | Handler |
|--------|------|---------|
| `POST` | `/captcha/shape/start` | `shape.createSession()` |
| `POST` | `/captcha/shape/:id/verify` | `shape.verify(id, points, origin)` |

## Express Integration

Full working example with all three methods:

```js
import express from 'express';
import {
  verify,
  BallChallengeManager,
  MazeChallengeManager,
  ShapeChallengeManager,
} from '@007captcha/server';

const app = express();
const SECRET = process.env.CAPTCHA_SECRET;

const ball  = new BallChallengeManager(SECRET);
const maze  = new MazeChallengeManager(SECRET);
const shape = new ShapeChallengeManager(SECRET);

app.use(express.json());

// Ball
app.post('/captcha/ball/start', (req, res) => {
  res.json(ball.createSession());
});

app.get('/captcha/ball/:id/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  let done = false;
  const ok = ball.startStreaming(
    req.params.id,
    (frame) => res.write(`event: frame\ndata: ${JSON.stringify(frame)}\n\n`),
    ()      => { done = true; res.write('event: end\ndata: {}\n\n'); res.end(); },
  );
  if (!ok) { res.end(); return; }
  req.on('close', () => { if (!done) ball.cancelSession(req.params.id); });
});

app.post('/captcha/ball/:id/verify', (req, res) => {
  const { points, cursorStartT, origin } = req.body;
  res.json(ball.verify(req.params.id, points || [], cursorStartT || 0, origin || ''));
});

// Maze
app.post('/captcha/maze/start', (req, res) => res.json(maze.createSession()));
app.post('/captcha/maze/:id/verify', (req, res) => {
  res.json(maze.verify(req.params.id, req.body.points || [], req.body.origin || ''));
});

// Shape
app.post('/captcha/shape/start', (req, res) => res.json(shape.createSession()));
app.post('/captcha/shape/:id/verify', (req, res) => {
  res.json(shape.verify(req.params.id, req.body.points || [], req.body.origin || ''));
});

// Token verification
app.post('/verify', async (req, res) => {
  res.json(await verify(req.body.token || '', SECRET));
});

app.listen(3007);
```

See [`examples/express-server/`](../../examples/express-server/) for the full demo with a UI.

## Session Lifecycle

- Sessions are stored in memory and auto-expire (60s for ball/shape, 120s for maze).
- Each session can only be verified once.
- Call `manager.destroy()` on server shutdown to clean up timers.
- For horizontally scaled deployments, sessions are per-process &mdash; route challenge requests to the same instance (sticky sessions or a shared store).

## License

[MIT](../../LICENSE)
