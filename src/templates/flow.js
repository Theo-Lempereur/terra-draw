export const meta = {
  name: 'flow',
  summary: 'Une suite d’étapes de gauche à droite, avec phases optionnelles.',
  roles: { step: 'étape, de 2 à 8, dans l’ordre de nodes' },
  needs: 'groups optionnel : des phases qui regroupent des étapes consécutives. Au-delà de 5 étapes, élargir canvas.width.'
};

const pad = index => String(index + 1).padStart(2, '0');

export function body({ plan, card, escape, density }) {
  const steps = plan.nodes;
  const phased = plan.groups.length > 0 && steps.every(node => node.group);
  const phases = phased
    ? plan.groups.map(group => ({ ...group, span: steps.filter(node => node.group === group.id).length }))
    : [];
  return `<section class="frame flow-frame" aria-label="Suite d’étapes">
<svg class="connectors" role="img" aria-label="Flèches entre les étapes"></svg>
<div class="flow-grid${phased ? ' phased' : ''}" style="--cols:${steps.length}">
${phases.map(phase => `<div class="phase tone-${phase.tone}" style="grid-column:span ${phase.span}"><span class="phase-title">${escape(phase.title)}</span>${phase.description && density.bodies ? `<span class="phase-note">${escape(phase.description)}</span>` : ''}</div>`).join('')}
${steps.map((node, index) => card(node, { kind: 'step-card', number: pad(index) })).join('')}
</div>
</section>`;
}

export function connectors(plan) {
  return plan.edges.map(edge => (edge.back
    // A loop leaves underneath the row so it never crosses a card.
    ? { ...edge, exit: 'bottom', enter: 'bottom', route: 'vh', bus: 34 }
    : { ...edge, exit: 'right', enter: 'left', route: 'line' }));
}
