<p align="center">
  <img src="007-logo.png" alt="007captcha" width="180">
</p>

<h1 align="center">007captcha</h1>

<p align="center">
  Behavioral captcha that catches bots through real-time interaction analysis.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@007captcha/client"><img src="https://img.shields.io/npm/v/@007captcha/client?label=%40007captcha%2Fclient&color=111827" alt="npm"></a>
  <a href="https://www.npmjs.com/package/@007captcha/server"><img src="https://img.shields.io/npm/v/@007captcha/server?label=%40007captcha%2Fserver&color=111827" alt="npm"></a>
  <a href="https://github.com/mutkuoz/007captcha/blob/main/LICENSE"><img src="https://img.shields.io/github/license/mutkuoz/007captcha?color=111827" alt="license"></a>
  <a href="https://github.com/mutkuoz/007captcha/stargazers"><img src="https://img.shields.io/github/stars/mutkuoz/007captcha?style=flat&color=111827" alt="stars"></a>
</p>

---

Users complete quick interactive challenges &mdash; following a moving ball, drawing shapes, or navigating mazes. Behind the scenes, the system analyzes how they move: cursor dynamics, reaction patterns, movement consistency, and challenge-specific signals that are extremely difficult for automated agents to replicate convincingly.

All verification runs **server-side**. The client never holds scoring logic, detection parameters, or signing secrets. Tokens are HMAC-SHA256 signed, single-use, and expire automatically.

**Zero runtime dependencies** across all packages.

## Features

- **Three challenge methods** &mdash; Ball following (real-time tracking), shape drawing, and maze navigation. Use one or randomize across all three.
- **Fully server-side verification** &mdash; All scoring, detection, and token signing run on your server. The browser is a thin input-capture layer with no access to scoring logic or detection parameters.
- **Real-time ball streaming** &mdash; Ball trajectories are computed tick-by-tick and streamed as rendered images via SSE. Future positions don't exist until generated. No video, no DOM elements, no extractable assets.
- **Opaque challenges** &mdash; Mazes are delivered as PNG images. Shape types are assigned server-side. The client never sees wall data, solutions, or generation logic.
- **HMAC-SHA256 tokens** &mdash; Single-use, signed server-side, auto-expire after 5 minutes. Verified with one function call.
- **Zero runtime dependencies** &mdash; Server package uses only Node.js built-in `crypto`. No native modules, no C++ bindings, no external services.
- **Framework-agnostic** &mdash; Vanilla JS via script tag, ES modules, or the `@007captcha/react` component. Works with any backend framework.
- **Light & dark themes** &mdash; Built-in `'light'`, `'dark'`, and `'auto'` (follows system preference) themes.
- **TypeScript-first** &mdash; Full type definitions shipped with every package.

## Challenge Methods

### Ball Following &nbsp;&mdash;&nbsp; *recommended*

A ball moves unpredictably across a canvas for 8 seconds. The user follows it with their cursor. The trajectory is generated **server-side in real-time** and streamed frame-by-frame as rendered images via SSE &mdash; future positions never exist on the client. An AI agent with full JavaScript access cannot predict where the ball will go next.

Ball and background colors change randomly mid-challenge to prevent frame-matching attacks. The canvas renders directly to `<canvas>` with no video element and no extractable DOM asset.

### Shape Drawing

The server assigns a random shape (circle, triangle, or square). The user draws it on a canvas. Their cursor path is sent to the server for analysis. The shape type is chosen server-side and the scoring never touches the browser.

### Maze Navigation

A procedurally generated maze is rendered server-side and sent to the client as a PNG image. The user traces a path from entrance to exit. Their cursor path is sent back to the server, which holds the maze structure, solution, and wall positions. The client only ever sees a flat image.

## Quick Start

### 1. Install

```bash
pnpm add @007captcha/client @007captcha/server
```

### 2. Server

All three challenge methods require a server component. Here's a minimal Express setup:

```js
import express from 'express';
import {
  verify,
  BallChallengeManager,
  MazeChallengeManager,
  ShapeChallengeManager,
} from '@007captcha/server';

const app = express();
const SECRET = process.env.CAPTCHA_SECRET || 'change-me';

const ball  = new BallChallengeManager(SECRET);
const maze  = new MazeChallengeManager(SECRET);
const shape = new ShapeChallengeManager(SECRET);

app.use(express.json());

// — Ball (3 endpoints) —
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

// — Maze (2 endpoints) —
app.post('/captcha/maze/start', (req, res) => res.json(maze.createSession()));
app.post('/captcha/maze/:id/verify', (req, res) => {
  const { points, origin } = req.body;
  res.json(maze.verify(req.params.id, points || [], origin || ''));
});

// — Shape (2 endpoints) —
app.post('/captcha/shape/start', (req, res) => res.json(shape.createSession()));
app.post('/captcha/shape/:id/verify', (req, res) => {
  const { points, origin } = req.body;
  res.json(shape.verify(req.params.id, points || [], origin || ''));
});

// — Token verification (all methods) —
app.post('/verify', async (req, res) => {
  res.json(await verify(req.body.token || '', SECRET));
});

app.listen(3007);
```

### 3. Client

```html
<div id="captcha"></div>
<script src="https://unpkg.com/@007captcha/client/dist/umd/index.global.js"></script>
<script>
  OOSevenCaptcha.render({
    siteKey: 'change-me',
    container: '#captcha',
    method: 'ball',
    serverUrl: window.location.origin,
    onSuccess(token) {
      // Send token to your backend for verification
      fetch('/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
    },
  });
</script>
```

Or with ES modules:

```ts
import { render } from '@007captcha/client';

const widget = render({
  siteKey: 'change-me',
  container: '#captcha',
  method: 'ball',
  serverUrl: window.location.origin,
  onSuccess: (token) => { /* send to server */ },
});
```

### 4. React

```bash
pnpm add @007captcha/client @007captcha/react
```

```tsx
import { OOSevenCaptcha } from '@007captcha/react';

function App() {
  return (
    <OOSevenCaptcha
      siteKey="change-me"
      method="ball"
      serverUrl={window.location.origin}
      onSuccess={(token) => { /* send to server */ }}
    />
  );
}
```

## Server-Side Verification

After a challenge completes, the client receives a signed token. Send it to your backend and verify:

```ts
import { verify } from '@007captcha/server';

const result = await verify(token, SECRET);

if (result.success) {
  // result.score    — 0.0 (bot) to 1.0 (human)
  // result.verdict  — 'human', 'uncertain', or 'bot'
  // result.method   — 'shape', 'maze', or 'ball'
}
```

Tokens are single-use and expire after 5 minutes.

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `siteKey` | `string` | *required* | Shared secret for HMAC token signing |
| `container` | `string \| HTMLElement` | *required* | CSS selector or DOM element to mount the widget |
| `method` | `'ball' \| 'shape' \| 'maze' \| 'random'` | `'random'` | Challenge method |
| `serverUrl` | `string` | *required* | Base URL for challenge endpoints |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'light'` | Color theme |
| `timeLimit` | `number` | *varies* | Time limit in ms |
| `onSuccess` | `(token: string) => void` | &mdash; | Called when challenge passes |
| `onFailure` | `(error: Error) => void` | &mdash; | Called when challenge fails |
| `onExpired` | `() => void` | &mdash; | Called when token expires |

### Widget Instance

```ts
const widget = render({ ... });

widget.getToken()   // Current verification token
widget.reset()      // Reset for a new challenge
widget.destroy()    // Remove widget from DOM
```

## Packages

| Package | Description |
|---------|-------------|
| [`@007captcha/client`](packages/client) | Browser widget &mdash; renders challenges, captures input, communicates with server |
| [`@007captcha/server`](packages/server) | Node.js backend &mdash; session management, analysis, token signing & verification |
| [`@007captcha/react`](packages/react) | React component wrapper |

## Security Model

- **Server-side analysis** &mdash; All scoring, detection, and token signing happen on the server. The client is a thin rendering layer that captures cursor input and sends it back.
- **No client secrets** &mdash; The browser never holds detection logic, scoring thresholds, or signing keys.
- **Real-time streaming** &mdash; Ball positions are computed tick-by-tick on the server and streamed as rendered images. Future positions don't exist until each frame is generated.
- **Opaque challenges** &mdash; Mazes are sent as PNG images. The client has no access to wall positions, solutions, or cell data. Shape assignments come from the server with no local shape generation.
- **HMAC-SHA256 tokens** &mdash; Single-use, signed server-side, 5-minute expiry.
- **Canvas rendering** &mdash; No `<video>`, no extractable DOM assets, no readable coordinates in the markup.

## Examples

| Example | Description |
|---------|-------------|
| [`examples/express-server/`](examples/express-server/) | Express.js with all three methods, SSE streaming, and full verification |
| [`examples/react-app/`](examples/react-app/) | Vite + React with method picker and server-side verification |
| [`examples/vanilla-html/`](examples/vanilla-html/) | Minimal HTML page with script tag |

### Run the Express Demo

```bash
pnpm install
pnpm demo
# → http://localhost:3007
```

### Run the React Demo

```bash
pnpm build
cd examples/react-app
pnpm install
pnpm dev
# → Vite on http://localhost:5173, API on http://localhost:3007
```

All demos include a method picker (shape, maze, ball, random) and server-side verification out of the box.

## Development

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm test             # Run tests
pnpm test:watch       # Watch mode
pnpm demo             # Build + start demo server
```

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
