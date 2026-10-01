// Smoke test du serveur MCP via un vrai client stdio : un `draw` par disposition, chronométré.
// Usage : npm run mcp:smoke   (images dans un dossier temporaire, chemin affiché)
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const dir = await mkdtemp(path.join(tmpdir(), 'terra-draw-mcp-smoke-'));
const transport = new StdioClientTransport({
  command: process.execPath, args: [fileURLToPath(new URL('../bin/terra-draw-mcp.js', import.meta.url))],
  env: { ...process.env, TERRA_DRAW_OUT: dir }
});
const client = new Client({ name: 'terra-draw-smoke', version: '0' });
await client.connect(transport);
const { tools } = await client.listTools();
console.log(`Outils exposés : ${tools.map(tool => tool.name).join(', ')}`);

const plans = [
  { title: 'Étapes', items: ['Théo demande', 'Agent Terra', 'Rendu Chromium', 'Image sur Discord'] },
  { title: 'Tes mails', items: [{ label: 'Promo', status: 'supprimé' }, { label: 'Devis', status: 'brouillon', preview: 'Bonjour…' }] },
  { title: 'Centre', layout: 'hub', items: ['Terra', 'Gmail', 'Discord', 'GitHub'] },
  { title: 'Comparaison', columns: ['MCP', 'API'], items: [{ label: 'Outils typés', group: 1 }, { label: 'Requêtes HTTP', group: 2 }] },
  { title: 'Grille', layout: 'grid', items: ['React', 'Docker', 'Stripe'] }
];
let failed = 0;
for (const plan of plans) {
  const started = performance.now();
  const result = await client.callTool({ name: 'draw', arguments: plan });
  const text = result.content?.[0]?.text ?? '';
  if (result.isError) failed += 1;
  console.log(`${result.isError ? 'KO' : 'ok'} ${Math.round(performance.now() - started)} ms (aller-retour MCP) · ${text.split('\n').reverse().join(' · ')}`);
}
await client.close();
console.log(failed ? `\n${failed} échec(s).` : `\nSmoke test MCP terminé avec succès. Images : ${dir}`);
process.exitCode = failed ? 1 : 0;
