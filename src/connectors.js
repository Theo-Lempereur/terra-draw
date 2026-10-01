/**
 * Runs inside Chromium once fonts and layout have settled: arrows are measured
 * from the real position of the cards. The resulting SVG is baked into the
 * exported HTML, so the artifact needs neither JavaScript nor a network request.
 *
 * Each edge carries its own anchors, decided by the template:
 *   exit/enter : top | bottom | left | right | top-right | top-left | bottom-right
 *   route      : vh (down, across, down) | hv (across, down, across) | line
 *   bus        : offset of the shared segment from the exit point, in pixels
 */
export function drawConnectors({ edges, strokeWidth = 1.8, tones, halo = '#faf9f5', gap = 6 }) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.querySelector('.connectors');
  if (!svg || !edges.length) return 0;
  const frame = svg.closest('.frame').getBoundingClientRect();
  svg.setAttribute('viewBox', `0 0 ${frame.width} ${frame.height}`);
  svg.setAttribute('width', frame.width);
  svg.setAttribute('height', frame.height);

  const el = (tag, attrs) => {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  const defs = el('defs', {});
  for (const [tone, color] of Object.entries(tones)) {
    const marker = el('marker', { id: `arrow-${tone}`, markerWidth: 9, markerHeight: 9, refX: 7.4, refY: 4.5, orient: 'auto', markerUnits: 'userSpaceOnUse' });
    marker.append(el('path', { d: 'M1.2 1.2 7.2 4.5 1.2 7.8', fill: 'none', stroke: color, 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    defs.append(marker);
  }
  svg.replaceChildren(defs);

  const round = value => Math.round(value * 10) / 10;
  const point = (rect, anchor, inset = 24) => {
    const left = rect.x - frame.x;
    const top = rect.y - frame.y;
    const cx = left + rect.width / 2;
    const cy = top + rect.height / 2;
    const right = left + rect.width;
    const bottom = top + rect.height;
    switch (anchor) {
      case 'top': return { x: cx, y: top, nx: 0, ny: -1 };
      case 'bottom': return { x: cx, y: bottom, nx: 0, ny: 1 };
      case 'left': return { x: left, y: cy, nx: -1, ny: 0 };
      case 'right': return { x: right, y: cy, nx: 1, ny: 0 };
      case 'top-right': return { x: right - inset, y: top, nx: 0, ny: -1 };
      case 'top-left': return { x: left + inset, y: top, nx: 0, ny: -1 };
      case 'bottom-right': return { x: right - inset, y: bottom, nx: 0, ny: 1 };
      case 'bottom-left': return { x: left + inset, y: bottom, nx: 0, ny: 1 };
      default: return { x: cx, y: cy, nx: 0, ny: 0 };
    }
  };

  let drawn = 0;
  for (const edge of edges) {
    const fromNode = document.querySelector(`[data-node="${edge.from}"]`);
    const toNode = document.querySelector(`[data-node="${edge.to}"]`);
    if (!fromNode || !toNode) continue;
    const start = point(fromNode.getBoundingClientRect(), edge.exit, edge.inset);
    const end = point(toNode.getBoundingClientRect(), edge.enter, edge.inset);
    end.x += end.nx * gap;
    end.y += end.ny * gap;

    let d;
    let label = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, anchor: 'middle' };
    if (edge.route === 'hv') {
      const mid = edge.bus === undefined ? (start.x + end.x) / 2 : start.x + edge.bus;
      d = `M${round(start.x)} ${round(start.y)}L${round(mid)} ${round(start.y)}L${round(mid)} ${round(end.y)}L${round(end.x)} ${round(end.y)}`;
      label = { x: mid, y: (start.y + end.y) / 2 - 8, anchor: 'middle' };
    } else if (edge.route === 'line') {
      d = `M${round(start.x)} ${round(start.y)}L${round(end.x)} ${round(end.y)}`;
      label.y -= 8;
    } else {
      const mid = edge.bus === undefined ? (start.y + end.y) / 2 : start.y + edge.bus;
      d = `M${round(start.x)} ${round(start.y)}L${round(start.x)} ${round(mid)}L${round(end.x)} ${round(mid)}L${round(end.x)} ${round(end.y)}`;
      label = Math.abs(start.x - end.x) < 8
        ? { x: start.x + 12, y: mid + 4, anchor: 'start' }
        : { x: (start.x + end.x) / 2, y: mid - 7, anchor: 'middle' };
    }

    const color = tones[edge.tone] ?? tones.neutral;
    const group = el('g', { 'data-edge': `${edge.from}-${edge.to}` });
    const title = el('title', {});
    title.textContent = `${edge.from} → ${edge.to}${edge.label ? ` : ${edge.label}` : ''}`;
    group.append(title, el('path', {
      d, fill: 'none', stroke: color, 'stroke-width': strokeWidth,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'stroke-dasharray': edge.dashed ? '5 5' : 'none', 'marker-end': `url(#arrow-${edge.tone in tones ? edge.tone : 'neutral'})`
    }));
    if (edge.label) {
      const text = el('text', {
        x: round(label.x), y: round(label.y), fill: color, 'text-anchor': label.anchor,
        'font-size': 12, 'font-weight': 600, 'paint-order': 'stroke', stroke: halo, 'stroke-width': 5, 'stroke-linejoin': 'round'
      });
      text.textContent = edge.label;
      group.append(text);
    }
    svg.append(group);
    drawn += 1;
  }
  return drawn;
}
