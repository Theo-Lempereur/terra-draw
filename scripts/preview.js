import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderDiagram } from '../src/render.js';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  const { values } = parseArgs({ options: { port: { type: 'string' }, host: { type: 'string' } } });
  const port = Number(values.port ?? process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT / --port doit être compris entre 1 et 65535.');
  const { outDir, manifest } = await renderDiagram({ source: path.join(root, 'examples/mcp-vs-api.json'), outDir: path.join(root, 'dist/mcp-vs-api') });
  const preview = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Terra Draw · Aperçu</title><style>*{box-sizing:border-box}body{margin:0;background:#e9e8e3;color:#252b37;font:14px system-ui}nav{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 24px;background:#faf9f5;border-bottom:1px solid #ddddd5}nav strong{font-size:17px}nav div{display:flex;gap:16px}a{color:#68558a;text-decoration:none}a:hover{text-decoration:underline}.sheet{margin:24px auto;overflow:hidden;box-shadow:0 8px 40px #252b3710}iframe{display:block;border:0;transform-origin:top left}@media(max-width:550px){nav{align-items:flex-start;flex-direction:column}nav div{flex-wrap:wrap}}</style><nav><strong>terra draw <span style="font-weight:400;color:#85828b">/ aperçu local</span></strong><div><a href="/diagram.html" download>HTML</a><a href="/diagram.png" download>PNG</a><a href="/diagram.pdf" download>PDF</a><a href="/manifest.json" download>Manifest</a></div></nav><main class="sheet"><iframe title="MCP vs API directe" src="/diagram.html" width="${manifest.render.width}" height="${manifest.render.height}"></iframe></main><script>const frame=document.querySelector('iframe'),sheet=document.querySelector('.sheet');function fit(){const scale=Math.min(1,(innerWidth-32)/${manifest.render.width});frame.style.transform='scale('+scale+')';sheet.style.width=${manifest.render.width}*scale+'px';sheet.style.height=${manifest.render.height}*scale+'px'}addEventListener('resize',fit);fit();</script></html>`;
  const files = new Map([
    ['/diagram.html', 'text/html; charset=utf-8'], ['/diagram.png', 'image/png'],
    ['/diagram.pdf', 'application/pdf'], ['/manifest.json', 'application/json; charset=utf-8']
  ]);
  const server = createServer(async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(req.method === 'HEAD' ? undefined : preview); return;
      }
      if (!files.has(pathname)) { res.writeHead(404).end('Introuvable'); return; }
      const body = await readFile(path.join(outDir, pathname.slice(1)));
      res.writeHead(200, { 'Content-Type': files.get(pathname), 'Content-Length': body.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(500).end('Erreur de lecture'); }
  });
  server.on('error', error => { console.error(`terra-draw preview : ${error.message}`); process.exitCode = 1; });
  server.listen(port, values.host ?? '0.0.0.0', () => console.log(`Terra Draw : http://localhost:${port} · HTML / PNG / PDF disponibles`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
} catch (error) { console.error(`terra-draw preview : ${error.message}`); process.exitCode = 1; }
