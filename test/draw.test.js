import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { normalizeSpec, statusOf, buildHtml, draw, closeDraw } from '../src/draw.js';
import { pickIcon } from '../src/visual-icons.js';

test('pickIcon : logo de marque, pictogramme depuis le français, initiale en dernier recours', () => {
  assert.deepEqual([pickIcon({ label: 'Envoi via Gmail' })].map(i => [i.kind, i.name]), [['brand', 'gmail']]);
  assert.equal(pickIcon({ label: 'Google Drive' }).name, 'googledrive');
  assert.equal(pickIcon({ label: 'Brouillon de réponse' }).name, 'file-pen');
  assert.equal(pickIcon({ label: 'Base de données' }).name, 'database');
  assert.equal(pickIcon({ label: 'Rendez-vous jeudi' }).name, 'calendar-clock');
  assert.equal(pickIcon({ label: 'Six and See' }).kind, 'letter');
  // Un mot courant en majuscule n'est pas une marque.
  assert.equal(pickIcon({ label: 'Note de frais' }).kind, 'line');
  // icon explicite : marque ou pictogramme anglais.
  assert.equal(pickIcon({ label: 'X', icon: 'github' }).name, 'github');
  assert.equal(pickIcon({ label: 'X', icon: 'server' }).name, 'server');
});

test('statuts : alias français et anglais, statut libre conservé', () => {
  assert.equal(statusOf('Supprimé').id, 'deleted');
  assert.equal(statusOf('en attente').id, 'waiting');
  assert.equal(statusOf('draft').id, 'draft');
  assert.deepEqual([statusOf('relu par Théo').id, statusOf('relu par Théo').label], ['custom', 'relu par Théo']);
  assert.equal(statusOf(''), null);
});

test('normalizeSpec : tolérant, devine la disposition', () => {
  assert.equal(normalizeSpec({ title: 'a', items: ['x', 'y'] }).layout, 'flow');
  assert.equal(normalizeSpec({ title: 'a', items: Array.from({ length: 8 }, (_, i) => `n${i}`) }).layout, 'grid');
  assert.equal(normalizeSpec({ title: 'a', items: [{ label: 'x', status: 'lu' }] }).layout, 'list');
  assert.equal(normalizeSpec({ title: 'a', columns: ['A', 'B'], items: [{ label: 'x', group: 2 }] }).items[0].group, 2);
  assert.equal(normalizeSpec({ title: 'a', layout: 'hub', items: ['x', 'y'] }).layout, 'flow');
  assert.equal(normalizeSpec({ title: 'a', items: [{ label: 'x'.repeat(200) }] }).items[0].label.length, 60);
  assert.throws(() => normalizeSpec({ items: ['x'] }), /title/);
  assert.throws(() => normalizeSpec({ title: 'a', items: [] }), /items/);
});

test('buildHtml : aucun pictogramme générique, texte échappé, aucune ressource externe', () => {
  const { html, icons } = buildHtml(normalizeSpec({ title: '<b>T</b>', items: ['Gmail', 'Serveur', 'Zorglub'] }));
  assert.ok(!html.includes('<b>T</b>') && html.includes('&lt;b&gt;'));
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(html), 'aucune URL réseau dans la page');
  assert.deepEqual(icons, ['Gmail → logo gmail', 'Serveur → server', 'Zorglub → initiale']);
});

test('draw : PNG rendu vite, navigateur réutilisé', { timeout: 60000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'terra-draw-test-'));
  try {
    await draw({ title: 'Chauffe', items: ['a'] }, { outDir: dir });
    const result = await draw({ title: 'Mails', items: [{ label: 'Devis', status: 'brouillon', preview: 'Bonjour' }] }, { outDir: dir });
    assert.equal(result.layout, 'list');
    assert.ok((await stat(result.png)).size > 10000);
    assert.ok(result.ms < 2000, `rendu à chaud en ${result.ms} ms`);
  } finally {
    await closeDraw();
    await rm(dir, { recursive: true, force: true });
  }
});
