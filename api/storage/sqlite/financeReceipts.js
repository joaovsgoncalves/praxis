/**
 * Recibos de pagamento do Alfred (`alfred_payment_receipts`, fase 6): leitura SÓ DE LEITURA para o ingest do
 * banco, que usa o piso de pago esperado dos recibos para não apagar um pagamento ainda não visto pelo
 * banco. A tabela é criada sob demanda pelo conector do Alfred: sem ela, lista vazia (como a consulta antiga).
 */
export function sqliteFinanceReceipts(db) {
  return {
    async list() {
      if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='alfred_payment_receipts'").get()) return [];
      return db.prepare('SELECT payment_id, expected_paid_floor, cycle_closing, cycle_due FROM alfred_payment_receipts').all();
    },
  };
}
