// Local preview: renders every example once at startup, then serves them with
// download links. Only this page uses JavaScript; the exported diagrams do not.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderExamples } from './examples.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const TYPES = new Map([
  ['diagram.html', 'text/html; charset=utf-8'], ['diagram.png', 'image/png'],
  ['diagram.pdf', 'application/pdf'], ['manifest.json', 'application/json; charset=utf-8']
]);
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

function indexPage(diagrams) {
  const data = diagrams.map(({ name, manifest }) => ({
    name, title: manifest.plan.title, template: manifest.template, mode: manifest.mode,
    width: manifest.render.width, height: manifest.render.height
  }));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Terra Draw · Aperçu</title>
<style>*{box-sizing:border-box}body{margin:0;background:#e9e8e3;color:#252b37;font:14px/1.5 system-ui,sans-serif}
nav{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;padding:14px 24px;background:#faf9f5;border-bottom:1px solid #ddddd5;position:sticky;top:0;z-index:5}
nav strong{font-size:17px}.tabs{display:flex;gap:8px;flex-wrap:wrap}
button{font:inherit;cursor:pointer;border:1px solid #dcdcd4;background:#fff;color:#4a4f5c;border-radius:999px;padding:6px 14px}
button[aria-current=true]{background:#ede8f5;border-color:#d7cfe6;color:#5d4d80;font-weight:600}
.links{display:flex;gap:14px;flex-wrap:wrap}a{color:#68558a;text-decoration:none}a:hover{text-decoration:underline}
.meta{padding:10px 24px;color:#6d717c;font-size:12px}
.sheet{margin:18px auto 32px;overflow:hidden;box-shadow:0 8px 40px #252b3714;background:#faf9f5}
iframe{display:block;border:0;transform-origin:top left}</style>
<nav><strong>terra draw <span style="font-weight:400;color:#85828b">/ aperçu local</span></strong>
<div class="tabs">${data.map((item, index) => `<button type="button" data-index="${index}"${index === 0 ? ' aria-current="true"' : ''}>${escape(item.title)}</button>`).join('')}</div>
<div class="links"><a id="l-html" download>HTML</a><a id="l-png" download>PNG</a><a id="l-pdf" download>PDF</a><a id="l-manifest" download>Manifest</a></div></nav>
<p class="meta" id="meta"></p>
<main class="sheet"><iframe id="frame" title="Aperçu du schéma"></iframe></main>
<script>
const items = ${JSON.stringify(data)};
const frame = document.getElementById('frame'), sheet = document.querySelector('.sheet');
let current = 0;
function fit() {
  const item = items[current];
  const scale = Math.min(1, (innerWidth - 32) / item.width);
  frame.width = item.width; frame.height = item.height;
  frame.style.transform = 'scale(' + scale + ')';
  sheet.style.width = item.width * scale + 'px';
  sheet.style.height = item.height * scale + 'px';
}
function show(index) {
  current = index;
  const item = items[index];
  frame.src = '/' + item.name + '/diagram.html';
  for (const key of ['html', 'png', 'pdf']) document.getElementById('l-' + key).href = '/' + item.name + '/diagram.' + key;
  document.getElementById('l-manifest').href = '/' + item.name + '/manifest.json';
  document.getElementById('meta').textContent = item.template + ' · mode ' + item.mode + ' · ' + item.width + '×' + item.height + ' px · ' + item.name;
  for (const button of document.querySelectorAll('.tabs button')) button.setAttribute('aria-current', String(Number(button.dataset.index) === index));
  fit();
}
document.querySelector('.tabs').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (button) show(Number(button.dataset.index));
});
addEventListener('resize', fit);
show(0);
</script></html>`;
}

try {
  const { values } = parseArgs({ options: { port: { type: 'string' }, host: { type: 'string' } } });
  const port = Number(values.port ?? process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT / --port doit être compris entre 1 et 65535.');

  const outRoot = path.join(root, 'dist/preview');
  const diagrams = await renderExamples({ outRoot, onProgress: name => console.log(`  rendu ${name}…`) });
  if (!diagrams.length) throw new Error('Aucun exemple à afficher dans examples/.');
  const page = indexPage(diagrams);
  const known = new Set(diagrams.map(diagram => diagram.name));

  const server = createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
      const { pathname } = new URL(request.url, 'http://localhost');
      if (pathname === '/') {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(request.method === 'HEAD' ? undefined : page);
        return;
      }
      const [, name, file] = pathname.split('/');
      if (!known.has(name) || !TYPES.has(file)) { response.writeHead(404).end('Introuvable'); return; }
      const body = await readFile(path.join(outRoot, name, file));
      response.writeHead(200, { 'Content-Type': TYPES.get(file), 'Content-Length': body.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch { response.writeHead(500).end('Erreur de lecture'); }
  });
  server.on('error', error => { console.error(`terra-draw preview : ${error.message}`); process.exitCode = 1; });
  server.listen(port, values.host ?? '0.0.0.0', () => console.log(`Terra Draw : http://localhost:${port} · ${diagrams.length} schémas · HTML / PNG / PDF`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
} catch (error) {
  console.error(`terra-draw preview : ${error.message}`);
  process.exitCode = 1;
}
