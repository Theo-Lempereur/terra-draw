import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createIconSet } from './icons.js';
import { PALETTE, PAPER } from './palette.js';
import * as comparison from './templates/comparison.js';
import * as hubAndSpoke from './templates/hub-and-spoke.js';
import * as flow from './templates/flow.js';
import * as cardsTable from './templates/cards-table.js';

const require = createRequire(import.meta.url);
// Read from package.json so the manifest and the exported HTML can never claim
// a version the project no longer has.
export const GENERATOR = `terra-draw/${JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version}`;

export const templates = {
  comparison,
  'hub-and-spoke': hubAndSpoke,
  flow,
  'cards-table': cardsTable
};

export const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

let embeddedFonts;
function fonts() {
  embeddedFonts ??= [400, 600, 700].map(weight => {
    const file = readFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff2`)).toString('base64');
    return `@font-face{font-family:Inter;font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${file}) format('woff2');font-display:block;}`;
  }).join('\n');
  return embeddedFonts;
}

const toneVars = () => Object.entries(PALETTE).map(([tone, colors]) =>
  `.tone-${tone}{--accent:${colors.accent};--tint:${colors.tint};--border:${colors.border};--wash:${colors.wash};--line:${colors.line};}`).join('');

/**
 * Build the standalone HTML document for a validated plan.
 * Returns the markup plus the icon report, so the manifest can mention which
 * icon names fell back to the generic pictogram.
 */
export function renderHtml(plan, { width = plan.canvas.width } = {}) {
  const density = plan.density;
  const icons = createIconSet({ strokeWidth: 1.7 });
  const escape = escapeHtml;

  const card = (node, { kind = '', number = null } = {}) => {
    const body = density.bodies && node.body ? `<p>${escape(node.body)}</p>` : '';
    return `<article class="card ${kind} tone-${node.tone}" data-node="${escape(node.id)}">`
      + `<span class="icon">${icons.svg(node.icon)}</span>`
      + '<div class="card-text">'
      + (number ? `<span class="card-number">${escape(number)}</span>` : '')
      + (node.badge ? `<span class="badge">${escape(node.badge)}</span>` : '')
      + `<h3>${escape(node.title)}</h3>${body}</div></article>`;
  };

  const context = { plan, density, card, escape, icon: name => icons.svg(name) };
  const template = templates[plan.template];
  const main = template.body(context);

  const badges = plan.badges.length
    ? `<ul class="chips">${plan.badges.map(badge => `<li class="chip tone-${badge.tone}">${badge.icon ? `<span class="chip-icon">${icons.svg(badge.icon)}</span>` : ''}${escape(badge.label)}</li>`).join('')}</ul>`
    : '';

  const table = density.table && plan.table
    ? `<section class="table-block" aria-label="${escape(plan.table.caption ?? 'Tableau de synthèse')}">
${plan.table.eyebrow || plan.table.caption ? `<div class="block-heading"><span class="eyebrow">${escape(plan.table.eyebrow ?? 'SYNTHÈSE')}</span>${plan.table.caption ? `<span>${escape(plan.table.caption)}</span>` : ''}</div>` : ''}
<table><thead><tr>${plan.table.columns.map(column => `<th scope="col">${escape(column)}</th>`).join('')}</tr></thead>
<tbody>${plan.table.rows.map(row => `<tr><th scope="row">${escape(row.label)}</th>${row.values.map(value => `<td>${escape(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>
</section>`
    : '';

  const notes = plan.notes.slice(0, density.notes);
  const notesBlock = notes.length
    ? `<div class="notes" style="--cols:${Math.min(notes.length, 2)}">${notes.map(note => `<aside class="note tone-${note.tone}"><span class="note-mark">${note.icon ? icons.svg(note.icon) : 'i'}</span><div>${note.title ? `<h2>${escape(note.title)}</h2>` : ''}<p>${escape(note.body)}</p></div></aside>`).join('')}</div>`
    : '';

  const legend = density.legend && plan.legend.length
    ? `<ul class="legend">${plan.legend.map(item => `<li class="tone-${item.tone ?? 'neutral'}"><span class="legend-line${item.dashed ? ' dashed' : ''}"></span>${escape(item.label)}</li>`).join('')}</ul>`
    : '';

  const license = readFileSync(require.resolve('@fontsource/inter/LICENSE'), 'utf8').replaceAll('--', '—');
  const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="generator" content="${GENERATOR}"><title>${escape(plan.title)}</title><!-- Embedded font license:\n${license}\n--><style>${fonts()}\n${css}\n${toneVars()}\n.canvas{width:${width}px}</style></head>
<body><main class="canvas tone-${plan.canvas.accent}" data-template="${escape(plan.template)}" data-mode="${escape(plan.mode)}" style="--icon-scale:${density.iconScale}">
<header><div class="masthead"><span class="brand"><span class="brand-symbol">${icons.svg('spark')}</span>terra<span class="brand-light">draw</span></span><span class="edition">${escape(plan.canvas.edition)}</span></div>
${plan.eyebrow ? `<p class="eyebrow">${escape(plan.eyebrow)}</p>` : ''}<h1>${escape(plan.title)}</h1>${plan.subtitle ? `<p class="subtitle">${escape(plan.subtitle)}</p>` : ''}${badges}</header>
${main}
${table}
${notesBlock}
${legend}
<footer><span>${escape(plan.footer ?? 'Créé avec Terra Draw')}</span><span>TERRA DRAW · LOCAL FIRST</span></footer>
</main></body></html>`;

  return { html, icons: icons.report() };
}

export const paper = PAPER;
