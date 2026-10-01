// `draw` : une image explicative en UN appel, visuel d'abord. Un agent donne un titre et quelques
// éléments courts ; le moteur choisit les icônes/logos, la mise en page et rend un PNG en ~0,3 s
// (Chromium gardé chaud entre deux dessins). Pensé pour un agent qui parle à Théo et montre en même
// temps : étapes, centre et satellites, comparaison, grille, ou liste à statuts (mails, tâches).
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { chromium } from './browser.js';
import { fonts } from './template.js';
import { PALETTE, PAPER } from './palette.js';
import { fold, lucideSvg, pickIcon } from './visual-icons.js';

export const LAYOUTS = ['flow', 'hub', 'compare', 'grid', 'list'];
const TONES = ['blue', 'green', 'amber', 'purple', 'rose'];
const MAX_ITEMS = 15;

// Statuts : clé canonique → libellé, pictogramme, ton. Les alias (français, anglais) y mènent.
export const STATUS = {
  new: ['nouveau', 'sparkles', 'blue'], unread: ['non lu', 'mail', 'blue'], read: ['lu', 'mail-open', 'neutral'],
  replied: ['répondu', 'reply', 'green'], sent: ['envoyé', 'send', 'green'], draft: ['brouillon', 'file-pen', 'amber'],
  waiting: ['en attente', 'hourglass', 'amber'], deleted: ['supprimé', 'trash', 'rose'],
  modified: ['modifié', 'pencil', 'purple'], done: ['fait', 'circle-check', 'green'], todo: ['à faire', 'circle-dashed', 'neutral'],
  error: ['erreur', 'triangle-alert', 'rose'], urgent: ['urgent', 'flame', 'rose'], archived: ['archivé', 'archive', 'neutral'],
  scheduled: ['programmé', 'calendar-clock', 'blue'], running: ['en cours', 'loader', 'blue']
};
const STATUS_ALIASES = {
  nouveau: 'new', nouvelle: 'new', 'non lu': 'unread', nonlu: 'unread', lu: 'read', repondu: 'replied', reponse: 'replied',
  envoye: 'sent', envoyee: 'sent', brouillon: 'draft', attente: 'waiting', 'en attente': 'waiting', pending: 'waiting',
  supprime: 'deleted', supprimee: 'deleted', modifie: 'modified', modifiee: 'modified', edited: 'modified', fait: 'done',
  termine: 'done', ok: 'done', valide: 'done', 'a faire': 'todo', afaire: 'todo', erreur: 'error', echec: 'error',
  failed: 'error', archive: 'archived', archivee: 'archived', programme: 'scheduled', planifie: 'scheduled',
  'en cours': 'running', encours: 'running'
};

export function statusOf(value) {
  if (value === undefined || value === null || value === '') return null;
  const key = fold(value).trim().replace(/\s+/g, ' ');
  const id = STATUS[key] ? key : STATUS_ALIASES[key] ?? STATUS_ALIASES[key.replace(/\s/g, '')];
  if (id) return { id, label: STATUS[id][0], icon: STATUS[id][1], tone: STATUS[id][2] };
  return { id: 'custom', label: String(value).slice(0, 24), icon: 'circle-dot', tone: 'neutral' };
}

const clip = (value, max) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

/**
 * Plan tolérant : un agent ne doit jamais perdre un aller-retour pour une virgule. On coupe, on devine,
 * on n'échoue que si rien n'est dessinable.
 */
export function normalizeSpec(input = {}) {
  const title = clip(input.title, 90);
  if (!title) throw new Error('title est obligatoire (quelques mots).');
  const rawItems = Array.isArray(input.items) ? input.items : [];
  const items = rawItems.slice(0, MAX_ITEMS).map(entry => (typeof entry === 'string' ? { label: entry } : entry ?? {}))
    .map(entry => ({
      label: clip(entry.label ?? entry.title ?? entry.name, 60),
      note: clip(entry.note ?? entry.detail ?? entry.description, 110),
      icon: entry.icon ? clip(entry.icon, 40) : '',
      status: statusOf(entry.status),
      preview: clip(entry.preview, 220),
      group: entry.group === 2 || entry.group === '2' || fold(entry.group) === fold(input.columns?.[1]) ? 2 : 1
    }))
    .filter(entry => entry.label);
  if (!items.length) throw new Error('items doit contenir au moins un élément avec un label.');
  const columns = Array.isArray(input.columns) ? input.columns.slice(0, 2).map(c => clip(c, 40)) : [];
  let layout = LAYOUTS.includes(input.layout) ? input.layout : null;
  layout ??= items.some(i => i.status || i.preview) ? 'list'
    : columns.length === 2 || rawItems.some(i => i?.group) ? 'compare'
      : items.length <= 6 ? 'flow' : 'grid';
  if (layout === 'hub' && items.length < 3) layout = 'flow';
  return { title, subtitle: clip(input.subtitle, 140), layout, items, columns };
}

const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function art(item, size = '') {
  const icon = item.art;
  const style = icon.kind === 'brand' ? ` style="--brand:${icon.color}"` : '';
  return `<div class="art ${icon.kind}${icon.dark ? ' dark' : ''} ${size}"${style}>${icon.svg}</div>`;
}

const stamp = status => (status
  ? `<span class="stamp tone-${status.tone} st-${status.id}">${lucideSvg(status.icon, 2.2)}${esc(status.label)}</span>` : '');

function tile(item, { number } = {}) {
  return `<div class="tile tone-${item.tone}${item.status ? ` st-${item.status.id}` : ''}">${stamp(item.status)}
${number ? `<span class="num">${number}</span>` : ''}${art(item)}
<div class="label">${esc(item.label)}</div>${item.note ? `<div class="note">${esc(item.note)}</div>` : ''}</div>`;
}

const arrow = `<div class="arrow"><svg viewBox="0 0 48 24" aria-hidden="true"><path d="M2 12h40m-9-8 9 8-9 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;

const LAYOUT = {
  flow(spec) {
    const perRow = spec.items.length <= 6 ? spec.items.length : Math.ceil(spec.items.length / Math.ceil(spec.items.length / 5));
    const rows = [];
    for (let i = 0; i < spec.items.length; i += perRow) rows.push(spec.items.slice(i, i + perRow));
    let n = 0;
    const html = rows.map(row => `<div class="flow">${row.map(item => tile(item, { number: ++n })).join(arrow)}</div>`).join('');
    return { html, width: Math.max(1200, Math.min(2200, perRow * 300 + (perRow - 1) * 56 + 128)) };
  },
  grid(spec) {
    const n = spec.items.length;
    const cols = n <= 4 ? n : Math.ceil(n / Math.ceil(n / 4));
    return { html: `<div class="grid" style="--cols:${cols}">${spec.items.map(i => tile(i)).join('')}</div>`, width: Math.max(1100, cols * 300 + 128) };
  },
  hub(spec) {
    const [center, ...spokes] = spec.items;
    const radius = spokes.length <= 6 ? 360 : 420;
    const squash = 0.82;                                     // ellipse : moins haute que large
    const w = 2 * radius + 300, h = Math.round(2 * radius * squash + 330), cx = w / 2, cy = h / 2;
    const placed = spokes.map((item, index) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * index) / spokes.length;
      return { item, x: cx + radius * Math.cos(angle), y: cy + radius * squash * Math.sin(angle) };
    });
    const lines = placed.map(({ item, x, y }) =>
      `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${PALETTE[item.tone].line}" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round"/>`).join('');
    const html = `<div class="hub" style="width:${w}px;height:${h}px"><svg class="spokes" width="${w}" height="${h}">${lines}</svg>
<div class="pin center" style="left:${cx}px;top:${cy}px">${tile({ ...center, tone: 'purple' })}</div>
${placed.map(({ item, x, y }) => `<div class="pin" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px">${tile(item)}</div>`).join('')}</div>`;
    return { html, width: w + 128 };
  },
  compare(spec) {
    const col = (group, tone) => {
      const items = spec.items.filter(i => i.group === group);
      const head = spec.columns[group - 1] ?? (group === 1 ? 'A' : 'B');
      return `<div class="col tone-${tone}"><div class="col-head">${esc(head)}</div>${items.map(i => row({ ...i, tone })).join('')}</div>`;
    };
    return { html: `<div class="compare">${col(1, 'blue')}<div class="vs">VS</div>${col(2, 'amber')}</div>`, width: 1300 };
  },
  list(spec) {
    return { html: `<div class="list">${spec.items.map(i => row(i)).join('')}</div>`, width: 1200 };
  }
};

function row(item) {
  const preview = item.preview
    ? `<div class="preview"><span class="preview-tag">${lucideSvg('file-pen', 2)}brouillon</span><p>${esc(item.preview)}</p></div>` : '';
  return `<div class="row tone-${item.tone}${item.status ? ` st-${item.status.id}` : ''}">${art(item, 'small')}
<div class="row-text"><div class="label">${esc(item.label)}</div>${item.note ? `<div class="note">${esc(item.note)}</div>` : ''}${preview}</div>${stamp(item.status)}</div>`;
}

const CSS = `
*{box-sizing:border-box}html,body{margin:0;background:${PAPER}}
.canvas{font-family:Inter,Arial,sans-serif;color:#1f2430;background:${PAPER};padding:52px 64px 40px;display:inline-block}
h1{margin:0;font-size:46px;font-weight:700;letter-spacing:-1.6px;line-height:1.12;max-width:1400px}
.sub{margin:12px 0 0;font-size:20px;color:#6b7080;max-width:1100px}
.body{margin-top:44px}
.mark{margin-top:36px;font-size:12px;letter-spacing:2px;color:#a3a6af;font-weight:600}
${Object.entries(PALETTE).map(([t, c]) => `.tone-${t}{--accent:${c.accent};--tint:${c.tint};--border:${c.border};--wash:${c.wash};--line:${c.line}}`).join('')}
.art{display:grid;place-items:center;width:132px;height:132px;border-radius:30px;background:var(--tint);color:var(--accent);flex:none;box-shadow:inset 0 0 0 2px var(--border)}
.art svg{width:64px;height:64px}
.art.brand{background:#fff;color:var(--brand);box-shadow:0 2px 0 var(--border),inset 0 0 0 2px var(--border)}
.art.brand.dark{background:#1f2430}
.art.brand svg{width:70px;height:70px}
.art.letter{background:var(--accent);color:#fff;box-shadow:none}
.letter{font-size:60px;font-weight:700;letter-spacing:-2px}
.art.small{width:76px;height:76px;border-radius:20px}.art.small svg{width:40px;height:40px}.art.small .letter{font-size:36px}
.tile{position:relative;width:280px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:16px;padding:30px 20px 26px;background:#fff;border-radius:28px;box-shadow:0 1px 0 #e6e4dc,0 10px 30px -18px rgba(31,36,48,.35)}
.tile::before{content:"";position:absolute;top:0;left:50%;width:64px;height:6px;margin-left:-32px;border-radius:0 0 6px 6px;background:var(--accent)}
.label{font-size:23px;font-weight:700;letter-spacing:-.4px;line-height:1.25}
.note{font-size:16px;color:#6b7080;line-height:1.45;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.num{position:absolute;top:14px;left:16px;font-size:13px;font-weight:700;color:var(--accent);background:var(--wash);border-radius:99px;padding:4px 10px}
.flow{display:flex;align-items:stretch;gap:0}.flow+.flow{margin-top:40px}
.arrow{width:56px;flex:none;align-self:center;color:#b5b2a8;display:grid;place-items:center}.arrow svg{width:46px}
.grid{display:grid;grid-template-columns:repeat(var(--cols),280px);gap:28px}
.hub{position:relative}.spokes{position:absolute;inset:0}
.pin{position:absolute;transform:translate(-50%,-50%)}
.pin .tile{width:250px;padding:24px 16px 20px}.pin .art{width:108px;height:108px}.pin .art svg{width:54px;height:54px}
.pin.center .tile{width:300px;box-shadow:0 0 0 10px #f1edf8,0 18px 40px -20px rgba(70,50,120,.5)}
.pin.center .art{width:150px;height:150px}.pin.center .art svg{width:80px;height:80px}
.compare{display:grid;grid-template-columns:1fr 88px 1fr;align-items:start}
.col{display:flex;flex-direction:column;gap:16px}
.col-head{font-size:28px;font-weight:700;color:var(--accent);background:var(--wash);border-radius:20px;padding:18px 24px;border:2px solid var(--border)}
.vs{align-self:center;justify-self:center;width:72px;height:72px;border-radius:50%;background:#1f2430;color:#fff;display:grid;place-items:center;font-weight:700;font-size:20px}
.list{display:flex;flex-direction:column;gap:14px;width:1072px}
.row{display:flex;align-items:center;gap:22px;background:#fff;border-radius:22px;padding:18px 22px;box-shadow:0 1px 0 #e6e4dc,0 8px 24px -18px rgba(31,36,48,.35);border-left:7px solid var(--accent)}
.row-text{flex:1;min-width:0}.row .note{-webkit-line-clamp:2}
.stamp{display:inline-flex;align-items:center;gap:8px;flex:none;font-size:16px;font-weight:700;color:var(--accent);background:var(--tint);border:2px solid var(--border);border-radius:99px;padding:8px 16px 8px 12px;white-space:nowrap}
.stamp svg{width:20px;height:20px}
.tile .stamp{position:absolute;top:-18px;right:-12px;box-shadow:0 4px 12px -6px rgba(0,0,0,.3)}
.st-deleted .label{text-decoration:line-through;text-decoration-thickness:2px;color:#9a9da6}
.st-deleted .art,.st-deleted .note,.st-archived .art{opacity:.45;filter:grayscale(1)}
.st-deleted{background:#fbf7f8}
.st-done .art,.st-sent .art,.st-replied .art{box-shadow:inset 0 0 0 3px var(--line)}
.preview{margin-top:12px;background:#fffdf6;border:2px dashed #e2cfa8;border-radius:14px;padding:12px 16px;transform:rotate(-.4deg)}
.preview-tag{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#96621e}
.preview-tag svg{width:15px;height:15px}
.preview p{margin:6px 0 0;font-size:16px;line-height:1.5;color:#4a4f5c;font-style:italic}
`;

export function buildHtml(spec) {
  let index = 0;
  const items = spec.items.map(item => ({
    ...item, art: pickIcon(item), tone: item.status?.tone && spec.layout === 'list' ? item.status.tone : TONES[index++ % TONES.length]
  }));
  const plan = { ...spec, items };
  const { html, width } = LAYOUT[spec.layout](plan);
  const doc = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${fonts()}${CSS}</style></head><body>
<main class="canvas"><h1>${esc(spec.title)}</h1>${spec.subtitle ? `<p class="sub">${esc(spec.subtitle)}</p>` : ''}
<div class="body">${html}</div><div class="mark">TERRA DRAW</div></main></body></html>`;
  return { html: doc, width, icons: items.map(i => `${i.label} → ${i.art.kind === 'brand' ? `logo ${i.art.name}` : i.art.kind === 'letter' ? 'initiale' : i.art.name}`) };
}

// --------------------------------------------------------------------------- rendu (Chromium chaud)
let warm = null;
const IDLE_MS = 10 * 60 * 1000;

async function warmPage() {
  if (!warm || !warm.browser.isConnected()) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ deviceScaleFactor: 2, locale: 'fr-FR', colorScheme: 'light', reducedMotion: 'reduce' });
    await page.route('**/*', route => route.abort());          // aucun accès réseau, jamais
    warm = { browser, page, timer: null };
  }
  clearTimeout(warm.timer);
  warm.timer = setTimeout(closeDraw, IDLE_MS);
  warm.timer.unref?.();
  return warm.page;
}

export async function closeDraw() {
  const current = warm;
  warm = null;
  if (current) { clearTimeout(current.timer); await current.browser.close().catch(() => {}); }
}

export const DRAW_DIR = process.env.TERRA_DRAW_OUT || path.join(homedir(), 'terra', 'drawings');
const slug = text => fold(text).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'schema';

/** Dessine `input` et renvoie { png, layout, icons, ms }. */
export async function draw(input, { outDir = DRAW_DIR } = {}) {
  const started = performance.now();
  const spec = normalizeSpec(input);
  const { html, width, icons } = buildHtml(spec);
  const page = await warmPage();
  await page.setViewportSize({ width: width + 40, height: 900 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  await mkdir(outDir, { recursive: true });
  const png = path.join(outDir, `${stamp}-${slug(spec.title)}.png`);
  await page.locator('.canvas').screenshot({ path: png });
  await writeFile(png.replace(/\.png$/, '.json'), `${JSON.stringify(input, null, 2)}\n`);
  return { png, layout: spec.layout, icons, ms: Math.round(performance.now() - started) };
}
