import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { iconPack, iconNames, iconAliases, resolveIcon, normalizeIconName, createIconSet, shapesOf, FALLBACK_ICON } from '../src/icons.js';

const packDir = fileURLToPath(new URL('../assets/icons/', import.meta.url));

test('le pack est complet, local et documenté', async () => {
  const pack = iconPack();
  const files = (await readdir(packDir)).filter(name => name.endsWith('.svg'));
  assert.equal(files.length, iconNames().length);
  assert.ok(iconNames().includes(FALLBACK_ICON));
  assert.equal(pack.manifest.license, 'MIT');
  assert.ok(pack.manifest.provenance.length > 40);
  assert.ok(Object.keys(iconAliases()).length > 100);
  // Chaque alias pointe vers un pictogramme réel et ne masque pas un fichier.
  for (const [alias, target] of Object.entries(iconAliases())) {
    assert.ok(iconNames().includes(target), `alias ${alias} → ${target} inconnu`);
    assert.ok(!iconNames().includes(alias), `l’alias ${alias} masque un fichier`);
  }
});

test('aucun fichier du pack ne référence une ressource distante ni un script', async () => {
  for (const file of (await readdir(packDir)).filter(name => name.endsWith('.svg'))) {
    const markup = await readFile(path.join(packDir, file), 'utf8');
    assert.doesNotMatch(markup, /https?:\/\/(?!www\.w3\.org)/, `${file} référence une URL distante`);
    assert.doesNotMatch(markup, /<script|on[a-z]+=|xlink:href|<image|<use/i, `${file} contient un élément interdit`);
    assert.doesNotThrow(() => shapesOf(markup, file));
  }
});

test('le validateur de pack refuse un contenu hors formes géométriques', () => {
  const wrap = inner => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${inner}</svg>`;
  assert.throws(() => shapesOf(wrap('<script/>'), 'x.svg'), /<script> non autorisé/);
  assert.throws(() => shapesOf(wrap('<image href="http://exemple.test/a.png"/>'), 'x.svg'), /<image> non autorisé/);
  assert.throws(() => shapesOf(wrap('<path onload="alert(1)" d="M0 0"/>'), 'x.svg'), /attribut "onload" non autorisé/);
  assert.throws(() => shapesOf(wrap('<path d="M0 0"/>texte libre'), 'x.svg'), /contenu non supporté/);
  assert.throws(() => shapesOf('<p>bonjour</p>', 'x.svg'), /un unique élément <svg> est attendu/);
  assert.doesNotThrow(() => shapesOf(wrap('<path d="M0 0"/><circle cx="1" cy="1" r="1"/>'), 'x.svg'));
});

test('résolution : noms libres, alias, repli et noms dangereux', () => {
  assert.equal(resolveIcon('github').name, 'branch');
  assert.equal(resolveIcon('GitHub').name, 'branch');
  assert.equal(resolveIcon('  Google Drive  ').name, 'folder');
  assert.equal(resolveIcon('mcp').name, 'plug');
  assert.equal(resolveIcon('server').name, 'server');
  assert.equal(resolveIcon('server').alias, false);
  for (const dangerous of ['../../etc/passwd', '__proto__', 'constructor', 'prototype', '', null, undefined, 'nom.inconnu']) {
    const icon = resolveIcon(dangerous);
    assert.equal(icon.name, FALLBACK_ICON, `${dangerous} aurait dû retomber sur ${FALLBACK_ICON}`);
    assert.equal(icon.fallback, true);
  }
  assert.equal(normalizeIconName('Base de Données'), 'base-de-données'.replace(/[^a-z0-9-]/g, ''));
  assert.equal(normalizeIconName('a'.repeat(80)).length, 48);
});

test('le rapport d’icônes distingue les noms résolus des replis', () => {
  const set = createIconSet();
  const svg = set.svg('gmail');
  assert.match(svg, /^<svg viewBox="0 0 24 24"/);
  assert.match(svg, /aria-hidden="true"/);
  set.svg('server');
  set.svg('licorne-rose');
  const report = set.report();
  assert.equal(report.network, false);
  assert.equal(report.pack, 'terra-draw-icons/1');
  assert.deepEqual(report.resolved, ['gmail → mail', 'server']);
  assert.deepEqual(report.fallback, ['licorne-rose']);
});
