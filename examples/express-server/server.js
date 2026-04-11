import express from 'express';
import { verify, BallChallengeManager } from '../../packages/server/dist/index.mjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const SECRET_KEY = 'demo-site-key-change-me'; // Must match the siteKey used in the client

// Server-side session manager
const ballManager = new BallChallengeManager(SECRET_KEY);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve the client dist for the script tag
app.use('/captcha', express.static(join(__dirname, '../../packages/client/dist/umd')));

// ─── Ball challenge SSE endpoints ───

/** Create a new ball challenge session */
app.post('/captcha/ball/start', (req, res) => {
  const { sessionId, visuals } = ballManager.createSession();
  res.json({ sessionId, visuals });
});

/** SSE stream: server sends ball frames in real-time */
app.get('/captcha/ball/:id/stream', (req, res) => {
  const sessionId = req.params.id;
  const session = ballManager.getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  // SSE headers
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

  // Only cancel if client disconnected early — not on normal completion
  req.on('close', () => {
    if (!streamCompleted) {
      ballManager.cancelSession(sessionId);
    }
  });
});

/** Verify cursor points against the recorded ball trajectory */
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

// ─── Main page ───

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
    h1 {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 4px;
      color: #111827;
    }
    .subtitle {
      font-size: 13px;
      color: #6b7280;
      margin-bottom: 24px;
    }
    #captcha {
      margin-bottom: 16px;
    }
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
    <p class="subtitle">Follow the ball with your cursor, then click Verify to test server-side validation.</p>
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
        console.log('Token received:', token.slice(0, 40) + '...');
      },
      onFailure(err) {
        captchaToken = null;
        document.getElementById('submit-btn').disabled = true;
        console.log('Challenge failed:', err.message);
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
