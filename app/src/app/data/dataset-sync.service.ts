import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { DataOrigin, DataStatus } from '../core/data/data-status';
import { DataStatusService } from '../core/data/repositories';
import { ShapeDetail } from '../core/models/network.model';
import { DATA_CONFIG } from './data-config';
import { KeyValueStore } from './key-value-store';
import {
  DataFormatError,
  FileEntry,
  ManifestFile,
  NetworkFile,
  ShapesFile,
  ZonesFile,
  parseManifest,
  parseNetwork,
  parseShapes,
  parseZones,
} from './published-format';

const KEYS = {
  /** Manifest y red juntos en un solo registro: se guardan de forma atómica. */
  dataset: 'dataset',
  file: (name: AuxFile) => `file-${name}`,
} as const;

/** Ficheros que se descargan bajo demanda (no al arrancar). */
type AuxFile = 'shapesOverview' | 'shapesDetail' | 'zones';

interface StoredDataset {
  manifest: unknown;
  network: unknown;
}

interface StoredFile {
  sha256: string;
  file: unknown;
}

interface Current {
  manifest: ManifestFile;
  /** Carpeta de la que vienen los ficheros: la publicación remota o la copia incluida. */
  baseUrl: string;
}

/**
 * Mantiene la última copia válida de los datos (RF-08, RNF-03, RNF-09):
 *
 * 1. Al arrancar muestra lo guardado en el dispositivo o, si no hay nada, la copia
 *    incluida en la app.
 * 2. Después descarga el manifest publicado. Si su dataVersion no ha cambiado no
 *    descarga nada más; si ha cambiado, descarga network.json, comprueba su huella
 *    y su formato y solo entonces sustituye la copia guardada.
 * 3. Si algo falla se siguen mostrando los datos anteriores con el aviso de que la
 *    actualización ha fallado.
 *
 * Los trazados y las zonas no se descargan aquí, sino cuando se piden (al abrir el mapa).
 */
@Injectable({ providedIn: 'root' })
export class DatasetSyncService extends DataStatusService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(KeyValueStore);
  private readonly config = inject(DATA_CONFIG);

  private readonly statusSignal = signal<DataStatus>({ state: 'loading' });
  private readonly networkSignal = signal<NetworkFile | null>(null);
  readonly status = this.statusSignal.asReadonly();
  /** Red publicada actual, o null si todavía no hay datos. */
  readonly network = this.networkSignal.asReadonly();

  private current: Current | null = null;
  private origin: DataOrigin = 'bundled';
  private refreshing: Promise<void> | null = null;
  private readonly fileRequests = new Map<string, Promise<unknown>>();

  refresh(): Promise<void> {
    this.refreshing ??= this.doRefresh().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  /** Trazados del nivel pedido, de la caché si siguen siendo válidos o descargados. */
  getShapesFile(detail: ShapeDetail): Promise<ShapesFile> {
    return this.getAuxFile(detail === 'overview' ? 'shapesOverview' : 'shapesDetail', parseShapes);
  }

  /** Barrios y distritos con sus paradas (búsqueda por zonas en el mapa). */
  getZonesFile(): Promise<ZonesFile> {
    return this.getAuxFile('zones', parseZones);
  }

  private async getAuxFile<T>(name: AuxFile, parse: (value: unknown) => T): Promise<T> {
    // Si se abre el mapa directamente (enlace o recarga), se espera a la carga inicial.
    if (!this.current && this.refreshing) await this.refreshing;
    const current = this.current;
    if (!current) throw new Error('No hay datos cargados');
    const key = `${current.manifest.dataVersion}:${name}`;
    let request = this.fileRequests.get(key) as Promise<T> | undefined;
    if (!request) {
      request = this.loadAuxFile(current, name, parse);
      // Si falla se olvida la petición para poder reintentar.
      request.catch(() => this.fileRequests.delete(key));
      this.fileRequests.set(key, request);
    }
    return request;
  }

  private async doRefresh(): Promise<void> {
    if (!this.current) await this.loadLocal();
    this.publishStatus({ checking: true, updateFailed: false });

    let updateFailed = false;
    try {
      await this.updateFromRemote();
    } catch (error) {
      updateFailed = true;
      console.warn(
        'No se pudieron actualizar los datos; se mantiene la última copia válida.',
        error,
      );
    }
    this.publishStatus({ checking: false, updateFailed });
  }

  /** Carga lo guardado en el dispositivo o, en su defecto, la copia incluida en la app. */
  private async loadLocal(): Promise<void> {
    try {
      const stored = await this.store.get<StoredDataset>(KEYS.dataset);
      const manifest = parseManifest(stored?.manifest);
      const network = parseNetwork(stored?.network);
      this.apply(manifest, network, this.config.remoteBaseUrl, 'cache');
      return;
    } catch {
      // Sin caché o caché dañada: se prueba con la copia incluida.
    }
    try {
      const base = this.config.bundledBaseUrl;
      const manifest = parseManifest(JSON.parse(await this.getText(`${base}manifest.json`)));
      const network = await this.fetchVerified(base, manifest.files.network, parseNetwork);
      this.apply(manifest, network, base, 'bundled');
    } catch (error) {
      console.warn('No se pudo cargar la copia de datos incluida en la app.', error);
    }
  }

  private async updateFromRemote(): Promise<void> {
    const base = this.config.remoteBaseUrl;
    const manifest = parseManifest(JSON.parse(await this.getText(`${base}manifest.json`)));

    if (this.current?.manifest.dataVersion === manifest.dataVersion) {
      // Mismos datos: nada que descargar. Si venían de la copia incluida, a partir de
      // ahora los trazados se piden a la publicación remota.
      this.current = { manifest, baseUrl: base };
      this.origin = 'network';
      return;
    }

    const network = await this.fetchVerified(base, manifest.files.network, parseNetwork);
    await this.safeWrite(KEYS.dataset, { manifest, network } satisfies StoredDataset);
    this.apply(manifest, network, base, 'network');
  }

  private async loadAuxFile<T>(
    current: Current,
    name: AuxFile,
    parse: (value: unknown) => T,
  ): Promise<T> {
    const entry = current.manifest.files[name];
    if (!entry) throw new Error(`Los datos publicados no incluyen "${name}"`);
    try {
      const stored = await this.store.get<StoredFile>(KEYS.file(name));
      if (stored?.sha256 === entry.sha256) return parse(stored.file);
    } catch {
      // Caché dañada: se descarga de nuevo.
    }
    const file = await this.fetchVerified(current.baseUrl, entry, parse);
    await this.safeWrite(KEYS.file(name), { sha256: entry.sha256, file } satisfies StoredFile);
    return file;
  }

  private apply(
    manifest: ManifestFile,
    network: NetworkFile,
    baseUrl: string,
    origin: DataOrigin,
  ): void {
    this.current = { manifest, baseUrl };
    this.origin = origin;
    this.networkSignal.set(network);
  }

  private publishStatus(flags: { checking: boolean; updateFailed: boolean }): void {
    if (!this.current) {
      this.statusSignal.set(flags.checking ? { state: 'loading' } : { state: 'unavailable' });
      return;
    }
    this.statusSignal.set({
      state: 'ready',
      origin: this.origin,
      generatedAt: new Date(this.current.manifest.generatedAt),
      ...flags,
    });
  }

  /** Un fallo al guardar (cuota, modo privado) no debe impedir mostrar los datos. */
  private async safeWrite(key: string, value: unknown): Promise<void> {
    try {
      await this.store.set(key, value);
    } catch (error) {
      console.warn(`No se pudo guardar "${key}" en el dispositivo.`, error);
    }
  }

  private async fetchVerified<T>(
    base: string,
    entry: FileEntry,
    parse: (value: unknown) => T,
  ): Promise<T> {
    const text = await this.getText(`${base}${entry.path}`);
    const digest = await sha256Hex(text);
    if (digest !== null && digest !== entry.sha256) {
      throw new DataFormatError(`${entry.path}: la huella no coincide con el manifest`);
    }
    return parse(JSON.parse(text));
  }

  private getText(url: string): Promise<string> {
    return firstValueFrom(this.http.get(url, { responseType: 'text' }));
  }
}

/** SHA-256 en hexadecimal, o null si el entorno no ofrece Web Crypto (contexto no seguro). */
async function sha256Hex(text: string): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
