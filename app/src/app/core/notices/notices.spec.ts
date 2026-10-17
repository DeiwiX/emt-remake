import { TestBed } from '@angular/core/testing';

import {
  EmtNotice,
  closedNoticesFabVisible,
  isVisible,
  mergeNotices,
  noticeLines,
  noticesFor,
  parseNoticeFeed,
  parseStoredNotices,
} from './notices';
import { NoticeSource, NoticesService } from './notices.service';

const DAY = 24 * 60 * 60_000;

/** Recorte del canal real de la EMT (15/10/2026), con su IP interna en los enlaces. */
const FEED = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xml:base="http://192.168.252.60/es"><channel>
<item>
  <title>70.3 Ironman Málaga. Afectaciones al servicio el domingo 18 de octubre de 2026</title>
  <link>http://192.168.252.60/es/node/961</link>
  <description>&lt;span&gt;70.3 Ironman&lt;/span&gt;&lt;div class="field field--name-body"&gt;&lt;p&gt;Con motivo del &lt;strong&gt;70.3 Ironman&lt;/strong&gt;, habrá alteraciones.&lt;/p&gt;&lt;/div&gt;</description>
  <pubDate>Thu, 15 Oct 2026 04:57:00 +0000</pubDate>
</item>
<item>
  <title>L-15-18-N2: modificación de recorridos por obras en C/ Blas de Lezo</title>
  <link>http://192.168.252.60/es/node/953</link>
  <description>&lt;span&gt;Admin&lt;/span&gt;&lt;div class="field field--name-body"&gt;&lt;p&gt;Debido a obras,
  C/ Blas de Lezo permanecerá cortada.&lt;/p&gt;&lt;/div&gt;</description>
  <pubDate>Tue, 06 Oct 2026 06:43:00 +0000</pubDate>
</item>
<item>
  <title>Home</title>
  <link>http://192.168.252.60/es/home</link>
  <pubDate>Wed, 29 Sep 2021 11:01:17 +0000</pubDate>
</item>
</channel></rss>`;

function notice(id: string, lines: string[], publishedAt: number): EmtNotice {
  return {
    id,
    title: id,
    summary: '',
    publishedAt,
    url: `https://www.emtmalaga.es/es/node/${id}`,
    lines,
  };
}

describe('noticeLines', () => {
  it('lee las líneas del principio del título', () => {
    expect(noticeLines('L-15-18-N2: modificación de recorridos')).toEqual(['15', '18', 'N2']);
    expect(noticeLines('L-C5: modificación parada de regulación')).toEqual(['C5']);
    expect(noticeLines('L-8-21-23-38: Paradas 802 y 848')).toEqual(['8', '21', '23', '38']);
    expect(noticeLines('L-4-19 y A: traslado de cabeceras')).toEqual(['4', '19', 'A']);
  });

  it('un título sin líneas es un aviso general', () => {
    expect(noticeLines('70.3 Ironman Málaga. Afectaciones al servicio')).toEqual([]);
  });
});

describe('parseNoticeFeed', () => {
  it('lee los avisos, con la dirección pública y el texto del cuerpo', () => {
    const notices = parseNoticeFeed(FEED);
    expect(notices.map((n) => n.id)).toEqual(['961', '953']);
    const [ironman, works] = notices;
    expect(ironman?.lines).toEqual([]);
    expect(ironman?.summary).toBe('Con motivo del 70.3 Ironman, habrá alteraciones.');
    expect(works?.url).toBe('https://www.emtmalaga.es/es/node/953');
    expect(works?.lines).toEqual(['15', '18', 'N2']);
    expect(works?.summary).toBe('Debido a obras, C/ Blas de Lezo permanecerá cortada.');
    expect(works?.publishedAt).toBe(Date.UTC(2026, 9, 6, 6, 43));
  });

  it('sin canal válido no hay avisos', () => {
    expect(parseNoticeFeed('')).toEqual([]);
    expect(parseNoticeFeed('<html>error</html>')).toEqual([]);
  });
});

describe('isVisible y mergeNotices', () => {
  const now = Date.UTC(2026, 9, 15);

  it('los de una línea duran 60 días y los generales 7', () => {
    expect(isVisible(notice('1', ['3'], now - 59 * DAY), now)).toBe(true);
    expect(isVisible(notice('1', ['3'], now - 61 * DAY), now)).toBe(false);
    expect(isVisible(notice('2', [], now - 6 * DAY), now)).toBe(true);
    expect(isVisible(notice('2', [], now - 8 * DAY), now)).toBe(false);
  });

  it('guarda los que ya no vienen en el canal, sin repetir y del más nuevo al más viejo', () => {
    const old = notice('900', ['34'], now - 30 * DAY);
    const expired = notice('800', ['1'], now - 90 * DAY);
    const updated = { ...notice('953', ['15'], now - 9 * DAY), title: 'nuevo' };
    const merged = mergeNotices(
      [old, expired, notice('953', ['15'], now - 9 * DAY)],
      [updated],
      now,
    );
    expect(merged.map((n) => n.id)).toEqual(['953', '900']);
    expect(merged[0]?.title).toBe('nuevo');
  });
});

describe('noticesFor', () => {
  const list = [notice('a', ['15', 'N2'], 0), notice('b', [], 0), notice('c', ['3'], 0)];

  it('los de esas líneas y, si se piden, los generales', () => {
    expect(noticesFor(list, ['n2'], true).map((n) => n.id)).toEqual(['a', 'b']);
    expect(noticesFor(list, ['3'], false).map((n) => n.id)).toEqual(['c']);
    expect(noticesFor(list, [], false)).toEqual([]);
  });
});

describe('parseStoredNotices', () => {
  it('descarta lo que no tiene la forma de un aviso o enlaza fuera de la EMT', () => {
    const good = notice('1', ['3'], 5);
    const raw = JSON.stringify([good, { id: 2 }, { ...good, url: 'https://otra.web/x' }]);
    expect(parseStoredNotices(raw)).toEqual([good]);
    expect(parseStoredNotices('no es json')).toEqual([]);
    expect(parseStoredNotices(null)).toEqual([]);
  });
});

describe('NoticesService', () => {
  class FakeSource extends NoticeSource {
    readonly available = true;
    calls = 0;
    fetchFeed(): Promise<string> {
      this.calls++;
      return Promise.resolve(FEED);
    }
  }

  beforeEach(() => localStorage.clear());

  it('descarga, guarda en el dispositivo y no repite la descarga enseguida', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 9, 15, 12));
    const source = new FakeSource();
    TestBed.configureTestingModule({ providers: [{ provide: NoticeSource, useValue: source }] });
    const service = TestBed.inject(NoticesService);

    await service.refresh();
    await service.refresh();
    expect(source.calls).toBe(1);
    expect(service.notices().map((n) => n.id)).toEqual(['961', '953']);
    expect(service.forLines(['18'], false).map((n) => n.id)).toEqual(['953']);
    expect(parseStoredNotices(localStorage.getItem('emt-remake.notices.v1'))).toHaveLength(2);
    vi.useRealTimers();
  });

  it('los cerrados no salen en el inicio pero sí en el detalle, y se recuerdan', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 9, 15, 12));
    TestBed.configureTestingModule({
      providers: [{ provide: NoticeSource, useValue: new FakeSource() }],
    });
    const service = TestBed.inject(NoticesService);
    await service.refresh();

    service.dismiss(['961']);
    expect(service.forLines(['18'], true, true).map((n) => n.id)).toEqual(['953']);
    expect(service.forLines(['18'], true).map((n) => n.id)).toEqual(['961', '953']);
    expect(JSON.parse(localStorage.getItem('emt-remake.notices-dismissed.v1')!)).toEqual(['961']);
    vi.useRealTimers();
  });
});

describe('triángulo de avisos cerrados', () => {
  it('se ve con avisos cerrados y desaparece al tirarlo a la papelera', () => {
    expect(closedNoticesFabVisible(['1', '2'], new Set())).toBe(true);
    expect(closedNoticesFabVisible(['1', '2'], new Set(['1', '2']))).toBe(false);
    expect(closedNoticesFabVisible([], new Set())).toBe(false);
  });

  it('vuelve si se cierra un aviso nuevo', () => {
    expect(closedNoticesFabVisible(['1', '2', '3'], new Set(['1', '2']))).toBe(true);
  });
});
