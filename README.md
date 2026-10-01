# terra-draw

Un outil local pour transformer un plan **JSON ou YAML** en schéma explicatif **HTML éditable, PNG et PDF**. Quatre modèles (`comparison`, `hub-and-spoke`, `flow`, `cards-table`), trois niveaux d'explication (`visual`, `balanced`, `self_explanatory`), un pack d'icônes vendorisé. Rien n'est téléchargé pendant le rendu. Un [serveur MCP](#serveur-mcp--un-seul-outil-draw) local (stdio) donne à un agent IA un seul outil, `draw`, qui rend une image visuelle en un appel.

## Installation et premier rendu

Node.js **20 ou supérieur**, npm et Chromium via Playwright :

```bash
git clone https://github.com/Theo-Lempereur/terra-draw.git
cd terra-draw
npm ci
npm run browser:install
npm run render -- examples/mcp-vs-api.json --out dist/mcp-vs-api
```

Sur un Linux sans dépendances système Chromium : `npm run browser:install -- --with-deps` (peut nécessiter des droits administrateur). Le navigateur est installé dans `node_modules/` ; `PLAYWRIGHT_BROWSERS_PATH` permet d'utiliser un cache différent, à configurer de façon identique pour l'installation et le rendu. L'installation initiale nécessite le réseau ; le rendu n'en a pas besoin.

Raccourci : `npm run example` rend tous les fichiers de `examples/` dans `dist/`. Sans npm : `node bin/terra-draw.js render examples/mcp-vs-api.json --out dist/mcp-vs-api`. Avec un lien npm local installé, le binaire s'appelle `terra-draw` ; aucune publication npm n'est nécessaire.

Les fichiers réellement produits sont :

```text
dist/mcp-vs-api/
  diagram.html     # Texte, CSS et SVG, polices intégrées ; aucun JS ni CDN
  diagram.png      # PNG à l'échelle 2 par défaut
  diagram.pdf      # Une page aux dimensions du schéma, texte sélectionnable
  manifest.json    # Source et empreinte, paramètres, navigateur, icônes, fichiers et SHA-256
```

Ouvrir `diagram.html` directement dans un navigateur, ou lancer la preview qui montre les quatre exemples avec boutons de téléchargement :

```bash
npm run dev                       # http://localhost:3000
PORT=4200 npm run dev              # Port fourni par Terra
npm run dev -- --port 4200         # Prioritaire sur PORT
```

La preview régénère tous les exemples au démarrage et écoute sur `0.0.0.0` (`--host 127.0.0.1` pour rester local). Redémarrer après modification d'un plan ; pas de serveur de compilation ni de rechargement automatique. `npm start` est équivalent.

## Commandes du CLI

```bash
terra-draw render <plan.json|plan.yaml> --out <dossier> [--width 1440] [--scale 2] [--mode balanced] [--formats html,png,pdf]
terra-draw validate <plan.json|plan.yaml> [--json]
terra-draw templates [--json]      # Les 4 modèles, leurs rôles et leurs contraintes
terra-draw icons [--json]          # Le pack d'icônes et ses alias
```

`--mode` et `--formats` surchargent les champs `mode` / `exports.formats` du plan. Les erreurs vont sur stderr avec code de sortie 1 ; le succès écrit un objet JSON sur stdout. Un dossier d'exports existant peut être régénéré ; un dossier contenant d'autres fichiers est refusé. Éviter deux rendus simultanés vers le même dossier.

## Le format pivot (`version: 1`)

Un plan décrit des **nodes** reliés par des **edges**, organisés par un **template**. JSON et YAML sont tous deux acceptés (même schéma, mêmes règles) ; voir [`schema/diagram.schema.json`](schema/diagram.schema.json) pour le contrat complet et [`examples/`](examples) pour des cas réels.

```yaml
version: 1
template: flow        # comparison | hub-and-spoke | flow | cards-table
mode: balanced         # visual | balanced | self_explanatory (défaut : balanced)
title: Du brief au schéma exporté
nodes:
  - { id: brief, title: Brief, icon: book, body: "Une intention écrite en clair." }
  - { id: plan, title: Plan pivot, icon: file }
edges:
  - { from: brief, to: plan, label: rédaction }
```

Champs de premier niveau : `title`/`subtitle`/`eyebrow` (en-tête), `canvas` (largeur, échelle, teinte, mention), `badges` (pastilles sous le titre), `groups` (colonnes/phases/sections selon le modèle), `nodes`, `edges` (synonyme : `connectors`), `table`, `notes` (encadrés), `legend`, `footer`, `exports.formats`.

Chaque `node` a un `id` (minuscules, chiffres, tirets), un `title`, et en option `body`, `icon`, `badge`, `tone`, `group`, `role`. **`edges` est optionnel** : s'il est omis, le modèle déduit les flèches logiques (chaîne pour `flow`, hub vers chaque spoke, etc.).

### Les quatre modèles

| Modèle | Usage | Rôles de node | Règle clé |
|---|---|---|---|
| `comparison` | Deux chemins face à face | `source` (0-1), `step`, `tool` | exactement 2 `groups` ; chaque step/tool rattaché à un groupe |
| `hub-and-spoke` | Un centre et ses satellites | `hub` (1), `spoke` (2-10) | aucun groupe ; les flèches relient toujours le hub |
| `flow` | Une suite d'étapes | `step` (2-8) | `groups` optionnel pour des phases ; boucles arrière autorisées |
| `cards-table` | Une grille + un tableau | `card` (2+) | `table` obligatoire ; pas de flèches |

`terra-draw templates` imprime ces règles depuis le code (jamais désynchronisées). La validation signale aussi les erreurs courantes : identifiant dupliqué, référence d'arête inconnue, rôle hors modèle, groupe manquant, largeur de tableau incohérente — chaque message nomme le champ fautif et, si utile, les valeurs connues.

### Les trois modes d'explication

| Mode | Densité | Usage prévu |
|---|---|---|
| `visual` | Pictogrammes et flèches, texte des cartes masqué, pas de tableau, 1 note max | support à l'oral ou à une app, très peu de lecture |
| `balanced` *(défaut)* | Pictos + titres courts + corps de carte + tableau + 2 notes | le cas général |
| `self_explanatory` | Tout le texte, numérotation, tableau, jusqu'à 4 notes | le schéma doit se suffire à lui-même, sans commentaire |

Le mode ne change pas la structure du plan, seulement l'affichage (`src/validate.js` → `MODES`) : un même plan peut être rendu dans les trois modes via `--mode`.

### Icônes

Pack vendorisé dans `assets/icons/` (43 pictogrammes tracés pour ce dépôt, licence MIT, voir `assets/icons/LICENSE`). Un nom libre comme `github`, `gmail`, `database`, `agent`, `mcp`, `rest`… est résolu via ~280 alias vers un pictogramme générique approprié (`terra-draw icons` liste tout). Un nom inconnu reçoit silencieusement le pictogramme `generic` ; le manifest de chaque rendu liste les noms retombés sur le fallback (`manifest.json` → `icons.fallback`), pour qu'un agent sache quoi corriger. Aucune icône n'est téléchargée, aucun logo de marque n'est reproduit.

### Format historique (étape 1)

Les plans `agent` / `branches` / `connectors` de l'étape 1 restent acceptés tels quels (voir [`schema/legacy-comparison.schema.json`](schema/legacy-comparison.schema.json) et [`examples/legacy/mcp-vs-api-etape-1.json`](examples/legacy/mcp-vs-api-etape-1.json)) : ils sont convertis en mémoire vers le format pivot avant rendu, sans aucune différence de sortie. Écrire les nouveaux plans directement au format pivot.

## Structure

```text
bin/terra-draw.js           Commandes CLI (render, validate, templates, icons)
bin/terra-draw-mcp.js        Point d'entrée du serveur MCP (stdio)
src/source.js               Lecture JSON/YAML
src/validate.js             JSON Schema, règles par modèle, modes, migration étape 1
src/introspect.js           listTemplates/listIcons/resolveIcons, partagés par le CLI et le MCP
src/template.js             Assemblage HTML (en-tête, badges, table, notes, légende)
src/templates/*.js          Mise en page propre à chaque modèle (comparison, hub-and-spoke, flow, cards-table)
src/connectors.js           Flèches SVG calculées sur la mise en page réelle (dans Chromium)
src/icons.js                Résolution et validation du pack d'icônes
src/palette.js              Les six teintes, seule source de vérité (CSS + SVG)
src/render.js                API de rendu et orchestration des exports
src/draw.js                 Mode visuel de l'outil draw : plan tolérant, 5 dispositions, Chromium gardé chaud
src/visual-icons.js         Choix automatique logo de marque / pictogramme Lucide / initiale
src/mcp/tools.js            Helpers du format pivot (créer, rendre, modifier) pour d'autres adaptateurs
src/mcp/server.js           Le serveur MCP : un seul outil, draw
schema/                     Contrats d'entrée versionnés (pivot + legacy)
assets/icons/                Pack d'icônes local (SVG, manifest, licence)
examples/                   Plans éditables (JSON et YAML), un par modèle
scripts/                    Installation Chromium, rendu des exemples, preview HTTP, vérifications, smoke test MCP
test/                       Validation, icônes, exports réels avec Chromium, outils et serveur MCP
docs/architecture.md        Le pipeline de rendu en détail
```

Le moteur est importable directement via `renderDiagram({ source, outDir, width, scale, mode, formats })` et `validateSource(source)` (`src/render.js`) : ce que peut utiliser tout adaptateur Node (le serveur MCP, lui, passe par `src/draw.js`). Un hôte non-Node peut aussi exécuter `bin/terra-draw.js` avec un tableau d'arguments et lire son JSON.

## Serveur MCP : un seul outil, `draw`

Un serveur [MCP](https://modelcontextprotocol.io) local (stdio) pour qu'un agent **montre** une image en
même temps qu'il parle, en **un appel** : pas de fichier de plan, pas de rendu séparé, pas de vérification.
Visuel d'abord : grandes vignettes, peu de texte, icônes et logos **choisis automatiquement** d'après le
libellé. PNG rendu en ~0,1 à 0,3 s : Chromium reste chaud dans le serveur entre deux dessins (fermé après
10 min d'inactivité).

```json
{ "name": "draw", "arguments": {
  "title": "Tes mails ce matin",
  "items": [
    { "label": "Newsletter Promo", "note": "Boutique · 08:12", "status": "supprimé" },
    { "label": "Devis site vitrine", "note": "Claire Martin", "status": "brouillon", "preview": "Bonjour Claire…" },
    { "label": "Accès à l'API", "note": "Teo du Colombier", "status": "en attente" } ] } }
```

| Champ | Rôle |
|---|---|
| `title`, `subtitle` | Titre (obligatoire) et sous-titre |
| `items` | 1 à 15 éléments : objets `{ label, note?, icon?, status?, preview?, group? }` ou simples textes |
| `layout` | `flow` (étapes), `hub` (1er élément au centre), `compare` (2 colonnes, `columns` + `group: 1\|2`), `grid`, `list` (lignes à statut). Deviné s'il manque |
| `status` | nouveau, non lu, lu, répondu, envoyé, brouillon, en attente, supprimé, modifié, fait, à faire, erreur, urgent, archivé, programmé, en cours (ou texte libre) |

Le résultat contient `MEDIA:<chemin du PNG>` : la gateway Hermes joint alors l'image à la réponse (Discord)
sans que l'agent ait à s'en occuper. Les PNG (et le plan `.json` à côté) vont dans `~/terra/drawings/`
(`TERRA_DRAW_OUT` pour changer). Démo de toutes les dispositions : `node scripts/draw-demo.js`.

**Icônes** (`src/visual-icons.js`) : logo de marque [Simple Icons](https://simpleicons.org) (CC0, ~3 400) quand
un nom propre est reconnu (Gmail, Discord, GitHub, Stripe, Google Drive…) ; sinon pictogramme
[Lucide](https://lucide.dev) (ISC, ~1 900) via un dictionnaire français puis les mots-clés anglais de Lucide ;
sinon une pastille à l'initiale. Jamais de pictogramme « + » générique. Tout est lu dans `node_modules` :
aucun rendu ne fait de requête réseau.

Le format pivot complet (4 modèles, tableaux, notes, PDF, HTML éditable) reste disponible en CLI
(`terra-draw render`) et via `src/mcp/tools.js` pour d'autres adaptateurs.

### Configurer un client MCP

```json
{ "mcpServers": { "terra-draw": { "command": "node", "args": ["/chemin/absolu/vers/terra-draw/bin/terra-draw-mcp.js"] } } }
```

### Vérifier que ça fonctionne

```bash
npm run mcp:smoke   # Client + serveur réels sur stdio : un draw par disposition, chronométré
npm run check       # Vérifie en mémoire l'outil exposé et sa description, hors ligne
npm test            # Inclut test/draw.test.js (icônes, statuts, rendu) et l'intégration stdio
```

## Vérification

```bash
npm run check    # Syntaxe, pack d'icônes, cohérence palette/CSS, modèles, exemples valides, outils MCP — hors ligne, sans Chromium
npm test          # Rendu réel des 4 exemples, PNG/PDF/HTML, CLI, modes, échappement, serveur MCP stdio — avec Chromium
npm run example   # Rend tous les exemples dans dist/
```

Les tests lancent le CLI, vérifient les dimensions PNG, le PDF d'une page, les empreintes, l'ouverture HTML sans réseau ni JavaScript, les références invalides, l'échappement, les modes et la protection des fichiers existants ; `test/mcp.test.js` fait de même pour les outils MCP, plus un aller-retour stdio réel. `npm run example` tient lieu de build : JavaScript natif, sans compilation.

Les versions npm sont verrouillées. À environnement identique, HTML et PNG sont déterministes ; les métadonnées de création du PDF peuvent changer. La sortie reste un canevas à largeur fixe, redimensionné dans la preview. Les exports, dépendances et caches ne sont pas versionnés. La police Inter est sous licence SIL OFL, conservée dans les artefacts HTML.

## Limites connues

- Pas d'éditeur graphique ni de layout libre : quatre modèles fixes, pensés pour rester lisibles plutôt que pour tout représenter.
- `flow` est limité à 8 étapes, `hub-and-spoke` à 10 satellites, `comparison` à 2 colonnes : au-delà, découper en plusieurs schémas.
- YAML est pris en charge pour la lecture ; aucun outil de conversion JSON → YAML n'est fourni.
- Le serveur MCP est un adaptateur mince (voir « Limites connues du MCP » ci-dessus) : ni éditeur graphique, ni génération par IA, ni service multi-utilisateur.
