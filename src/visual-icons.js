// Icônes du mode visuel (`draw`) : choisies automatiquement depuis le libellé, pour qu'un agent
// n'ait jamais à les chercher. Ordre : logo de marque (Simple Icons, CC0) → pictogramme Lucide
// (ISC) via un dictionnaire français + les mots-clés anglais de Lucide → pastille à initiale.
// Tout est local (node_modules) : aucun rendu ne télécharge quoi que ce soit.
import { createRequire } from 'node:module';
import * as simpleIcons from 'simple-icons';

const require = createRequire(import.meta.url);
const NODES = require('lucide-static/icon-nodes.json');
const TAGS = require('lucide-static/tags.json');

export const fold = text => String(text ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const words = text => fold(text).match(/[a-z0-9]+/g) ?? [];
const singular = word => (word.length > 3 && /[sx]$/.test(word) ? word.slice(0, -1) : word);

// Mots courants (français, ou anglais absent des tags Lucide) → pictogramme. Clés sans accent, au singulier.
const FR = {
  mail: 'mail', email: 'mail', courriel: 'mail', message: 'message-square', boite: 'inbox', inbox: 'inbox',
  brouillon: 'file-pen', draft: 'file-pen', envoi: 'send', envoye: 'send', envoyer: 'send', reponse: 'reply',
  repondre: 'reply', supprime: 'trash', suppression: 'trash', corbeille: 'trash', attente: 'hourglass',
  attendre: 'hourglass', modifie: 'pencil', modification: 'pencil', agent: 'bot', ia: 'bot', ai: 'bot',
  assistant: 'bot', robot: 'bot', terra: 'bot', master: 'bot', llm: 'brain', modele: 'brain', cerveau: 'brain',
  serveur: 'server', donnee: 'database', bdd: 'database', site: 'globe', web: 'globe', internet: 'globe',
  navigateur: 'app-window', application: 'smartphone', app: 'smartphone', mobile: 'smartphone',
  telephone: 'phone', appel: 'phone', voix: 'mic', vocal: 'mic', micro: 'mic', parler: 'mic', oral: 'mic',
  audio: 'audio-lines', son: 'volume-2', schema: 'pen-tool', diagramme: 'pen-tool', dessin: 'pen-tool',
  image: 'image', photo: 'image', png: 'image', video: 'video', utilisateur: 'user', client: 'user',
  personne: 'user', moi: 'user', theo: 'user', humain: 'user', equipe: 'users', gens: 'users',
  entreprise: 'building-2', societe: 'building-2', startup: 'rocket', rdv: 'calendar-clock',
  rendez: 'calendar-clock', reunion: 'calendar-clock', entretien: 'calendar-clock', calendrier: 'calendar',
  agenda: 'calendar', date: 'calendar', planning: 'calendar-range', heure: 'clock', temps: 'clock',
  delai: 'timer', vitesse: 'gauge', rapide: 'zap', paiement: 'credit-card', payer: 'credit-card',
  facture: 'receipt', devis: 'receipt-text', argent: 'banknote', prix: 'euro', budget: 'piggy-bank',
  cout: 'euro', euro: 'euro', contrat: 'file-signature', document: 'file-text', doc: 'file-text',
  fichier: 'file', pdf: 'file-text', dossier: 'folder', projet: 'folder-kanban', code: 'code',
  dev: 'code', developpement: 'code', programme: 'code', script: 'file-code', terminal: 'terminal',
  commande: 'terminal', cli: 'terminal', api: 'plug', mcp: 'plug-zap', outil: 'wrench', moteur: 'cog',
  reglage: 'settings', parametre: 'settings', config: 'settings', configuration: 'settings',
  securite: 'shield-check', protection: 'shield', cle: 'key-round', password: 'key-round', auth: 'key-round',
  prive: 'lock', cloud: 'cloud', nuage: 'cloud', reseau: 'network', recherche: 'search', chercher: 'search',
  validation: 'circle-check', valider: 'circle-check', verifier: 'circle-check', verification: 'circle-check',
  valide: 'circle-check', ok: 'circle-check', erreur: 'triangle-alert', probleme: 'triangle-alert',
  bug: 'bug', idee: 'lightbulb', objectif: 'target', but: 'target', stat: 'chart-line', statistique: 'chart-line',
  analyse: 'chart-column', rapport: 'clipboard-list', resume: 'clipboard-list', liste: 'list-checks',
  tache: 'list-checks', todo: 'list-checks', notification: 'bell', alerte: 'bell', question: 'circle-help',
  colis: 'package', livraison: 'truck', maison: 'house', accueil: 'house', ecole: 'graduation-cap',
  cours: 'graduation-cap', formation: 'graduation-cap', apprendre: 'graduation-cap', lecon: 'book-open',
  livre: 'book-open', stage: 'briefcase', emploi: 'briefcase', job: 'briefcase', travail: 'briefcase',
  mission: 'briefcase', freelance: 'briefcase', candidature: 'send', cv: 'id-card', profil: 'id-card',
  contact: 'contact', discussion: 'messages-square', conversation: 'messages-square', chat: 'messages-square',
  lien: 'link', rendu: 'image', export: 'download', telechargement: 'download', import: 'upload',
  japon: 'torii-gate', japonais: 'languages', langue: 'languages', traduction: 'languages', voyage: 'plane',
  avion: 'plane', lieu: 'map-pin', adresse: 'map-pin', carte: 'map', musique: 'music', randonnee: 'mountain',
  voiture: 'car', repas: 'utensils', sante: 'heart-pulse', meteo: 'cloud-sun', depart: 'play', debut: 'play',
  fin: 'flag', arrivee: 'flag', etape: 'footprints', plan: 'map', strategie: 'chess-knight', idees: 'lightbulb',
  choix: 'split', decision: 'split', comparaison: 'scale', versus: 'scale', vs: 'scale', test: 'flask-conical',
  donnees: 'database', memoire: 'brain', navigateurs: 'app-window', relance: 'bell-ring', browser: 'app-window', requete: 'arrow-left-right', http: 'arrow-left-right', https: 'arrow-left-right', chromium: 'chromium', chrome: 'chromium',
  relancer: 'bell-ring', recruteur: 'user-search', rh: 'user-search', json: 'braces',
  yaml: 'braces', html: 'code-xml', valideur: 'shield-check', format: 'braces', etat: 'activity',
  suivi: 'activity', historique: 'history', archive: 'archive', archiver: 'archive', partage: 'share-2',
  publication: 'megaphone', annonce: 'megaphone', offre: 'tag', vente: 'shopping-cart', achat: 'shopping-cart',
  commande_: 'shopping-cart', produit: 'box', stock: 'boxes', usine: 'factory', bureau: 'building',
  pc: 'laptop', ordinateur: 'laptop', portable: 'laptop', machine: 'computer', poste: 'monitor', windows: 'monitor',
  vps: 'server', hote: 'server', interface: 'app-window', accord: 'shield-check', autorisation: 'shield-check',
  autoriser: 'shield-check', permission: 'shield-check', execution: 'square-terminal', executer: 'square-terminal',
  lancer: 'play', ouvrir: 'folder-open', ouverture: 'folder-open', resultat: 'clipboard-check', retour: 'undo-2',
  coeur: 'heart', hierarchie: 'network', arbre: 'network', mode: 'toggle-right'
};

const STOP = new Set(['de', 'du', 'des', 'le', 'la', 'les', 'un', 'une', 'et', 'ou', 'en', 'au',
  'aux', 'pour', 'par', 'avec', 'sur', 'sans', 'dans', 'son', 'sa', 'ses', 'mon', 'ma', 'mes', 'the', 'and', 'of',
  'to', 'for', 'with', 'via', 'qui', 'que', 'est', 'six', 'see', 'new', 'all']);

// Mots qui ressemblent à une marque mais sont d'abord des mots courants.
const NOT_BRANDS = new Set(['mail', 'signal', 'line', 'ring', 'open', 'next', 'go', 'notion', 'origin',
  'framer', 'render', 'reason', 'deno', 'zig', 'ghost', 'buffer', 'about', 'apache', 'matrix', 'bluesky',
  'square', 'shell', 'target', 'flux', 'note', 'session', 'vite', 'hugo', 'monzo', 'element', 'proton', 'cloud', 'docs', 'drive', 'stage', 'plan']);

let lucide;
function lucideIndex() {
  if (lucide) return lucide;
  const byTag = new Map();
  for (const [name, tags] of Object.entries(TAGS)) {
    if (!NODES[name]) continue;
    for (const tag of [name.split('-')[0], ...tags]) {
      for (const word of words(tag)) {
        // À égalité, le nom le plus court est le pictogramme « canonique » (mail plutôt que mail-plus).
        const best = byTag.get(word);
        if (!best || name.length < best.length) byTag.set(word, name);
      }
    }
  }
  lucide = { byTag };
  return lucide;
}

let brands;
function brandIndex() {
  if (brands) return brands;
  brands = new Map();
  for (const [key, icon] of Object.entries(simpleIcons)) {
    if (!key.startsWith('si') || !icon?.path) continue;
    for (const id of [fold(icon.title).replace(/[^a-z0-9]/g, ''), icon.slug]) if (id && !brands.has(id)) brands.set(id, icon);
  }
  return brands;
}

/** Un nom de marque explicite ou repéré dans le texte (« Gmail », « Google Drive », « Node.js »). */
export function findBrand(text, { explicit = false } = {}) {
  const index = brandIndex();
  if (explicit) return index.get(fold(text).replace(/[^a-z0-9]/g, '')) ?? null;
  const tokens = String(text ?? '').match(/[\p{L}\p{N}][\p{L}\p{N}.+#-]*/gu) ?? [];
  for (const size of [3, 2, 1]) {
    for (let i = 0; i + size <= tokens.length; i += 1) {
      const slice = tokens.slice(i, i + size);
      // Un nom propre : majuscule (hors 1er mot d'une phrase en minuscules ailleurs) ou chiffre/point.
      if (!slice.some(token => /\p{Lu}/u.test(token) || /[.\d+#]/.test(token))) continue;
      const id = fold(slice.join('')).replace(/[^a-z0-9]/g, '');
      if (id.length < 3 || (size === 1 && (NOT_BRANDS.has(id) || FR[singular(id)]))) continue;
      const brand = index.get(id);
      if (brand) return brand;
    }
  }
  return null;
}

/** Pictogramme Lucide pour un nom explicite ou des mots libres (français ou anglais). */
export function findPictogram(text, { explicit = false } = {}) {
  const raw = fold(text).trim().replace(/\s+/g, '-');
  if (explicit && NODES[raw]) return raw;
  const { byTag } = lucideIndex();
  const list = words(text).filter(word => !STOP.has(word));
  // Le dictionnaire choisi à la main passe avant les mots-clés de Lucide (« base de données » → database).
  for (const word of list) {
    const hit = FR[word] ?? FR[singular(word)];
    if (hit && NODES[hit]) return hit;
  }
  for (const word of list) {
    const w = singular(word);
    const hit = w.length > 2 ? (NODES[w] ? w : byTag.get(w) ?? byTag.get(word)) : null;
    if (hit && NODES[hit]) return hit;
  }
  return null;
}

const attr = value => String(value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function lucideSvg(name, strokeWidth = 1.8) {
  const nodes = NODES[name] ?? NODES.circle;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${
    nodes.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${attr(v)}"`).join(' ')}/>`).join('')}</svg>`;
}

const luminance = hex => {
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * L'icône d'un élément. `icon` explicite (marque ou nom Lucide) d'abord, sinon déduite du libellé puis
 * de la note. Renvoie { kind: 'brand'|'line'|'letter', name, svg, color?, dark? }.
 */
export function pickIcon({ icon, label, note } = {}) {
  const tries = [];
  // Un vrai logo vaut toujours mieux qu'un pictogramme : la marque citée dans le libellé passe avant
  // l'icône générique qu'un agent aurait choisie (« Chromium » + icon "browser" → logo Chromium).
  if (icon) tries.push(() => findBrand(icon, { explicit: true }));
  tries.push(() => findBrand(label));
  if (icon) tries.push(() => findPictogram(icon, { explicit: true }), () => findPictogram(icon));
  tries.push(() => findPictogram(label), () => findBrand(note), () => findPictogram(note));
  for (const attempt of tries) {
    const hit = attempt();
    if (!hit) continue;
    if (typeof hit === 'string') return { kind: 'line', name: hit, svg: lucideSvg(hit) };
    return {
      kind: 'brand', name: hit.slug, color: `#${hit.hex}`, dark: luminance(hit.hex) > 0.82,
      svg: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${attr(hit.path)}"/></svg>`
    };
  }
  const letter = (String(label ?? '?').match(/\p{L}|\p{N}/u)?.[0] ?? '?').toUpperCase();
  return { kind: 'letter', name: `lettre-${letter}`, svg: `<span class="letter">${attr(letter)}</span>` };
}

export const hasPictogram = name => Boolean(NODES[name]);
