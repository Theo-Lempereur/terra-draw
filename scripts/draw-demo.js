// Démo + mesure de `draw` : un dessin par disposition, temps de chaque rendu (le 1er lance Chromium).
// Usage : node scripts/draw-demo.js [dossier]   (défaut : /tmp/terra-draw-demo)
import { draw, closeDraw } from '../src/draw.js';

const outDir = process.argv[2] ?? '/tmp/terra-draw-demo';
const demos = [
  { title: 'Comment marche Terra Draw', layout: 'flow', items: [
    { label: 'Théo demande', note: 'à la voix ou sur Discord' }, { label: 'Agent Terra', note: 'résume en quelques éléments' },
    { label: 'Moteur de validation' }, { label: 'Rendu Chromium', note: 'hors ligne, 0,3 s' }, { label: 'Image sur Discord' }] },
  { title: 'Tes mails ce matin', subtitle: 'Mission freelance et stage', items: [
    { label: 'Newsletter Promo', note: 'Boutique · 08:12', status: 'supprimé' },
    { label: 'RE: Candidature stage', note: 'Jean-Michel Flamant · 19:19', status: 'répondu' },
    { label: 'Devis site vitrine', note: 'Claire Martin · 10:02', status: 'brouillon', preview: 'Bonjour Claire, merci pour votre demande : je vous propose un premier échange jeudi…' },
    { label: 'Accès à l’API', note: 'Teo du Colombier · hier', status: 'en attente' },
    { label: 'Facture Infomaniak', note: 'Infomaniak · lundi', status: 'modifié' }] },
  { title: 'Terra, l’assistant de Théo', layout: 'hub', items: [
    { label: 'Terra' }, { label: 'Gmail', icon: 'gmail' }, { label: 'Discord' }, { label: 'Agenda' },
    { label: 'Claude Code' }, { label: 'GitHub' }, { label: 'Voix' }] },
  { title: 'MCP ou API ?', columns: ['MCP', 'API classique'], items: [
    { label: 'Outils typés', group: 1 }, { label: 'L’agent découvre seul', group: 1 },
    { label: 'Requêtes HTTP', group: 2 }, { label: 'Code à écrire', group: 2 }] },
  { title: 'Terra : un cœur, trois façons de l’installer', layout: 'tree', items: [
    { label: 'Terra', note: 'Master, mémoire, agents et outils' },
    { label: 'Mode serveur', note: 'Le cœur tourne sur echo, même PC éteint', icon: 'server', parent: 'Terra' },
    { label: 'Agents et modules', note: 'Master, mémoire, Discord, mails, suivi', parent: 'Mode serveur' },
    { label: 'API protégée', note: 'Via Tailscale seulement, jeton obligatoire', parent: 'Mode serveur' },
    { label: 'Mode client', note: 'Le PC affiche et agit, relié à echo', icon: 'laptop', parent: 'Terra' },
    { label: 'Voix et île', parent: 'Mode client' }, { label: 'Agent PC', parent: 'Mode client' },
    { label: 'Mode tout local', note: 'Tout sur le PC, sans serveur', icon: 'house', parent: 'Terra' },
    { label: 'Dispo seulement PC allumé', icon: 'power', parent: 'Mode tout local' }] },
  { title: 'Du clic dans l’île à l’action sur Windows', layout: 'route',
    zones: [{ label: 'PC Windows', note: 'Île · voix · agent PC' }, { label: 'Serveur echo', note: 'Master · mémoire · outils' }],
    items: [
      { label: 'Théo demande dans l’île', note: '« ouvre mon rapport de stage »', from: 'PC' },
      { label: 'La demande part vers echo', note: 'Canal privé, jeton de la console', from: 'PC', to: 'echo', via: 'Tailscale' },
      { label: 'Le master choisit l’outil', from: 'echo' },
      { label: 'Appel de l’agent PC', note: 'Jeton PC, outils autorisés seulement', from: 'echo', to: 'PC', via: 'Tailscale' },
      { label: 'Accord dans l’île', from: 'PC', status: 'en attente' },
      { label: 'Résultat renvoyé', note: 'Succès, refus ou indisponible', from: 'PC', to: 'echo' }] },
  { title: 'La stack du projet', layout: 'grid', items: ['React', 'Node.js', 'PostgreSQL', 'Docker', 'Tailscale', 'Stripe', 'GitHub', 'Vercel'] }
];

for (const demo of demos) {
  const result = await draw(demo, { outDir });
  console.log(`${result.ms} ms · ${result.layout} · ${result.png}\n   ${result.icons.join(' | ')}`);
}
await closeDraw();
