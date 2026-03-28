# @007captcha/client

Client-side widget and analysis engine for 007captcha. Handles rendering, user interaction, behavioral analysis, and token generation.

## Installation

```bash
pnpm add @007captcha/client
```

Or via script tag:

```html
<script src="https://unpkg.com/@007captcha/client/dist/umd/index.global.js"></script>
```

## Usage

### ES Module

```typescript
import { render } from '@007captcha/client';

const widget = render({
  siteKey: 'your-site-key',
  container: '#captcha',
  method: 'ball',                      // 'random' | 'shape' | 'maze' | 'ball'
  serverUrl: window.location.origin,   // required for ball challenges
  onSuccess: (token) => {
    // Send to server for verification
  },
});
```

### Script Tag

```html
<div id="captcha"></div>
<script src="https://unpkg.com/@007captcha/client/dist/umd/index.global.js"></script>
<script>
  OOSevenCaptcha.render({
    siteKey: 'your-site-key',
    container: '#captcha',
    method: 'ball',
    serverUrl: window.location.origin,
    onSuccess: function(token) {
      console.log(token);
    }
  });
</script>
```

### Form Integration

The widget creates a hidden input named `captcha-token` inside its Shadow DOM. For standard form submissions, use `widget.getToken()` to retrieve the token.

## Challenge Methods

| Method | Server Required | Description |
|--------|----------------|-------------|
| `'ball'` | Yes (`serverUrl`) | Follow a moving ball in real-time — strongest bot detection |
| `'shape'` | No | Draw a random shape (circle, triangle, square) |
| `'maze'` | No | Navigate a procedurally generated maze |
| `'random'` | Depends | Picks a random method (ball included only if `serverUrl` is set) |

The ball challenge streams positions from the server via SSE, so future ball positions never exist on the client. Shape and maze challenges run entirely client-side with no server dependency beyond token verification.

## API

### `render(config): CaptchaWidget`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `siteKey` | `string` | required | Site key for token signing |
| `container` | `string \| HTMLElement` | required | Mount target (CSS selector or DOM element) |
| `method` | `'random' \| 'shape' \| 'maze' \| 'ball'` | `'random'` | Challenge method |
| `serverUrl` | `string` | — | Server base URL (required for `'ball'`) |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'light'` | Widget color theme |
| `timeLimit` | `number` | varies | Max time in ms (shape: 10s, maze: 8s, ball: 14s) |
| `onSuccess` | `(token: string) => void` | — | Called when challenge passes |
| `onFailure` | `(error: Error) => void` | — | Called when challenge fails |
| `onExpired` | `() => void` | — | Called when token expires |

### `CaptchaWidget`

```typescript
widget.getToken()  // Current verification token (string)
widget.reset()     // Reset for a new challenge
widget.destroy()   // Remove widget from DOM
```

## License

MIT
