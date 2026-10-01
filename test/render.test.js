import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { renderDiagram } from '../src/render.js';
import { readSource } from '../src/source.js';
import { validateDiagram } from '../src/validate.js';
import { chromium } from '../src/browser.js';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../bin/terra-draw.js', import.meta.url));
const example = name => fileURLToPath(new URL(`../examples/${name}`, import.meta.url));
const EXPORTS = ['diagram.html', 'diagram.pdf', 'diagram.png', 'manifest.json'];
const EXAMPLES = ['mcp-vs-api.json', 'agent-outils.json', 'pipeline-terra-draw.yaml', 'exports-terra-draw.json'];

const temp = async prefix => mkdtemp(path.join(tmpdir(), `terra-draw-${prefix}-`));

/** Load an exported page offline, with JavaScript disabled, as a reader would. */
async function openExport(browser, file) {
  const context = await browser.newContext({ javaScriptEnabled: false, offline: true });
  const page = await context.newPage();
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.setContent(await readFile(file, 'utf8'));
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  return { page, context, requests };
}

test('chaque exemple produit les quatre fichiers, lisibles et autonomes', { timeout: 300000 }, async () => {
  const dir = await temp('examples');
  let browser;
  try {
    browser = await chromium.launch();
    for (const name of EXAMPLES) {
      const source = example(name);
      const out = path.join(dir, name.replace(/\W/g, '-'));
      const { manifest } = await renderDiagram({ source, outDir: out, scale: 1 });
      const plan = validateDiagram((await readSource(source)).data);

      assert.deepEqual((await readdir(out)).sort(), EXPORTS, `${name} : fichiers produits`);
      assert.deepEqual(manifest.render.formats, ['html', 'png', 'pdf']);
      assert.equal(manifest.template, plan.template);
      assert.equal(manifest.icons.network, false);
      for (const file of manifest.files) {
        const bytes = await readFile(path.join(out, file.path));
        assert.ok(bytes.length > 0, `${name}/${file.path} est vide`);
        assert.equal(bytes.length, file.bytes);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
      }

      const png = await readFile(path.join(out, 'diagram.png'));
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
      assert.equal(png.readUInt32BE(16), manifest.render.width);
      assert.equal(png.readUInt32BE(20), manifest.render.height);

      const pdf = await PDFDocument.load(await readFile(path.join(out, 'diagram.pdf')));
      assert.equal(pdf.getPageCount(), 1, `${name} : le PDF doit tenir sur une page`);
      assert.ok(Math.abs(pdf.getPage(0).getWidth() - manifest.render.width * 0.75) < 1);
      assert.ok(Math.abs(pdf.getPage(0).getHeight() - manifest.render.height * 0.75) < 1);

      const html = await readFile(path.join(out, 'diagram.html'), 'utf8');
      assert.doesNotMatch(html, /(src|href)="https?:|url\(\s*["']?https?:/, `${name} : ressource distante dans le HTML`);
      const { page, context, requests } = await openExport(browser, path.join(out, 'diagram.html'));
      assert.deepEqual(requests, [], `${name} : requête réseau à l’ouverture`);
      assert.equal(await page.locator('script').count(), 0);
      assert.equal(await page.locator('[data-node]').count(), plan.nodes.length, `${name} : cartes manquantes`);
      assert.equal(await page.locator('.connectors > g').count(), plan.edges.length, `${name} : flèches manquantes`);
      assert.equal(await page.locator('h1').textContent(), plan.title);
      const overflowing = await page.locator('.canvas, .card, .card-text, .chip, .phase, th, td, .note')
        .evaluateAll(nodes => nodes.filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.className));
      assert.deepEqual(overflowing, [], `${name} : débordement horizontal`);
      await context.close();
    }
  } finally { await browser?.close(); await rm(dir, { recursive: true, force: true }); }
});

test('le plan de l’étape 1 rend exactement le même HTML que l’exemple migré', { timeout: 120000 }, async () => {
  const dir = await temp('legacy');
  try {
    const migrated = await renderDiagram({ source: example('mcp-vs-api.json'), outDir: path.join(dir, 'pivot'), scale: 1, formats: ['html'] });
    const legacy = await renderDiagram({ source: example('legacy/mcp-vs-api-etape-1.json'), outDir: path.join(dir, 'legacy'), scale: 1, formats: ['html'] });
    const sha = result => result.manifest.files.find(file => file.path === 'diagram.html').sha256;
    assert.equal(sha(legacy), sha(migrated), 'le format de l’étape 1 ne rend plus à l’identique');
    assert.equal(legacy.manifest.source.format, 'json');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('modes et formats : la densité et les exports demandés sont respectés', { timeout: 180000 }, async () => {
  const dir = await temp('modes');
  let browser;
  try {
    const source = example('mcp-vs-api.json');
    const visual = await renderDiagram({ source, outDir: path.join(dir, 'visual'), scale: 1, mode: 'visual', formats: ['html'] });
    assert.equal(visual.manifest.mode, 'visual');
    assert.deepEqual((await readdir(path.join(dir, 'visual'))).sort(), ['diagram.html', 'manifest.json']);
    assert.deepEqual(visual.manifest.render.formats, ['html']);

    browser = await chromium.launch();
    const { page, context } = await openExport(browser, path.join(dir, 'visual/diagram.html'));
    assert.equal(await page.locator('table').count(), 0, 'le mode visual ne doit pas afficher le tableau');
    assert.equal(await page.locator('.card p').count(), 0, 'le mode visual ne doit pas afficher les textes de carte');
    assert.ok(await page.locator('[data-node]').count() > 0);
    assert.equal(await page.locator('.canvas').getAttribute('data-mode'), 'visual');
    await context.close();

    const dense = await renderDiagram({ source, outDir: path.join(dir, 'dense'), scale: 1, mode: 'self_explanatory', formats: ['html'] });
    const opened = await openExport(browser, path.join(dir, 'dense/diagram.html'));
    assert.equal(await opened.page.locator('table').count(), 1);
    assert.ok(await opened.page.locator('.card p').count() > 0);
    assert.equal(dense.manifest.mode, 'self_explanatory');
    await opened.context.close();

    await assert.rejects(renderDiagram({ source, outDir: path.join(dir, 'x'), mode: 'enorme' }), /mode inconnu/);
    await assert.rejects(renderDiagram({ source, outDir: path.join(dir, 'x'), formats: ['svg'] }), /Format inconnu/);
  } finally { await browser?.close(); await rm(dir, { recursive: true, force: true }); }
});

test('CLI : commandes, erreurs d’usage et absence d’export en cas d’échec', { timeout: 120000 }, async () => {
  const dir = await temp('cli');
  try {
    const source = example('mcp-vs-api.json');
    const out = path.join(dir, 'render');
    const { stdout } = await exec(process.execPath, [cli, 'render', source, '--out', out, '--scale', '1']);
    const result = JSON.parse(stdout);
    assert.deepEqual(result.manifest, JSON.parse(await readFile(path.join(out, 'manifest.json'), 'utf8')));
    assert.deepEqual((await readdir(out)).sort(), EXPORTS);

    const templates = JSON.parse((await exec(process.execPath, [cli, 'templates', '--json'])).stdout);
    assert.deepEqual(templates.map(entry => entry.template).sort(), ['cards-table', 'comparison', 'flow', 'hub-and-spoke']);
    const icons = JSON.parse((await exec(process.execPath, [cli, 'icons', '--json'])).stdout);
    assert.ok(icons.icons.includes('generic') && icons.aliases.github === 'branch');
    const valid = JSON.parse((await exec(process.execPath, [cli, 'validate', example('pipeline-terra-draw.yaml'), '--json'])).stdout);
    assert.equal(valid.valid, true);
    assert.equal(valid.format, 'yaml');
    assert.match((await exec(process.execPath, [cli, '--help'])).stdout, /terra-draw render/);

    const fails = async (args, pattern) => assert.rejects(
      exec(process.execPath, [cli, ...args]),
      error => error.code === 1 && pattern.test(error.stderr) || assert.fail(`stderr inattendu : ${error.stderr}`)
    );
    await fails(['render', source, '--out', path.join(dir, 'ko'), '--width', 'nope'], /--width attend un entier/);
    await fails(['render', source, '--out', path.join(dir, 'ko'), '--width', '100'], /width doit être un entier entre 1200 et 2400/);
    await fails(['render', source, '--out', path.join(dir, 'ko'), '--scale', '7'], /scale doit être 1, 2 ou 3/);
    await fails(['render', source], /--out <dossier> est obligatoire/);
    await fails(['render', source, '--out', path.join(dir, 'ko'), '--oops'], /oops/);
    await fails(['rendre', source, '--out', path.join(dir, 'ko')], /Commande inconnue/);
    await fails(['render', path.join(dir, 'absent.json'), '--out', path.join(dir, 'ko')], /Source introuvable/);
    await fails(['render', example('mcp-vs-api.json').replace('.json', '.toml'), '--out', path.join(dir, 'ko')], /Extension non supportée/);

    const broken = path.join(dir, 'broken.json');
    await writeFile(broken, '{bad');
    await fails(['render', broken, '--out', path.join(dir, 'ko')], /JSON invalide/);
    const brokenYaml = path.join(dir, 'broken.yaml');
    await writeFile(brokenYaml, 'nodes:\n  - id: a\n   title: décalé');
    await fails(['render', brokenYaml, '--out', path.join(dir, 'ko')], /YAML invalide/);
    await fails(['validate', broken], /JSON invalide/);

    assert.deepEqual((await readdir(dir)).sort(), ['broken.json', 'broken.yaml', 'render'], 'un échec ne doit rien écrire');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('rendu reproductible et dossier de sortie protégé', { timeout: 180000 }, async () => {
  const dir = await temp('replace');
  try {
    const source = example('mcp-vs-api.json');
    const out = path.join(dir, 'out');
    const first = await renderDiagram({ source, outDir: out, scale: 1 });
    const second = await renderDiagram({ source, outDir: out, scale: 1 });
    for (const file of ['diagram.html', 'diagram.png']) {
      const sha = result => result.manifest.files.find(entry => entry.path === file).sha256;
      assert.equal(sha(second), sha(first), `${file} n’est pas déterministe`);
    }
    await writeFile(path.join(out, 'personnel.txt'), 'garder');
    await assert.rejects(renderDiagram({ source, outDir: out, scale: 1 }), /non géré par terra-draw/);
    assert.equal(await readFile(path.join(out, 'personnel.txt'), 'utf8'), 'garder');
    assert.ok((await readdir(out)).includes('diagram.png'), 'les exports précédents doivent survivre');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('texte non fiable échappé, icône inconnue signalée, largeur imposée', { timeout: 120000 }, async () => {
  const dir = await temp('escape');
  let browser;
  try {
    const plan = JSON.parse(await readFile(example('mcp-vs-api.json'), 'utf8'));
    plan.title = '<img src="https://exemple.invalide" onerror="alert(1)">';
    plan.nodes[0].icon = '__proto__';
    plan.footer = '</style><script>alert(2)</script>';
    const input = path.join(dir, 'input.json');
    await writeFile(input, JSON.stringify(plan));
    const { manifest } = await renderDiagram({ source: input, outDir: path.join(dir, 'out'), width: 1200, scale: 2 });
    assert.deepEqual(manifest.icons.fallback, ['proto'], 'une icône inconnue doit être signalée dans le manifest');

    browser = await chromium.launch();
    const { page, context, requests } = await openExport(browser, path.join(dir, 'out/diagram.html'));
    assert.deepEqual(requests, []);
    assert.equal(await page.locator('img, script').count(), 0);
    assert.equal(await page.locator('h1').textContent(), plan.title);
    assert.equal(await page.locator('footer span').first().textContent(), plan.footer);
    assert.equal(await page.locator('[data-node="agent"] .icon rect').count(), 1, 'le pictogramme générique doit être utilisé');
    await context.close();

    const png = await readFile(path.join(dir, 'out/diagram.png'));
    assert.equal(png.readUInt32BE(16), 2400);
    assert.equal(png.readUInt32BE(20), manifest.render.height * 2);
    assert.equal(manifest.render.width, 1200);
  } finally { await browser?.close(); await rm(dir, { recursive: true, force: true }); }
});
