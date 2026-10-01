// Fast, offline sanity pass: syntax of every source file, integrity of the icon
// pack, agreement between the palette and the stylesheet, and validity of every
// example. No browser, no network — `npm test` covers the real rendering.
import { readdir, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { iconPack, iconNames, resolveIcon, FALLBACK_ICON } from '../src/icons.js';
import { PALETTE } from '../src/palette.js';
import { TEMPLATES, TONES } from '../src/validate.js';
import { templates } from '../src/template.js';
import { validateSource } from '../src/render.js';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const failures = [];
const ok = [];

const report = (label, problem) => (problem ? failures.push(`${label} : ${problem}`) : ok.push(label));

async function jsFiles(dir) {
  const entries = await readdir(path.join(root, dir), { withFileTypes: true, recursive: true });
  return entries.filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => path.relative(root, path.join(entry.parentPath ?? entry.path, entry.name)));
}

const sources = (await Promise.all(['bin', 'src', 'scripts', 'test'].map(jsFiles))).flat().sort();
for (const file of sources) {
  try { await exec(process.execPath, ['--check', path.join(root, file)]); report(`syntaxe ${file}`); }
  catch (error) { report(`syntaxe ${file}`, error.stderr.trim().split('\n')[0]); }
}

try {
  const pack = iconPack();
  report(`pack d’icônes (${iconNames().length} pictogrammes, ${pack.aliases.size} alias)`,
    resolveIcon('nom-qui-nexiste-pas').name === FALLBACK_ICON ? null : 'le repli ne renvoie pas generic');
} catch (error) { report('pack d’icônes', error.message); }

const css = await readFile(path.join(root, 'src/styles.css'), 'utf8');
for (const tone of TONES) {
  report(`tone ${tone}`, Object.hasOwn(PALETTE, tone) ? null : 'absent de src/palette.js');
}
report('palette et tones alignés',
  Object.keys(PALETTE).join() === TONES.join() ? null : `palette=${Object.keys(PALETTE)} tones=${TONES}`);
report('variables de teinte utilisées par la feuille de style',
  ['--accent', '--tint', '--border', '--wash', '--line'].every(variable => css.includes(variable)) ? null : 'une variable de teinte n’est pas lue');

for (const name of Object.keys(TEMPLATES)) {
  const template = templates[name];
  report(`modèle ${name}`, template && typeof template.body === 'function' && typeof template.connectors === 'function' && template.meta
    ? null : 'implémentation incomplète (body, connectors, meta)');
}

const exampleDir = path.join(root, 'examples');
const examples = (await readdir(exampleDir, { withFileTypes: true, recursive: true }))
  .filter(entry => entry.isFile() && /\.(json|ya?ml)$/.test(entry.name))
  .map(entry => path.relative(root, path.join(entry.parentPath ?? entry.path, entry.name)))
  .sort();
report('exemples présents', examples.length >= 4 ? null : `seulement ${examples.length} trouvé(s)`);
for (const example of examples) {
  try {
    const { plan } = await validateSource(path.join(root, example));
    report(`exemple ${example} (${plan.template}, mode ${plan.mode})`);
  } catch (error) { report(`exemple ${example}`, error.message.replaceAll('\n', ' ')); }
}

const covered = new Set();
for (const example of examples) {
  try { covered.add((await validateSource(path.join(root, example))).plan.template); } catch { /* already reported */ }
}
report('les quatre modèles sont illustrés',
  Object.keys(TEMPLATES).every(name => covered.has(name)) ? null : `manquant(s) : ${Object.keys(TEMPLATES).filter(name => !covered.has(name)).join(', ')}`);

console.log(ok.map(line => `  ok  ${line}`).join('\n'));
if (failures.length) {
  console.error(`\n${failures.length} problème(s) :\n${failures.map(line => `  KO  ${line}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`\n${ok.length} vérifications passées.`);
}
