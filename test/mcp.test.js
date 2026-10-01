import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  createDiagram, renderDiagramTool, updateDiagram, listTemplates, listIcons, resolveIcons
} from '../src/mcp/tools.js';

const temp = async prefix => mkdtemp(path.join(tmpdir(), `terra-draw-mcp-${prefix}-`));
const example = name => fileURLToPath(new URL(`../examples/${name}`, import.meta.url));
const server = fileURLToPath(new URL('../bin/terra-draw-mcp.js', import.meta.url));

test('list_templates et list_icons reflètent le moteur (4 modèles, pack vendoré)', () => {
  const templates = listTemplates();
  assert.deepEqual(templates.map(entry => entry.template).sort(), ['cards-table', 'comparison', 'flow', 'hub-and-spoke']);
  assert.ok(templates.every(entry => entry.roles && entry.requirements && entry.modes.length === 3));
  const icons = listIcons();
  assert.ok(icons.icons.includes('generic'));
  assert.equal(icons.aliases.github, 'branch');
});

test('resolve_icons : correspondance exacte, alias, repli sur generic', () => {
  const resolved = resolveIcons(['generic', 'github', 'nom-qui-nexiste-pas']);
  assert.deepEqual(resolved.map(entry => entry.resolved), ['generic', 'branch', 'generic']);
  assert.equal(resolved[0].fallback, false);
  assert.equal(resolved[1].alias, true);
  assert.equal(resolved[2].fallback, true);
});

test('create_diagram : brief déterministe pour flow et hub-and-spoke', async () => {
  const dir = await temp('create');
  try {
    const flowPath = path.join(dir, 'flow.json');
    const flow = await createDiagram({ path: flowPath, template: 'flow', title: 'T', brief: ['A', 'B', 'C'] });
    assert.equal(flow.nodes, 3);
    assert.equal(flow.edges, 2);
    const flowPlan = JSON.parse(await readFile(flowPath, 'utf8'));
    assert.deepEqual(flowPlan.nodes.map(node => node.role), ['step', 'step', 'step']);
    assert.ok(!Object.hasOwn(flowPlan, 'edges'), 'edges omis : déduits au rendu');

    const hubPath = path.join(dir, 'hub.json');
    const hub = await createDiagram({ path: hubPath, template: 'hub-and-spoke', title: 'T', brief: ['Centre', 'A', 'B'] });
    assert.equal(hub.nodes, 3);
    const hubPlan = JSON.parse(await readFile(hubPath, 'utf8'));
    assert.equal(hubPlan.nodes[0].role, 'hub');
    assert.ok(hubPlan.nodes.slice(1).every(node => node.role === 'spoke'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('create_diagram : erreurs claires et aucune écriture en cas d’échec', async () => {
  const dir = await temp('create-errors');
  try {
    const target = path.join(dir, 'plan.json');
    await assert.rejects(createDiagram({ path: target, template: 'flow', title: 'T', brief: ['A', 'B'], nodes: [] }),
      /fournir soit brief, soit nodes/);
    await assert.rejects(createDiagram({ path: target, template: 'comparison', title: 'T', brief: ['A', 'B'] }),
      /non supporté pour le modèle « comparison »/);
    await assert.rejects(createDiagram({ path: target, template: 'flow', title: 'T', brief: ['Une seule étape'] }),
      /2 à 8 étapes/);
    await assert.rejects(createDiagram({
      path: target, template: 'hub-and-spoke', title: 'T',
      nodes: [{ id: 'centre', title: 'Centre', role: 'hub' }]
    }), /hub-and-spoke attend au moins deux satellites/);
    await assert.rejects(readFile(target), /ENOENT/);

    await createDiagram({ path: target, template: 'flow', title: 'T', brief: ['A', 'B'] });
    await assert.rejects(createDiagram({ path: target, template: 'flow', title: 'T', brief: ['A', 'B'] }), /existe déjà/);
    await createDiagram({ path: target, template: 'flow', title: 'T2', brief: ['A', 'B', 'C'], overwrite: true });
    assert.equal(JSON.parse(await readFile(target, 'utf8')).title, 'T2');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('update_diagram : set, nodes.upsert/remove, et refus des champs ambigus', async () => {
  const dir = await temp('update');
  try {
    const target = path.join(dir, 'plan.json');
    await createDiagram({ path: target, template: 'flow', title: 'Départ', brief: ['A', 'B', 'C'] });

    const updated = await updateDiagram({ source: target, set: { title: 'Arrivée', mode: 'visual' } });
    assert.equal(updated.mode, 'visual');
    assert.equal(JSON.parse(await readFile(target, 'utf8')).title, 'Arrivée');

    await updateDiagram({ source: target, nodes: { upsert: [{ id: 'd', title: 'D' }] } });
    const withD = JSON.parse(await readFile(target, 'utf8'));
    assert.ok(withD.nodes.some(node => node.id === 'd'));

    await updateDiagram({ source: target, nodes: { remove: ['d'] } });
    const withoutD = JSON.parse(await readFile(target, 'utf8'));
    assert.ok(!withoutD.nodes.some(node => node.id === 'd'));

    await assert.rejects(updateDiagram({ source: target, nodes: { remove: ['zzz'] } }), /identifiant inconnu/);
    await assert.rejects(updateDiagram({ source: target, set: { inconnu: 1 } }), /champ « inconnu » non supporté/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('update_diagram : edges.upsert/remove sur des flèches explicites', async () => {
  const dir = await temp('update-edges');
  try {
    const target = path.join(dir, 'plan.json');
    await createDiagram({
      path: target, template: 'flow', title: 'Boucle',
      nodes: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }],
      edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]
    });

    const withLoop = await updateDiagram({ source: target, edges: { upsert: [{ from: 'c', to: 'a' }] } });
    assert.equal(withLoop.edges, 3);
    assert.ok(JSON.parse(await readFile(target, 'utf8')).edges.some(edge => edge.from === 'c' && edge.to === 'a'));

    const withoutLoop = await updateDiagram({ source: target, edges: { remove: [{ from: 'c', to: 'a' }] } });
    assert.equal(withoutLoop.edges, 2);

    await assert.rejects(updateDiagram({ source: target, edges: { remove: [{ from: 'x', to: 'y' }] } }), /flèche inconnue/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('update_diagram : refuse le format historique (étape 1)', async () => {
  const dir = await temp('update-legacy');
  try {
    const target = path.join(dir, 'legacy.json');
    await writeFile(target, await readFile(example('legacy/mcp-vs-api-etape-1.json'), 'utf8'));
    await assert.rejects(updateDiagram({ source: target, set: { title: 'x' } }), /format historique/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('render_diagram : rend réellement un plan et retourne des chemins absolus', { timeout: 120000 }, async () => {
  const dir = await temp('render');
  try {
    const outDir = path.join(dir, 'out');
    const result = await renderDiagramTool({ source: example('mcp-vs-api.json'), outDir, scale: 1, formats: ['html'] });
    assert.equal(result.outDir, path.resolve(outDir));
    assert.ok(result.files.every(file => path.isAbsolute(file.path)));
    assert.ok(result.files[0].path.startsWith(result.outDir));
    assert.match(await readFile(result.files[0].path, 'utf8'), /<!doctype html>/i);
    await assert.rejects(renderDiagramTool({ source: example('mcp-vs-api.json') }), /outDir est obligatoire/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('serveur MCP stdio : create_diagram puis render_diagram via un vrai processus', { timeout: 120000 }, async () => {
  const dir = await temp('stdio');
  const transport = new StdioClientTransport({ command: process.execPath, args: [server] });
  const client = new Client({ name: 'terra-draw-mcp-test', version: '0' });
  try {
    await client.connect(transport);

    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(tool => tool.name).sort(),
      ['create_diagram', 'list_icons', 'list_templates', 'render_diagram', 'resolve_icons', 'update_diagram']);

    const planPath = path.join(dir, 'plan.json');
    const created = await client.callTool({
      name: 'create_diagram',
      arguments: { path: planPath, template: 'hub-and-spoke', title: 'Test stdio', brief: ['Centre', 'A', 'B', 'C'] }
    });
    assert.equal(created.isError, undefined, created.content?.[0]?.text);

    const outDir = path.join(dir, 'out');
    const rendered = await client.callTool({ name: 'render_diagram', arguments: { source: planPath, outDir, scale: 1 } });
    assert.equal(rendered.isError, undefined, rendered.content?.[0]?.text);
    assert.deepEqual((await readdir(outDir)).sort(), ['diagram.html', 'diagram.pdf', 'diagram.png', 'manifest.json']);
    for (const file of rendered.structuredContent.files) {
      assert.ok(path.isAbsolute(file.path));
      assert.ok((await stat(file.path)).size > 0);
    }

    // outDir est requis par le schéma d'entrée zod : l'erreur vient du serveur
    // (validation de forme) avant même d'atteindre notre code (src/mcp/tools.js).
    const missingOutDir = await client.callTool({ name: 'render_diagram', arguments: { source: planPath } });
    assert.equal(missingOutDir.isError, true);
    assert.match(missingOutDir.content[0].text, /outDir/);

    const badTool = await client.callTool({ name: 'create_diagram', arguments: { path: planPath, title: 'x' } });
    assert.equal(badTool.isError, true);
  } finally {
    await client.close().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});
