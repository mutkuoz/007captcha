import express from 'express';
import { verify } from '@007captcha/server';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const SECRET_KEY = 'demo-site-key-change-me'; // Must match the siteKey used in the client

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve the client dist for the script tag
app.use('/captcha', express.static(join(__dirname, '../../packages/client/dist/umd')));

app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>007captcha Express Example</title>
  <style>
    body { font-family: system-ui; display: flex; justify-content: center; padding: 48px; background: #f3f4f6; }
    .card { background: #fff; padding: 32px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h1 { font-size: 20px; margin-bottom: 16px; }
    button { background: #2563eb; color: #fff; border: none; border-radius: 6px; padding: 8px 20px; cursor: pointer; margin-top: 16px; }
    #result { margin-top: 16px; padding: 12px; border-radius: 8px; font-size: 13px; font-family: monospace; white-space: pre-wrap; }
    .success { background: #ecfdf5; border: 1px solid #a7f3d0; }
    .error { background: #fef2f2; border: 1px solid #fecaca; }
  </style>
</head>
<body>
  <div class="card">
    <h1>007captcha + Express</h1>
    <form id="form" method="POST" action="/verify">
      <div id="captcha"></div>
      <button type="submit">Verify</button>
    </form>
    <div id="result"></div>
  </div>
  <script src="/captcha/index.global.js"></script>
  <script>
    OOSevenCaptcha.render({
      siteKey: '${SECRET_KEY}',
      container: '#captcha',
      onSuccess(token) { console.log('Token:', token); }
    });
    document.getElementById('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = new FormData(e.target);
      const res = await fetch('/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: form.get('captcha-token') })
      });
      const data = await res.json();
      const el = document.getElementById('result');
      el.className = data.success ? 'success' : 'error';
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
