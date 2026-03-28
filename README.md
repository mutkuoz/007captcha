# 007captcha

A behavioral captcha framework that catches bots through real-time interaction analysis.

Users complete quick interactive challenges — drawing shapes, navigating mazes, or following a moving ball. The system analyzes behavioral signals (cursor jitter, reaction time, movement patterns) and challenge-specific metrics to determine if the user is human.

## Challenge Methods

### Ball Following *(recommended)*

The most advanced method. A ball moves unpredictably across the canvas for 8 seconds — the user follows it with their cursor. The trajectory is generated **server-side in real-time** and streamed frame-by-frame via SSE, so future positions never exist on the client. An AI agent with full JavaScript access cannot read ahead.

The system measures reaction lag, overshoot after direction changes, tracking distance variance, and cursor micro-jitter. Ball and background colors change randomly mid-challenge to prevent frame-matching attacks. Requires a server component (`@007captcha/server`).

### Shape Drawing

Users draw a random shape (circle, triangle, or square) on a canvas. The system analyzes drawing behavior and geometric perfection — humans draw imperfectly with natural jitter, while bots produce suspiciously perfect or suspiciously noisy shapes. Runs entirely client-side.

### Maze Solving

A procedurally generated maze is rendered on a canvas. Users trace a path from entrance to exit with their cursor. The system checks wall crossings, path optimality, backtracking behavior, and movement patterns. The maze refreshes every 8 seconds. Runs entirely client-side.

## How It Works

1. User clicks "Start" and gets a random challenge (or a specific one via config)
2. They complete the challenge within the time limit
3. The system analyzes **behavioral signals** (speed variation, jitter, timing patterns) and **challenge-specific metrics** to produce a humanity score (0.0-1.0)
4. A signed HMAC token is generated for server-side verification

For ball challenges, the entire analysis runs server-side — the client only sends cursor positions back after the challenge ends.

## Quick Start

### Script Tag

```html
<div id="captcha"></div>
<script src="https://unpkg.com/@007captcha/client/dist/umd/index.global.js"></script>
<script>
  OOSevenCaptcha.render({
    siteKey: 'your-site-key',
    container: '#captcha',
    method: 'ball',         // 'random' | 'shape' | 'maze' | 'ball'
    serverUrl: '/captcha',  // required for ball challenges
    onSuccess: function(token) {
      console.log('Token:', token);
    }
  });
</script>
```

### npm / pnpm

```bash
pnpm add @007captcha/client
```

```typescript
import { render } from '@007captcha/client';

const widget = render({
  siteKey: 'your-site-key',
  container: '#captcha',
  method: 'ball',
  serverUrl: window.location.origin,
  onSuccess: (token) => {
    fetch('/api/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  },
});
```

### React

```bash
pnpm add @007captcha/client @007captcha/react
```

```tsx
import { OOSevenCaptcha } from '@007captcha/react';

function App() {
  return (
    <OOSevenCaptcha
      siteKey="your-site-key"
      method="ball"
      serverUrl={window.location.origin}
      onSuccess={(token) => console.log(token)}
    />
  );
}
```

## Server Setup

### Token Verification (all methods)

```bash
pnpm add @007captcha/server
```

```typescript
import { verify } from '@007captcha/server';

const result = await verify(token, 'your-site-key');

if (result.success) {
  console.log('Method:', result.method);       // 'shape' | 'maze' | 'ball'
  console.log('Challenge:', result.challenge);  // 'circle', 'triangle', 'square', 'maze', 'ball'
  console.log('Score:', result.score);          // 0.0-1.0
  console.log('Verdict:', result.verdict);      // 'human' | 'uncertain' | 'bot'
} else {
  console.log('Error:', result.error);
}
```

### Ball Challenge Endpoints (required for ball method)

The ball challenge needs three server endpoints. Here's an Express example:

```typescript
import express from 'express';
import { BallChallengeManager } from '@007captcha/server';

const app = express();
const ballManager = new BallChallengeManager('your-site-key');

app.use(express.json());

// 1. Create session
app.post('/captcha/ball/start', (req, res) => {
  const { sessionId, visuals } = ballManager.createSession();
  res.json({ sessionId, visuals });
});

// 2. SSE stream — sends ball positions in real-time
app.get('/captcha/ball/:id/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const started = ballManager.startStreaming(
    req.params.id,
    (frame) => res.write(`event: frame\ndata: ${JSON.stringify(frame)}\n\n`),
    () => { res.write('event: end\ndata: {}\n\n'); res.end(); },
    (visuals) => res.write(`event: colorChange\ndata: ${JSON.stringify(visuals)}\n\n`),
  );

  if (!started) { res.end(); return; }
  req.on('close', () => ballManager.cancelSession(req.params.id));
});

// 3. Verify cursor points against recorded trajectory
app.post('/captcha/ball/:id/verify', (req, res) => {
  const { points, cursorStartT, origin } = req.body;
  res.json(ballManager.verify(req.params.id, points, cursorStartT, origin));
});
```

## Configuration

### Client Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `siteKey` | `string` | required | Your site key (shared secret for HMAC token signing) |
| `container` | `string \| HTMLElement` | required | CSS selector or DOM element to mount the widget |
| `method` | `'random' \| 'shape' \| 'maze' \| 'ball'` | `'random'` | Which challenge to use |
| `serverUrl` | `string` | — | Server URL for ball challenge endpoints (required for `'ball'`) |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'light'` | Widget color theme |
| `timeLimit` | `number` | varies | Time limit in ms (shape: 10s, maze: 8s, ball: 14s) |
| `onSuccess` | `(token: string) => void` | — | Called when challenge passes |
| `onFailure` | `(error: Error) => void` | — | Called when challenge fails |
| `onExpired` | `() => void` | — | Called when token expires |

> When `method` is `'random'`, ball challenges are only included in the pool if `serverUrl` is provided.

### Widget Methods

```typescript
const widget = render({ ... });
widget.getToken();  // Get the current token
widget.reset();     // Reset for a new challenge
widget.destroy();   // Remove the widget from DOM
```

## Detection Signals

### Behavioral Analysis

Shared across all challenge methods. Analyzes raw cursor movement patterns.

| Signal | Human | Bot |
|--------|-------|-----|
| Point count | 200-600 events | <20 events |
| Speed variation | High CV (>0.4) | Low CV (<0.1) |
| Acceleration | Natural variation | Near-zero |
| Timing intervals | Irregular (5-20ms std dev) | Perfectly regular (<1ms std dev) |
| Micro-jitter | Natural hand tremor | Absent or synthetic |
| Pauses | At corners/direction changes | None |

### Ball Tracking (ball method)

Server-side analysis of how the cursor follows the ball. This is the hardest set of signals for bots to fake because the ball trajectory doesn't exist until the server computes it in real-time.

| Signal | Human | Bot |
|--------|-------|-----|
| Tracking distance | 10-50px average | <5px (locked on) |
| Distance variance | High std dev | Near-zero |
| Reaction lag | 100-400ms | <50ms |
| Lag consistency | Variable across time windows | Constant |
| Overshoot | Frequent after direction changes | Absent |
| Tracking coverage | 60-90% of time within range | >95% |

### Shape Perfection (shape method)

| Shape | What's Measured |
|-------|----------------|
| Circle | RMS error from best-fit circle, radius variation, angular coverage, closure |
| Triangle | Angle uniformity, side length consistency, edge straightness, closure |
| Square | 90-degree angle accuracy, side uniformity, parallelism, edge straightness, closure |

### Maze Analysis (maze method)

| Signal | Human | Bot |
|--------|-------|-----|
| Wall crossings | 0-2 (minor brushes) | Many (ignoring walls) |
| Path straightness | Low (winding, exploring) | High (direct line) |
| Optimal path ratio | 1.5-4x shortest path | ~1.0x (too perfect) |
| Backtracking | Some (dead ends) | None |

### Scoring

Each method combines behavioral analysis (50-60%) with challenge-specific metrics (40-50%) into a single score.

| Score | Verdict | Result |
|-------|---------|--------|
| 0.0-0.3 | `bot` | Challenge fails |
| 0.3-0.7 | `uncertain` | Challenge passes |
| 0.7-1.0 | `human` | Challenge passes |

## Packages

| Package | Description |
|---------|-------------|
| `@007captcha/client` | Client widget, rendering, and analysis for shape/maze challenges |
| `@007captcha/server` | Token verification + ball challenge session manager |
| `@007captcha/react` | React component wrapper |

All packages have **zero runtime dependencies**.

## Examples

- [`examples/vanilla-html/`](examples/vanilla-html/) — HTML page with script tag (shape/maze)
- [`examples/express-server/`](examples/express-server/) — Express.js with all three methods, SSE streaming, and server-side verification

## Security

**Ball challenge (strongest):** The trajectory is computed server-side tick-by-tick. Future ball positions don't exist until each frame is generated. The client receives positions via SSE and renders to `<canvas>` — no video, no DOM element, no extractable asset. Colors change randomly mid-challenge. An AI agent with full JS access cannot predict where the ball will go next.

**Token signing:** All tokens use HMAC-SHA256. For shape/maze, the client signs the token. For ball, the server signs it — the client never holds the secret.

**Token expiry:** Tokens are single-use and expire after 5 minutes.

**Behavioral analysis:** Cursor speed variation, micro-jitter, timing irregularity, and pause patterns are hard to replicate even for sophisticated bots that study the detection algorithms.

## Try It

```bash
pnpm install
pnpm demo
```

Opens a demo server at `http://localhost:3007` with a method picker (shape, maze, ball) and server-side verification. All three methods work out of the box — the ball challenge SSE endpoints are included.

## Development

```bash
pnpm install          # install dependencies
pnpm test             # run all tests
pnpm -r run build     # build all packages
pnpm demo             # build + start demo server
```

## License

MIT
