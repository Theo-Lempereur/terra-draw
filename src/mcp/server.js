// Serveur MCP local (stdio) pour terra-draw : UN seul outil, `draw`. Un agent qui parle à Théo doit
// pouvoir montrer une image en un appel, sans lire de doc ni enchaîner créer/rendre/vérifier. Le
// format pivot complet (create/render/update) reste disponible en CLI : terra-draw render.
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { draw, LAYOUTS } from '../draw.js';

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

export const DRAW_DESCRIPTION = 'Dessine une image explicative et l’affiche à Théo (PNG, ~0,3 s). UN appel suffit : '
  + 'ne prépare rien avant, n’appelle pas d’autre outil. Visuel d’abord : 2 à 8 éléments, label court (2 à 5 mots), '
  + 'note facultative très courte. Les icônes et logos sont choisis seuls d’après le label (Gmail, Discord, GitHub, '
  + 'Stripe… → leur logo) ; icon seulement pour forcer (nom de marque ou pictogramme anglais : mail, bot, server…). '
  + 'layout : flow = étapes dans l’ordre ; hub = le 1er élément au centre, les autres autour ; compare = 2 colonnes '
  + '(columns + group 1 ou 2 sur chaque élément) ; grid = ensemble de cartes ; list = lignes avec statut (mails, tâches). '
  + 'status : nouveau, non lu, lu, répondu, envoyé, brouillon, en attente, supprimé, modifié, fait, à faire, erreur, '
  + 'urgent, archivé, programmé, en cours. preview : extrait d’un brouillon (affiché comme un mini-brouillon). '
  + 'Sans layout : list s’il y a des statuts, compare s’il y a des groupes, sinon flow (≤ 6) ou grid. '
  + 'Pour changer l’image : rappeler draw avec le plan complet corrigé.';

const item = z.object({
  label: z.string().describe('2 à 5 mots'),
  note: z.string().optional().describe('détail très court (expéditeur · heure, chiffre…)'),
  icon: z.string().optional(),
  status: z.string().optional(),
  preview: z.string().optional(),
  group: z.union([z.literal(1), z.literal(2)]).optional()
});

export function createServer() {
  const server = new McpServer({ name: 'terra-draw', version });
  server.registerTool('draw', {
    title: 'Dessiner',
    description: DRAW_DESCRIPTION,
    inputSchema: {
      title: z.string(),
      items: z.array(z.union([z.string(), item])).min(1).max(15).describe('éléments : objets, ou simples textes'),
      layout: z.enum(LAYOUTS).optional(),
      subtitle: z.string().optional(),
      columns: z.array(z.string()).length(2).optional()
    }
  }, async args => {
    try {
      const result = await draw(args);
      // MEDIA: fait joindre l'image à la réponse par la gateway Hermes (Discord), même si l'agent l'oublie.
      return { content: [{ type: 'text', text: `MEDIA:${result.png}\nImage prête (${result.layout}, ${result.ms} ms). `
        + 'Elle est jointe automatiquement à ta réponse : parle à Théo, ne recopie pas le chemin.' }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: `draw a échoué : ${error.message}` }] };
    }
  });
  return server;
}
