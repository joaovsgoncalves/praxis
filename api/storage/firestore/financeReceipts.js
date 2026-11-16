/**
 * Recibos do Alfred no Firestore: os recibos pertencem à fase 6 e ainda não existem neste motor, então a
 * leitura devolve lista vazia. ceiling: quando a fase 6 mapear `alfred_payment_receipts`, trocar por leitura
 * da coleção (o ingest só precisa de payment_id, expected_paid_floor, cycle_closing e cycle_due).
 */
export function firestoreFinanceReceipts() {
  return { async list() { return []; } };
}
