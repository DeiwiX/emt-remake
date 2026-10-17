import { TestBed } from '@angular/core/testing';

import { RealtimeService, RealtimeSource } from './realtime.service';

const record = (time: string) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: ['-4.45', '36.70'] },
  properties: { codLinea: '1', codBus: '640', sentido: '1', codParIni: 'a', last_update: time },
});

/** Fuente falsa: cuenta las descargas y devuelve el dato que se le diga. */
class FakeSource extends RealtimeSource {
  readonly available = true;
  calls = 0;
  time = '2026-10-17 10:00:00';
  fetchVehicles(): Promise<unknown> {
    this.calls++;
    return Promise.resolve([record(this.time)]);
  }
}

/** Optimizaciones 1 y 2 (17/10/2026): menos descargas y nada en segundo plano. */
describe('RealtimeService', () => {
  let source: FakeSource;
  let service: RealtimeService;
  let hidden = false;
  const destroy: (() => void)[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    hidden = false;
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() =>
      hidden ? 'hidden' : 'visible',
    );
    source = new FakeSource();
    TestBed.configureTestingModule({ providers: [{ provide: RealtimeSource, useValue: source }] });
    service = TestBed.inject(RealtimeService);
  });

  afterEach(() => {
    destroy.splice(0).forEach((fn) => fn());
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const watch = () =>
    service.watch({
      onDestroy: (fn) => {
        destroy.push(fn);
        return () => undefined;
      },
    });

  it('tras un dato nuevo no vuelve a preguntar hasta pasados 3 min', async () => {
    watch();
    await vi.advanceTimersByTimeAsync(0);
    expect(source.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(150_000);
    expect(source.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(source.calls).toBe(2);
    // Sin cambios, cada 30 s.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(source.calls).toBe(3);
  });

  it('con la app en segundo plano no descarga y al volver pide al momento', async () => {
    watch();
    await vi.advanceTimersByTimeAsync(0);
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(source.calls).toBe(1);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(source.calls).toBe(2);
  });

  it('el botón "Actualizar" descarga siempre', async () => {
    watch();
    await vi.advanceTimersByTimeAsync(0);
    await service.refreshNow();
    expect(source.calls).toBe(2);
  });
});
