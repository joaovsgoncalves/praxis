import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createFinanceRouter } from './routes/finance.js';
import { BRAND_COLOR_IDS, initFinanceSchema, seedFinanceIfEmpty } from './finance.js';
import { createTestDb, requestJson, startTestServer } from './test-support/helpers.mjs';
import { BRAND_PALETTE, accountBrand, brandOptionsFor, contrastRatio } from '../src/lib/financeBrand.js';

async function mountFinance(t) {
  const db = createTestDb({ withFinance: true });
  seedFinanceIfEmpty(db);
  const app = express();
  app.use(express.json());
  app.use('/api/finance', createFinanceRouter({ db, getLocalDateString: () => '2026-08-12' }));
  const server = await startTestServer(app);
  t.after(() => {
    db.close();
    return server.close();
  });
  return { db, server };
}

async function patchRaw(base, path, body) {
  const response = await fetch(`${base}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

function columns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

test('migração da carteira é aditiva e idempotente', () => {
  const db = createTestDb({ withFinance: true });
  seedFinanceIfEmpty(db);
  const before = db.prepare('SELECT id, name, institution FROM finance_accounts ORDER BY id').all();

  initFinanceSchema(db);
  initFinanceSchema(db);

  const accountCols = columns(db, 'finance_accounts');
  const settingsCols = columns(db, 'finance_settings');
  assert.equal(accountCols.filter((c) => c === 'brand_color').length, 1);
  assert.equal(accountCols.filter((c) => c === 'card_last4').length, 1);
  assert.equal(settingsCols.filter((c) => c === 'hide_values').length, 1);
  assert.deepEqual(db.prepare('SELECT id, name, institution FROM finance_accounts ORDER BY id').all(), before);
  db.close();
});

test('migração adiciona colunas num banco antigo sem perder dados', () => {
  const db = createTestDb();
  db.exec(`
    CREATE TABLE finance_settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      reserved_car REAL DEFAULT 0,
      reserved_live REAL DEFAULT 0,
      snapshot_label TEXT DEFAULT '',
      updated_at TEXT
    );
    CREATE TABLE finance_accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT DEFAULT 'checking',
      institution TEXT DEFAULT '',
      mask TEXT DEFAULT '',
      pierre_account_id TEXT,
      is_operational INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );
    INSERT INTO finance_accounts (id, name, institution) VALUES ('acc-old', 'Antiga', 'inter');
    INSERT INTO finance_settings (id, reserved_car) VALUES ('default', 42);
  `);

  initFinanceSchema(db);

  const acc = db.prepare('SELECT * FROM finance_accounts WHERE id = ?').get('acc-old');
  assert.equal(acc.name, 'Antiga');
  assert.equal(acc.brand_color, null);
  assert.equal(acc.card_last4, null);
  const settings = db.prepare('SELECT * FROM finance_settings').get();
  assert.equal(settings.reserved_car, 42);
  assert.equal(settings.hide_values, 0);
  db.close();
});

test('PATCH /accounts/:id aceita brand_color (paleta e hex) e card_last4', async (t) => {
  const { server } = await mountFinance(t);

  const byPalette = await requestJson(server.base, '/api/finance/accounts/acc-inter', {
    method: 'PATCH',
    body: { brand_color: 'vinho', card_last4: '0465' },
  });
  assert.equal(byPalette.brand_color, 'vinho');
  assert.equal(byPalette.card_last4, '0465');

  const byHex = await requestJson(server.base, '/api/finance/accounts/acc-inter', {
    method: 'PATCH',
    body: { brand_color: '#FF7A00' },
  });
  assert.equal(byHex.brand_color, '#ff7a00');
  assert.equal(byHex.card_last4, '0465', 'campo ausente não apaga o outro');

  const accounts = await requestJson(server.base, '/api/finance/accounts');
  const inter = accounts.find((a) => a.id === 'acc-inter');
  assert.equal(inter.brand_color, '#ff7a00');
  assert.equal(inter.card_last4, '0465');
  const c6 = accounts.find((a) => a.id === 'acc-c6');
  assert.equal(c6.brand_color, null);
  assert.equal(c6.card_last4, null);

  const overview = await requestJson(server.base, '/api/finance/overview');
  assert.equal(overview.accounts.find((a) => a.id === 'acc-inter').brand_color, '#ff7a00');

  const cleared = await requestJson(server.base, '/api/finance/accounts/acc-inter', {
    method: 'PATCH',
    body: { brand_color: null, card_last4: '' },
  });
  assert.equal(cleared.brand_color, null);
  assert.equal(cleared.card_last4, null);
});

test('PATCH /accounts/:id rejeita brand_color e card_last4 inválidos sem gravar', async (t) => {
  const { server } = await mountFinance(t);
  await requestJson(server.base, '/api/finance/accounts/acc-c6', {
    method: 'PATCH',
    body: { brand_color: 'c6', card_last4: '1234' },
  });

  for (const body of [
    { brand_color: 'roxo-neon' },
    { brand_color: '#12345' },
    { brand_color: 'red; drop table' },
    { card_last4: '12a4' },
    { card_last4: '12345' },
    { brand_color: 'vinho', card_last4: '99' },
  ]) {
    const res = await patchRaw(server.base, '/api/finance/accounts/acc-c6', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.ok(res.body.error);
  }

  const accounts = await requestJson(server.base, '/api/finance/accounts');
  const c6 = accounts.find((a) => a.id === 'acc-c6');
  assert.equal(c6.brand_color, 'c6');
  assert.equal(c6.card_last4, '1234');

  const missing = await patchRaw(server.base, '/api/finance/accounts/nao-existe', { brand_color: 'c6' });
  assert.equal(missing.status, 404);
});

test('settings hide_values vai e volta como booleano', async (t) => {
  const { server } = await mountFinance(t);

  const initial = await requestJson(server.base, '/api/finance/settings');
  assert.equal(initial.hide_values, false);
  assert.equal(initial.reserved_car, 1270);

  const on = await requestJson(server.base, '/api/finance/settings', {
    method: 'PATCH',
    body: { hide_values: true },
  });
  assert.equal(on.hide_values, true);
  assert.equal(on.reserved_car, 1270, 'não mexe nas reservas');

  const again = await requestJson(server.base, '/api/finance/settings');
  assert.equal(again.hide_values, true);
  const overview = await requestJson(server.base, '/api/finance/overview');
  assert.equal(overview.settings.hide_values, true);

  const off = await requestJson(server.base, '/api/finance/settings', {
    method: 'PATCH',
    body: { hide_values: false },
  });
  assert.equal(off.hide_values, false);

  const reserves = await requestJson(server.base, '/api/finance/settings', {
    method: 'PATCH',
    body: { reserved_live: 700 },
  });
  assert.equal(reserves.hide_values, false, 'PATCH sem hide_values mantém o valor');

  const invalid = await patchRaw(server.base, '/api/finance/settings', { hide_values: 'sim' });
  assert.equal(invalid.status, 400);
});

test('paleta do cartão: ids batem com a API e texto tem contraste AA nas duas pontas', () => {
  assert.deepEqual(BRAND_PALETTE.map((b) => b.id), BRAND_COLOR_IDS);
  for (const brand of BRAND_PALETTE) {
    for (const stop of [brand.from, brand.to]) {
      assert.ok(contrastRatio(stop, brand.fg) >= 4.5, `${brand.id} fg em ${stop}: ${contrastRatio(stop, brand.fg).toFixed(2)}`);
      assert.ok(contrastRatio(stop, brand.muted) >= 4.5, `${brand.id} muted em ${stop}: ${contrastRatio(stop, brand.muted).toFixed(2)}`);
    }
  }
  for (const hex of ['#ff7a00', '#009ee3', '#ffffff', '#000000', '#21c25e', '#777777']) {
    const brand = accountBrand({ brand_color: hex });
    for (const stop of [brand.from, brand.to]) {
      assert.ok(contrastRatio(stop, brand.fg) >= 4.5, `hex ${hex} fg em ${stop}`);
      assert.ok(contrastRatio(stop, brand.muted) >= 4.5, `hex ${hex} muted em ${stop}`);
    }
  }
});

test('cor padrão por instituição e roxo só no Nubank', () => {
  assert.equal(accountBrand({ institution: 'inter' }).id, 'inter');
  assert.equal(accountBrand({ institution: 'mp' }).id, 'mp');
  assert.equal(accountBrand({ institution: 'nubank' }).id, 'nubank');
  assert.equal(accountBrand({ institution: 'xp', name: 'XP' }).id, 'neutro');
  assert.equal(accountBrand({ institution: 'inter', brand_color: 'vinho' }).id, 'vinho');
  assert.ok(!brandOptionsFor({ institution: 'inter' }).some((b) => b.id === 'nubank'));
  assert.ok(brandOptionsFor({ institution: 'nubank' }).some((b) => b.id === 'nubank'));
});
