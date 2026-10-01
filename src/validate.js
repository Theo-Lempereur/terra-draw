import { readFileSync } from 'node:fs';
import Ajv from 'ajv';

export const schema = JSON.parse(readFileSync(new URL('../schema/diagram.schema.json', import.meta.url), 'utf8'));
const check = new Ajv({ allErrors: true }).compile(schema);

export function validateDiagram(diagram) {
  if (!check(diagram)) {
    throw new Error(`Diagramme invalide : ${check.errors.map(e => `${e.instancePath || '/'} ${e.message}`).join('; ')}`);
  }
  const rows = new Map([[diagram.agent.id, 0]]);
  const owners = new Map();
  diagram.branches.forEach((branch, branchIndex) => {
    [...branch.cards, ...branch.tools].forEach((card, index) => {
      if (rows.has(card.id)) throw new Error(`Identifiant dupliqué : ${card.id}`);
      rows.set(card.id, index < branch.cards.length ? index + 1 : branch.cards.length + 1);
      owners.set(card.id, branchIndex);
    });
  });
  const edges = new Set();
  for (const edge of diagram.connectors) {
    if (!rows.has(edge.from) || !rows.has(edge.to)) throw new Error(`Connecteur inconnu : ${edge.from} → ${edge.to}`);
    if (rows.get(edge.from) >= rows.get(edge.to)) throw new Error(`Le modèle comparison exige des connecteurs descendants : ${edge.from} → ${edge.to}`);
    if (rows.get(edge.to) !== rows.get(edge.from) + 1 || (edge.from !== diagram.agent.id && owners.get(edge.from) !== owners.get(edge.to))) {
      throw new Error(`Connecter uniquement les étapes successives d’une même branche (ou l’agent à sa première carte) : ${edge.from} → ${edge.to}`);
    }
    const key = `${edge.from}:${edge.to}`;
    if (edges.has(key)) throw new Error(`Connecteur dupliqué : ${key}`);
    edges.add(key);
  }
  return diagram;
}
