// Serveur MCP local (stdio) pour terra-draw. Chaque outil valide ses entrées
// avec zod, puis délègue à src/mcp/tools.js — qui lui-même délègue à
// src/validate.js et src/render.js. Le serveur ne réimplémente ni ne contourne
// le moteur : il l'expose avec des schémas et des erreurs lisibles par un agent.
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  createDiagram, renderDiagramTool, updateDiagram, listTemplates, listIcons, resolveIcons
} from './tools.js';

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

const TEMPLATE_ENUM = ['comparison', 'hub-and-spoke', 'flow', 'cards-table'];
const MODE_ENUM = ['visual', 'balanced', 'self_explanatory'];
const FORMAT_ENUM = ['html', 'png', 'pdf'];

// Les blocs structurés (nodes, groups, edges, table, …) suivent exactement le
// format pivot décrit par schema/diagram.schema.json : ce schéma JSON reste la
// seule source de vérité pour leur forme, validée par validateDiagram(). Le
// laisser libre ici (plutôt que de le dupliquer en zod) évite deux vérités.
const jsonObject = z.record(z.string(), z.unknown());
const jsonObjectArray = z.array(jsonObject);
const upsertRemove = z.union([
  jsonObjectArray,
  z.object({ upsert: jsonObjectArray.optional(), remove: z.array(z.union([z.string(), jsonObject])).optional() })
]);

function textResult(result) {
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result };
}

async function run(fn, args) {
  return textResult(await fn(args));
}

export function createServer() {
  const server = new McpServer({ name: 'terra-draw', version }, {
    instructions: 'Crée, rend, met à jour et inspecte des schémas explicatifs terra-draw (comparison, hub-and-spoke, flow, cards-table). '
      + 'Toujours valider avec render_diagram ou list_templates/list_icons avant de supposer la forme d’un plan : les erreurs renvoyées nomment le champ fautif.'
  });

  server.registerTool('list_templates', {
    title: 'Lister les modèles',
    description: 'Les 4 modèles disponibles (comparison, hub-and-spoke, flow, cards-table), leurs rôles de node et leurs contraintes, lus depuis le moteur — jamais désynchronisés du code.',
    inputSchema: {},
    outputSchema: { templates: jsonObjectArray }
  }, () => textResult({ templates: listTemplates() }));

  server.registerTool('list_icons', {
    title: 'Lister les icônes',
    description: 'Le pack d’icônes vendoré (assets/icons/) et ses alias. Un nom non listé ici (ou non alias) retombe silencieusement sur le pictogramme "generic" au rendu.',
    inputSchema: {},
    outputSchema: {
      pack: z.string(), license: z.string(), fallback: z.string(),
      icons: z.array(z.string()), aliases: jsonObject
    }
  }, () => textResult(listIcons()));

  server.registerTool('resolve_icons', {
    title: 'Résoudre des noms d’icônes',
    description: 'Résout une liste de noms libres (ex. "Google Drive", "github") vers les identifiants réellement utilisables du pack — exact, alias, ou repli sur "generic" si inconnu.',
    inputSchema: { names: z.array(z.string()).min(1).describe('Noms libres à résoudre, ex. ["github", "Google Drive", "zzz-inconnu"].') },
    outputSchema: { icons: jsonObjectArray }
  }, ({ names }) => textResult({ icons: resolveIcons(names) }));

  server.registerTool('create_diagram', {
    title: 'Créer un diagramme',
    description: 'Écrit un nouveau fichier de plan terra-draw (.json ou .yaml). Deux façons de décrire le contenu, non combinables : '
      + '(1) nodes/groups/edges/table/… — le format pivot complet, voir list_templates pour les rôles et contraintes par modèle ; '
      + '(2) brief — une liste courte d’éléments, pour un squelette déterministe : flow (chaque élément devient une étape, dans l’ordre) et '
      + 'hub-and-spoke (le premier élément devient le centre, les suivants des satellites). brief n’est pas supporté pour comparison (2 colonnes) '
      + 'ni cards-table (table obligatoire) : fournir nodes/groups/table directement pour ces modèles. N’écrit rien si le plan ne valide pas.',
    inputSchema: {
      path: z.string().describe('Chemin du fichier à créer, relatif ou absolu (.json ou .yaml).'),
      template: z.enum(TEMPLATE_ENUM),
      title: z.string(),
      mode: z.enum(MODE_ENUM).optional(),
      subtitle: z.string().optional(),
      eyebrow: z.string().optional(),
      canvas: jsonObject.optional(),
      exports: jsonObject.optional().describe('{ formats: ["html","png","pdf"] } — sous-ensemble.'),
      groups: jsonObjectArray.optional(),
      nodes: jsonObjectArray.optional().describe('Paramètres structurés. Fournir soit nodes, soit brief — pas les deux.'),
      edges: jsonObjectArray.optional().describe('Omis : le modèle déduit les flèches logiques.'),
      badges: jsonObjectArray.optional(),
      notes: jsonObjectArray.optional(),
      table: jsonObject.optional().describe('Obligatoire pour cards-table : { columns, rows }.'),
      legend: jsonObjectArray.optional(),
      footer: z.string().optional(),
      brief: z.array(z.union([z.string(), jsonObject])).optional()
        .describe('Squelette déterministe : ["Étape 1", "Étape 2", …] (flow) ou ["Centre", "Satellite A", …] (hub-and-spoke). Items objets acceptés : { title, icon?, body? }.'),
      overwrite: z.boolean().optional().describe('Défaut false : refuse d’écraser un fichier existant.')
    },
    outputSchema: {
      path: z.string(), format: z.enum(['json', 'yaml']), template: z.string(), mode: z.string(),
      nodes: z.number(), edges: z.number(), groups: z.number(), table: z.boolean()
    }
  }, args => run(createDiagram, args));

  server.registerTool('render_diagram', {
    title: 'Rendre un diagramme',
    description: 'Rend un plan existant en HTML/PNG/PDF + manifest.json via le moteur terra-draw (Chromium hors ligne, aucune requête réseau). '
      + 'Retourne les chemins absolus des fichiers produits et leur empreinte SHA-256.',
    inputSchema: {
      source: z.string().describe('Chemin du plan à rendre (.json ou .yaml).'),
      outDir: z.string().describe('Dossier de sortie. Un dossier déjà géré par terra-draw peut être régénéré ; un dossier contenant d’autres fichiers est refusé.'),
      mode: z.enum(MODE_ENUM).optional().describe('Remplace le mode déclaré dans le plan.'),
      formats: z.array(z.enum(FORMAT_ENUM)).min(1).optional().describe('Sous-ensemble de html,png,pdf. Défaut : exports.formats du plan.'),
      width: z.number().int().min(1200).max(2400).optional(),
      scale: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional().describe('Densité du PNG.')
    },
    outputSchema: {
      outDir: z.string(), manifestPath: z.string(),
      files: z.array(z.object({ path: z.string(), bytes: z.number(), sha256: z.string() })),
      template: z.string(), mode: z.string(), icons: jsonObject, render: jsonObject
    }
  }, args => run(renderDiagramTool, args));

  server.registerTool('update_diagram', {
    title: 'Modifier un diagramme',
    description: 'Applique des modifications explicites à un plan existant, puis le revalide avant d’écrire (aucune écriture partielle). '
      + 'set : champs scalaires { title?, subtitle?, eyebrow?, mode?, footer? }. canvas : fusion superficielle. '
      + 'groups/nodes : un tableau remplace entièrement la collection, ou { upsert: [...], remove: [...] } l’édite par id '
      + '(une carte de cards-table est un node de role "card" : passer par nodes). edges : pareil, identifiées par { from, to }. '
      + 'table/exports : remplacement complet, ou null pour retirer. badges/notes/legend : remplacement complet. '
      + 'Toute forme ambiguë ou un champ non listé ici renvoie une erreur plutôt que d’être interprété.',
    inputSchema: {
      source: z.string().describe('Chemin du plan existant à modifier.'),
      set: jsonObject.optional().describe('{ title?, subtitle?, eyebrow?, mode?, footer? }'),
      canvas: jsonObject.optional(),
      groups: upsertRemove.optional(),
      nodes: upsertRemove.optional(),
      edges: upsertRemove.optional(),
      table: z.union([jsonObject, z.null()]).optional(),
      badges: jsonObjectArray.optional(),
      notes: jsonObjectArray.optional(),
      legend: jsonObjectArray.optional(),
      exports: z.union([jsonObject, z.null()]).optional(),
      out: z.string().optional().describe('Écrire vers un autre chemin plutôt que d’écraser source.'),
      overwrite: z.boolean().optional().describe('Si out est donné et existe déjà. Défaut true.')
    },
    outputSchema: {
      path: z.string(), format: z.enum(['json', 'yaml']), template: z.string(), mode: z.string(),
      nodes: z.number(), edges: z.number(), groups: z.number(), table: z.boolean()
    }
  }, args => run(updateDiagram, args));

  return server;
}
