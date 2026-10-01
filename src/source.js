import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

export const SOURCE_EXTENSIONS = ['.json', '.yaml', '.yml'];

/** Parse a plan written as JSON or YAML, reporting where the syntax breaks. */
export function parseSource(raw, format, label = 'la source') {
  let data;
  if (format === 'json') {
    try { data = JSON.parse(raw); }
    catch (error) { throw new Error(`JSON invalide dans ${label} : ${error.message}`); }
  } else {
    try { data = parseYaml(raw, { prettyErrors: true, merge: false }); }
    catch (error) { throw new Error(`YAML invalide dans ${label} : ${error.message.split('\n')[0]}`); }
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${label} doit contenir un objet de plan (clés version, template, title, nodes…).`);
  }
  return data;
}

export function formatFor(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.json') return 'json';
  if (extension === '.yaml' || extension === '.yml') return 'yaml';
  throw new Error(`Extension non supportée : « ${extension || path.basename(file)} ». Attendu : ${SOURCE_EXTENSIONS.join(', ')}.`);
}

/** Read a plan file and return its raw text (for hashing) along with the parsed object. */
export async function readSource(file) {
  const format = formatFor(file);
  let raw;
  try { raw = await readFile(file, 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Source introuvable : ${file}`);
    if (error.code === 'EISDIR') throw new Error(`Source attendue : un fichier, pas un dossier (${file}).`);
    throw error;
  }
  return { raw, format, data: parseSource(raw, format, path.basename(file)) };
}
