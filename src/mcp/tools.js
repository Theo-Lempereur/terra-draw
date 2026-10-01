// Logique des outils MCP, en fonctions pures testables sans transport stdio.
// Rien ici ne réimplémente le moteur : on construit ou on édite un objet plan
// (le même format pivot que le CLI lit), puis on délègue toute la validation
// et tout le rendu à src/validate.js et src/render.js.
import path from 'node:path';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { stringify as stringifyYaml } from 'yaml';
import { renderDiagram } from '../render.js';
import { validateDiagram, isLegacyDiagram } from '../validate.js';
import { readSource, formatFor } from '../source.js';
import { listTemplates, listIcons, resolveIcons } from '../introspect.js';

const SCALAR_SET_FIELDS = ['title', 'subtitle', 'eyebrow', 'mode', 'footer'];

function slugId(title, fallback) {
  const base = String(title ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const slug = /^[a-z]/.test(base) ? base : `item-${base}`.replace(/-+$/, '');
  return (slug || fallback).slice(0, 48);
}

function uniqueId(title, used, index) {
  let id = slugId(title, `item-${index + 1}`);
  let suffix = 2;
  while (used.has(id)) { id = `${slugId(title, `item-${index + 1}`)}-${suffix}`; suffix += 1; }
  used.add(id);
  return id;
}

/** Transforme une liste courte d'éléments en nodes, pour les modèles où l'ordre suffit à déduire les rôles. */
function skeletonNodesFromBrief(template, brief) {
  if (!Array.isArray(brief) || !brief.length) throw new Error('brief : un tableau non vide est attendu (chaînes ou objets { title, icon, body }).');
  const items = brief.map((entry, index) => {
    if (typeof entry === 'string') return { title: entry };
    if (entry && typeof entry === 'object' && typeof entry.title === 'string') return entry;
    throw new Error(`brief[${index}] : attendu une chaîne ou un objet { title, icon?, body? }.`);
  });
  const used = new Set();
  const toNode = (item, index, role) => ({
    id: uniqueId(item.title, used, index), title: item.title, role,
    ...(item.icon !== undefined && { icon: item.icon }),
    ...(item.body !== undefined && { body: item.body }),
    ...(item.badge !== undefined && { badge: item.badge }),
    ...(item.tone !== undefined && { tone: item.tone })
  });

  if (template === 'flow') {
    if (items.length < 2 || items.length > 8) throw new Error(`brief : le modèle flow attend de 2 à 8 étapes (reçu : ${items.length}).`);
    return items.map((item, index) => toNode(item, index, 'step'));
  }
  if (template === 'hub-and-spoke') {
    if (items.length < 3) throw new Error(`brief : le modèle hub-and-spoke attend un centre (brief[0]) et au moins deux satellites (reçu ${items.length} élément(s) au total).`);
    if (items.length > 11) throw new Error(`brief : au plus dix satellites (reçu ${items.length - 1}).`);
    const [hub, ...spokes] = items;
    return [toNode(hub, 0, 'hub'), ...spokes.map((item, index) => toNode(item, index + 1, 'spoke'))];
  }
  throw new Error(`brief : non supporté pour le modèle « ${template} » — ambigu sans structure explicite. Fournir nodes (et groups pour comparison, table pour cards-table) directement.`);
}

async function writePlan(targetPath, plan, format, { overwrite }) {
  const absolute = path.resolve(targetPath);
  if (!overwrite) {
    const exists = await stat(absolute).then(() => true, () => false);
    if (exists) throw new Error(`Le fichier existe déjà : ${targetPath}. Passer overwrite:true pour le remplacer.`);
  }
  await mkdir(path.dirname(absolute), { recursive: true });
  const serialized = format === 'json' ? `${JSON.stringify(plan, null, 2)}\n` : stringifyYaml(plan);
  await writeFile(absolute, serialized);
  return absolute;
}

function summarize(absolutePath, format, validated) {
  return {
    path: absolutePath, format, template: validated.template, mode: validated.mode,
    nodes: validated.nodes.length, edges: validated.edges.length, groups: validated.groups.length,
    table: Boolean(validated.table)
  };
}

/**
 * Crée un nouveau fichier de plan. Deux façons de décrire le contenu, non combinables :
 * - paramètres structurés (nodes, groups, edges, table, …) — le format pivot tel quel ;
 * - brief : une liste courte d'éléments, pour flow (étapes dans l'ordre) et hub-and-spoke
 *   (brief[0] devient le hub). Squelette déterministe, pas de génération par un modèle IA.
 */
export async function createDiagram(input) {
  const { path: targetPath, template, title, overwrite = false, brief, nodes, ...rest } = input ?? {};
  if (!targetPath) throw new Error('path est obligatoire : chemin du fichier de plan à créer (.json ou .yaml).');
  if (!template) throw new Error('template est obligatoire : comparison, hub-and-spoke, flow ou cards-table.');
  if (!title) throw new Error('title est obligatoire.');
  const format = formatFor(targetPath);
  if (brief !== undefined && nodes !== undefined) throw new Error('create_diagram : fournir soit brief, soit nodes — pas les deux.');
  const resolvedNodes = brief !== undefined ? skeletonNodesFromBrief(template, brief) : nodes;
  if (!resolvedNodes || !resolvedNodes.length) throw new Error('create_diagram : fournir nodes (paramètres structurés) ou brief (liste courte d’éléments).');

  const plan = { version: 1, template, title, nodes: resolvedNodes };
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) plan[key] = value;
  }

  const validated = validateDiagram(plan);
  const absolute = await writePlan(targetPath, plan, format, { overwrite });
  return summarize(absolute, format, validated);
}

/** Rend un plan existant en HTML/PNG/PDF/manifest via le moteur de rendu (Chromium hors ligne). */
export async function renderDiagramTool(input) {
  const { source, outDir, mode, formats, width, scale } = input ?? {};
  if (!source) throw new Error('source est obligatoire : chemin du plan à rendre (.json ou .yaml).');
  if (!outDir) throw new Error('outDir est obligatoire : dossier qui recevra diagram.html / diagram.png / diagram.pdf / manifest.json.');
  const { outDir: absoluteOutDir, manifest } = await renderDiagram({ source, outDir, mode, formats, width, scale });
  return {
    outDir: absoluteOutDir,
    manifestPath: path.join(absoluteOutDir, 'manifest.json'),
    files: manifest.files.map(file => ({ ...file, path: path.join(absoluteOutDir, file.path) })),
    template: manifest.template,
    mode: manifest.mode,
    icons: manifest.icons,
    render: manifest.render
  };
}

/** Remplace entièrement une collection (tableau donné), ou l'édite via { upsert, remove } indexé par id. */
function applyCollection(plan, key, spec) {
  if (Array.isArray(spec)) { plan[key] = spec; return; }
  if (!spec || typeof spec !== 'object') throw new Error(`update_diagram : ${key} doit être un tableau (remplacement complet) ou un objet { upsert, remove }.`);
  const { upsert, remove } = spec;
  if (upsert === undefined && remove === undefined) throw new Error(`update_diagram : ${key} attend upsert et/ou remove (ou un tableau pour remplacer entièrement).`);
  const current = Array.isArray(plan[key]) ? [...plan[key]] : [];
  if (remove !== undefined) {
    if (!Array.isArray(remove)) throw new Error(`update_diagram : ${key}.remove doit être un tableau d’identifiants.`);
    for (const id of remove) {
      const index = current.findIndex(item => item.id === id);
      if (index === -1) throw new Error(`update_diagram : ${key}.remove — identifiant inconnu « ${id} ».`);
      current.splice(index, 1);
    }
  }
  if (upsert !== undefined) {
    if (!Array.isArray(upsert)) throw new Error(`update_diagram : ${key}.upsert doit être un tableau d’objets avec un id.`);
    for (const patch of upsert) {
      if (!patch || typeof patch !== 'object' || !patch.id) throw new Error(`update_diagram : ${key}.upsert — chaque élément doit avoir un id.`);
      const index = current.findIndex(item => item.id === patch.id);
      if (index === -1) current.push(patch);
      else current[index] = { ...current[index], ...patch };
    }
  }
  plan[key] = current;
}

/** Même logique que applyCollection, mais les edges sont identifiées par la paire (from, to). */
function applyEdges(plan, spec) {
  if (plan.connectors && !plan.edges) { plan.edges = plan.connectors; delete plan.connectors; }
  if (Array.isArray(spec)) { plan.edges = spec; return; }
  if (!spec || typeof spec !== 'object') throw new Error('update_diagram : edges doit être un tableau (remplacement complet) ou un objet { upsert, remove }.');
  const { upsert, remove } = spec;
  if (upsert === undefined && remove === undefined) throw new Error('update_diagram : edges attend upsert et/ou remove (ou un tableau pour remplacer entièrement).');
  const current = Array.isArray(plan.edges) ? [...plan.edges] : [];
  const key = edge => `${edge?.from}>${edge?.to}`;
  if (remove !== undefined) {
    if (!Array.isArray(remove)) throw new Error('update_diagram : edges.remove doit être un tableau de { from, to }.');
    for (const ref of remove) {
      const index = current.findIndex(edge => key(edge) === key(ref));
      if (index === -1) throw new Error(`update_diagram : edges.remove — flèche inconnue « ${ref?.from} » → « ${ref?.to} ».`);
      current.splice(index, 1);
    }
  }
  if (upsert !== undefined) {
    if (!Array.isArray(upsert)) throw new Error('update_diagram : edges.upsert doit être un tableau de flèches { from, to, … }.');
    for (const patch of upsert) {
      if (!patch || !patch.from || !patch.to) throw new Error('update_diagram : edges.upsert — chaque flèche doit avoir from et to.');
      const index = current.findIndex(edge => key(edge) === key(patch));
      if (index === -1) current.push(patch);
      else current[index] = { ...current[index], ...patch };
    }
  }
  plan.edges = current;
}

/**
 * Applique des modifications explicites à un plan existant : champs scalaires (set), canvas
 * (fusion), nodes/groups/edges (remplacement ou upsert+remove par id), table/badges/notes/legend/
 * exports (remplacement complet, ou null pour retirer table/exports). Toute autre forme de
 * modification est refusée avec une erreur, plutôt que d'être interprétée.
 */
export async function updateDiagram(input) {
  const { source, set, canvas, groups, nodes, edges, table, badges, notes, legend, exports: exportsField, out, overwrite = true } = input ?? {};
  if (!source) throw new Error('source est obligatoire : chemin du plan existant à modifier.');
  const absoluteSource = path.resolve(source);
  const { data, format } = await readSource(absoluteSource);
  if (isLegacyDiagram(data)) throw new Error('update_diagram : le format historique (étape 1, champs agent/branches) n’est pas modifiable directement — recréer le plan au format pivot (version 1) puis réessayer.');
  const plan = structuredClone(data);

  if (set !== undefined) {
    if (!set || typeof set !== 'object' || Array.isArray(set)) throw new Error('update_diagram : set doit être un objet { title?, subtitle?, eyebrow?, mode?, footer? }.');
    for (const [field, value] of Object.entries(set)) {
      if (!SCALAR_SET_FIELDS.includes(field)) throw new Error(`update_diagram : champ « ${field} » non supporté dans set (attendus : ${SCALAR_SET_FIELDS.join(', ')}).`);
      plan[field] = value;
    }
  }
  if (canvas !== undefined) plan.canvas = { ...(plan.canvas ?? {}), ...canvas };
  if (groups !== undefined) applyCollection(plan, 'groups', groups);
  if (nodes !== undefined) applyCollection(plan, 'nodes', nodes);
  if (edges !== undefined) applyEdges(plan, edges);
  if (table !== undefined) { if (table === null) delete plan.table; else plan.table = table; }
  if (badges !== undefined) plan.badges = badges;
  if (notes !== undefined) plan.notes = notes;
  if (legend !== undefined) plan.legend = legend;
  if (exportsField !== undefined) { if (exportsField === null) delete plan.exports; else plan.exports = exportsField; }

  const validated = validateDiagram(plan);
  const targetPath = out ? path.resolve(out) : absoluteSource;
  const targetFormat = out ? formatFor(targetPath) : format;
  const absolute = await writePlan(targetPath, plan, targetFormat, { overwrite: out ? overwrite : true });
  return summarize(absolute, targetFormat, validated);
}

export { listTemplates, listIcons, resolveIcons };
