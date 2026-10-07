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

export const LAYOUTS = ['flow', 'hub', 'compare', 'grid', 'list', 'tree', 'route'];
const TONES = ['blue', 'green', 'amber', 'purple', 'rose'];
const MAX_ZONES = 4;
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
      group: entry.group === 2 || entry.group === '2' || fold(entry.group) === fold(input.columns?.[1]) ? 2 : 1,
      parent: ref(entry.parent),
      from: ref(entry.from),
      to: ref(entry.to),
      via: clip(entry.via, 30)
    }))
    .filter(entry => entry.label);
  if (!items.length) throw new Error('items doit contenir au moins un élément avec un label.');
  const columns = Array.isArray(input.columns) ? input.columns.slice(0, 2).map(c => clip(c, 40)) : [];
  const zones = (Array.isArray(input.zones) ? input.zones : []).slice(0, MAX_ZONES)
    .map(zone => (typeof zone === 'string' ? { label: zone } : zone ?? {}))
    .map(zone => ({ label: clip(zone.label ?? zone.name, 40), note: clip(zone.note, 80), icon: zone.icon ? clip(zone.icon, 40) : '' }))
    .filter(zone => zone.label);
  let layout = LAYOUTS.includes(input.layout) ? input.layout : null;
  layout ??= items.some(i => i.from !== '' || i.to !== '') || zones.length ? 'route'
    : items.some(i => i.parent !== '') ? 'tree'
      : items.some(i => i.status || i.preview) ? 'list'
        : columns.length === 2 || rawItems.some(i => i?.group) ? 'compare'
          : items.length <= 6 ? 'flow' : 'grid';
  if (layout === 'hub' && items.length < 3) layout = 'flow';
  return { title, subtitle: clip(input.subtitle, 140), layout, items, columns, zones };
}

// Référence vers un autre élément ou une zone : un libellé, ou un numéro (1 = le premier).
const ref = value => (typeof value === 'number' ? String(value) : clip(value, 60));

/** Retrouve `value` dans `list` (par numéro, libellé exact, puis libellé contenu dans l'autre). */
function lookup(list, value) {
  if (!value) return -1;
  if (/^\d+$/.test(value)) return Number(value) >= 1 && Number(value) <= list.length ? Number(value) - 1 : -1;
  const key = fold(value).replace(/[^a-z0-9]+/g, ' ').trim();
  const keys = list.map(entry => fold(entry.label).replace(/[^a-z0-9]+/g, ' ').trim());
  const exact = keys.indexOf(key);
  if (exact !== -1) return exact;
  return key ? keys.findIndex(other => other && (other.includes(key) || key.includes(other))) : -1;
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
  },
  tree(spec) {
    // Chaque élément pointe vers son parent (libellé ou numéro) ; sans parent, c'est une racine.
    const nodes = spec.items.map((item, id) => ({ ...item, id, kids: [], up: null }));
    const roots = [];
    for (const node of nodes) {
      const index = node.parent ? lookup(nodes, node.parent) : -1;
      let parent = index === -1 || index === node.id ? null : nodes[index];
      for (let p = parent; p; p = p.up) if (p === node) { parent = null; break; }   // pas de boucle
      if (parent) { node.up = parent; parent.kids.push(node); } else roots.push(node);
    }
    // Une seule racine : elle est le sommet, ses enfants sont numérotés et chacun donne sa couleur à
    // sa branche. Plusieurs racines : ce sont elles, côte à côte, qui sont numérotées.
    const paint = (node, tone) => { node.tone = tone; node.kids.forEach(kid => paint(kid, tone)); };
    const heads = roots.length === 1 ? roots[0].kids : roots;
    if (roots.length === 1) roots[0].tone = 'neutral';
    heads.forEach((node, index) => { paint(node, TONES[index % TONES.length]); node.number = index + 1; });
    const top = roots.length === 1 ? roots[0] : null;

    const render = (node, depth) => {
      const leaves = node.kids.length > 0 && node.kids.every(kid => !kid.kids.length);
      const stack = leaves && (depth >= 1 || node.kids.length > 6 || !top);
      const level = node === top ? 0 : depth === 0 || node.up === top ? 1 : 2;
      const card = `<div class="tnode d${level} tone-${node.tone}">${node.number ? `<span class="tnum">${node.number}</span>` : ''}
${art(node, level === 0 ? '' : 'small')}<div class="ttext"><div class="label">${esc(node.label)}</div>${node.note ? `<div class="note">${esc(node.note)}</div>` : ''}</div>${stamp(node.status)}</div>`;
      const kids = node.kids.length ? `<div class="kids">${node.kids.map(kid => render(kid, depth + 1).html).join('')}</div>` : '';
      return { html: `<div class="branch${stack ? ' stack' : ''}">${card}${kids}</div>`, width: stack || !node.kids.length ? 380 : 0 };
    };
    // Largeur estimée : une colonne par feuille posée côte à côte (les piles de feuilles = une colonne).
    const span = (node, depth) => {
      const stack = node.kids.length > 0 && node.kids.every(kid => !kid.kids.length) && (depth >= 1 || node.kids.length > 6 || !top);
      return stack || !node.kids.length ? 420 : Math.max(420, node.kids.reduce((sum, kid) => sum + span(kid, depth + 1) + 40, -40));
    };
    const width = roots.reduce((sum, root) => sum + span(root, 0) + 48, -48);
    return { html: `<div class="tree" data-wires><svg class="wires"></svg>${roots.map(root => render(root, 0).html).join('')}</div>`, width: Math.max(1100, width + 128) };
  },
  route(spec) {
    // Des machines (zones) en colonnes, chacune avec sa ligne de vie ; chaque étape est soit un trajet
    // d'une zone à l'autre (flèche), soit une action sur place (carte posée sur la ligne de vie).
    const zones = spec.zones.map(zone => ({ ...zone }));
    const zoneOf = value => {
      if (!value) return -1;
      const index = lookup(zones, value);
      if (index !== -1 || /^\d+$/.test(value) || zones.length >= MAX_ZONES) return index;
      zones.push({ label: value, note: '', icon: '' });
      return zones.length - 1;
    };
    const steps = spec.items.map(item => {
      const from = zoneOf(item.from), to = zoneOf(item.to);
      return { ...item, from, to };
    });
    if (!zones.length) zones.push({ label: 'Ici', note: '', icon: '' });
    zones.forEach((zone, index) => { zone.tone = TONES[index % TONES.length]; zone.art = pickIcon(zone); });
    const n = zones.length;
    const col = n <= 2 ? 470 : n === 3 ? 410 : 350;
    const head = zones.map((zone, index) => `<div class="zone tone-${zone.tone}" style="grid-column:${index + 1};grid-row:1">
${art(zone, 'big')}<div class="label">${esc(zone.label)}</div>${zone.note ? `<div class="note">${esc(zone.note)}</div>` : ''}</div>
<div class="life tone-${zone.tone}" style="grid-column:${index + 1};grid-row:2 / ${steps.length + 2}"></div>`).join('');
    const body = steps.map((step, index) => {
      const row = index + 2, number = `<span class="snum">${index + 1}</span>`;
      const note = step.note ? `<div class="note">${esc(step.note)}</div>` : '';
      const travels = step.from !== -1 && step.to !== -1 && step.from !== step.to;
      if (!travels) {
        const at = step.from !== -1 ? step.from : Math.max(step.to, 0);
        return `<div class="act tone-${zones[at].tone}" style="grid-column:${at + 1};grid-row:${row}">${number}${art(step, 'small')}
<div class="ttext"><div class="label">${esc(step.label)}</div>${note}</div>${stamp(step.status)}</div>`;
      }
      const left = Math.min(step.from, step.to), right = Math.max(step.from, step.to);
      const via = step.via ? `<span class="via">${art({ art: pickIcon({ label: step.via }) }, 'mini')}${esc(step.via)}</span>` : '';
      return `<div class="hop tone-${zones[step.from].tone} ${step.to > step.from ? 'right' : 'left'}" style="grid-column:${left + 1} / ${right + 2};grid-row:${row}">
<div class="hop-label">${number}${esc(step.label)}${stamp(step.status)}</div><div class="hop-line">${HEAD}${via}</div>${note}</div>`;
    }).join('');
    return { html: `<div class="route" style="--col:${col}px;--n:${n}">${head}${body}</div>`, width: n * col + 128 };
  }
};

const HEAD = '<svg class="head" viewBox="0 0 20 24" aria-hidden="true"><path d="M3 3l14 9-14 9" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * Exécutée DANS la page, une fois les polices prêtes : trace les flèches de l'arbre d'après les
 * positions réelles des cartes (coudes arrondis parent → enfant, ou épine latérale pour une pile).
 */
function wireTrees() {
  for (const host of document.querySelectorAll('[data-wires]')) {
    const box = host.getBoundingClientRect();
    const at = el => {
      const r = el.getBoundingClientRect();
      return { l: r.left - box.left, r: r.right - box.left, t: r.top - box.top, b: r.bottom - box.top, cx: r.left - box.left + r.width / 2, cy: r.top - box.top + r.height / 2 };
    };
    let out = '';
    for (const branch of host.querySelectorAll('.branch')) {
      const kids = branch.querySelectorAll(':scope > .kids > .branch > .tnode');
      if (!kids.length) continue;
      const p = at(branch.querySelector(':scope > .tnode'));
      const area = at(branch.querySelector(':scope > .kids'));
      for (const kid of kids) {
        const k = at(kid);
        const color = getComputedStyle(kid).getPropertyValue('--line').trim();
        let d, tip;
        if (branch.classList.contains('stack')) {
          const x = area.l + 26, r = 14, end = k.l - 3;
          d = `M${x} ${p.b} V${k.cy - r} Q${x} ${k.cy} ${x + r} ${k.cy} H${end}`;
          tip = `M${end - 11} ${k.cy - 8} L${end} ${k.cy} L${end - 11} ${k.cy + 8}`;
        } else {
          const y = p.b + (area.t - p.b) / 2, end = k.t - 3, dx = k.cx - p.cx;
          const r = Math.min(16, Math.abs(dx) / 2, y - p.b), s = Math.sign(dx);
          d = Math.abs(dx) < 1 ? `M${p.cx} ${p.b} V${end}`
            : `M${p.cx} ${p.b} V${y - r} Q${p.cx} ${y} ${p.cx + s * r} ${y} H${k.cx - s * r} Q${k.cx} ${y} ${k.cx} ${y + r} V${end}`;
          tip = `M${k.cx - 8} ${end - 11} L${k.cx} ${end} L${k.cx + 8} ${end - 11}`;
        }
        out += `<path d="${d}" stroke="${color}"/><path d="${tip}" stroke="${color}"/>`;
      }
    }
    const svg = host.querySelector(':scope > svg.wires');
    svg.setAttribute('width', box.width);
    svg.setAttribute('height', box.height);
    svg.innerHTML = `<g fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${out}</g>`;
  }
}

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
.art.mini{width:30px;height:30px;border-radius:9px;box-shadow:none}.art.mini svg{width:18px;height:18px}.art.mini .letter{font-size:16px;letter-spacing:0}
.art.big{width:150px;height:150px;border-radius:36px}.art.big svg{width:84px;height:84px}
.ttext{flex:1;min-width:0}
.tree{position:relative;display:flex;justify-content:center;align-items:flex-start;gap:48px}
.wires{position:absolute;left:0;top:0;overflow:visible}
.branch{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center}
.kids{display:flex;align-items:flex-start;gap:40px;margin-top:88px}
.branch.stack{align-items:stretch;width:420px}
.branch.stack>.kids{flex-direction:column;align-items:stretch;gap:16px;margin-top:26px;padding-left:58px}
.tnode{position:relative;display:flex;align-items:center;gap:18px;width:380px;padding:18px 20px;background:#fff;border-radius:22px;box-shadow:0 1px 0 #e6e4dc,0 10px 28px -18px rgba(31,36,48,.4)}
.branch.stack>.tnode,.branch.stack>.kids .tnode{width:auto}
.tnode .art.small{width:64px;height:64px;border-radius:18px}.tnode .art.small svg{width:34px;height:34px}
.tnode .label{font-size:21px}.tnode .note{font-size:15.5px;margin-top:4px;-webkit-line-clamp:4}
.tnode.d0{flex-direction:column;text-align:center;gap:12px;width:400px;padding:24px 24px 22px;box-shadow:0 0 0 10px #efede6,0 18px 40px -22px rgba(31,36,48,.55)}
.tnode.d0 .art{width:96px;height:96px;border-radius:26px}.tnode.d0 .art svg{width:52px;height:52px}
.tnode.d0 .label{font-size:28px}.tnode.d0 .note{font-size:17px}
.tnode.d1{background:var(--wash);box-shadow:inset 0 0 0 2px var(--border),0 10px 28px -20px rgba(31,36,48,.4)}
.tnode.d1 .label{font-size:23px;color:var(--accent)}
.tnode.d2{border-left:7px solid var(--accent)}
.tnum{position:absolute;top:-20px;left:-16px;width:46px;height:46px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;font-size:23px;font-weight:700;box-shadow:0 0 0 6px ${PAPER}}
.tnode .stamp{position:absolute;top:-16px;right:-10px;padding:5px 12px 5px 9px;font-size:14px}
.route{display:grid;grid-template-columns:repeat(var(--n),var(--col));row-gap:18px;align-items:center}
.zone{display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;margin:0 18px 18px;padding:26px 18px 22px;background:var(--wash);border-radius:30px;box-shadow:inset 0 0 0 2px var(--border)}
.zone .label{font-size:28px;color:var(--accent)}.zone .note{font-size:16px}
.life{align-self:stretch;position:relative}
.life::before{content:"";position:absolute;left:50%;top:-36px;bottom:-24px;margin-left:-2px;border-left:4px dotted var(--line);opacity:.55}
.act{position:relative;z-index:1;justify-self:center;display:flex;align-items:center;gap:16px;width:calc(var(--col) - 60px);padding:16px 18px 16px 22px;background:#fff;border-radius:20px;box-shadow:inset 0 0 0 2px var(--border),0 10px 26px -18px rgba(31,36,48,.45)}
.act .label{font-size:20px}.act .note{font-size:15px;margin-top:3px}
.snum{flex:none;width:36px;height:36px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;font-size:17px;font-weight:700}
.act>.snum{position:absolute;top:-14px;left:-14px;box-shadow:0 0 0 5px ${PAPER}}
.act .stamp{position:absolute;top:-15px;right:-10px;box-shadow:0 4px 12px -6px rgba(0,0,0,.3)}
.act .stamp,.hop .stamp{padding:4px 11px 4px 8px;font-size:13px}.act .stamp svg,.hop .stamp svg{width:16px;height:16px}
.hop{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:10px;padding:8px calc(var(--col) / 2)}
.hop-label{display:flex;align-items:center;gap:12px;max-width:100%;padding:6px 16px 6px 6px;background:${PAPER};border-radius:99px;font-size:20px;font-weight:700;letter-spacing:-.3px;line-height:1.25}
.hop-line{position:relative;align-self:stretch;height:30px;color:var(--line)}
.hop-line::before{content:"";position:absolute;left:4px;right:4px;top:50%;height:5px;margin-top:-2.5px;border-radius:5px;background:var(--line)}
.hop-line::after{content:"";position:absolute;top:50%;width:16px;height:16px;margin-top:-8px;border-radius:50%;background:var(--line);box-shadow:0 0 0 5px ${PAPER}}
.hop.right .hop-line::after{left:-6px}.hop.left .hop-line::after{right:-6px}
.head{position:absolute;top:50%;width:22px;height:26px;margin-top:-13px}
.hop.right .head{right:-6px}.hop.left .head{left:-6px;transform:scaleX(-1)}
.via{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:inline-flex;align-items:center;gap:8px;padding:4px 14px 4px 5px;background:#fff;border-radius:99px;box-shadow:inset 0 0 0 2px var(--border);color:#1f2430;font-size:15px;font-weight:700;white-space:nowrap}
.hop>.note{max-width:100%;text-align:center;font-size:15.5px;-webkit-line-clamp:2}
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
<div class="body">${html}</div><div class="mark">TERRA DRAW</div></main>
${html.includes('data-wires') ? `<script>window.__wire = ${wireTrees.toString()};</script>` : ''}</body></html>`;
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
  await page.evaluate(() => window.__wire?.());
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  await mkdir(outDir, { recursive: true });
  const png = path.join(outDir, `${stamp}-${slug(spec.title)}.png`);
  await page.locator('.canvas').screenshot({ path: png });
  await writeFile(png.replace(/\.png$/, '.json'), `${JSON.stringify(input, null, 2)}\n`);
  return { png, layout: spec.layout, icons, ms: Math.round(performance.now() - started) };
}
