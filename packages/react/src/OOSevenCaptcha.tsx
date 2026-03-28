import { useRef, useEffect } from 'react';
import type { CaptchaConfig } from '@007captcha/client';
import { CaptchaWidget } from '@007captcha/client';

export interface OOSevenCaptchaProps extends Omit<CaptchaConfig, 'container'> {
  className?: string;
}

export function OOSevenCaptcha({
  className,
  siteKey,
  theme,
  timeLimit,
  onSuccess,
  onFailure,
  onExpired,
}: OOSevenCaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<CaptchaWidget | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const widget = new CaptchaWidget({
      siteKey,
      container: containerRef.current,
      theme,
      timeLimit,
      onSuccess,
      onFailure,
      onExpired,
    });

    widgetRef.current = widget;
    return () => {
      widget.destroy();
      widgetRef.current = null;
    };
  }, [siteKey, theme, timeLimit]);

  return <div ref={containerRef} className={className} />;
}
