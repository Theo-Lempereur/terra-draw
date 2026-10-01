export const meta = {
  name: 'cards-table',
  summary: 'Une grille de cartes au-dessus d’un tableau de synthèse.',
  roles: { card: 'carte de la grille, 2 au minimum' },
  needs: 'table obligatoire. groups optionnel : des sections de cartes. Aucune flèche.'
};

/** Balance the grid: 7 cards become 4 + 3 rather than 4 + 2 + 1. */
export const columnsFor = count => (count <= 3 ? count : Math.ceil(count / Math.ceil(count / 4)));

export function body({ plan, card, escape }) {
  const grid = (nodes, columns) => `<div class="card-grid" style="--cols:${columns}">${nodes.map(node => card(node, { kind: 'grid-card' })).join('')}</div>`;
  const sectioned = plan.groups.length > 0 && plan.nodes.every(node => node.group);
  if (!sectioned) return `<section class="cards" aria-label="Cartes">${grid(plan.nodes, columnsFor(plan.nodes.length))}</section>`;
  // One column count for every section, so cards stay aligned down the page.
  const columns = columnsFor(Math.max(...plan.groups.map(group => plan.nodes.filter(node => node.group === group.id).length)));
  return plan.groups.map(group => {
    const nodes = plan.nodes.filter(node => node.group === group.id);
    return `<section class="cards card-section tone-${group.tone}" aria-label="${escape(group.title)}">
<div class="band"><h2>${escape(group.title)}</h2>${group.description ? `<p>${escape(group.description)}</p>` : ''}${group.badge ? `<span class="chip">${escape(group.badge)}</span>` : ''}</div>
${grid(nodes, columns)}
</section>`;
  }).join('');
}

export const connectors = () => [];
