import { LatLon } from '../models/network.model';
import { ColorScheme } from '../theme/color-scheme.service';

/**
 * Abstracción del mapa (RNF-07). Las pantallas solo conocen estas interfaces;
 * cambiar de proveedor (por ejemplo, a Google Maps) es escribir otro adaptador
 * y registrarlo en app.config.ts.
 */

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
}

export interface MapStop {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
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
  zoomChanged(zoom: number): void;
}

export interface MapView {
  setRoutes(routes: readonly MapRoute[]): void;
  setStops(stops: readonly MapStop[]): void;
  /** Líneas visibles; null = todas. */
  setVisibleLines(lineIds: ReadonlySet<string> | null): void;
  /** Resalta una línea y atenúa el resto; null = ninguna. */
  setHighlightedLine(lineId: string | null): void;
  fitTo(points: readonly LatLon[]): void;
  setScheme(scheme: ColorScheme): void;
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
