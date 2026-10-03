import { Injectable } from '@angular/core';
import type { FeatureCollection } from 'geojson';
import type {
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
  StyleSpecification,
} from 'maplibre-gl';

import { LatLon } from '../core/models/network.model';
import {
  MapBaseLayer,
  MapProvider,
  MapRoute,
  MapStop,
  MapView,
  MapViewEvents,
  MapViewOptions,
} from '../core/map/map-provider';
import { ColorScheme } from '../core/theme/color-scheme.service';

/** Estilos vectoriales de OpenFreeMap: gratuitos, sin clave ni cookies (ADR 0003). */
const STYLE_URLS: Record<ColorScheme, string> = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

/**
 * Foto aérea: PNOA del Instituto Geográfico Nacional (CC BY 4.0, scne.es), servida
 * por WMTS con CORS abierto. Los textos de las líneas usan las fuentes de OpenFreeMap.
 */
const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    pnoa: {
      type: 'raster',
      tiles: [
        'https://www.ign.es/wmts/pnoa-ma?request=GetTile&service=WMTS&version=1.0.0' +
          '&layer=OI.OrthoimageCoverage&style=default&format=image/jpeg' +
          '&tilematrixset=GoogleMapsCompatible&tilematrix={z}&tilerow={y}&tilecol={x}',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        'PNOA cedido por © <a href="https://www.ign.es" target="_blank" rel="noopener">Instituto Geográfico Nacional</a> (CC BY 4.0 scne.es)',
    },
  },
  layers: [{ id: 'pnoa', type: 'raster', source: 'pnoa' }],
};

function styleFor(layer: MapBaseLayer, scheme: ColorScheme): string | StyleSpecification {
  return layer === 'satellite' ? SATELLITE_STYLE : STYLE_URLS[scheme];
}

/** Ficheros copiados desde node_modules en angular.json (assets y styles). */
const WORKER_PATH = 'maplibre/maplibre-gl-worker.mjs';
const CSS_PATH = 'maplibre.css';

const LAYER = {
  casing: 'routes-casing',
  line: 'routes-line',
  approximate: 'routes-approximate',
  labels: 'routes-labels',
  stops: 'stops',
  selectedStop: 'selected-stop',
} as const;
const SOURCE = { routes: 'routes', stops: 'stops', selectedStop: 'selected-stop' } as const;

/**
 * Con muchas paradas (toda la red) solo se dibujan al acercarse, para no saturar
 * el mapa; con pocas (una línea o una parada) se ven a cualquier zoom.
 */
const MANY_STOPS = 200;
const MANY_STOPS_MIN_ZOOM = 13;

/** Margen en píxeles alrededor del toque para acertar con líneas finas. */
const TAP_TOLERANCE_PX = 10;

/**
 * Adaptador de MapProvider con MapLibre GL JS. La librería (≈150 KB comprimidos)
 * se descarga solo al crear el primer mapa (carga diferida, RNF-02).
 */
@Injectable()
export class MapLibreMapProvider extends MapProvider {
  isSupported(): boolean {
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
    } catch {
      return false;
    }
  }

  async create(
    container: HTMLElement,
    options: MapViewOptions,
    events: MapViewEvents,
  ): Promise<MapView> {
    const maplibre = await import('maplibre-gl');
    loadStylesheet();
    maplibre.setWorkerUrl(new URL(WORKER_PATH, document.baseURI).href);

    const map = new maplibre.Map({
      container,
      style: styleFor('streets', options.scheme),
      center: [options.center[1], options.center[0]],
      zoom: options.zoom,
      attributionControl: { compact: true },
      fadeDuration: options.reduceMotion ? 0 : 300,
      // Se cede el foco al resto de la página: el mapa no atrapa el teclado.
      keyboard: true,
    });
    map.getCanvas().setAttribute('aria-label', options.label);
    map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');

    await new Promise<void>((resolve, reject) => {
      map.once('load', () => resolve());
      map.once('error', (event) => reject(event.error));
    });
    return new MapLibreView(map, options, events);
  }
}

class MapLibreView implements MapView {
  private routes: readonly MapRoute[] = [];
  private stops: readonly MapStop[] = [];
  private visibleLines: ReadonlySet<string> | null = null;
  private highlighted: ReadonlySet<string> | null = null;
  private highlightedStop: MapStop | null = null;
  private scheme: ColorScheme;
  private baseLayer: MapBaseLayer = 'streets';

  constructor(
    private readonly map: MapLibreMap,
    private readonly options: MapViewOptions,
    events: MapViewEvents,
  ) {
    this.scheme = options.scheme;
    this.installLayers();
    // Cambiar de estilo (tema) borra las capas propias: se vuelven a crear.
    map.on('style.load', () => this.installLayers());
    map.on('zoomend', () => events.zoomChanged(map.getZoom()));
    map.on('click', (event) => {
      const { x, y } = event.point;
      const box: [[number, number], [number, number]] = [
        [x - TAP_TOLERANCE_PX, y - TAP_TOLERANCE_PX],
        [x + TAP_TOLERANCE_PX, y + TAP_TOLERANCE_PX],
      ];
      const stop = map.queryRenderedFeatures(box, { layers: [LAYER.selectedStop, LAYER.stops] })[0];
      if (stop) {
        events.stopSelected(String(stop.properties['id']));
        return;
      }
      const route = map.queryRenderedFeatures(box, { layers: [LAYER.line, LAYER.approximate] })[0];
      events.lineSelected(route ? String(route.properties['lineId']) : null);
    });
  }

  setRoutes(routes: readonly MapRoute[]): void {
    this.routes = routes;
    this.source(SOURCE.routes)?.setData(this.routesGeoJson());
  }

  setStops(stops: readonly MapStop[]): void {
    this.stops = stops;
    this.source(SOURCE.stops)?.setData(this.stopsGeoJson());
    this.applyStopsZoomRange();
  }

  setVisibleLines(lineIds: ReadonlySet<string> | null): void {
    this.visibleLines = lineIds;
    this.applyFiltersAndHighlight();
  }

  setHighlightedLines(lineIds: ReadonlySet<string> | null): void {
    this.highlighted = lineIds;
    this.applyFiltersAndHighlight();
  }

  setHighlightedStop(stop: MapStop | null): void {
    this.highlightedStop = stop;
    this.source(SOURCE.selectedStop)?.setData(this.selectedStopGeoJson());
  }

  fitTo(points: readonly LatLon[]): void {
    if (points.length === 0) return;
    const lats = points.map((p) => p[0]);
    const lons = points.map((p) => p[1]);
    this.map.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      {
        // Margen extra abajo y a la derecha: ahí están la atribución y los botones de zoom.
        padding: { top: 32, left: 32, bottom: 72, right: 64 },
        animate: !this.options.reduceMotion,
        maxZoom: 16,
      },
    );
  }

  setScheme(scheme: ColorScheme): void {
    if (scheme === this.scheme) return;
    this.scheme = scheme;
    this.map.setStyle(styleFor(this.baseLayer, scheme));
  }

  setBaseLayer(layer: MapBaseLayer): void {
    if (layer === this.baseLayer) return;
    this.baseLayer = layer;
    this.map.setStyle(styleFor(layer, this.scheme));
  }

  destroy(): void {
    this.map.remove();
  }

  private installLayers(): void {
    const map = this.map;
    if (map.getSource(SOURCE.routes)) return;
    const casingColor = this.scheme === 'dark' ? '#000000' : '#FFFFFF';
    const stopStroke = this.scheme === 'dark' ? '#FFFFFF' : '#1A1A1A';
    const stopFill = this.scheme === 'dark' ? '#1A1A1A' : '#FFFFFF';

    map.addSource(SOURCE.routes, { type: 'geojson', data: this.routesGeoJson() });
    map.addSource(SOURCE.stops, { type: 'geojson', data: this.stopsGeoJson() });
    map.addSource(SOURCE.selectedStop, { type: 'geojson', data: this.selectedStopGeoJson() });

    map.addLayer({
      id: LAYER.casing,
      type: 'line',
      source: SOURCE.routes,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': casingColor },
    });
    map.addLayer({
      id: LAYER.line,
      type: 'line',
      source: SOURCE.routes,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': ['get', 'color'] },
    });
    map.addLayer({
      id: LAYER.approximate,
      type: 'line',
      source: SOURCE.routes,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-dasharray': [2, 2] },
    });
    // Número de línea sobre el recorrido: el color nunca es la única pista.
    map.addLayer({
      id: LAYER.labels,
      type: 'symbol',
      source: SOURCE.routes,
      minzoom: 12,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 300,
        'text-field': ['get', 'lineId'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 13,
        'text-rotation-alignment': 'viewport',
        'text-keep-upright': true,
      },
      paint: {
        'text-color': ['get', 'textColor'],
        'text-halo-color': ['get', 'color'],
        'text-halo-width': 4,
      },
    });
    map.addLayer({
      id: LAYER.stops,
      type: 'circle',
      source: SOURCE.stops,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3, 17, 7],
        'circle-color': stopFill,
        'circle-stroke-color': stopStroke,
        'circle-stroke-width': 2,
      },
    });
    // Parada marcada: más grande y con color de acento, visible a cualquier zoom.
    map.addLayer({
      id: LAYER.selectedStop,
      type: 'circle',
      source: SOURCE.selectedStop,
      paint: {
        'circle-radius': 10,
        'circle-color': this.scheme === 'dark' ? '#4D8DFF' : '#0054E9',
        'circle-stroke-color': this.scheme === 'dark' ? '#000000' : '#FFFFFF',
        'circle-stroke-width': 3,
      },
    });
    this.applyFiltersAndHighlight();
    this.applyStopsZoomRange();
  }

  private applyStopsZoomRange(): void {
    if (!this.map.getLayer(LAYER.stops)) return;
    const minZoom = this.stops.length > MANY_STOPS ? MANY_STOPS_MIN_ZOOM : 0;
    this.map.setLayerZoomRange(LAYER.stops, minZoom, 24);
  }

  private applyFiltersAndHighlight(): void {
    const map = this.map;
    if (!map.getLayer(LAYER.line)) return;

    const visible: ExpressionSpecification | true = this.visibleLines
      ? ['in', ['get', 'lineId'], ['literal', [...this.visibleLines]]]
      : true;
    const official: FilterSpecification = ['all', visible, ['!', ['get', 'approximate']]];
    const approximate: FilterSpecification = ['all', visible, ['get', 'approximate']];
    const all: FilterSpecification = ['all', visible];
    map.setFilter(LAYER.casing, all);
    map.setFilter(LAYER.line, official);
    map.setFilter(LAYER.approximate, approximate);
    map.setFilter(LAYER.labels, all);

    const h = this.highlighted;
    const isHighlighted: ExpressionSpecification = [
      'in',
      ['get', 'lineId'],
      ['literal', h ? [...h] : []],
    ];
    const width = (normal: number, wide: number): ExpressionSpecification =>
      h
        ? [
            'interpolate',
            ['linear'],
            ['zoom'],
            11,
            ['case', isHighlighted, wide, normal],
            16,
            ['case', isHighlighted, wide * 2, normal * 2],
          ]
        : ['interpolate', ['linear'], ['zoom'], 11, normal, 16, normal * 2];
    const opacity: ExpressionSpecification | number = h ? ['case', isHighlighted, 1, 0.2] : 1;

    for (const layer of [LAYER.line, LAYER.approximate]) {
      map.setPaintProperty(layer, 'line-width', width(2, 4));
      map.setPaintProperty(layer, 'line-opacity', opacity);
    }
    map.setPaintProperty(LAYER.casing, 'line-width', width(4, 7));
    map.setPaintProperty(LAYER.casing, 'line-opacity', opacity);
    map.setPaintProperty(LAYER.labels, 'text-opacity', opacity);
    // Las líneas resaltadas se dibujan por encima del resto.
    const sortKey: ExpressionSpecification | number = h ? ['case', isHighlighted, 1, 0] : 0;
    map.setLayoutProperty(LAYER.casing, 'line-sort-key', sortKey);
    map.setLayoutProperty(LAYER.line, 'line-sort-key', sortKey);
    map.setLayoutProperty(LAYER.approximate, 'line-sort-key', sortKey);
  }

  private source(id: string): GeoJSONSource | undefined {
    return this.map.getSource<GeoJSONSource>(id);
  }

  private routesGeoJson(): FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: this.routes.map((route) => ({
        type: 'Feature',
        properties: {
          lineId: route.lineId,
          color: route.color,
          textColor: route.textColor,
          approximate: route.approximate,
        },
        geometry: { type: 'LineString', coordinates: route.points.map(([lat, lon]) => [lon, lat]) },
      })),
    };
  }

  private selectedStopGeoJson(): FeatureCollection {
    const stop = this.highlightedStop;
    return {
      type: 'FeatureCollection',
      features: stop
        ? [
            {
              type: 'Feature',
              properties: { id: stop.id, name: stop.name },
              geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] },
            },
          ]
        : [],
    };
  }

  private stopsGeoJson(): FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: this.stops.map((stop) => ({
        type: 'Feature',
        properties: { id: stop.id, name: stop.name },
        geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] },
      })),
    };
  }
}

let stylesheetLoaded = false;
function loadStylesheet(): void {
  if (stylesheetLoaded) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = CSS_PATH;
  document.head.appendChild(link);
  stylesheetLoaded = true;
}
