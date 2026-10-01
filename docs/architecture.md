# Du plan au rendu, puis à MCP

```text
Agent Terra / Hermes (futur)
  → adaptateur MCP (futur)
    → terra-draw render source.json --out dossier
      → validation JSON et références
      → HTML/CSS + SVG local
      → Chromium sans requêtes réseau
      → HTML autonome + PNG + PDF + manifest.json
```

`src/render.js` expose `renderDiagram({ source, outDir, width = 1440, scale = 2 })` et renvoie `{ outDir, manifest }`. Les erreurs sont des exceptions ; seul le CLI choisit les codes de sortie. Un adaptateur Node peut appeler cette fonction directement. Tout autre hôte peut lancer `bin/terra-draw.js` avec une liste d'arguments, sans construire de commande shell, puis analyser stdout en JSON.

Le futur adaptateur devra définir son propre répertoire de travail, limiter les chemins et les ressources, sérialiser les écritures vers un même dossier et retourner des références aux artefacts. Le CLI est un outil local de confiance, pas un service multi-utilisateur. Il n'effectue aucun accès à GitHub, Gmail ou Drive : ces noms ne sont que des éléments du schéma.

Le contrat `version: 1` / `template: comparison` reste volontairement limité à deux branches. JSON Schema contrôle les champs ; le validateur contrôle les identifiants et la direction des arêtes. Un ajout de modèle demandera une nouvelle implémentation de mise en page, pas un remplacement du moteur d'export. Le format n'accepte ni HTML brut, ni ressources distantes, ni chemins d'icônes arbitraires.

Le SVG est calculé à partir des positions réelles des cartes une fois les polices chargées. Il est figé dans le HTML exporté, qui ne contient aucun script. Modifier directement le texte du HTML reste possible ; pour recalculer la disposition et les flèches, modifier le JSON et relancer le rendu.

Les exports sont d'abord écrits dans un dossier temporaire adjacent. Le dossier final n'est remplacé qu'après réussite du rendu. Seuls les dossiers contenant exclusivement des exports reconnus par le manifest peuvent être remplacés. Le manifest contient le nom du fichier source et son SHA-256, jamais un chemin absolu local, et les empreintes des trois artefacts. Aucun horodatage volontaire n'est ajouté ; Chromium peut dater le PDF.

Les icônes génériques sont dessinées localement. Inter provient du paquet `@fontsource/inter`, avec sa licence SIL OFL. Les exports embarquent les fichiers de police ; aucune requête réseau n'est autorisée pendant le rendu.
