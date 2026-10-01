import { readFileSync } from 'node:fs';
import Ajv from 'ajv';

export const schema = JSON.parse(readFileSync(new URL('../schema/diagram.schema.json', import.meta.url), 'utf8'));
export const legacySchema = JSON.parse(readFileSync(new URL('../schema/legacy-comparison.schema.json', import.meta.url), 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false });
const checkPivot = ajv.compile(schema);
const checkLegacy = ajv.compile(legacySchema);

export const TEMPLATES = {
  comparison: {
    label: 'comparison',
    summary: 'Deux chemins mis en regard, avec une entrée commune et un tableau de synthèse.',
    roles: ['source', 'step', 'tool'],
    defaultRole: 'step',
    groups: { min: 2, max: 2, label: 'exactement deux colonnes dans groups' },
    tableColumnsFromGroups: true
  },
  'hub-and-spoke': {
    label: 'hub-and-spoke',
    summary: 'Un élément central et les éléments qui l’entourent.',
    roles: ['hub', 'spoke'],
    defaultRole: 'spoke',
    groups: { min: 0, max: 0, label: 'aucun groupe' }
  },
  flow: {
    label: 'flow',
    summary: 'Une suite d’étapes de gauche à droite, avec phases optionnelles.',
    roles: ['step'],
    defaultRole: 'step',
    groups: { min: 0, max: 4, label: 'de 0 à 4 phases dans groups' }
  },
  'cards-table': {
    label: 'cards-table',
    summary: 'Une grille de cartes au-dessus d’un tableau de synthèse.',
    roles: ['card'],
    defaultRole: 'card',
    groups: { min: 0, max: 4, label: 'de 0 à 4 sections dans groups' },
    requiresTable: true,
    forbidsEdges: true
  }
};

export const MODES = {
  visual: { label: 'visual', bodies: false, table: false, notes: 1, legend: true, strokeWidth: 2.4, iconScale: 1.3 },
  balanced: { label: 'balanced', bodies: true, table: true, notes: 2, legend: true, strokeWidth: 1.8, iconScale: 1 },
  self_explanatory: { label: 'self_explanatory', bodies: true, table: true, notes: 4, legend: true, strokeWidth: 1.8, iconScale: 1, numbered: true }
};

export const TONES = ['amber', 'green', 'purple', 'blue', 'rose', 'neutral'];

const list = values => values.join(', ');

function valueAt(data, instancePath) {
  let current = data;
  for (const part of instancePath.split('/').slice(1)) {
    if (current === null || typeof current !== 'object') return undefined;
    current = current[part.replaceAll('~1', '/').replaceAll('~0', '~')];
  }
  return current;
}

function preview(value) {
  if (value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return ` (reçu : ${text.length > 60 ? `${text.slice(0, 57)}…` : text})`;
}

/** Turn an Ajv error into a sentence a human or an agent can act on. */
function describe(error, data) {
  const at = error.instancePath || '/';
  const got = () => preview(valueAt(data, error.instancePath));
  switch (error.keyword) {
    case 'required':
      return `${at} : champ obligatoire manquant « ${error.params.missingProperty} ».`;
    case 'additionalProperties':
      return `${at} : champ inconnu « ${error.params.additionalProperty} » — vérifier l’orthographe ou le retirer.`;
    case 'enum':
      return `${at} : valeur attendue parmi ${list(error.params.allowedValues)}${got()}.`;
    case 'const':
      return `${at} : doit valoir ${JSON.stringify(error.params.allowedValue)}${got()}.`;
    case 'type':
      return `${at} : type attendu ${error.params.type}${got()}.`;
    case 'pattern':
      return `${at} : identifiant invalide — minuscules, chiffres et tirets, commençant par une lettre (ex. mcp-server)${got()}.`;
    case 'minLength':
      return `${at} : texte vide interdit.`;
    case 'maxLength':
      return `${at} : ${error.params.limit} caractères maximum${got()}.`;
    case 'minItems':
      return `${at} : au moins ${error.params.limit} élément(s) attendu(s).`;
    case 'maxItems':
      return `${at} : ${error.params.limit} élément(s) maximum.`;
    case 'uniqueItems':
      return `${at} : doublon entre les positions ${error.params.i} et ${error.params.j}.`;
    default:
      return `${at} : ${error.message}.`;
  }
}

function fail(errors, data, kind) {
  const seen = new Set();
  const lines = [];
  for (const error of errors) {
    const line = describe(error, data);
    if (!seen.has(line)) { seen.add(line); lines.push(line); }
  }
  throw new Error(`Plan ${kind} invalide :\n${lines.map(line => `  - ${line}`).join('\n')}`);
}

export function isLegacyDiagram(input) {
  return Boolean(input) && typeof input === 'object' && (Object.hasOwn(input, 'agent') || Object.hasOwn(input, 'branches'));
}

/** Convert an étape-1 plan (agent / branches / connectors) into the pivot format. */
export function fromLegacy(input) {
  if (!checkLegacy(input)) fail(checkLegacy.errors, input, 'comparison (format étape 1)');
  const groups = input.branches.map((branch, index) => ({
    id: `group-${index + 1}`, title: branch.title, description: branch.description, tone: branch.tone
  }));
  const nodes = [{ ...input.agent, role: 'source', tone: 'purple' }];
  input.branches.forEach((branch, index) => {
    for (const card of branch.cards) nodes.push({ ...card, role: 'step', group: groups[index].id });
    for (const card of branch.tools) nodes.push({ ...card, role: 'tool', group: groups[index].id });
  });
  const plan = {
    version: 1, template: 'comparison', mode: 'balanced', title: input.title, nodes, edges: input.connectors, groups
  };
  if (input.subtitle) plan.subtitle = input.subtitle;
  if (input.eyebrow) plan.eyebrow = input.eyebrow;
  if (input.comparison) {
    plan.table = {
      eyebrow: 'CE QUI CHANGE',
      caption: 'Deux approches, des responsabilités différentes',
      columns: ['En pratique', ...input.branches.map(branch => branch.title)],
      rows: input.comparison
    };
  }
  if (input.annotation) plan.notes = [{ title: input.annotation.title, body: input.annotation.body }];
  if (input.footer) plan.footer = input.footer;
  return plan;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readGroups(plan, spec, template) {
  const groups = (plan.groups ?? []).map(group => ({ ...group }));
  const { min, max } = spec.groups;
  assert(groups.length >= min && groups.length <= max,
    `Le modèle ${template} attend ${spec.groups.label} ; ${groups.length} fourni(s).`);
  const ids = new Set();
  for (const group of groups) {
    assert(!ids.has(group.id), `Identifiant de groupe dupliqué : « ${group.id} ».`);
    ids.add(group.id);
  }
  return groups;
}

function readNodes(plan, spec, template, groups, accent) {
  const groupById = new Map(groups.map(group => [group.id, group]));
  const ids = new Set(groups.map(group => group.id));
  return plan.nodes.map((node, index) => {
    assert(!ids.has(node.id), `Identifiant dupliqué : « ${node.id} » (nodes[${index}]). Les nodes et les groups partagent le même espace de noms.`);
    ids.add(node.id);
    const role = node.role ?? spec.defaultRole;
    assert(spec.roles.includes(role),
      `Node « ${node.id} » : role « ${role} » inconnu pour le modèle ${template} (attendus : ${list(spec.roles)}).`);
    let group;
    if (node.group !== undefined) {
      group = groupById.get(node.group);
      assert(group, `Node « ${node.id} » : groupe « ${node.group} » introuvable${groups.length ? ` (déclarés : ${list(groups.map(g => g.id))})` : ' — aucun groups déclaré'}.`);
    }
    return {
      id: node.id, title: node.title, body: node.body, icon: node.icon, badge: node.badge,
      role, group: node.group, tone: node.tone ?? group?.tone ?? accent, index
    };
  });
}

function readTable(plan, spec, groups) {
  if (!plan.table) {
    assert(!spec.requiresTable, 'Le modèle cards-table attend un bloc table (columns + rows).');
    return null;
  }
  const width = plan.table.rows[0].values.length;
  plan.table.rows.forEach((row, index) => {
    assert(row.values.length === width,
      `table.rows[${index}] (« ${row.label} ») : ${row.values.length} valeur(s) alors que la première ligne en compte ${width}. Toutes les lignes doivent avoir la même largeur.`);
  });
  let columns = plan.table.columns;
  if (!columns && spec.tableColumnsFromGroups && groups.length === width) columns = ['En pratique', ...groups.map(group => group.title)];
  assert(columns, `table.columns est obligatoire : ${width + 1} en-têtes attendus (la première colonne titre les étiquettes de ligne).`);
  assert(columns.length === width + 1,
    `table.columns compte ${columns.length} en-tête(s) pour des lignes de ${width} valeur(s) : il en faut ${width + 1} (étiquette + une par valeur).`);
  return { eyebrow: plan.table.eyebrow, caption: plan.table.caption, columns, rows: plan.table.rows };
}

function rolesOf(nodes, role) {
  return nodes.filter(node => node.role === role);
}

function checkTemplateShape(template, nodes, groups) {
  if (template === 'comparison') {
    const sources = rolesOf(nodes, 'source');
    assert(sources.length <= 1, `Le modèle comparison accepte au plus un node role "source" : ${list(sources.map(n => n.id))}.`);
    assert(!sources[0]?.group, `Le node source « ${sources[0]?.id} » ne doit pas être rattaché à un groupe : il introduit les deux colonnes.`);
    for (const node of nodes) {
      if (node.role !== 'source') {
        assert(node.group, `Node « ${node.id} » : un node ${node.role} du modèle comparison doit déclarer un group (${list(groups.map(g => g.id))}).`);
      }
    }
    for (const group of groups) {
      assert(nodes.some(node => node.group === group.id && node.role === 'step'),
        `Le groupe « ${group.id} » n’a aucune étape : ajouter au moins un node role "step" rattaché à ce groupe.`);
    }
  }
  if (template === 'hub-and-spoke') {
    const hubs = rolesOf(nodes, 'hub');
    assert(hubs.length === 1, `Le modèle hub-and-spoke attend exactement un node role "hub" : ${hubs.length} trouvé(s).`);
    const spokes = rolesOf(nodes, 'spoke');
    assert(spokes.length >= 2, `Le modèle hub-and-spoke attend au moins deux satellites (role "spoke") : ${spokes.length} trouvé(s).`);
    assert(spokes.length <= 10, `Le modèle hub-and-spoke affiche au plus dix satellites : ${spokes.length} fourni(s).`);
  }
  if (template === 'flow') {
    assert(nodes.length >= 2, `Le modèle flow attend au moins deux étapes : ${nodes.length} fournie(s).`);
    assert(nodes.length <= 8, `Le modèle flow affiche au plus huit étapes : ${nodes.length} fournies. Regrouper des étapes ou passer à plusieurs schémas.`);
  }
  if (template === 'cards-table') {
    assert(nodes.length >= 2, `Le modèle cards-table attend au moins deux cartes : ${nodes.length} fournie(s).`);
  }
  if (groups.length) {
    const grouped = nodes.filter(node => node.role !== 'source');
    const withGroup = grouped.filter(node => node.group);
    assert(withGroup.length === grouped.length || withGroup.length === 0,
      `Groupes partiels : ${list(grouped.filter(node => !node.group).map(node => node.id))} n’ont pas de group alors que d’autres nodes en ont. Rattacher tous les nodes ou aucun.`);
    if (template !== 'comparison' && withGroup.length) {
      const order = withGroup.map(node => node.group);
      const seen = new Set();
      let previous;
      for (const id of order) {
        if (id !== previous) {
          assert(!seen.has(id), `Le groupe « ${id} » est interrompu : lister les nodes d’un même groupe les uns à la suite des autres.`);
          seen.add(id);
          previous = id;
        }
      }
    }
  }
}

/** Rank inside a comparison column: 0 for the source, 1..n for steps, n+1 for tools. */
function comparisonRanks(nodes, groups) {
  const ranks = new Map();
  for (const node of rolesOf(nodes, 'source')) ranks.set(node.id, 0);
  for (const group of groups) {
    const steps = nodes.filter(node => node.group === group.id && node.role === 'step');
    steps.forEach((node, index) => ranks.set(node.id, index + 1));
    for (const node of nodes.filter(n => n.group === group.id && n.role === 'tool')) ranks.set(node.id, steps.length + 1);
  }
  return ranks;
}

function deriveEdges(template, nodes, groups) {
  const edges = [];
  if (template === 'comparison') {
    const [source] = rolesOf(nodes, 'source');
    for (const group of groups) {
      const steps = nodes.filter(node => node.group === group.id && node.role === 'step');
      const tools = nodes.filter(node => node.group === group.id && node.role === 'tool');
      if (source && steps[0]) edges.push({ from: source.id, to: steps[0].id });
      for (let i = 0; i < steps.length - 1; i += 1) edges.push({ from: steps[i].id, to: steps[i + 1].id });
      const last = steps.at(-1);
      if (last) for (const tool of tools) edges.push({ from: last.id, to: tool.id });
    }
  }
  if (template === 'hub-and-spoke') {
    const [hub] = rolesOf(nodes, 'hub');
    for (const spoke of rolesOf(nodes, 'spoke')) edges.push({ from: hub.id, to: spoke.id });
  }
  if (template === 'flow') {
    for (let i = 0; i < nodes.length - 1; i += 1) edges.push({ from: nodes[i].id, to: nodes[i + 1].id });
  }
  return edges;
}

function readEdges(plan, spec, template, nodes, groups) {
  assert(!(plan.edges && plan.connectors), 'edges et connectors sont deux noms du même champ : n’en garder qu’un.');
  const declared = plan.edges ?? plan.connectors;
  if (spec.forbidsEdges) {
    assert(!declared?.length, `Le modèle ${template} ne dessine pas de flèches : retirer edges.`);
    return [];
  }
  const byId = new Map(nodes.map(node => [node.id, node]));
  const edges = (declared ?? deriveEdges(template, nodes, groups)).map(edge => ({ ...edge }));
  const seen = new Set();
  const ranks = template === 'comparison' ? comparisonRanks(nodes, groups) : null;
  for (const edge of edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    assert(from, `Flèche « ${edge.from} » → « ${edge.to} » : le node « ${edge.from} » n’existe pas. Identifiants connus : ${list([...byId.keys()])}.`);
    assert(to, `Flèche « ${edge.from} » → « ${edge.to} » : le node « ${edge.to} » n’existe pas. Identifiants connus : ${list([...byId.keys()])}.`);
    assert(edge.from !== edge.to, `Flèche « ${edge.from} » → « ${edge.to} » : un node ne peut pas se relier à lui-même.`);
    const key = `${edge.from}:${edge.to}`;
    assert(!seen.has(key), `Flèche dupliquée : « ${edge.from} » → « ${edge.to} ».`);
    seen.add(key);
    if (template === 'comparison') {
      const [a, b] = [ranks.get(from.id), ranks.get(to.id)];
      assert(b === a + 1 && (from.role === 'source' || from.group === to.group),
        `Flèche « ${edge.from} » → « ${edge.to} » : le modèle comparison relie des étapes successives d’une même colonne, ou le node source aux premières étapes.`);
    }
    if (template === 'hub-and-spoke') {
      assert(from.role === 'hub' || to.role === 'hub',
        `Flèche « ${edge.from} » → « ${edge.to} » : le modèle hub-and-spoke relie le hub à ses satellites, pas deux satellites entre eux.`);
    }
    if (template === 'flow') {
      assert(to.index === from.index + 1 || to.index < from.index,
        `Flèche « ${edge.from} » → « ${edge.to} » : le modèle flow relie deux étapes consécutives, ou revient vers une étape antérieure (boucle).`);
      edge.back = to.index < from.index;
    }
    edge.tone ??= from.tone;
    edge.dashed = Boolean(edge.dashed);
  }
  return edges;
}

/**
 * Validate a plan and return a normalised copy: defaults applied, tones resolved,
 * edges derived when omitted. Throws an Error whose message lists every problem.
 */
export function validateDiagram(input) {
  if (isLegacyDiagram(input)) return validateDiagram(fromLegacy(input));
  if (!checkPivot(input)) fail(checkPivot.errors, input, 'pivot v1');
  const template = input.template;
  const spec = TEMPLATES[template];
  const mode = input.mode ?? 'balanced';
  const canvas = {
    width: input.canvas?.width ?? 1440,
    scale: input.canvas?.scale ?? 2,
    accent: input.canvas?.accent ?? 'purple',
    edition: input.canvas?.edition ?? 'TERRA DRAW / EXPLAINER'
  };
  const groups = readGroups(input, spec, template);
  const nodes = readNodes(input, spec, template, groups, canvas.accent);
  checkTemplateShape(template, nodes, groups);
  const edges = readEdges(input, spec, template, nodes, groups);
  const table = readTable(input, spec, groups);
  return {
    version: 1,
    template,
    mode,
    density: MODES[mode],
    title: input.title,
    subtitle: input.subtitle,
    eyebrow: input.eyebrow,
    canvas,
    exports: { formats: input.exports?.formats ?? ['html', 'png', 'pdf'] },
    groups: groups.map(group => ({ ...group, tone: group.tone ?? canvas.accent })),
    nodes,
    edges,
    badges: (input.badges ?? []).map(badge => ({ ...badge, tone: badge.tone ?? canvas.accent })),
    notes: (input.notes ?? []).map(note => ({ ...note, tone: note.tone ?? 'neutral' })),
    table,
    legend: input.legend ?? [],
    footer: input.footer
  };
}
