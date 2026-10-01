#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { renderDiagram } from '../src/render.js';

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    out: { type: 'string' }, width: { type: 'string' }, scale: { type: 'string' }, help: { type: 'boolean', short: 'h' }
  } });
  if (values.help) {
    console.log('terra-draw render <diagram.json> --out <dossier> [--width 1440] [--scale 2]\nSortie : diagram.html, diagram.png, diagram.pdf, manifest.json\nLargeur : 1200–2400 px ; échelle PNG : 1, 2 ou 3.');
  } else {
    if (positionals.length !== 2 || positionals[0] !== 'render' || !values.out) throw new Error('Usage : terra-draw render <diagram.json> --out <dossier> [--width 1440] [--scale 2]');
    const result = await renderDiagram({ source: positionals[1], outDir: values.out, width: values.width === undefined ? 1440 : Number(values.width), scale: values.scale === undefined ? 2 : Number(values.scale) });
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  console.error(`terra-draw : ${error.message}`);
  process.exitCode = 1;
}
