<p align="center">
  <img src="../../007-logo.png" alt="007captcha" width="120">
</p>

<h1 align="center">@007captcha/client</h1>

<p align="center">
  Browser widget for 007captcha. Renders challenges, captures user input, and communicates with the server for verification.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@007captcha/client"><img src="https://img.shields.io/npm/v/@007captcha/client?color=111827" alt="npm"></a>
  <a href="https://github.com/mutkuoz/007captcha/blob/main/LICENSE"><img src="https://img.shields.io/github/license/mutkuoz/007captcha?color=111827" alt="license"></a>
</p>

---

## Installation

```bash
pnpm add @007captcha/client
```

Or via script tag (UMD):

```html
<script src="https://unpkg.com/@007captcha/client/dist/umd/index.global.js"></script>
```

## Usage

### ES Module

```ts
import { render } from '@007captcha/client';

const widget = render({
  siteKey: 'your-secret-key',
  container: '#captcha',
  method: 'ball',
  serverUrl: window.location.origin,
  onSuccess: (token) => {
    fetch('/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  },
});
```

### Script Tag

```html
<div id="captcha"></div>
<script src="https://unpkg.com/@007captcha/client/dist/umd/index.global.js"></script>
<script>
  OOSevenCaptcha.render({
    siteKey: 'your-secret-key',
    container: '#captcha',
    method: 'ball',
    serverUrl: window.location.origin,
    onSuccess(token) {
      console.log('Verified:', token);
    },
  });
</script>
```

### Form Integration

The widget creates a hidden `<input name="captcha-token">` in the DOM. For standard form submissions, you can also retrieve the token programmatically:

```js
const token = widget.getToken();
```

## Challenge Methods

| Method | Description |
|--------|-------------|
| `'ball'` | Follow a moving ball with your cursor in real-time |
| `'shape'` | Draw a randomly assigned shape (circle, triangle, or square) |
| `'maze'` | Navigate a procedurally generated maze from entrance to exit |
| `'random'` | The server picks a random method each time |

All methods require a `serverUrl`. The server handles session creation, analysis, and token signing &mdash; the client is a rendering and input-capture layer.

## Configuration

### `render(config): CaptchaWidget`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `siteKey` | `string` | *required* | Secret key shared with server |
| `container` | `string \| HTMLElement` | *required* | Mount target (CSS selector or element) |
| `method` | `'ball' \| 'shape' \| 'maze' \| 'random'` | `'random'` | Challenge method |
| `serverUrl` | `string` | *required* | Base URL for the captcha server endpoints |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'light'` | Widget color theme |
| `timeLimit` | `number` | *varies* | Override time limit in ms |
| `onSuccess` | `(token: string) => void` | &mdash; | Called with signed token on pass |
| `onFailure` | `(error: Error) => void` | &mdash; | Called on challenge failure |
| `onExpired` | `() => void` | &mdash; | Called when a token expires |

### `CaptchaWidget`

```ts
widget.getToken()   // Returns the current signed token (string)
widget.reset()      // Reset and show a new challenge
widget.destroy()    // Remove the widget from the DOM entirely
```

## Theming

The widget supports `'light'`, `'dark'`, and `'auto'` themes. In `'auto'` mode, it follows the user's system preference via `prefers-color-scheme`.

```ts
render({ theme: 'dark', /* ... */ });
```

## Requirements

- A running `@007captcha/server` instance with the appropriate endpoints. See the [server package](../server) or the [Express example](../../examples/express-server/) for setup.
- The `siteKey` must match between client and server.

## License

[MIT](../../LICENSE)
