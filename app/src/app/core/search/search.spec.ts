import { Line, Stop } from '../models/network.model';
import { normalize, searchLines, searchStops } from './search';

const line = (id: string, name: string): Line => ({ id, name, notes: '', directions: [] });
const stop = (id: string, name: string): Stop => ({
  id,
  name,
  address: '',
  lat: 0,
  lon: 0,
  services: [],
});

const LINES = [
  line('1', 'Parque del Sur - Alameda Principal - San Andrés'),
  line('2', 'Alameda Principal - Ciudad Jardín'),
  line('10', 'Alameda - Universidad'),
  line('11', 'Alameda Principal - El Palo'),
  line('C1', 'Circular 1'),
  line('N1', 'Nocturna Alameda - Churriana'),
];

const STOPS = [
  stop('103', 'Plaza de la Merced'),
  stop('152', 'Postas - Lorenza Correa'),
  stop('1520', 'Avenida de Andalucía'),
  stop('15', 'Alameda Principal Sur'),
];

describe('normalize', () => {
  it('quita tildes, mayúsculas y signos', () => {
    expect(normalize('  Ciudad JARDÍN - Málaga ')).toBe('ciudad jardin malaga');
  });
});

describe('searchLines', () => {
  it('pone primero la coincidencia exacta de código', () => {
    expect(searchLines(LINES, '1').map((l) => l.id)).toEqual(['1', '10', '11', 'C1']);
  });

  it('busca por código sin distinguir mayúsculas', () => {
    expect(searchLines(LINES, 'c1').map((l) => l.id)).toEqual(['C1']);
  });

  it('busca por nombre sin tildes y con palabras en cualquier orden', () => {
    expect(searchLines(LINES, 'jardin').map((l) => l.id)).toEqual(['2']);
    expect(searchLines(LINES, 'palo alameda').map((l) => l.id)).toEqual(['11']);
  });

  it('prioriza los nombres que empiezan por la búsqueda', () => {
    expect(searchLines(LINES, 'alameda').map((l) => l.id)).toEqual(['2', '10', '11', '1', 'N1']);
  });

  it('no devuelve nada para búsquedas vacías o sin resultados', () => {
    expect(searchLines(LINES, '   ')).toEqual([]);
    expect(searchLines(LINES, 'aeropuerto')).toEqual([]);
  });

  it('respeta el límite de resultados', () => {
    expect(searchLines(LINES, 'alameda', 2)).toHaveLength(2);
  });
});

describe('searchStops', () => {
  it('busca por código exacto y por prefijo', () => {
    expect(searchStops(STOPS, '152').map((s) => s.id)).toEqual(['152', '1520']);
    expect(searchStops(STOPS, '15').map((s) => s.id)).toEqual(['15', '152', '1520']);
  });

  it('busca por nombre', () => {
    expect(searchStops(STOPS, 'merced').map((s) => s.id)).toEqual(['103']);
    expect(searchStops(STOPS, 'andalucia').map((s) => s.id)).toEqual(['1520']);
  });
});
