import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { DATA_CONFIG } from './data-config';
import { DatasetSyncService } from './dataset-sync.service';
import { KeyValueStore, MemoryKeyValueStore } from './key-value-store';
import { PublishedFixture, networkFixture, publishedFixture } from './testing/data-fixtures';

const REMOTE = 'https://remote.test/data/v1/';
const BUNDLED = 'bundled/v1/';

describe('DatasetSyncService', () => {
  let store: MemoryKeyValueStore;
  let http: HttpTestingController;

  /** Crea un servicio nuevo (como un arranque de la app) que comparte el almacén. */
  function startApp(): DatasetSyncService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: KeyValueStore, useValue: store },
        { provide: DATA_CONFIG, useValue: { remoteBaseUrl: REMOTE, bundledBaseUrl: BUNDLED } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(DatasetSyncService);
  }

  /** Espera a que la app pida la URL y responde con el texto dado (o con un error de red). */
  async function respond(url: string, body: string | 'network-error'): Promise<void> {
    const request = await vi.waitFor(() => http.expectOne(url));
    if (body === 'network-error') request.error(new ProgressEvent('error'));
    else request.flush(body);
  }

  async function serve(base: string, fixture: PublishedFixture): Promise<void> {
    await respond(`${base}manifest.json`, fixture.manifest);
    await respond(`${base}network.json`, fixture.network);
  }

  beforeEach(() => {
    store = new MemoryKeyValueStore();
  });

  afterEach(() => http.verify());

  it('en el primer arranque usa la copia incluida y no descarga la red si no ha cambiado', async () => {
    const fixture = await publishedFixture('v1');
    const sync = startApp();
    const done = sync.refresh();

    await serve(BUNDLED, fixture);
    await respond(`${REMOTE}manifest.json`, fixture.manifest);
    await done;

    expect(sync.network()?.lines).toHaveLength(2);
    expect(sync.status()).toMatchObject({ state: 'ready', origin: 'network', updateFailed: false });
  });

  it('descarga una versión nueva, la guarda y la usa sin conexión en el siguiente arranque', async () => {
    const bundled = await publishedFixture('v1');
    const remote = await publishedFixture('v2', networkFixture('Nombre nuevo'));

    const first = startApp();
    const firstDone = first.refresh();
    await serve(BUNDLED, bundled);
    await serve(REMOTE, remote);
    await firstDone;
    expect(first.network()?.lines[1]?.name).toBe('Nombre nuevo');

    const second = startApp();
    const secondDone = second.refresh();
    await respond(`${REMOTE}manifest.json`, 'network-error');
    await secondDone;

    expect(second.network()?.lines[1]?.name).toBe('Nombre nuevo');
    expect(second.status()).toMatchObject({ state: 'ready', origin: 'cache', updateFailed: true });
  });

  it('descarta una red cuya huella no coincide y mantiene la copia anterior', async () => {
    const bundled = await publishedFixture('v1');
    const remote = await publishedFixture('v2', networkFixture('Nombre nuevo'));
    const sync = startApp();
    const done = sync.refresh();

    await serve(BUNDLED, bundled);
    await respond(`${REMOTE}manifest.json`, remote.manifest);
    await respond(`${REMOTE}network.json`, remote.network.replace('Nombre nuevo', 'Manipulado'));
    await done;

    expect(sync.network()?.lines[1]?.name).toBe('Alameda - Universidad');
    expect(sync.status()).toMatchObject({ state: 'ready', origin: 'bundled', updateFailed: true });
  });

  it('descarta un manifest con un formato no compatible', async () => {
    const bundled = await publishedFixture('v1');
    const sync = startApp();
    const done = sync.refresh();

    await serve(BUNDLED, bundled);
    await respond(`${REMOTE}manifest.json`, JSON.stringify({ schemaVersion: 2 }));
    await done;

    expect(sync.status()).toMatchObject({ state: 'ready', updateFailed: true });
  });

  it('indica que no hay datos si no hay caché, ni copia incluida, ni conexión', async () => {
    const sync = startApp();
    const done = sync.refresh();

    await respond(`${BUNDLED}manifest.json`, 'network-error');
    await respond(`${REMOTE}manifest.json`, 'network-error');
    await done;

    expect(sync.network()).toBeNull();
    expect(sync.status()).toEqual({ state: 'unavailable' });
  });

  it('descarga los trazados una sola vez y después los lee del dispositivo', async () => {
    const fixture = await publishedFixture('v1');
    const first = startApp();
    const done = first.refresh();
    await serve(BUNDLED, fixture);
    await serve(REMOTE, await publishedFixture('v1-remote'));
    await done;

    const shapes = first.getShapesFile('overview');
    await respond(`${REMOTE}shapes-overview.json`, fixture.shapesOverview);
    expect(Object.keys((await shapes).shapes)).toEqual(['g21']);

    // Nuevo arranque sin conexión: los trazados salen del almacén, sin peticiones.
    const second = startApp();
    const secondDone = second.refresh();
    await respond(`${REMOTE}manifest.json`, 'network-error');
    await secondDone;
    expect(Object.keys((await second.getShapesFile('overview')).shapes)).toEqual(['g21']);
  });
});
