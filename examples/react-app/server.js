import express from 'express';
import { verify, BallChallengeManager, MazeChallengeManager, ShapeChallengeManager } from '../../packages/server/dist/index.mjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const SECRET_KEY = 'demo-site-key-change-me';

const ballManager = new BallChallengeManager(SECRET_KEY);
const mazeManager = new MazeChallengeManager(SECRET_KEY);
const shapeManager = new ShapeChallengeManager(SECRET_KEY);

app.use(express.json());

// Serve the built React app (for production / preview)
app.use(express.static(join(__dirname, 'dist')));

// — Ball endpoints —
app.post('/captcha/ball/start', (req, res) => {
  const { sessionId, visuals } = ballManager.createSession();
  res.json({ sessionId, visuals });
});

app.get('/captcha/ball/:id/stream', (req, res) => {
  const sessionId = req.params.id;
  const session = ballManager.getSession(sessionId);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  let streamCompleted = false;
  const started = ballManager.startStreaming(
    sessionId,
    (frame) => res.write(`event: frame\ndata: ${JSON.stringify(frame)}\n\n`),
    () => { streamCompleted = true; res.write('event: end\ndata: {}\n\n'); res.end(); },
  );
  if (!started) { res.write('event: error\ndata: {"error":"Session already started or expired"}\n\n'); res.end(); return; }
  req.on('close', () => { if (!streamCompleted) ballManager.cancelSession(sessionId); });
});

app.post('/captcha/ball/:id/verify', (req, res) => {
  const { points, cursorStartT, origin } = req.body;
  res.json(ballManager.verify(req.params.id, points || [], cursorStartT || 0, origin || ''));
});

// — Maze endpoints —
app.post('/captcha/maze/start', (req, res) => res.json(mazeManager.createSession()));
app.post('/captcha/maze/:id/verify', (req, res) => {
  const { points, origin } = req.body;
  res.json(mazeManager.verify(req.params.id, points || [], origin || ''));
});

// — Shape endpoints —
app.post('/captcha/shape/start', (req, res) => res.json(shapeManager.createSession()));
app.post('/captcha/shape/:id/verify', (req, res) => {
  const { points, origin } = req.body;
  res.json(shapeManager.verify(req.params.id, points || [], origin || ''));
});

// — Token verification —
app.post('/verify', async (req, res) => {
  res.json(await verify(req.body.token || '', SECRET_KEY));
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3007;
app.listen(PORT, () => {
  console.log(`007captcha React example — API server running at http://localhost:${PORT}`);
});
