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

```bash
pnpm add @007captcha/client @007captcha/server
```

### 2. Server (Express)

```js
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
    (frame) => res.write(`event: frame\ndata: ${JSON.stringify(frame)}\n\n`),
    ()      => { done = true; res.write('event: end\ndata: {}\n\n'); res.end(); },
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
```

### 3. Client (vanilla)

```html
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
```

Or with ES modules:

```ts
import { render } from '@007captcha/client';

const widget = render({
  siteKey: 'change-me',
  container: '#captcha',
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
      serverUrl={window.location.origin}
      onSuccess={(token) => { /* send to server */ }}
    />
  );
}
```

## Server-Side Verification

After the challenge completes, the client receives a signed token. Send it to your backend and verify:

```ts
import { verify } from '@007captcha/server';

const result = await verify(token, SECRET);

if (result.success) {
  // result.score    — 0.0 (bot) to 1.0 (human)
  // result.verdict  — 'human', 'uncertain', or 'bot'
  // result.method   — 'ball'
}
```

Tokens are single-use and expire after 5 minutes.

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `siteKey` | `string` | *required* | Shared secret for HMAC token signing |
| `container` | `string \| HTMLElement` | *required* | CSS selector or DOM element to mount the widget |
| `serverUrl` | `string` | *required* | Base URL for challenge endpoints |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'light'` | Color theme |
| `timeLimit` | `number` | `14000` | Time limit in ms |
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
| [`@007captcha/client`](packages/client) | Browser widget &mdash; renders the ball, captures cursor input and frame acks, communicates with server |
| [`@007captcha/server`](packages/server) | Node.js backend &mdash; session management, analysis, token signing & verification |
| [`@007captcha/react`](packages/react) | React component wrapper |

## Security Model

- **Server-side analysis** &mdash; All scoring, detection, and token signing happen on the server. The client is a thin rendering layer that captures cursor input and sends it back along with per-frame commitments.
- **Frame-level temporal binding** &mdash; For every streamed ball frame, the client sends a `frameAck` with its cursor position at the moment the frame was received. The server checks that these commitments align with the real ball positions it sent, that the latency distribution looks like network jitter (not a constant replay offset), and that the committed positions match the main cursor trace. A pre-computed cursor path cannot satisfy all three constraints.
- **No client secrets** &mdash; The browser never holds detection logic, scoring thresholds, or signing keys.
- **Multi-signal behavioral analysis** &mdash; Each challenge evaluates 12+ independent signals: spectral timing analysis, velocity-curvature power law, jerk profiling, sub-movement segmentation, drift/bias detection, and more.
- **Hard bot flags** &mdash; Spectral peak ratios above 8.0, non-monotonic/duplicate timestamps, `navigator.webdriver === true`, headless browser signatures, impossible power law fits, missing frame acknowledgments, unnaturally precise tracking, and zero reaction time on ball-direction changes trigger immediate bot verdicts that bypass scoring.
- **Environment fingerprinting** &mdash; Client-collected browser signals (webdriver, plugins, screen dimensions, touch support) combined with server-side HTTP header analysis (User-Agent, Accept-Language).
- **Real-time streaming** &mdash; Ball positions are computed tick-by-tick on the server and streamed as rendered images. Future positions don't exist until each frame is generated.
- **HMAC-SHA256 tokens** &mdash; Single-use, signed server-side, 5-minute expiry.
- **Canvas rendering** &mdash; No `<video>`, no extractable DOM assets, no readable coordinates in the markup.

## Examples

| Example | Description |
|---------|-------------|
| [`examples/express-server/`](examples/express-server/) | Express.js with the ball challenge, SSE streaming, and full verification |
| [`examples/react-app/`](examples/react-app/) | Vite + React with server-side verification |
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
