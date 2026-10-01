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
import { validateDiagram } from '../src/validate.js';
import { renderDiagram } from '../src/render.js';
import { chromium } from '../src/browser.js';

const source = fileURLToPath(new URL('../examples/mcp-vs-api.json', import.meta.url));
const cli = fileURLToPath(new URL('../bin/terra-draw.js', import.meta.url));
const example = JSON.parse(await readFile(source, 'utf8'));
const exec = promisify(execFile);

test('validation : schéma, références, doublons et sens des connecteurs', () => {
  assert.equal(validateDiagram(example), example);
  const badVersion = structuredClone(example); badVersion.version = 2;
  assert.throws(() => validateDiagram(badVersion), /invalide/);
  const duplicate = structuredClone(example); duplicate.agent.id = duplicate.branches[0].cards[0].id;
  assert.throws(() => validateDiagram(duplicate), /dupliqué/);
  const unknown = structuredClone(example); unknown.connectors[0].to = 'missing';
  assert.throws(() => validateDiagram(unknown), /inconnu/);
  const reversed = structuredClone(example); reversed.connectors[0].from = 'direct-auth';
  assert.throws(() => validateDiagram(reversed), /descendants/);
  const crossing = structuredClone(example); crossing.connectors[2].to = 'mcp-server';
  assert.throws(() => validateDiagram(crossing), /même branche/);
  const extra = structuredClone(example); extra.html = '<script></script>';
  assert.throws(() => validateDiagram(extra), /invalide/);
});

test('CLI : paramètres invalides et JSON invalide → erreur sans export', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'terra-draw-cli-'));
  try {
    await assert.rejects(exec(process.execPath, [cli, 'render', source, '--out', path.join(dir, 'out'), '--width', 'nope']), error => error.code === 1 && /width/.test(error.stderr));
    await assert.rejects(exec(process.execPath, [cli, 'render', source, '--out', path.join(dir, 'out'), '--oops']), error => error.code === 1);
    const bad = path.join(dir, 'bad.json'); await writeFile(bad, '{bad');
    await assert.rejects(exec(process.execPath, [cli, 'render', bad, '--out', path.join(dir, 'out')]), error => /JSON invalide/.test(error.stderr));
    assert.deepEqual(await readdir(dir), ['bad.json']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('exports réels : CLI, PNG, PDF une page, SVG, autonomie et relance', { timeout: 90000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'terra-draw-export-'));
  let browser;
  try {
    const out = path.join(dir, 'render');
    const { stdout } = await exec(process.execPath, [cli, 'render', source, '--out', out, '--scale', '1']);
    const result = JSON.parse(stdout);
    const manifest = JSON.parse(await readFile(path.join(out, 'manifest.json'), 'utf8'));
    assert.deepEqual(result.manifest, manifest);
    assert.deepEqual((await readdir(out)).sort(), ['diagram.html', 'diagram.pdf', 'diagram.png', 'manifest.json']);
    for (const file of manifest.files) {
      const bytes = await readFile(path.join(out, file.path));
      assert.equal(bytes.length, file.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    }
    const png = await readFile(path.join(out, 'diagram.png'));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), manifest.render.width);
    assert.equal(png.readUInt32BE(20), manifest.render.height);
    const pdf = await PDFDocument.load(await readFile(path.join(out, 'diagram.pdf')));
    assert.equal(pdf.getPageCount(), 1);
    assert.ok(Math.abs(pdf.getPage(0).getWidth() - manifest.render.width * .75) < 1);
    assert.ok(Math.abs(pdf.getPage(0).getHeight() - manifest.render.height * .75) < 1);
    browser = await chromium.launch();
    const context = await browser.newContext({ javaScriptEnabled: false, offline: true });
    const page = await context.newPage();
    const requests = []; page.on('request', r => requests.push(r.url()));
    const html = await readFile(path.join(out, 'diagram.html'), 'utf8');
    await page.setContent(html); await page.evaluate(() => document.fonts.ready);
    assert.deepEqual(requests, []);
    assert.equal(await page.locator('.connectors > g').count(), example.connectors.length);
    assert.equal(await page.locator('[data-node]').count(), 11);
    assert.equal(await page.locator('h1').textContent(), example.title);
    assert.equal(await page.locator('script').count(), 0);
    const overflowing = await page.locator('.canvas, .card, .card-content, th, td').evaluateAll(nodes => nodes.filter(n => n.scrollWidth > n.clientWidth + 1).map(n => n.className));
    assert.deepEqual(overflowing, []);
    const second = await renderDiagram({ source, outDir: out, scale: 1 });
    assert.equal(second.manifest.files.find(f => f.path === 'diagram.html').sha256, manifest.files.find(f => f.path === 'diagram.html').sha256);
    assert.equal(second.manifest.files.find(f => f.path === 'diagram.png').sha256, manifest.files.find(f => f.path === 'diagram.png').sha256);
    await writeFile(path.join(out, 'personal.txt'), 'keep');
    await assert.rejects(renderDiagram({ source, outDir: out }), /non géré/);
    assert.equal(await readFile(path.join(out, 'personal.txt'), 'utf8'), 'keep');
  } finally { await browser?.close(); await rm(dir, { recursive: true, force: true }); }
});

test('texte non fiable échappé, icône inconnue et largeur minimale', { timeout: 45000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'terra-draw-escape-'));
  let browser;
  try {
    const diagram = structuredClone(example);
    diagram.title = '<img src="https://example.invalid" onerror="alert(1)">';
    diagram.agent.icon = '__proto__';
    const input = path.join(dir, 'input.json'); await writeFile(input, JSON.stringify(diagram));
    const { manifest } = await renderDiagram({ source: input, outDir: path.join(dir, 'output'), width: 1200, scale: 2 });
    browser = await chromium.launch(); const page = await browser.newPage();
    await page.setContent(await readFile(path.join(dir, 'output/diagram.html'), 'utf8'));
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('img, script').count(), 0);
    assert.equal(await page.locator('h1').textContent(), diagram.title);
    assert.equal(await page.locator('.agent .icon rect').count(), 1);
    assert.equal(await page.locator('.card-content').evaluateAll(nodes => nodes.some(n => n.scrollWidth > n.clientWidth + 1)), false);
    const png = await readFile(path.join(dir, 'output/diagram.png'));
    assert.equal(png.readUInt32BE(16), 2400);
    assert.equal(png.readUInt32BE(20), manifest.render.height * 2);
  } finally { await browser?.close(); await rm(dir, { recursive: true, force: true }); }
});
