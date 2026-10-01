// Local icon resolution. The pack lives in assets/icons/ and is read once per
// process: rendering a diagram never performs a network request for a logo.
import { readFileSync, readdirSync } from 'node:fs';

const packDir = new URL('../assets/icons/', import.meta.url);
export const FALLBACK_ICON = 'generic';

// Only self-closing geometric shapes are accepted, so a file dropped into the
// pack can never introduce a script, an external reference or raw text.
const SHAPES = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse']);
const ATTRS = new Set([
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height',
  'points', 'fill', 'fill-rule', 'clip-rule', 'opacity', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'
]);

export function shapesOf(markup, file) {
  const body = markup.match(/^\s*<svg\b[^>]*>([\s\S]*)<\/svg>\s*$/);
  if (!body) throw new Error(`Icône ${file} : un unique élément <svg> est attendu.`);
  const shapes = body[1].trim();
  const left = shapes.replace(/<([a-z]+)((?:\s+[a-z-]+="[^"<>]*")*)\s*\/>/g, (_match, tag, attrs) => {
    if (!SHAPES.has(tag)) throw new Error(`Icône ${file} : élément <${tag}> non autorisé (attendu : ${[...SHAPES].join(', ')}).`);
    for (const [, name] of attrs.matchAll(/\s+([a-z-]+)="/g)) {
      if (!ATTRS.has(name)) throw new Error(`Icône ${file} : attribut "${name}" non autorisé sur <${tag}>.`);
    }
    return '';
  }).trim();
  if (left !== '') throw new Error(`Icône ${file} : contenu non supporté (formes auto-fermantes uniquement) près de « ${left.slice(0, 40)} ».`);
  return shapes;
}

let pack;
export function iconPack() {
  if (pack) return pack;
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', packDir), 'utf8'));
  const shapes = new Map();
  for (const file of readdirSync(packDir).filter(name => name.endsWith('.svg')).sort()) {
    shapes.set(file.slice(0, -4), shapesOf(readFileSync(new URL(file, packDir), 'utf8'), file));
  }
  if (!shapes.has(FALLBACK_ICON)) throw new Error(`Pack d’icônes incomplet : ${FALLBACK_ICON}.svg est obligatoire.`);
  const aliases = new Map();
  for (const [alias, target] of Object.entries(manifest.aliases ?? {})) {
    if (!shapes.has(target)) throw new Error(`Alias d’icône "${alias}" : cible inconnue "${target}".`);
    if (shapes.has(alias)) throw new Error(`Alias d’icône "${alias}" : un fichier ${alias}.svg existe déjà.`);
    aliases.set(alias, target);
  }
  pack = { manifest, shapes, aliases, id: `${manifest.name}/${manifest.version}` };
  return pack;
}

/** Normalise a free-form name written by a human or an agent: "Google Drive" → "google-drive". */
export function normalizeIconName(name) {
  return String(name ?? '').trim().toLowerCase().replace(/[\s_.]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-{2,}/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

/** Resolve a requested name to a pack entry. Unknown names fall back instead of failing. */
export function resolveIcon(requested) {
  const { shapes, aliases } = iconPack();
  const key = normalizeIconName(requested);
  const name = shapes.has(key) ? key : aliases.get(key);
  if (name) return { requested: key, name, alias: name !== key, fallback: false, shapes: shapes.get(name) };
  return { requested: key, name: FALLBACK_ICON, alias: false, fallback: true, shapes: shapes.get(FALLBACK_ICON) };
}

export function iconNames() {
  return [...iconPack().shapes.keys()];
}

export function iconAliases() {
  return Object.fromEntries([...iconPack().aliases].sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Per-render icon set: renders inline SVG and reports which names fell back,
 * so the manifest can tell an agent that an icon name was not understood.
 */
export function createIconSet({ strokeWidth = 1.7 } = {}) {
  const used = new Map();
  return {
    svg(requested) {
      const icon = resolveIcon(requested);
      if (requested !== undefined && requested !== null && requested !== '') used.set(icon.requested || '(vide)', icon);
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon.shapes}</svg>`;
    },
    report() {
      const entries = [...used.entries()].sort(([a], [b]) => a.localeCompare(b));
      return {
        pack: iconPack().id,
        license: iconPack().manifest.license,
        network: false,
        resolved: entries.filter(([, icon]) => !icon.fallback).map(([requested, icon]) => (icon.alias ? `${requested} → ${icon.name}` : requested)),
        fallback: entries.filter(([, icon]) => icon.fallback).map(([requested]) => requested)
      };
    }
  };
}
