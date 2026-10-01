# Du plan au rendu, puis à MCP

```text
Agent Terra / Hermes / tout client MCP
  → src/mcp/server.js + src/mcp/tools.js (serveur MCP, stdio)
    → terra-draw render source.json|yaml --out dossier [--mode] [--formats]
      → lecture JSON/YAML (src/source.js)
      → validation JSON Schema + règles par modèle + migration étape 1 (src/validate.js)
      → mise en page HTML/CSS propre au modèle (src/templates/*.js)
      → résolution d'icônes locale, sans réseau (src/icons.js)
      → Chromium hors ligne : flèches SVG mesurées sur la mise en page réelle (src/connectors.js)
      → HTML autonome + PNG + PDF + manifest.json
```

## Le pipeline de validation

`validateDiagram()` (`src/validate.js`) fait trois passes, chacune avec des messages d'erreur qui nomment le champ fautif :

1. **Migration étape 1** : si le plan a les clés `agent`/`branches` de l'ancien format, `fromLegacy()` le convertit vers le format pivot (toujours `template: "comparison"`) avant de continuer. Le rendu final est strictement identique à celui d'un plan pivot équivalent (vérifié par test).
2. **JSON Schema** (`schema/diagram.schema.json` ou `schema/legacy-comparison.schema.json`) : types, énumérations, longueurs, présence des champs obligatoires. Les erreurs Ajv sont reformulées en phrases lisibles (`describe()`), avec un aperçu de la valeur reçue quand c'est utile.
3. **Règles par modèle** (`TEMPLATES` dans `src/validate.js`) : rôles autorisés, nombre de groupes, cohérence des `edges` avec la topologie du modèle (`comparison` relie des étapes successives d'une même colonne, `hub-and-spoke` relie toujours le hub, `flow` relie des étapes consécutives ou revient en arrière). Si `edges` est omis, `deriveEdges()` les déduit.

Le résultat est un plan **normalisé** : chaque node a sa teinte résolue (héritée du groupe ou de `canvas.accent`), chaque edge a son `tone`/`dashed`, le mode a sa `density` (voir `MODES`). C'est ce plan normalisé que `src/template.js` consomme — jamais l'entrée brute.

## Les modèles (`src/templates/*.js`)

Chaque modèle exporte trois choses : `meta` (nom, rôles, besoins — utilisé par `terra-draw templates`), `body({ plan, card, escape, density })` qui produit le HTML du corps, et `connectors(plan)` qui annote chaque edge normalisé avec ses ancrages géométriques (`exit`, `enter`, `route`, `bus`). Ajouter un modèle demande d'implémenter ces trois exports et de l'enregistrer dans `TEMPLATES` (`src/validate.js`) et `templates` (`src/template.js`) ; le moteur d'export (Chromium, manifest, protection du dossier) ne change pas.

Le SVG des flèches est calculé une fois les polices chargées et la mise en page posée (`src/connectors.js`, exécuté dans la page via `page.evaluate`), puis figé dans le HTML exporté qui ne contient aucun script. Modifier directement le texte du HTML exporté reste possible pour une correction mineure ; un changement de fond doit repartir du plan source.

## Les modes (`MODES` dans `src/validate.js`)

`visual` / `balanced` / `self_explanatory` ne changent pas la structure du plan, seulement la densité d'affichage lue par `src/template.js` : visibilité des corps de carte, du tableau, nombre de notes conservées, épaisseur des traits, échelle des icônes. `--mode` en CLI peut surcharger le `mode` déclaré dans le plan sans revalider le reste.

## Les icônes (`src/icons.js`, `assets/icons/`)

Le pack est lu une fois par process depuis `assets/icons/` (SVG + `manifest.json` listant licence, provenance et alias). `resolveIcon()` normalise un nom libre (`"Google Drive"` → `google-drive`) puis cherche un fichier exact, sinon un alias, sinon retombe sur `generic`. Chaque fichier SVG du pack est validé à la lecture (`shapesOf()`) : seules des formes géométriques auto-fermantes (`path`, `circle`, `rect`…) avec une liste d'attributs autorisés sont acceptées — aucun `<script>`, `<image>`, attribut `on*` ou référence externe ne peut s'y glisser, y compris si le pack est étendu plus tard. `createIconSet()` suit, pour un rendu donné, quels noms ont été résolus directement, via alias, ou retombés sur le fallback ; ce rapport est écrit dans `manifest.json` (`icons.resolved` / `icons.fallback`) pour qu'un agent sache quels noms corriger.

## Les exports (`src/render.js`)

`renderDiagram({ source, outDir, width, scale, mode, formats })` expose le moteur complet et renvoie `{ outDir, manifest }`. Les erreurs sont des exceptions ; seul le CLI choisit les codes de sortie. `validateSource(source)` expose la validation seule, sans Chromium, pour `terra-draw validate` et pour des vérifications rapides. Un adaptateur Node peut appeler ces fonctions directement. Tout autre hôte peut lancer `bin/terra-draw.js` avec une liste d'arguments, sans construire de commande shell, puis analyser stdout en JSON.

Le serveur MCP (`src/mcp/*`, voir le README) appelle ces mêmes fonctions sans les dupliquer : `render_diagram` délègue à `renderDiagram()`, `create_diagram`/`update_diagram` construisent ou éditent un objet plan puis délèguent à `validateDiagram()` avant d'écrire quoi que ce soit sur disque. Le CLI et le MCP restent des outils locaux de confiance, pas des services multi-utilisateurs : un process MCP par agent, pas de répertoire de travail partagé, pas d'authentification. Ni l'un ni l'autre n'effectue d'accès à GitHub, Gmail ou Drive : ces noms ne sont que des éléments du schéma ou des alias d'icônes.

Les exports sont d'abord écrits dans un dossier temporaire adjacent. Le dossier final n'est remplacé qu'après réussite du rendu. Seuls les dossiers contenant exclusivement des exports reconnus par le manifest peuvent être remplacés. Le manifest contient le nom du fichier source, son format (`json`/`yaml`) et son SHA-256, jamais un chemin absolu local, les empreintes de chaque artefact produit, et le rapport d'icônes. Aucun horodatage volontaire n'est ajouté ; Chromium peut dater le PDF.

Chromium est lancé hors ligne (`page.route('**/*', route => route.abort())`) : même un plan malveillant ne peut pas déclencher de requête réseau pendant le rendu. Les champs texte sont systématiquement échappés (`escapeHtml`) ; aucun champ du format pivot n'accepte de HTML brut. Inter provient du paquet `@fontsource/inter`, avec sa licence SIL OFL intégrée dans chaque export en commentaire.

## Étendre le format

Le contrat `version: 1` est volontairement fermé (`additionalProperties: false`) pour que les fautes de frappe d'un agent soient détectées plutôt que silencieusement ignorées. Ajouter un champ demande une entrée dans `schema/diagram.schema.json`, puis dans la lecture (`src/validate.js`) et l'éventuel rendu (`src/template.js` / `src/templates/*.js`). Un changement de contrat incompatible passerait par `version: 2`, avec les deux schémas supportés en parallèle comme c'est déjà le cas pour l'étape 1.
