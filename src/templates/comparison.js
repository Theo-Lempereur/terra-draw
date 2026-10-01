export const meta = {
  name: 'comparison',
  summary: 'Deux chemins mis en regard sous une entrée commune.',
  roles: { source: 'entrée unique, au-dessus des deux colonnes (0 ou 1)', step: 'étape d’une colonne', tool: 'destination en bas de colonne' },
  needs: 'groups : exactement 2. Chaque step et chaque tool déclare son group.'
};

const pad = index => String(index + 1).padStart(2, '0');

export function body({ plan, card, escape, density }) {
  const source = plan.nodes.find(node => node.role === 'source');
  const column = (group, index) => {
    const steps = plan.nodes.filter(node => node.group === group.id && node.role === 'step');
    const tools = plan.nodes.filter(node => node.group === group.id && node.role === 'tool');
    return `<section class="column tone-${group.tone}">
<div class="column-heading"><span class="column-number">${pad(index)}</span><div><h2>${escape(group.title)}</h2>${group.description && density.bodies ? `<p>${escape(group.description)}</p>` : ''}</div>${group.badge ? `<span class="chip">${escape(group.badge)}</span>` : ''}</div>
<div class="steps">${steps.map((node, step) => card(node, { kind: 'step', number: density.numbered ? pad(step) : null })).join('')}</div>
${tools.length ? `<div class="tools" style="--cols:${tools.length}">${tools.map(node => card(node, { kind: 'tool' })).join('')}</div>` : ''}
</section>`;
  };
  return `<section class="frame comparison-frame" aria-label="Comparaison de deux chemins">
<svg class="connectors" role="img" aria-label="Flèches entre les étapes"></svg>
${source ? `<div class="source-wrap">${card(source, { kind: 'source' })}</div>` : ''}
<div class="columns" style="--cols:${plan.groups.length}">${plan.groups.map(column).join('')}</div>
</section>`;
}

export function connectors(plan) {
  const byId = new Map(plan.nodes.map(node => [node.id, node]));
  return plan.edges.map(edge => (byId.get(edge.from).role === 'source'
    // Enter near the right edge so the arrow slips past the column heading.
    ? { ...edge, exit: 'bottom', enter: 'top-right', inset: 24, route: 'vh', bus: 15 }
    : { ...edge, exit: 'bottom', enter: 'top', route: 'vh' }));
}
