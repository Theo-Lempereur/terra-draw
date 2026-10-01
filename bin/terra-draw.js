#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { renderDiagram, validateSource } from '../src/render.js';
import { GENERATOR } from '../src/template.js';
import { MODES, TONES } from '../src/validate.js';
import { iconNames, iconAliases, iconPack } from '../src/icons.js';
import { SOURCE_EXTENSIONS } from '../src/source.js';
import { listTemplates } from '../src/introspect.js';

const USAGE = `terra-draw — schémas explicatifs locaux (${GENERATOR})

  terra-draw render <plan.json|plan.yaml> --out <dossier> [options]
  terra-draw validate <plan.json|plan.yaml>
  terra-draw templates [--json]
  terra-draw icons [--json]

Options de render
  --out <dossier>     Obligatoire. Reçoit diagram.html, diagram.png, diagram.pdf et manifest.json.
  --width <1200-2400> Largeur du canevas en px. Défaut : canvas.width du plan, sinon 1440.
  --scale <1|2|3>     Densité du PNG. Défaut : canvas.scale du plan, sinon 2.
  --mode <mode>       ${Object.keys(MODES).join(' | ')}. Remplace le champ mode du plan.
  --formats <liste>   Sous-ensemble de html,png,pdf. Défaut : exports.formats du plan.

Sources acceptées : ${SOURCE_EXTENSIONS.join(', ')}.
Succès : un objet JSON sur stdout. Erreur : message sur stderr et code de sortie 1.`;

function parseFormats(value) {
  const formats = value.split(',').map(part => part.trim()).filter(Boolean);
  if (!formats.length) throw new Error('--formats attend au moins un format parmi html,png,pdf.');
  return formats;
}

function optionalInteger(value, flag) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number)) throw new Error(`${flag} attend un entier (reçu : ${value}).`);
  return number;
}

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string' }, width: { type: 'string' }, scale: { type: 'string' },
      mode: { type: 'string' }, formats: { type: 'string' },
      json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }
    }
  });
  const [command, target] = positionals;

  if (values.help || !command) {
    console.log(USAGE);
  } else if (command === 'templates') {
    const listing = listTemplates();
    console.log(values.json
      ? JSON.stringify(listing, null, 2)
      : listing.map(entry => `${entry.template}\n  ${entry.summary}\n  roles : ${Object.entries(entry.roles).map(([role, help]) => `${role} (${help})`).join(' · ')}\n  ${entry.requirements}`).join('\n\n')
        + `\n\nmodes : ${Object.keys(MODES).join(', ')}\ntones : ${TONES.join(', ')}`);
  } else if (command === 'icons') {
    const pack = iconPack();
    if (values.json) {
      console.log(JSON.stringify({ pack: pack.id, license: pack.manifest.license, fallback: pack.manifest.fallback, icons: iconNames(), aliases: iconAliases() }, null, 2));
    } else {
      const aliases = iconAliases();
      console.log(`${pack.id} · licence ${pack.manifest.license} · ${iconNames().length} pictogrammes, ${Object.keys(aliases).length} alias`);
      console.log(`\nPictogrammes :\n  ${iconNames().join(' ')}`);
      console.log(`\nUn nom inconnu reçoit « ${pack.manifest.fallback} ». ${Object.keys(aliases).length} alias sont acceptés, par exemple : ${Object.keys(aliases).slice(0, 14).join(', ')}…`);
    }
  } else if (command === 'validate') {
    if (!target || positionals.length !== 2) throw new Error('Usage : terra-draw validate <plan.json|plan.yaml>');
    const { format, plan } = await validateSource(target);
    const summary = {
      valid: true, format, template: plan.template, mode: plan.mode,
      nodes: plan.nodes.length, edges: plan.edges.length, groups: plan.groups.length,
      table: Boolean(plan.table), notes: plan.notes.length, exports: plan.exports.formats
    };
    console.log(values.json ? JSON.stringify(summary, null, 2) : `Plan valide · ${format} · ${plan.template} · mode ${plan.mode} · ${plan.nodes.length} nodes · ${plan.edges.length} flèches`);
  } else if (command === 'render') {
    if (!target || positionals.length !== 2) throw new Error('Usage : terra-draw render <plan.json|plan.yaml> --out <dossier>');
    if (!values.out) throw new Error('--out <dossier> est obligatoire.');
    const result = await renderDiagram({
      source: target, outDir: values.out,
      width: optionalInteger(values.width, '--width'),
      scale: optionalInteger(values.scale, '--scale'),
      mode: values.mode,
      formats: values.formats === undefined ? undefined : parseFormats(values.formats)
    });
    console.log(JSON.stringify(result, null, 2));
  } else {
    throw new Error(`Commande inconnue : « ${command} ». Commandes : render, validate, templates, icons.`);
  }
} catch (error) {
  console.error(`terra-draw : ${error.message}`);
  process.exitCode = 1;
}
