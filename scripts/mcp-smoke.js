// Exemple vérifiable d'utilisation du serveur MCP : un vrai client s'y connecte
// en stdio (comme le ferait Terra, Hermes ou Claude Code), liste les outils,
// crée un plan depuis un brief, le rend réellement (Chromium hors ligne), puis
// lui applique une modification explicite. Lancer avec `npm run mcp:smoke`.
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = path.join(root, 'bin/terra-draw-mcp.js');

function call(client, name, args) {
  console.log(`\n→ tools/call ${name} ${JSON.stringify(args)}`);
  return client.callTool({ name, arguments: args });
}

function report(result) {
  if (result.isError) {
    console.error(`  ✗ ${result.content[0].text}`);
    throw new Error(`Appel d'outil en échec : ${result.content[0].text}`);
  }
  console.log(`  ✓ ${JSON.stringify(result.structuredContent)}`);
  return result.structuredContent;
}

const dir = await mkdtemp(path.join(tmpdir(), 'terra-draw-mcp-smoke-'));
const transport = new StdioClientTransport({ command: process.execPath, args: [server], cwd: root });
const client = new Client({ name: 'terra-draw-mcp-smoke', version: '0' });

try {
  await client.connect(transport);

  const { tools } = await client.listTools();
  console.log(`Outils exposés : ${tools.map(tool => tool.name).join(', ')}`);

  const planPath = path.join(dir, 'pipeline.json');
  const created = report(await call(client, 'create_diagram', {
    path: planPath, template: 'flow', title: 'Du brief au schéma exporté (smoke MCP)',
    brief: ['Brief', 'Plan pivot', 'Validation', 'Rendu exporté']
  }));

  const outDir = path.join(dir, 'export');
  const rendered = report(await call(client, 'render_diagram', { source: created.path, outDir, scale: 1 }));

  report(await call(client, 'update_diagram', {
    source: created.path, set: { footer: 'Rendu via le smoke test MCP de terra-draw.' }
  }));

  const manifest = JSON.parse(await readFile(rendered.manifestPath, 'utf8'));
  console.log(`\nFichiers produits :\n${rendered.files.map(file => `  - ${file.path} (${file.bytes} octets)`).join('\n')}`);
  console.log(`Manifest généré par ${manifest.generator}, gabarit ${manifest.template}, mode ${manifest.mode}.`);
  console.log('\nSmoke test MCP terminé avec succès.');
} finally {
  await client.close().catch(() => {});
  await rm(dir, { recursive: true, force: true });
}
