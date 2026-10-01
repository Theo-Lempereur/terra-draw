# terra-draw

Un outil local pour transformer un plan **JSON ou YAML** en schéma explicatif **HTML éditable, PNG et PDF**. Quatre modèles (`comparison`, `hub-and-spoke`, `flow`, `cards-table`), trois niveaux d'explication (`visual`, `balanced`, `self_explanatory`), un pack d'icônes vendorisé. Rien n'est téléchargé pendant le rendu. Un [serveur MCP](#serveur-mcp) local (stdio) expose le même moteur à un agent IA.

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
src/mcp/tools.js            Logique des 6 outils MCP (fonctions pures, testables sans transport)
src/mcp/server.js           Déclaration des outils MCP (schémas zod) et câblage vers src/mcp/tools.js
schema/                     Contrats d'entrée versionnés (pivot + legacy)
assets/icons/                Pack d'icônes local (SVG, manifest, licence)
examples/                   Plans éditables (JSON et YAML), un par modèle
scripts/                    Installation Chromium, rendu des exemples, preview HTTP, vérifications, smoke test MCP
test/                       Validation, icônes, exports réels avec Chromium, outils et serveur MCP
docs/architecture.md        Le pipeline de rendu en détail
```

Le moteur est importable directement via `renderDiagram({ source, outDir, width, scale, mode, formats })` et `validateSource(source)` (`src/render.js`) : c'est ce que fait le serveur MCP, et ce que peut faire tout autre adaptateur Node. Un hôte non-Node peut aussi exécuter `bin/terra-draw.js` avec un tableau d'arguments et lire son JSON.

## Serveur MCP

Un serveur [MCP](https://modelcontextprotocol.io) local, en stdio, pour qu'un agent (Terra, Hermes, Claude Code, ou tout autre client MCP) crée, modifie, inspecte et rende des diagrammes sans réimplémenter le moteur. Chaque outil construit ou lit un objet plan au format pivot puis appelle `validateDiagram()` / `renderDiagram()` — exactement ce que fait le CLI. Rien n'est dupliqué : `src/introspect.js` et `src/mcp/tools.js` sont les seuls points d'entrée, et les messages d'erreur sont ceux de `src/validate.js`.

### Lancer le serveur

```bash
npm run mcp
```

Le serveur lit et écrit du JSON-RPC sur stdin/stdout ; tout diagnostic (y compris « serveur MCP prêt sur stdio ») part sur stderr, jamais sur stdout. Il s'arrête avec le processus qui l'a lancé : pas de démon, pas de port réseau, pas d'état partagé entre agents.

### Configurer un client MCP

```json
{
  "mcpServers": {
    "terra-draw": {
      "command": "node",
      "args": ["/chemin/absolu/vers/terra-draw/bin/terra-draw-mcp.js"]
    }
  }
}
```

(Format accepté par Claude Code, Claude Desktop et la plupart des clients MCP via `claude mcp add` ou un fichier de configuration équivalent.)

### Les 6 outils

| Outil | Rôle |
|---|---|
| `list_templates` | Les 4 modèles, leurs rôles de node et leurs contraintes — lu depuis le moteur, jamais désynchronisé |
| `list_icons` | Le pack vendoré (43 pictogrammes) et ses ~280 alias |
| `resolve_icons` | Résout des noms libres (`"Google Drive"`, `"github"`…) vers l'icône réellement utilisée (exacte, alias, ou repli `generic`) |
| `create_diagram` | Écrit un nouveau plan `.json`/`.yaml` : paramètres structurés (`nodes`/`groups`/`edges`/`table`/…), ou `brief` — une liste courte d'éléments, pour un squelette déterministe limité à `flow` (étapes dans l'ordre) et `hub-and-spoke` (premier élément = centre) |
| `render_diagram` | Rend un plan existant en HTML/PNG/PDF + manifest, identique au CLI (`--mode`, `--formats`, `--width`, `--scale`) |
| `update_diagram` | Modifie un plan existant : `set` pour les champs scalaires, `canvas` en fusion, `nodes`/`groups`/`edges` en remplacement complet ou `{ upsert, remove }` par id, `table`/`badges`/`notes`/`legend`/`exports` en remplacement complet |

Chaque outil déclare un schéma d'entrée et de sortie (zod, converti en JSON Schema côté protocole). Une entrée invalide, une référence inconnue ou une modification ambiguë renvoie un résultat `isError: true` avec un message exploitable — jamais une valeur inventée ni un crash silencieux.

Exemple d'appel (`create_diagram` avec un brief) :

```json
{ "name": "create_diagram", "arguments": {
  "path": "dist/pipeline.json", "template": "flow", "title": "Du brief au schéma exporté",
  "brief": ["Brief", "Plan pivot", "Validation", "Rendu exporté"]
} }
```

produit un plan `flow` à 4 étapes (edges déduits), identique à un plan écrit à la main avec `role: "step"` pour chaque nœud.

### Vérifier que ça fonctionne

```bash
npm run mcp:smoke   # Client + serveur réels sur stdio : crée, rend puis modifie un diagramme (Chromium requis)
npm run check        # Inclut une vérification en mémoire des outils MCP, hors ligne
npm test              # Inclut test/mcp.test.js : helpers unitaires + intégration stdio bout en bout
```

### Limites connues du MCP

- Transport stdio uniquement : pas de HTTP/SSE, pas de multi-client, pas d'authentification — un process MCP correspond à un agent local, comme le CLI.
- `brief` (squelette déterministe) ne couvre que `flow` et `hub-and-spoke` : `comparison` (2 colonnes) et `cards-table` (table obligatoire) demandent des paramètres structurés explicites. Aucun appel à un service d'IA externe n'est fait pour « compléter » un brief.
- `update_diagram` n'accepte que des opérations explicites et nommées ; toute autre forme est refusée plutôt qu'interprétée. Le format historique (étape 1) n'est pas éditable par cet outil (recréer au format pivot).

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
