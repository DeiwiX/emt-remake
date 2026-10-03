import es from '../../../../public/i18n/es.json';
import en from '../../../../public/i18n/en.json';

/** Devuelve las claves de un JSON anidado en formato "a.b.c". */
function flattenKeys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === 'object' && child !== null ? flattenKeys(child, path) : [path];
  });
}

describe('Traducciones', () => {
  it('español e inglés tienen exactamente las mismas claves', () => {
    expect(flattenKeys(en).sort()).toEqual(flattenKeys(es).sort());
  });

  it('ningún texto está vacío', () => {
    const values = (obj: object): unknown[] =>
      Object.values(obj).flatMap((v) => (typeof v === 'object' && v !== null ? values(v) : [v]));
    for (const value of [...values(es), ...values(en)]) {
      expect(typeof value === 'string' && value.trim().length > 0).toBe(true);
    }
  });
});
