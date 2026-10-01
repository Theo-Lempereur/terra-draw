import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const paths = {
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
  code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16"/>',
  key: '<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9m-5-5 3-3m-1 5 3-3"/>',
  check: '<path d="m5 12 4 4L19 6"/><path d="M21 12a9 9 0 1 1-6-8.5"/>',
  server: '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01M11 6.5h6M11 17.5h6"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  folder: '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  generic: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12h8m-4-4v8"/>'
};
function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${Object.hasOwn(paths, name) ? paths[name] : paths.generic}</svg>`;
}
function card(data, kind = '') {
  return `<article class="card ${kind}" data-node="${escapeHtml(data.id)}"><span class="icon">${icon(data.icon)}</span><div class="card-content">${data.badge ? `<span class="badge">${escapeHtml(data.badge)}</span>` : ''}<h3>${escapeHtml(data.title)}</h3>${data.body ? `<p>${escapeHtml(data.body)}</p>` : ''}</div></article>`;
}

export function renderHtml(diagram, width = 1440) {
  const fonts = [400, 600, 700].map(weight => {
    const font = readFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff2`)).toString('base64');
    return `@font-face{font-family:Inter; font-style:normal; font-weight:${weight}; src:url(data:font/woff2;base64,${font}) format('woff2'); font-display:block;}`;
  }).join('\n');
  const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
  const fontLicense = readFileSync(require.resolve('@fontsource/inter/LICENSE'), 'utf8').replaceAll('--', '—');
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="generator" content="terra-draw 0.1.0"><title>${escapeHtml(diagram.title)}</title><!-- Embedded font license:\n${fontLicense}\n--><style>${fonts}\n${css}\n.canvas{width:${width}px}</style></head>
<body><main class="canvas">
<header><div class="masthead"><span class="brand"><span class="brand-symbol">${icon('spark')}</span>terra<span class="brand-light">draw</span></span><span class="edition">EXPLAINER / 001</span></div>
${diagram.eyebrow ? `<p class="eyebrow">${escapeHtml(diagram.eyebrow)}</p>` : ''}<h1>${escapeHtml(diagram.title)}</h1>${diagram.subtitle ? `<p class="subtitle">${escapeHtml(diagram.subtitle)}</p>` : ''}</header>
<section class="flow" aria-label="Diagramme de comparaison"><svg class="connectors" aria-label="Connexions entre les étapes" role="img"></svg>
<div class="agent-wrap">${card(diagram.agent, 'agent')}</div>
<div class="branches">${diagram.branches.map((branch, index) => `<section class="branch ${branch.tone}"><div class="branch-heading"><span class="branch-number">0${index + 1}</span><div><h2>${escapeHtml(branch.title)}</h2><p>${escapeHtml(branch.description)}</p></div></div><div class="steps">${branch.cards.map(c => card(c)).join('')}</div><div class="tools" style="grid-template-columns:repeat(${branch.tools.length},1fr)">${branch.tools.map(c => card(c, 'tool')).join('')}</div></section>`).join('')}</div></section>
${diagram.comparison ? `<section class="comparison"><div class="section-heading"><span class="eyebrow">CE QUI CHANGE</span><span>Deux approches, des responsabilités différentes</span></div><table><thead><tr><th scope="col">En pratique</th>${diagram.branches.map(b => `<th scope="col">${escapeHtml(b.title)}</th>`).join('')}</tr></thead><tbody>${diagram.comparison.map(row => `<tr><th scope="row">${escapeHtml(row.label)}</th>${row.values.map(v => `<td>${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>` : ''}
${diagram.annotation ? `<aside class="annotation"><span class="annotation-mark">i</span><div><h2>${escapeHtml(diagram.annotation.title)}</h2><p>${escapeHtml(diagram.annotation.body)}</p></div></aside>` : ''}
<footer><span>${escapeHtml(diagram.footer || 'Créé avec Terra Draw')}</span><span>TERRA DRAW · LOCAL FIRST</span></footer>
</main></body></html>`;
}

// Runs inside Chromium after fonts and layout settle. The resulting SVG is baked
// into the exported HTML, so the artifact needs neither JS nor a network request.
export function drawConnectors(connectors) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.querySelector('.connectors');
  const flow = document.querySelector('.flow').getBoundingClientRect();
  svg.setAttribute('viewBox', `0 0 ${flow.width} ${flow.height}`);
  const colors = { amber: '#b27d35', green: '#288575', purple: '#7562ac', neutral: '#7e8492' };
  const el = (tag, attrs) => {
    const node = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  };
  const defs = el('defs', {});
  for (const [tone, color] of Object.entries(colors)) {
    const marker = el('marker', { id: `arrow-${tone}`, markerWidth: 8, markerHeight: 8, refX: 7, refY: 4, orient: 'auto', markerUnits: 'userSpaceOnUse' });
    marker.append(el('path', { d: 'M1 1L7 4L1 7', fill: 'none', stroke: color, 'stroke-width': 1.6 }));
    defs.append(marker);
  }
  svg.replaceChildren(defs);
  for (const edge of connectors) {
    const fromNode = document.querySelector(`[data-node="${edge.from}"]`);
    const from = fromNode.getBoundingClientRect();
    const to = document.querySelector(`[data-node="${edge.to}"]`).getBoundingClientRect();
    const x1 = from.x + from.width / 2 - flow.x;
    const y1 = from.bottom - flow.y;
    const fromAgent = fromNode.classList.contains('agent');
    const x2 = (fromAgent ? to.right - 24 : to.x + to.width / 2) - flow.x;
    const y2 = to.top - flow.y - 5;
    const middle = fromAgent ? y1 + 15 : (y1 + y2) / 2;
    const tone = edge.tone || 'neutral';
    const group = el('g', {});
    const title = el('title', {});
    title.textContent = `${edge.from} → ${edge.to}${edge.label ? ` : ${edge.label}` : ''}`;
    group.append(title, el('path', {
      d: `M${x1} ${y1} L${x1} ${middle} L${x2} ${middle} L${x2} ${y2}`,
      fill: 'none', stroke: colors[tone], 'stroke-width': 1.8,
      'stroke-linejoin': 'round', 'stroke-dasharray': edge.dashed ? '5 5' : 'none', 'marker-end': `url(#arrow-${tone})`
    }));
    if (edge.label) {
      const label = el('text', { x: (x1 + x2) / 2 + 12, y: middle + 4, fill: colors[tone], 'font-size': 12, 'font-weight': 600, 'paint-order': 'stroke', stroke: '#faf9f5', 'stroke-width': 5, 'stroke-linejoin': 'round' });
      label.textContent = edge.label;
      group.append(label);
    }
    svg.append(group);
  }
}
