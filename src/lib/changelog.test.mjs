import test from 'node:test';
import assert from 'node:assert/strict';
import { changelog, latestRelease } from '../data/changelog.js';
import { shouldShowWhatsNew } from './whatsNew.js';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

test('a release mais nova tem id, data AAAA-MM-DD, título e 1 a 6 itens não vazios', () => {
  const first = changelog[0];
  assert.ok(first, 'changelog vazio');
  assert.equal(latestRelease, first);
  assert.equal(typeof first.id, 'string');
  assert.ok(first.id.trim().length > 0);
  assert.match(first.date, ISO_DAY);
  assert.ok(!Number.isNaN(Date.parse(`${first.date}T12:00:00Z`)), 'data inválida');
  assert.equal(typeof first.title, 'string');
  assert.ok(first.title.trim().length > 0);
  assert.ok(Array.isArray(first.items));
  assert.ok(first.items.length >= 1 && first.items.length <= 6, `itens: ${first.items.length}`);
  for (const item of first.items) {
    assert.equal(typeof item, 'string');
    assert.ok(item.trim().length > 0, 'item vazio');
  }
});

test('todas as releases seguem o mesmo formato', () => {
  for (const release of changelog) {
    assert.match(release.date, ISO_DAY, release.id);
    assert.ok(release.title.trim(), release.id);
    assert.ok(release.items.length >= 1 && release.items.length <= 6, release.id);
  }
});

test('ids são únicos', () => {
  const ids = changelog.map((release) => release.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('ordenado da mais nova para a mais antiga', () => {
  for (let i = 1; i < changelog.length; i += 1) {
    assert.ok(changelog[i - 1].date >= changelog[i].date, `${changelog[i - 1].id} antes de ${changelog[i].id}`);
  }
});

test('diálogo aparece sem estado salvo e quando o id visto é outro; some depois de visto', () => {
  assert.equal(shouldShowWhatsNew(null, latestRelease), true);
  assert.equal(shouldShowWhatsNew('2020-01-01-antiga', latestRelease), true);
  assert.equal(shouldShowWhatsNew(latestRelease.id, latestRelease), false);
  assert.equal(shouldShowWhatsNew(null, undefined), false);
});
