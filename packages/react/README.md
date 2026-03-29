<p align="center">
  <img src="../../007-logo.png" alt="007captcha" width="120">
</p>

<h1 align="center">@007captcha/react</h1>

<p align="center">
  React component for 007captcha.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@007captcha/react"><img src="https://img.shields.io/npm/v/@007captcha/react?color=111827" alt="npm"></a>
  <a href="https://github.com/mutkuoz/007captcha/blob/main/LICENSE"><img src="https://img.shields.io/github/license/mutkuoz/007captcha?color=111827" alt="license"></a>
</p>

---

## Installation

```bash
pnpm add @007captcha/client @007captcha/react
```

Both packages are required &mdash; `@007captcha/client` is a peer dependency.

## Usage

```tsx
import { OOSevenCaptcha } from '@007captcha/react';

function LoginForm() {
  const handleSuccess = (token: string) => {
    fetch('/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  };

  return (
    <form>
      <OOSevenCaptcha
        siteKey="your-secret-key"
        method="ball"
        serverUrl={window.location.origin}
        onSuccess={handleSuccess}
      />
      <button type="submit">Log in</button>
    </form>
  );
}
```

### With Dark Theme

```tsx
<OOSevenCaptcha
  siteKey="your-secret-key"
  serverUrl="/api"
  theme="dark"
  onSuccess={handleSuccess}
  onFailure={(err) => console.error(err.message)}
/>
```

### Random Method

```tsx
<OOSevenCaptcha
  siteKey="your-secret-key"
  serverUrl={window.location.origin}
  method="random"
  onSuccess={handleSuccess}
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `siteKey` | `string` | *required* | Secret key shared with server |
| `serverUrl` | `string` | *required* | Base URL for captcha server endpoints |
| `method` | `'ball' \| 'shape' \| 'maze' \| 'random'` | `'random'` | Challenge method |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'light'` | Color theme |
| `timeLimit` | `number` | *varies* | Override time limit in ms |
| `className` | `string` | &mdash; | CSS class applied to the wrapper `<div>` |
| `onSuccess` | `(token: string) => void` | &mdash; | Called with signed token on pass |
| `onFailure` | `(error: Error) => void` | &mdash; | Called on challenge failure |
| `onExpired` | `() => void` | &mdash; | Called when a token expires |

The component automatically handles mounting, cleanup, and re-initialization when `siteKey`, `method`, `theme`, or `timeLimit` change.

## Requirements

- React 18+
- A running `@007captcha/server` instance. See the [server package](../server) for setup.

## License

[MIT](../../LICENSE)
