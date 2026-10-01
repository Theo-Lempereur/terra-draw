// Render every example into dist/<nom>/. Used by `npm run example`, and by the
// preview server to prepare what it serves.
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderDiagram } from '../src/render.js';

const root = fileURLToPath(new URL('../', import.meta.url));

/** Examples kept in examples/ itself; examples/legacy/ holds compatibility fixtures. */
export async function listExamples() {
  const entries = await readdir(path.join(root, 'examples'), { withFileTypes: true });
  return entries
    .filter(entry => entry.isFile() && /\.(json|ya?ml)$/.test(entry.name))
    .map(entry => ({ name: entry.name.replace(/\.(json|ya?ml)$/, ''), source: path.join(root, 'examples', entry.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function renderExamples({ outRoot = path.join(root, 'dist'), scale, onProgress } = {}) {
  const rendered = [];
  for (const example of await listExamples()) {
    onProgress?.(example.name);
    const { manifest } = await renderDiagram({ source: example.source, outDir: path.join(outRoot, example.name), scale });
    rendered.push({ ...example, manifest });
  }
  return rendered;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const rendered = await renderExamples({ onProgress: name => process.stdout.write(`  rendu ${name}…\n`) });
    for (const { name, manifest } of rendered) {
      console.log(`${name} · ${manifest.template} · mode ${manifest.mode} · ${manifest.render.width}×${manifest.render.height} · ${manifest.files.map(file => file.path).join(', ')}`);
    }
    console.log(`\n${rendered.length} exemples rendus dans dist/.`);
  } catch (error) {
    console.error(`terra-draw examples : ${error.message}`);
    process.exitCode = 1;
  }
}
