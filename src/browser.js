// Keep Chromium with the project, also in restricted/offline environments.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= '0';
export const { chromium } = await import('playwright');
