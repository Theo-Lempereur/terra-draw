export const meta = {
  name: 'hub-and-spoke',
  summary: 'Un élément central et les éléments qui l’entourent.',
  roles: { hub: 'le centre, exactement un', spoke: 'satellite, de 2 à 10' },
  needs: 'Aucun group. Les satellites se répartissent automatiquement à gauche puis à droite.'
};

/** Left column first, so reading top-to-bottom follows the order of `nodes`. */
export function split(plan) {
  const spokes = plan.nodes.filter(node => node.role === 'spoke');
  const half = Math.ceil(spokes.length / 2);
  const side = new Map();
  spokes.forEach((node, index) => side.set(node.id, index < half ? 'left' : 'right'));
  return { left: spokes.slice(0, half), right: spokes.slice(half), side };
}

export function body({ plan, card }) {
  const hub = plan.nodes.find(node => node.role === 'hub');
  const { left, right } = split(plan);
  const column = (nodes, side) => `<div class="spokes ${side}">${nodes.map(node => card(node, { kind: `spoke side-${side}` })).join('')}</div>`;
  return `<section class="frame hub-frame" aria-label="Un centre et ses satellites">
<svg class="connectors" role="img" aria-label="Flèches entre le centre et les satellites"></svg>
<div class="hub-grid">
${column(left, 'left')}
<div class="hub-wrap">${card(hub, { kind: 'hub' })}</div>
${column(right, 'right')}
</div>
</section>`;
}

export function connectors(plan) {
  const byId = new Map(plan.nodes.map(node => [node.id, node]));
  const { side } = split(plan);
  return plan.edges.map(edge => {
    const fromHub = byId.get(edge.from).role === 'hub';
    const spoke = fromHub ? edge.to : edge.from;
    const onLeft = side.get(spoke) === 'left';
    // The hub leaves by the side its satellite sits on; the satellite is entered
    // on its inner edge, so every line fans out without crossing a card.
    const hubAnchor = onLeft ? 'left' : 'right';
    const spokeAnchor = onLeft ? 'right' : 'left';
    return fromHub
      ? { ...edge, exit: hubAnchor, enter: spokeAnchor, route: 'line' }
      : { ...edge, exit: spokeAnchor, enter: hubAnchor, route: 'line' };
  });
}
