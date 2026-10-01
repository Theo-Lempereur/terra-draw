import { readFile, writeFile, mkdir, mkdtemp, rm, rename, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from './browser.js';
import { validateDiagram } from './validate.js';
import { renderHtml, drawConnectors } from './template.js';

export async function renderDiagram({ source, outDir, width = 1440, scale = 2 }) {
  if (!source || !outDir) throw new Error('source et outDir sont requis.');
  if (!Number.isInteger(width) || width < 1200 || width > 2400) throw new Error('width doit être un entier entre 1200 et 2400.');
  if (![1, 2, 3].includes(scale)) throw new Error('scale doit être 1, 2 ou 3.');
  const sourcePath = path.resolve(source);
  const outputPath = path.resolve(outDir);
  let replace = false;
  try { await stat(outputPath); replace = true; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (replace) {
    let owned = false;
    try {
      const previous = JSON.parse(await readFile(path.join(outputPath, 'manifest.json'), 'utf8'));
      const names = await readdir(outputPath);
      owned = previous.generator === 'terra-draw/0.1.0' && names.every(name => ['diagram.html', 'diagram.png', 'diagram.pdf', 'manifest.json'].includes(name));
    } catch { /* Existing user files must never be overwritten. */ }
    if (!owned) throw new Error(`Dossier de sortie non géré par terra-draw : ${outDir}. Choisir un autre dossier.`);
  }
  const raw = await readFile(sourcePath, 'utf8');
  let diagram;
  try { diagram = JSON.parse(raw); } catch (error) { throw new Error(`JSON invalide dans ${source} : ${error.message}`); }
  validateDiagram(diagram);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const staging = await mkdtemp(path.join(path.dirname(outputPath), '.terra-draw-'));
  let browser;
  try {
    try { browser = await chromium.launch({ headless: true }); }
    catch (error) { throw new Error(`Chromium indisponible. Exécuter npm run browser:install (ou npm run browser:install -- --with-deps). ${error.message}`); }
    const page = await browser.newPage({ viewport: { width, height: 1000 }, deviceScaleFactor: scale, locale: 'fr-FR', timezoneId: 'UTC', colorScheme: 'light', reducedMotion: 'reduce' });
    // Defense in depth: rendering user data never needs an HTTP or file request.
    await page.route('**/*', route => route.abort());
    await page.setContent(renderHtml(diagram, width), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(drawConnectors, diagram.connectors);
    const height = await page.locator('.canvas').evaluate(node => Math.ceil(node.getBoundingClientRect().height));
    if (height > 12000) throw new Error('Diagramme trop haut (maximum 12000 px). Réduire le texte.');
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ media: 'screen' });
    const html = await page.content();
    await writeFile(path.join(staging, 'diagram.html'), html);
    await page.screenshot({ path: path.join(staging, 'diagram.png'), fullPage: true });
    await page.pdf({ path: path.join(staging, 'diagram.pdf'), width: `${width}px`, height: `${height}px`, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, tagged: true });
    const files = await Promise.all(['diagram.html', 'diagram.png', 'diagram.pdf'].map(async file => {
      const bytes = await readFile(path.join(staging, file));
      return { path: file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    }));
    const manifest = {
      version: 1, generator: 'terra-draw/0.1.0', template: diagram.template,
      source: { path: path.relative(path.dirname(sourcePath), sourcePath), sha256: createHash('sha256').update(raw).digest('hex') },
      render: { width, height, scale, locale: 'fr-FR', browser: browser.version(), formats: ['html', 'png', 'pdf'], network: false },
      files
    };
    await writeFile(path.join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
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
