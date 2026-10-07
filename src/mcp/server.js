// Serveur MCP local (stdio) pour terra-draw : UN seul outil, `draw`. Un agent qui parle à Théo doit
// pouvoir montrer une image en un appel, sans lire de doc ni enchaîner créer/rendre/vérifier. Le
// format pivot complet (create/render/update) reste disponible en CLI : terra-draw render.
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { draw, LAYOUTS } from '../draw.js';

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

export const DRAW_DESCRIPTION = 'Dessine une image explicative et l’affiche à Théo (PNG, ~0,5 s). UN appel suffit : '
  + 'ne prépare rien avant, n’appelle pas d’autre outil. label court (2 à 5 mots) ; note = une vraie phrase courte '
  + '(≤ 100 caractères) qui dit le pourquoi ou le comment : c’est elle qui donne de la profondeur. Les icônes et logos '
  + 'sont choisis seuls d’après le label (Gmail, Discord, Tailscale… → leur logo) ; icon seulement pour forcer (nom de '
  + 'marque ou pictogramme anglais : server, laptop, bot…). '
  + 'layout : tree = hiérarchie fléchée (parent sur chaque élément = libellé ou numéro de son parent ; la racine n’en a '
  + 'pas ; ses enfants sont numérotés 1, 2, 3 → idéal pour « N modes / N parties, et ce qu’il y a dedans ») ; '
  + 'route = trajets entre machines ou acteurs (zones en colonnes avec leur image, ex. ["PC Windows", "Serveur echo"] ; '
  + 'chaque étape a from et to = une flèche numérotée de from vers to, via = le canal (Tailscale, HTTPS…) ; '
  + 'from seul = action sur place sur cette machine) ; flow = étapes dans l’ordre sans changement de machine ; '
  + 'hub = le 1er élément au centre, les autres autour ; compare = 2 colonnes (columns + group 1 ou 2) ; '
  + 'grid = ensemble de cartes ; list = lignes avec statut (mails, tâches). '
  + 'status : nouveau, non lu, lu, répondu, envoyé, brouillon, en attente, supprimé, modifié, fait, à faire, erreur, '
  + 'urgent, archivé, programmé, en cours. preview : extrait d’un brouillon (affiché comme un mini-brouillon). '
  + 'Sans layout : route s’il y a from/to, tree s’il y a parent, list s’il y a des statuts, compare s’il y a des '
  + 'groupes, sinon flow (≤ 6) ou grid. Pour changer l’image : rappeler draw avec le plan complet corrigé.';

const ref = z.union([z.string(), z.number()]);
const item = z.object({
  label: z.string().describe('2 à 5 mots'),
  note: z.string().optional().describe('une phrase courte : le pourquoi / le comment (≤ 100 caractères)'),
  icon: z.string().optional(),
  status: z.string().optional(),
  preview: z.string().optional(),
  group: z.union([z.literal(1), z.literal(2)]).optional(),
  parent: ref.optional().describe('tree : libellé ou numéro (1 = 1er élément) du parent'),
  from: ref.optional().describe('route : zone de départ (nom ou numéro)'),
  to: ref.optional().describe('route : zone d’arrivée ; absent = action sur place'),
  via: z.string().optional().describe('route : canal du trajet (Tailscale, HTTPS, SMTP…)')
});
const zone = z.union([z.string(), z.object({ label: z.string(), note: z.string().optional(), icon: z.string().optional() })]);

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
      columns: z.array(z.string()).length(2).optional(),
      zones: z.array(zone).min(1).max(4).optional().describe('route : machines ou acteurs, de gauche à droite')
    }
  }, async args => {
    try {
      const result = await draw(args);
      // MEDIA: fait joindre l'image à la réponse par la gateway Hermes (Discord), même si l'agent l'oublie.
      return { content: [{ type: 'text', text: `MEDIA:${result.png}\nImage prête (${result.layout}, ${result.ms} ms). `
        + 'Recopie la ligne MEDIA: ci-dessus, seule sur sa ligne, juste après le texte qu’elle illustre : '
        + 'sans elle, Théo ne voit pas l’image.' }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: `draw a échoué : ${error.message}` }] };
    }
  });
  return server;
}
