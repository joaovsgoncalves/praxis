const MARKER_PREFIX = 'nutrition_water_migrated_';

export function readLocalWater(storage, date) {
  try {
    const ml = storage.getItem(`water_ml_${date}`);
    const amount = ml !== null ? Number(ml) : Number(storage.getItem(`water_${date}`) || 0) * 250;
    return Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : 0;
  } catch {
    return 0;
  }
}

export async function migrateLocalWater({ storage, date, remote, save }) {
  const marker = `${MARKER_PREFIX}${date}`;
  if (storage.getItem(marker) === '1') return { record: remote, migrated: false };

  const localAmount = readLocalWater(storage, date);
  if (remote.exists || localAmount <= 0) {
    storage.setItem(marker, '1');
    return { record: remote, migrated: false };
  }

  try {
    const record = await save({
      date,
      amount_ml: localAmount,
      expected_revision: 0,
    });
    storage.setItem(marker, '1');
    return { record, migrated: true };
  } catch (error) {
    // Outro dispositivo venceu a criação: o remoto sempre prevalece.
    if (error?.status === 409 && error?.body?.current) {
      storage.setItem(marker, '1');
      return { record: error.body.current, migrated: false, conflict: true };
    }
    throw error;
  }
}
