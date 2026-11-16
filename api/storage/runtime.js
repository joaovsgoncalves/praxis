import { createStorage } from './index.js';
import { createSqliteDriver } from './sqlite/driver.js';
import { createSqliteConnections } from './sqlite/connections.js';
import { createFirestoreDriver } from './firestore/driver.js';

/**
 * Motor escolhido pelo ambiente. Nesta versão só `sqlite` existe para o servidor: o Firestore ainda
 * não tem todos os domínios portados nem homologação, e a variável não pode ligá-lo por acidente.
 */
export function storageEngineFromEnv(env = process.env) {
  const value = env.PRAXIS_STORAGE ?? 'sqlite';
  if (value !== 'sqlite') throw new Error(`PRAXIS_STORAGE=${value} não está disponível nesta versão (só sqlite)`);
  return value;
}

/**
 * Monta a camada de persistência. `firestore` só por injeção explícita (testes no emulador).
 * `close()` recusa chamadas novas, espera as que estão em andamento e fecha as conexões dedicadas.
 */
export function createStorageRuntime({ engine, currentOwner, now, sqlite, firestore }) {
  let driver, connections = null;
  if (engine === 'sqlite') {
    connections = createSqliteConnections(sqlite || {});
    driver = createSqliteDriver({ open: connections.get });
  } else if (engine === 'firestore') {
    if (!firestore?.client) throw new TypeError('firestore.client injetado é obrigatório');
    driver = createFirestoreDriver(firestore);
  } else {
    throw new TypeError(`motor de armazenamento desconhecido: ${engine}`);
  }
  const storage = createStorage({ driver, currentOwner, now });
  let closing = null;
  return {
    engine,
    storage,
    runLegacy(callback) {
      if (engine !== 'sqlite') throw new Error('legacy integration only available on sqlite');
      return driver.runLegacy(currentOwner(), callback);
    },
    openOwners: () => connections?.openOwners() ?? [],
    close() {
      closing ??= (async () => {
        await storage.close();
        return connections ? connections.closeAll() : 0;
      })();
      return closing;
    },
  };
}
