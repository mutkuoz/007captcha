/** Collect browser environment signals for server-side bot detection. */
export interface ClientEnvironment {
  webdriver: boolean;
  languageCount: number;
  screenWidth: number;
  screenHeight: number;
  outerWidth: number;
  outerHeight: number;
  pluginCount: number;
  touchSupport: boolean;
  devicePixelRatio: number;
  colorDepth: number;
}

export function collectEnvironment(): ClientEnvironment {
  return {
    webdriver: !!(navigator as any).webdriver,
    languageCount: navigator.languages?.length ?? 0,
    screenWidth: screen.width,
    screenHeight: screen.height,
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
    pluginCount: navigator.plugins?.length ?? 0,
    touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    devicePixelRatio: window.devicePixelRatio ?? 1,
    colorDepth: screen.colorDepth,
  };
}
