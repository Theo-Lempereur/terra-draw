# terra-draw

Un outil local pour transformer un plan **JSON ou YAML** en schéma explicatif **HTML éditable, PNG et PDF**. Quatre modèles (`comparison`, `hub-and-spoke`, `flow`, `cards-table`), trois niveaux d'explication (`visual`, `balanced`, `self_explanatory`), un pack d'icônes vendorisé. Rien n'est téléchargé pendant le rendu.

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

## Structure et future intégration Terra / MCP

```text
bin/terra-draw.js           Commandes CLI (render, validate, templates, icons)
src/source.js               Lecture JSON/YAML
src/validate.js             JSON Schema, règles par modèle, modes, migration étape 1
src/template.js             Assemblage HTML (en-tête, badges, table, notes, légende)
src/templates/*.js          Mise en page propre à chaque modèle (comparison, hub-and-spoke, flow, cards-table)
src/connectors.js           Flèches SVG calculées sur la mise en page réelle (dans Chromium)
src/icons.js                Résolution et validation du pack d'icônes
src/palette.js              Les six teintes, seule source de vérité (CSS + SVG)
src/render.js                API de rendu et orchestration des exports
schema/                     Contrats d'entrée versionnés (pivot + legacy)
assets/icons/                Pack d'icônes local (SVG, manifest, licence)
examples/                   Plans éditables (JSON et YAML), un par modèle
scripts/                    Installation Chromium, rendu des exemples, preview HTTP, vérifications
test/                       Validation, icônes, exports réels avec Chromium
docs/architecture.md        Point d'entrée pour un futur adaptateur MCP
```

Un futur outil MCP pourra exécuter le CLI avec un tableau d'arguments, puis lire son JSON et le manifest. Le même moteur est importable via `renderDiagram({ source, outDir, width, scale, mode, formats })` et `validateSource(source)`. Aucun serveur MCP, éditeur graphique ou appel à un service d'IA n'est implémenté.

## Vérification

```bash
npm run check    # Syntaxe, pack d'icônes, cohérence palette/CSS, modèles, exemples valides — hors ligne, sans Chromium
npm test          # Rendu réel des 4 exemples, PNG/PDF/HTML, CLI, modes, échappement — avec Chromium
npm run example   # Rend tous les exemples dans dist/
```

Les tests lancent le CLI, vérifient les dimensions PNG, le PDF d'une page, les empreintes, l'ouverture HTML sans réseau ni JavaScript, les références invalides, l'échappement, les modes et la protection des fichiers existants. `npm run example` tient lieu de build : JavaScript natif, sans compilation.

Les versions npm sont verrouillées. À environnement identique, HTML et PNG sont déterministes ; les métadonnées de création du PDF peuvent changer. La sortie reste un canevas à largeur fixe, redimensionné dans la preview. Les exports, dépendances et caches ne sont pas versionnés. La police Inter est sous licence SIL OFL, conservée dans les artefacts HTML.

## Limites connues

- Pas d'éditeur graphique ni de layout libre : quatre modèles fixes, pensés pour rester lisibles plutôt que pour tout représenter.
- `flow` est limité à 8 étapes, `hub-and-spoke` à 10 satellites, `comparison` à 2 colonnes : au-delà, découper en plusieurs schémas.
- YAML est pris en charge pour la lecture ; aucun outil de conversion JSON → YAML n'est fourni.
- Pas de couche MCP : le CLI est conçu pour être appelé par un futur adaptateur, pas pour en faire office.
