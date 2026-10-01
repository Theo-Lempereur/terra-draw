import { readFile, writeFile, mkdir, mkdtemp, rm, rename, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from './browser.js';
import { readSource } from './source.js';
import { validateDiagram, MODES } from './validate.js';
import { renderHtml, templates, GENERATOR } from './template.js';
import { drawConnectors } from './connectors.js';
import { lineTones, PAPER } from './palette.js';

export const ARTIFACTS = { html: 'diagram.html', png: 'diagram.png', pdf: 'diagram.pdf' };
const MANIFEST = 'manifest.json';
const OWNED = new Set([...Object.values(ARTIFACTS), MANIFEST]);

async function claimOutputDir(outputPath, outDir) {
  try { await stat(outputPath); }
  catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  let owned = false;
  try {
    const previous = JSON.parse(await readFile(path.join(outputPath, MANIFEST), 'utf8'));
    const names = await readdir(outputPath);
    owned = String(previous.generator ?? '').startsWith('terra-draw/') && names.every(name => OWNED.has(name));
  } catch { /* Existing user files must never be overwritten. */ }
  if (!owned) throw new Error(`Dossier de sortie non géré par terra-draw : ${outDir}. Choisir un autre dossier.`);
  return true;
}

/**
 * Render a plan to a standalone HTML page plus the requested image exports.
 * Everything happens locally: Chromium is started offline and every request is
 * aborted, so a diagram can never pull a font, a logo or a stylesheet.
 */
export async function renderDiagram({ source, outDir, width, scale, mode, formats }) {
  if (!source || !outDir) throw new Error('source et outDir sont requis.');
  if (width !== undefined && (!Number.isInteger(width) || width < 1200 || width > 2400)) {
    throw new Error('width doit être un entier entre 1200 et 2400.');
  }
  if (scale !== undefined && ![1, 2, 3].includes(scale)) throw new Error('scale doit être 1, 2 ou 3.');
  const sourcePath = path.resolve(source);
  const outputPath = path.resolve(outDir);

  const replace = await claimOutputDir(outputPath, outDir);
  const { raw, format, data } = await readSource(sourcePath);
  // The mode only drives density, so it is overridden after validation: that
  // keeps --mode usable on plans written in the étape-1 format too.
  if (mode !== undefined && !Object.hasOwn(MODES, mode)) {
    throw new Error(`mode inconnu : « ${mode} ». Attendu : ${Object.keys(MODES).join(', ')}.`);
  }
  const validated = validateDiagram(data);
  const plan = mode === undefined ? validated : { ...validated, mode, density: MODES[mode] };
  const pageWidth = width ?? plan.canvas.width;
  const pngScale = scale ?? plan.canvas.scale;
  const wanted = formats ?? plan.exports.formats;
  for (const name of wanted) {
    if (!Object.hasOwn(ARTIFACTS, name)) throw new Error(`Format inconnu : « ${name} ». Attendu : ${Object.keys(ARTIFACTS).join(', ')}.`);
  }

  const { html: markup, icons } = renderHtml(plan, { width: pageWidth });
  const edges = templates[plan.template].connectors(plan);

  await mkdir(path.dirname(outputPath), { recursive: true });
  const staging = await mkdtemp(path.join(path.dirname(outputPath), '.terra-draw-'));
  let browser;
  try {
    try { browser = await chromium.launch({ headless: true }); }
    catch (error) {
      throw new Error(`Chromium indisponible. Exécuter npm run browser:install (ou npm run browser:install -- --with-deps). ${error.message}`);
    }
    const page = await browser.newPage({
      viewport: { width: pageWidth, height: 1000 }, deviceScaleFactor: pngScale,
      locale: 'fr-FR', timezoneId: 'UTC', colorScheme: 'light', reducedMotion: 'reduce'
    });
    // Defense in depth: rendering user data never needs an HTTP or file request.
    await page.route('**/*', route => route.abort());
    await page.setContent(markup, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const drawn = await page.evaluate(drawConnectors, { edges, strokeWidth: plan.density.strokeWidth, tones: lineTones(), halo: PAPER });
    if (drawn !== edges.length) throw new Error(`Flèches non dessinées : ${drawn} sur ${edges.length}. Vérifier les identifiants de edges.`);
    const height = await page.locator('.canvas').evaluate(node => Math.ceil(node.getBoundingClientRect().height));
    if (height > 12000) throw new Error('Diagramme trop haut (maximum 12000 px). Réduire le texte ou le nombre de nodes.');
    await page.setViewportSize({ width: pageWidth, height });
    await page.emulateMedia({ media: 'screen' });

    const produced = [];
    if (wanted.includes('html')) {
      await writeFile(path.join(staging, ARTIFACTS.html), await page.content());
      produced.push(ARTIFACTS.html);
    }
    if (wanted.includes('png')) {
      await page.screenshot({ path: path.join(staging, ARTIFACTS.png), fullPage: true });
      produced.push(ARTIFACTS.png);
    }
    if (wanted.includes('pdf')) {
      await page.pdf({
        path: path.join(staging, ARTIFACTS.pdf), width: `${pageWidth}px`, height: `${height}px`,
        printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, tagged: true
      });
      produced.push(ARTIFACTS.pdf);
    }

    const files = await Promise.all(produced.map(async file => {
      const bytes = await readFile(path.join(staging, file));
      if (!bytes.length) throw new Error(`Export vide : ${file}.`);
      return { path: file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    }));
    const manifest = {
      version: 1,
      generator: GENERATOR,
      template: plan.template,
      mode: plan.mode,
      source: { path: path.basename(sourcePath), format, sha256: createHash('sha256').update(raw).digest('hex') },
      plan: { title: plan.title, nodes: plan.nodes.length, edges: plan.edges.length, groups: plan.groups.length, table: Boolean(plan.table) },
      render: {
        width: pageWidth, height, scale: pngScale, locale: 'fr-FR', browser: browser.version(),
        formats: wanted.filter(name => produced.includes(ARTIFACTS[name])), network: false
      },
      icons,
      files
    };
    await writeFile(path.join(staging, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);

    if (replace) {
      const backup = `${staging}-previous`;
      await rename(outputPath, backup);
      try { await rename(staging, outputPath); }
      catch (error) { await rename(backup, outputPath); throw error; }
      await rm(backup, { recursive: true, force: true });
    } else {
      await rename(staging, outputPath);
    }
    return { outDir: outputPath, manifest };
  } finally {
    await browser?.close();
    await rm(staging, { recursive: true, force: true });
  }
}

/** Validate without rendering. Used by `terra-draw validate` and by the tests. */
export async function validateSource(source) {
  const { data, format } = await readSource(path.resolve(source));
  const plan = validateDiagram(data);
  return { format, plan };
}
