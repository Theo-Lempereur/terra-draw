# terra-draw

Un prototype local pour transformer un plan JSON en schéma explicatif **HTML éditable, PNG et PDF**. Un seul modèle à ce stade : une comparaison de deux chemins, illustrée par **MCP vs API directe**.

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

Raccourci : `npm run example`. Sans npm : `node bin/terra-draw.js render examples/mcp-vs-api.json --out dist/mcp-vs-api`. Avec un lien npm local installé, le binaire s'appelle `terra-draw` ; aucune publication npm n'est nécessaire.

Les fichiers réellement produits sont :

```text
dist/mcp-vs-api/
  diagram.html     # Texte, CSS et SVG, polices intégrées ; aucun JS ni CDN
  diagram.png      # PNG à l'échelle 2 par défaut
  diagram.pdf      # Une page aux dimensions du schéma, texte sélectionnable
  manifest.json   # Source et empreinte, paramètres, navigateur, fichiers et SHA-256
```

Ouvrir `diagram.html` directement dans un navigateur, ou lancer la preview avec boutons de téléchargement :

```bash
npm run dev                       # http://localhost:3000
PORT=4200 npm run dev              # Port fourni par Terra
npm run dev -- --port 4200         # Prioritaire sur PORT
```

La preview régénère l'exemple au démarrage et écoute sur `0.0.0.0` (`--host 127.0.0.1` pour rester local). Redémarrer après modification du JSON ; pas de serveur de compilation ni de rechargement automatique. `npm start` est équivalent.

Options de rendu : `--width 1200` à `2400` (défaut `1440`), `--scale 1`, `2` ou `3` pour le PNG. Les erreurs vont sur stderr avec code de sortie 1 ; le succès écrit un objet JSON sur stdout. Un dossier d'exports existant peut être régénéré ; un dossier contenant d'autres fichiers est refusé. Éviter deux rendus simultanés vers le même dossier.

## Modifier le schéma

Copier [l'exemple](examples/mcp-vs-api.json) et conserver `version: 1`, `template: "comparison"`. Le [JSON Schema](schema/diagram.schema.json) documente et valide les champs :

- `title`, `subtitle`, `eyebrow` : en-tête ; `agent` : carte d'entrée.
- `branches` : exactement deux sections, chacune avec titre, description, couleur, 1 à 4 `cards` et 1 à 4 `tools`.
- Une carte possède `id`, `title` et, en option, `body`, `badge`, `icon`. Les identifiants sont uniques.
- `connectors` : `from`, `to`, puis `label`, `tone`, `dashed` facultatifs. Flèches entre étapes successives d'une même branche, ou de l'agent vers la première carte ; ce modèle n'est pas un moteur de graphes libre.
- `comparison` : lignes avec `label` et deux `values` dans l'ordre des branches ; `annotation` : `title` et `body` ; `footer` facultatif.

Couleurs : `amber`, `green`, `purple`, `neutral`. Icônes SVG locales : `spark`, `code`, `key`, `check`, `server`, `mail`, `folder`. Toute icône inconnue reçoit un pictogramme générique ; aucun logo n'est téléchargé. Les champs sont du texte, jamais du HTML exécutable. Privilégier des formulations courtes pour les cartes et les étiquettes.

Le schéma représente les appels aller. MCP standardise la découverte et l'invocation des outils ; authentification, autorisations et validations restent nécessaires. Références : [outils MCP](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), [export PDF Playwright](https://playwright.dev/docs/api/class-page#page-pdf).

## Structure et future intégration Terra / MCP

```text
bin/terra-draw.js           Arguments CLI et codes de sortie
src/validate.js            JSON Schema et intégrité des connexions
src/template.js           Cartes HTML, icônes et connecteurs SVG
src/styles.css            Présentation du modèle comparison
src/render.js              API de rendu et orchestration des exports
schema/                    Contrat d'entrée versionné
examples/                  Plans éditables
scripts/                   Installation Chromium et preview HTTP
test/                      Validation et exports réels avec Chromium
docs/architecture.md       Point d'entrée pour un futur adaptateur MCP
```

Un futur outil MCP pourra exécuter le CLI avec un tableau d'arguments, puis lire son JSON et le manifest. Le même moteur est importable via `renderDiagram({ source, outDir, width, scale })`. Aucun serveur MCP, éditeur graphique ou appel à un service d'IA n'est implémenté.

## Vérification

```bash
npm run check
npm test
npm run example
```

Les tests lancent le CLI, vérifient les dimensions PNG, le PDF d'une page, les empreintes, l'ouverture HTML sans réseau ni JavaScript, les références invalides, l'échappement et la protection des fichiers existants. `npm run example` tient lieu de build : JavaScript natif, sans compilation.

Les versions npm sont verrouillées. À environnement identique, HTML et PNG sont déterministes ; les métadonnées de création du PDF peuvent changer. La sortie reste un canevas à largeur fixe, redimensionné dans la preview. Les exports, dépendances et caches ne sont pas versionnés. La police Inter est sous licence SIL OFL, conservée dans les artefacts HTML.
