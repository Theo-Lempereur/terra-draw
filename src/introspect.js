// Introspection partagée par le CLI (bin/terra-draw.js) et le serveur MCP
// (src/mcp/tools.js) : une seule lecture de TEMPLATES / MODES / TONES / du pack
// d'icônes, pour que les deux surfaces décrivent toujours le même moteur.
import { templates } from './template.js';
import { TEMPLATES, MODES, TONES } from './validate.js';
import { iconNames, iconAliases, iconPack, resolveIcon } from './icons.js';

/** Les 4 modèles, leurs rôles et leurs contraintes, lus depuis le code (jamais désynchronisés). */
export function listTemplates() {
  return Object.entries(TEMPLATES).map(([name, spec]) => ({
    template: name,
    summary: spec.summary,
    roles: templates[name].meta.roles,
    requirements: templates[name].meta.needs,
    modes: Object.keys(MODES),
    tones: TONES
  }));
}

/** Le pack d'icônes vendoré et ses alias. */
export function listIcons() {
  const pack = iconPack();
  return {
    pack: pack.id,
    license: pack.manifest.license,
    fallback: pack.manifest.fallback,
    icons: iconNames(),
    aliases: iconAliases()
  };
}

/** Résout une liste de noms libres vers les identifiants réellement utilisables du pack. */
export function resolveIcons(names) {
  return names.map(requested => {
    const icon = resolveIcon(requested);
    return {
      requested: String(requested),
      normalized: icon.requested,
      resolved: icon.name,
      alias: icon.alias,
      fallback: icon.fallback
    };
  });
}
