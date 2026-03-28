# @007captcha/client

Client-side widget and shape analysis engine for 007captcha.

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
  theme: 'light',
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
    onSuccess: function(token) {
      console.log(token);
    }
  });
</script>
```

### Form Integration

The widget automatically creates a hidden input named `captcha-token` inside its Shadow DOM. For standard form submissions, use `widget.getToken()` to retrieve the token.

## API

### `render(config: CaptchaConfig): CaptchaWidget`

Creates and mounts a captcha widget.

### `CaptchaWidget`

- `getToken(): string` — Returns the current verification token
- `reset(): void` — Resets the widget for a new challenge
- `destroy(): void` — Removes the widget from the DOM

## License

MIT
