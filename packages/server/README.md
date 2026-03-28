# @007captcha/server

Server-side token verification and ball challenge session management for 007captcha.

Zero runtime dependencies — uses only Node.js built-in `crypto`.

## Installation

```bash
pnpm add @007captcha/server
```

## Token Verification

Verifies signed tokens from any challenge method (shape, maze, or ball).

```typescript
import { verify } from '@007captcha/server';

const result = await verify(token, 'your-site-key');

if (result.success) {
  console.log('Method:', result.method);       // 'shape' | 'maze' | 'ball'
  console.log('Challenge:', result.challenge);  // e.g. 'circle', 'maze', 'ball'
  console.log('Score:', result.score);          // 0.0-1.0
  console.log('Verdict:', result.verdict);      // 'human' | 'uncertain' | 'bot'
}
```

### `verify(token, secretKey): Promise<VerifyResult>`

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | `true` if signature is valid and verdict is not `'bot'` |
| `score` | `number` | 0.0 (bot) to 1.0 (human) |
| `method` | `string` | `'shape'`, `'maze'`, or `'ball'` |
| `challenge` | `string` | Specific challenge (e.g. `'circle'`, `'maze'`, `'ball'`) |
| `verdict` | `string` | `'human'`, `'uncertain'`, or `'bot'` |
| `timestamp` | `number` | When the challenge was completed (ms since epoch) |
| `error` | `string?` | Error message if verification failed |

Tokens expire after 5 minutes.

## Ball Challenge Manager

Manages server-side ball challenge sessions. Required when using the `'ball'` challenge method.

The ball trajectory is computed in real-time via a physics simulation running on the server. Each frame is streamed to the client as it's generated — **future positions never exist until each tick computes them**. After the challenge, the user's cursor path is compared against the recorded trajectory to detect bots.

```typescript
import { BallChallengeManager } from '@007captcha/server';

const manager = new BallChallengeManager('your-site-key', {
  durationMs: 8000, // simulation length in ms (default: 8000)
});
```

Create one instance per server process. Sessions are stored in memory and auto-expire after 60 seconds.

### `createSession(): { sessionId, visuals }`

Creates a new challenge session. Returns a unique session ID and the initial visual configuration (ball color, background color, ball shape) — all randomly selected from high-contrast pairs.

### `startStreaming(sessionId, onFrame, onEnd, onColorChange?): boolean`

Starts the real-time physics simulation for a session.

- `onFrame({ x, y, t })` — called at ~60fps with the ball's current position
- `onEnd()` — called when the 8-second simulation finishes
- `onColorChange(visuals)` — called when ball/background colors change mid-challenge (random intervals)

Returns `false` if the session doesn't exist or was already started.

### `verify(sessionId, cursorPoints, cursorStartT, origin): BallVerifyResult`

Compares the user's cursor path against the recorded ball trajectory. Analyzes:

- **Tracking distance** — average distance between cursor and ball (humans: 10-50px, bots: <5px)
- **Reaction lag** — cross-correlation based lag estimate (humans: 100-400ms, bots: <50ms)
- **Lag consistency** — variation across time windows (humans: variable, bots: constant)
- **Overshoot** — cursor continues old direction after ball changes (humans overshoot, bots don't)
- **Behavioral signals** — cursor speed variation, jitter, timing regularity, pauses

Returns `{ success, score, verdict, token }`. The token is HMAC-SHA256 signed and can be verified with `verify()`.

### `cancelSession(sessionId): void`

Stops the physics simulation and removes the session. Call this when the client disconnects.

### `destroy(): void`

Stops all active sessions and the background cleanup timer. Call on server shutdown.

### Express Example

```typescript
import express from 'express';
import { BallChallengeManager, verify } from '@007captcha/server';

const app = express();
const manager = new BallChallengeManager('your-site-key');

app.use(express.json());

// Create a new ball challenge session
app.post('/captcha/ball/start', (req, res) => {
  const { sessionId, visuals } = manager.createSession();
  res.json({ sessionId, visuals });
});

// SSE stream: send ball positions in real-time
app.get('/captcha/ball/:id/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const started = manager.startStreaming(
    req.params.id,
    (frame) => res.write(`event: frame\ndata: ${JSON.stringify(frame)}\n\n`),
    () => { res.write('event: end\ndata: {}\n\n'); res.end(); },
    (visuals) => res.write(`event: colorChange\ndata: ${JSON.stringify(visuals)}\n\n`),
  );

  if (!started) { res.end(); return; }
  req.on('close', () => manager.cancelSession(req.params.id));
});

// Verify cursor points against recorded trajectory
app.post('/captcha/ball/:id/verify', (req, res) => {
  const { points, cursorStartT, origin } = req.body;
  res.json(manager.verify(req.params.id, points, cursorStartT, origin));
});

// Verify any token (shape, maze, or ball)
app.post('/verify', async (req, res) => {
  const result = await verify(req.body.token, 'your-site-key');
  res.json(result);
});
```

## License

MIT
