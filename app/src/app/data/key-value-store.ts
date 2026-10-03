/**
 * Almacenamiento local de los datos descargados. IndexedDB funciona igual en la
 * PWA y dentro de Capacitor, y admite los cientos de KB de la red sin problemas.
 */
export abstract class KeyValueStore {
  abstract get<T>(key: string): Promise<T | undefined>;
  abstract set(key: string, value: unknown): Promise<void>;
  abstract delete(key: string): Promise<void>;
}

/** Sustituto en memoria: pruebas y navegadores sin IndexedDB (p. ej. algunos modos privados). */
export class MemoryKeyValueStore extends KeyValueStore {
  private readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

const DB_NAME = 'emt-remake';
const STORE_NAME = 'data';

export class IndexedDbKeyValueStore extends KeyValueStore {
  private database?: Promise<IDBDatabase>;

  async get<T>(key: string): Promise<T | undefined> {
    return this.request<T | undefined>('readonly', (store) => store.get(key));
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.request('readwrite', (store) => store.put(value, key));
  }

  async delete(key: string): Promise<void> {
    await this.request('readwrite', (store) => store.delete(key));
  }

  private async request<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest,
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const request = operation(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    });
  }

  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.database;
  }
}

/** Elige IndexedDB si existe; si no, memoria (los datos no persistirán entre sesiones). */
export function createKeyValueStore(): KeyValueStore {
  return typeof indexedDB === 'undefined'
    ? new MemoryKeyValueStore()
    : new IndexedDbKeyValueStore();
}
