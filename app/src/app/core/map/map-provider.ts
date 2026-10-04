import { LatLon, Polygon } from '../models/network.model';
import { ColorScheme } from '../theme/color-scheme.service';

/**
 * Abstracción del mapa (RNF-07). Las pantallas solo conocen estas interfaces;
 * cambiar de proveedor (por ejemplo, a Google Maps) es escribir otro adaptador
 * y registrarlo en app.config.ts.
 */

/** Capa base: callejero (claro u oscuro según el esquema) o foto aérea. */
export type MapBaseLayer = 'streets' | 'satellite';

export interface MapRoute {
  /** Identificador único del recorrido (un sentido de una línea). */
  readonly id: string;
  readonly lineId: string;
  readonly color: string;
  /** Color del número de línea dibujado sobre el recorrido. */
  readonly textColor: string;
  /** Recorrido dibujado uniendo paradas: se pinta discontinuo. */
  readonly approximate: boolean;
  readonly points: readonly LatLon[];
  /** Texto sobre el recorrido; por defecto, el número de línea (p. ej. "6 min a pie"). */
  readonly label?: string;
}

/** Autobús en el mapa (tiempo real): dibujo de un bus del color de su línea con el número. */
export interface MapVehicle {
  readonly id: string;
  readonly lineId: string;
  readonly lat: number;
  readonly lon: number;
  readonly color: string;
  readonly textColor: string;
  /** Rumbo en grados (0 = norte): el bus se dibuja mirando hacia donde va. */
  readonly bearing?: number;
  /** El que se está siguiendo: se dibuja algo mayor y con borde. */
  readonly selected?: boolean;
}

/** Corte de tráfico en el mapa: aviso en su punto; atenuado si aún no ha empezado. */
export interface MapTrafficItem {
  readonly id: string;
  readonly point: LatLon;
  readonly active: boolean;
}

export interface MapStop {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  /** Texto encima de la parada (p. ej. las líneas que pasan: "1 · 36"); sin él, no se rotula. */
  readonly label?: string;
}

export interface MapViewOptions {
  readonly center: LatLon;
  readonly zoom: number;
  readonly scheme: ColorScheme;
  /** Respeta la preferencia de movimiento reducido (RNF-05). */
  readonly reduceMotion: boolean;
  /** Etiqueta accesible del mapa. */
  readonly label: string;
}

export interface MapViewEvents {
  /** Se ha tocado un recorrido (lineId) o una zona vacía (null). */
  lineSelected(lineId: string | null): void;
  stopSelected(stopId: string): void;
  /** Se ha tocado un corte de tráfico. */
  trafficSelected?(id: string): void;
  /** Se ha tocado un autobús en tiempo real. */
  vehicleSelected?(id: string): void;
  zoomChanged(zoom: number): void;
}

export interface MapView {
  setRoutes(routes: readonly MapRoute[]): void;
  setStops(stops: readonly MapStop[]): void;
  /** Líneas visibles; null = todas. */
  setVisibleLines(lineIds: ReadonlySet<string> | null): void;
  /**
   * Resalta unas líneas y atenúa el resto (una línea elegida, o las que
   * coinciden con una búsqueda); null = ninguna, todas con la misma intensidad.
   */
  setHighlightedLines(lineIds: ReadonlySet<string> | null): void;
  /** Marca una parada (por ejemplo, la elegida en la búsqueda); null = ninguna. */
  setHighlightedStop(stop: MapStop | null): void;
  fitTo(points: readonly LatLon[]): void;
  setScheme(scheme: ColorScheme): void;
  setBaseLayer(layer: MapBaseLayer): void;
  /** Nombre accesible del mapa (el lienzo es la región que anuncian los lectores de pantalla). */
  setLabel(label: string): void;
  /**
   * Posición del usuario (punto azul); null para quitarla. `accuracy` (metros)
   * dibuja alrededor el círculo del margen de error.
   */
  setUserLocation(point: LatLon | null, accuracy?: number): void;
  /** Cortes de tráfico; lista vacía para quitarlos. */
  setTraffic(items: readonly MapTrafficItem[]): void;
  /** Autobuses en tiempo real; lista vacía para quitarlos. */
  setVehicles(vehicles: readonly MapVehicle[]): void;
  /** Tamaño de los autobuses (1 = normal), según Ajustes. */
  setVehicleScale(scale: number): void;
  /** Centra el mapa en un punto sin cambiar el zoom (seguir a un autobús). */
  centerOn(point: LatLon): void;
  /** Marca una zona (contorno y relleno suave); null = ninguna. */
  setHighlightedArea(polygons: readonly Polygon[] | null): void;
  destroy(): void;
}

export abstract class MapProvider {
  /** false si el dispositivo no puede mostrar este mapa (p. ej. sin WebGL). */
  abstract isSupported(): boolean;
  abstract create(
    container: HTMLElement,
    options: MapViewOptions,
    events: MapViewEvents,
  ): Promise<MapView>;
}
