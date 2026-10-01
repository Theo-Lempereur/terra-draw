/**
 * Single source of truth for the six tones. `styles.css` declares the matching
 * `.tone-*` classes; `line` is used by the SVG connectors, which cannot read CSS
 * custom properties from a detached <svg>. A test keeps both lists in sync.
 */
export const PALETTE = {
  amber: { accent: '#96621e', tint: '#f4e8d6', border: '#e8dcc9', wash: '#f7f3eb', line: '#b27d35' },
  green: { accent: '#227568', tint: '#deeee7', border: '#d2e2db', wash: '#eff5f0', line: '#288575' },
  purple: { accent: '#74619b', tint: '#ede8f5', border: '#dcd3e9', wash: '#f4f0f8', line: '#7562ac' },
  blue: { accent: '#2f6490', tint: '#dde9f3', border: '#cfdeeb', wash: '#eef4f8', line: '#3b78a8' },
  rose: { accent: '#9c4c60', tint: '#f6e3e8', border: '#ecd4db', wash: '#faf0f2', line: '#b05f76' },
  neutral: { accent: '#5d6773', tint: '#e4e8ec', border: '#d9dfe4', wash: '#f0f3f5', line: '#78808d' }
};

export const PAPER = '#faf9f5';

export const lineTones = () => Object.fromEntries(Object.entries(PALETTE).map(([tone, colors]) => [tone, colors.line]));
