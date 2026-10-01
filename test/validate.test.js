import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateDiagram, fromLegacy, isLegacyDiagram, TEMPLATES, MODES } from '../src/validate.js';
import { parseSource } from '../src/source.js';

const read = async name => JSON.parse(await readFile(fileURLToPath(new URL(`../examples/${name}`, import.meta.url)), 'utf8'));
const comparison = await read('mcp-vs-api.json');
const hub = await read('agent-outils.json');
const cards = await read('exports-terra-draw.json');
const legacy = await read('legacy/mcp-vs-api-etape-1.json');
const flow = parseSource(await readFile(fileURLToPath(new URL('../examples/pipeline-terra-draw.yaml', import.meta.url)), 'utf8'), 'yaml');

/** Mutate a deep copy of a valid plan and expect a readable message. */
function rejects(base, mutate, pattern) {
  const plan = structuredClone(base);
  mutate(plan);
  assert.throws(() => validateDiagram(plan), error => {
    assert.match(error.message, pattern, `message inattendu : ${error.message}`);
    return true;
  });
}

test('les quatre exemples produisent un plan normalisé', () => {
  for (const [example, template] of [[comparison, 'comparison'], [hub, 'hub-and-spoke'], [flow, 'flow'], [cards, 'cards-table']]) {
    const plan = validateDiagram(example);
    assert.equal(plan.template, template);
    assert.ok(Object.hasOwn(MODES, plan.mode));
    assert.equal(plan.density, MODES[plan.mode]);
    assert.ok(plan.nodes.every(node => TEMPLATES[template].roles.includes(node.role)), 'un role est hors du modèle');
    assert.ok(plan.nodes.every(node => node.tone), 'une teinte n’a pas été résolue');
    assert.ok(plan.edges.every(edge => edge.tone && typeof edge.dashed === 'boolean'));
  }
});

test('le plan de l’étape 1 est converti sans perte vers le format pivot', () => {
  assert.ok(isLegacyDiagram(legacy));
  assert.ok(!isLegacyDiagram(comparison));
  const converted = validateDiagram(legacy);
  const migrated = validateDiagram(comparison);
  // Les identifiants de groupe ont été renommés en migrant l’exemple ; tout le
  // reste doit rester strictement identique, sinon le rendu a régressé.
  const strip = plan => ({
    ...plan,
    groups: plan.groups.map(group => ({ ...group, id: null })),
    nodes: plan.nodes.map(node => ({ ...node, group: node.group ? null : undefined }))
  });
  assert.deepEqual(strip(converted), strip(migrated));
  assert.equal(converted.table.columns.join(' | '), 'En pratique | API directe | MCP');
  assert.equal(converted.notes.length, 1);
  assert.equal(fromLegacy(legacy).template, 'comparison');
});

test('mode : valeur par défaut et densités', () => {
  const plan = structuredClone(comparison);
  delete plan.mode;
  assert.equal(validateDiagram(plan).mode, 'balanced');
  assert.equal(MODES.visual.bodies, false);
  assert.equal(MODES.visual.table, false);
  assert.equal(MODES.self_explanatory.notes, 4);
  rejects(comparison, p => { p.mode = 'tres-visuel'; }, /mode.*valeur attendue parmi visual, balanced, self_explanatory/s);
});

test('schéma : champ manquant, champ inconnu, mauvais type, identifiant invalide', () => {
  rejects(comparison, p => { delete p.title; }, /champ obligatoire manquant « title »/);
  rejects(comparison, p => { delete p.nodes; }, /champ obligatoire manquant « nodes »/);
  rejects(comparison, p => { p.html = '<script>'; }, /champ inconnu « html »/);
  rejects(comparison, p => { p.nodes[0].titre = 'faute de frappe'; }, /champ inconnu « titre »/);
  rejects(comparison, p => { p.title = 42; }, /type attendu string/);
  rejects(comparison, p => { p.nodes[0].id = 'Agent_1'; }, /identifiant invalide/);
  rejects(comparison, p => { p.version = 2; }, /doit valoir 1/);
  rejects(comparison, p => { p.template = 'mindmap'; }, /valeur attendue parmi comparison, hub-and-spoke, flow, cards-table/);
  rejects(comparison, p => { p.nodes[0].tone = 'fuchsia'; }, /valeur attendue parmi amber, green, purple, blue, rose, neutral/);
  rejects(comparison, p => { p.title = 'x'.repeat(400); }, /320 caractères maximum/);
  rejects(comparison, p => { p.nodes = []; }, /au moins 1 élément/);
});

test('schéma : plusieurs erreurs sont listées ensemble', () => {
  const plan = structuredClone(comparison);
  delete plan.title;
  plan.version = 9;
  plan.oups = true;
  assert.throws(() => validateDiagram(plan), error => {
    const lines = error.message.split('\n').filter(line => line.startsWith('  - '));
    assert.ok(lines.length >= 3, `attendu au moins 3 erreurs, reçu :\n${error.message}`);
    return true;
  });
});

test('références : nodes, groupes et flèches inconnus', () => {
  rejects(comparison, p => { p.edges[0].to = 'nexiste-pas'; }, /le node « nexiste-pas » n’existe pas.*Identifiants connus/s);
  rejects(comparison, p => { p.edges[0].from = 'nexiste-pas'; }, /le node « nexiste-pas » n’existe pas/);
  rejects(comparison, p => { p.nodes[1].group = 'autre'; }, /groupe « autre » introuvable.*déclarés/s);
  rejects(comparison, p => { p.nodes[2].id = p.nodes[1].id; }, /Identifiant dupliqué/);
  rejects(comparison, p => { p.edges.push({ ...p.edges[0] }); }, /Flèche dupliquée/);
  rejects(comparison, p => { p.edges[0] = { from: 'agent', to: 'agent' }; }, /ne peut pas se relier à lui-même/);
  rejects(comparison, p => { p.connectors = p.edges; }, /edges et connectors sont deux noms du même champ/);
});

test('règles propres à chaque modèle', () => {
  rejects(comparison, p => { p.edges[2].to = 'mcp-server'; }, /étapes successives d’une même colonne/);
  rejects(comparison, p => { p.groups.pop(); }, /attend exactement deux colonnes dans groups/);
  rejects(comparison, p => { p.nodes[0].role = 'step'; }, /doit déclarer un group/);
  rejects(comparison, p => { p.nodes[1].role = 'hub'; }, /role « hub » inconnu pour le modèle comparison/);

  rejects(hub, p => { p.nodes[1].role = 'hub'; }, /exactement un node role "hub" : 2 trouvé/);
  rejects(hub, p => { p.edges[0] = { from: 'github', to: 'gmail' }; }, /relie le hub à ses satellites/);
  rejects(hub, p => { p.groups = [{ id: 'g', title: 'G' }]; }, /hub-and-spoke attend aucun groupe/);

  rejects(flow, p => { p.edges.push({ from: 'brief', to: 'exports' }); }, /étapes consécutives, ou revient vers une étape antérieure/);
  rejects(cards, p => { p.edges = [{ from: 'html', to: 'png' }]; }, /cards-table ne dessine pas de flèches/);
  rejects(cards, p => { delete p.table; }, /cards-table attend un bloc table/);
});

test('tableau : largeur des lignes et en-têtes', () => {
  rejects(cards, p => { p.table.rows[1].values.pop(); }, /2 valeur\(s\) alors que la première ligne en compte 3/);
  rejects(cards, p => { p.table.columns.pop(); }, /il en faut 4 \(étiquette \+ une par valeur\)/);
  const derived = structuredClone(comparison);
  delete derived.table.columns;
  assert.deepEqual(validateDiagram(derived).table.columns, ['En pratique', 'API directe', 'MCP']);
  const orphan = structuredClone(cards);
  delete orphan.table.columns;
  assert.throws(() => validateDiagram(orphan), /table.columns est obligatoire/);
});

test('les flèches sont déduites quand edges est absent', () => {
  const chain = structuredClone(flow);
  delete chain.edges;
  assert.deepEqual(validateDiagram(chain).edges.map(edge => `${edge.from}>${edge.to}`),
    ['brief>plan', 'plan>validation', 'validation>rendu', 'rendu>exports']);

  const star = structuredClone(hub);
  delete star.edges;
  const spokes = validateDiagram(star).edges;
  assert.equal(spokes.length, 6);
  assert.ok(spokes.every(edge => edge.from === 'agent'));

  const columns = structuredClone(comparison);
  delete columns.edges;
  const derived = validateDiagram(columns).edges.map(edge => `${edge.from}>${edge.to}`);
  assert.ok(derived.includes('agent>direct-contract'));
  assert.ok(derived.includes('mcp-server>mcp-drive'));
  assert.equal(derived.length, comparison.edges.length);
});

test('YAML et JSON : syntaxe invalide signalée avec un repère', () => {
  assert.throws(() => parseSource('{bad', 'json', 'plan.json'), /JSON invalide dans plan.json/);
  assert.throws(() => parseSource('a:\n  - b\n -c: :', 'yaml', 'plan.yaml'), /YAML invalide dans plan.yaml/);
  assert.throws(() => parseSource('[1,2]', 'json', 'plan.json'), /doit contenir un objet de plan/);
  assert.deepEqual(parseSource('version: 1\ntitle: Test', 'yaml'), { version: 1, title: 'Test' });
});
