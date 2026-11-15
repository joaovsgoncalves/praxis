/** Lista de compras / desejos — curto, médio e longo prazo */

export const PURCHASE_HORIZONS = ['short', 'medium', 'long'];
export const PURCHASE_STATUSES = ['want', 'bought', 'paused'];

export function initPurchaseSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT DEFAULT '',
      horizon TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'want',
      price_estimate TEXT DEFAULT '',
      url TEXT DEFAULT '',
      sort_order INTEGER,
      created_date TEXT DEFAULT (datetime('now')),
      updated_date TEXT DEFAULT (datetime('now'))
    );
  `);
}

// Leitura e escrita da lista moram em services/purchases.js (camada assíncrona). As funções síncronas
// antigas estão congeladas em test-support/oracles/purchaseList.bcbadad.js só para a prova de paridade.
