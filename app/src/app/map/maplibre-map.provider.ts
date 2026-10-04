import { Injectable } from '@angular/core';
import type { FeatureCollection } from 'geojson';
import type {
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
  StyleSpecification,
} from 'maplibre-gl';

import { LatLon, Polygon } from '../core/models/network.model';
import {
  MapBaseLayer,
  MapProvider,
  MapRoute,
  MapStop,
  MapView,
  MapViewEvents,
  MapViewOptions,
  MapVehicle,
  MapTrafficItem,
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
  stopLabels: 'stop-labels',
  selectedStop: 'selected-stop',
  areaFill: 'area-fill',
  areaOutline: 'area-outline',
  userHalo: 'user-halo',
  user: 'user',
  vehicles: 'vehicles',
  vehicleLabels: 'vehicle-labels',
  traffic: 'traffic',
  trafficLabels: 'traffic-labels',
} as const;
const SOURCE = {
  routes: 'routes',
  stops: 'stops',
  selectedStop: 'selected-stop',
  area: 'area',
  user: 'user',
  vehicles: 'vehicles',
  traffic: 'traffic',
} as const;

/**
 * Con muchas paradas (toda la red) solo se dibujan al acercarse, para no saturar
 * el mapa; con pocas (una línea o una parada) se ven a cualquier zoom.
 */
const MANY_STOPS = 200;
const MANY_STOPS_MIN_ZOOM = 13;

/** Los dibujos de bus se hacen al doble de resolución para que se vean nítidos. */
const BUS_PIXEL_RATIO = 2;

function busImageName(color: string): string {
  return `bus-${color.replace('#', '').toLowerCase()}`;
}

/**
 * Autobús visto desde arriba, mirando al norte (la capa lo gira según su rumbo):
 * carrocería del color de la línea con borde blanco, parabrisas delante, luna
 * trasera y ventanillas. null si el entorno no tiene canvas (pruebas).
 */
function drawBus(color: string): ImageData | null {
  const width = 22 * BUS_PIXEL_RATIO;
  const height = 48 * BUS_PIXEL_RATIO;
  const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return null;
  canvas.width = width;
  canvas.height = height;
  const r = BUS_PIXEL_RATIO;
  const rounded = (x: number, y: number, w: number, h: number, radius: number) => {
    ctx.beginPath();
    ctx.roundRect(x * r, y * r, w * r, h * r, radius * r);
  };
  // Sombra suave y carrocería con borde blanco.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  rounded(2, 3, 18, 44, 5);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2 * r;
  rounded(2, 1, 18, 44, 5);
  ctx.fill();
  ctx.stroke();
  // Parabrisas (delante, arriba), luna trasera y ventanillas laterales.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  rounded(4.5, 3.5, 13, 6, 2.5);
  ctx.fill();
  rounded(5.5, 39, 11, 3.5, 1.5);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  for (let y = 13; y < 37; y += 6) {
    rounded(3.5, y, 2, 4, 1);
    ctx.fill();
    rounded(16.5, y, 2, 4, 1);
    ctx.fill();
  }
  return ctx.getImageData(0, 0, width, height);
}

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
  private userLocation: LatLon | null = null;
  private userAccuracy = 0;
  private vehicles: readonly MapVehicle[] = [];
  private vehicleScale = 1;
  /** Dibujos de bus ya añadidos al estilo (uno por color de línea). */
  private readonly busImages = new Set<string>();
  private traffic: readonly MapTrafficItem[] = [];
  private area: readonly Polygon[] | null = null;
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
      const bus = map.getLayer(LAYER.vehicles)
        ? map.queryRenderedFeatures(box, { layers: [LAYER.vehicles] })[0]
        : undefined;
      if (bus && events.vehicleSelected) {
        events.vehicleSelected(String(bus.properties['id']));
        return;
      }
      const cut = map.getLayer(LAYER.traffic)
        ? map.queryRenderedFeatures(box, { layers: [LAYER.traffic] })[0]
        : undefined;
      if (cut && events.trafficSelected) {
        events.trafficSelected(String(cut.properties['id']));
        return;
      }
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

  setTraffic(items: readonly MapTrafficItem[]): void {
    this.traffic = items;
    this.source(SOURCE.traffic)?.setData(this.trafficGeoJson());
  }

  setVehicles(vehicles: readonly MapVehicle[]): void {
    this.vehicles = vehicles;
    this.ensureBusImages();
    this.source(SOURCE.vehicles)?.setData(this.vehiclesGeoJson());
  }

  setVehicleScale(scale: number): void {
    this.vehicleScale = scale;
    if (!this.map.getLayer(LAYER.vehicles)) return;
    this.map.setLayoutProperty(LAYER.vehicles, 'icon-size', this.busIconSize());
    this.map.setLayoutProperty(LAYER.vehicleLabels, 'text-size', Math.round(11 * scale));
  }

  centerOn(point: LatLon): void {
    this.map.easeTo({
      center: [point[1], point[0]],
      duration: this.options.reduceMotion ? 0 : 800,
    });
  }

  /** Tamaño del icono según el zoom y el ajuste del usuario; el seguido, algo mayor. */
  private busIconSize(): ExpressionSpecification {
    const s = this.vehicleScale;
    return [
      'interpolate',
      ['linear'],
      ['zoom'],
      11,
      ['*', 0.55 * s, ['case', ['get', 'selected'], 1.25, 1]],
      16,
      ['*', 1.1 * s, ['case', ['get', 'selected'], 1.25, 1]],
    ];
  }

  /** Añade al estilo el dibujo de bus de cada color que falte. */
  private ensureBusImages(): void {
    for (const vehicle of this.vehicles) {
      const name = busImageName(vehicle.color);
      if (this.busImages.has(name) && this.map.hasImage(name)) continue;
      const image = drawBus(vehicle.color);
      if (!image) return;
      if (!this.map.hasImage(name)) this.map.addImage(name, image, { pixelRatio: BUS_PIXEL_RATIO });
      this.busImages.add(name);
    }
  }

  setUserLocation(point: LatLon | null, accuracy = 0): void {
    this.userLocation = point;
    this.userAccuracy = accuracy;
    this.source(SOURCE.user)?.setData(this.userGeoJson());
    this.applyUserAccuracy();
  }

  /**
   * El halo mide lo mismo que el margen de error en el suelo: metros a píxeles
   * según el zoom (en Web Mercator, un píxel mide 156 543 m × cos(lat) / 2^zoom).
   */
  private applyUserAccuracy(): void {
    if (!this.map.getLayer(LAYER.userHalo)) return;
    const lat = this.userLocation?.[0] ?? 36.72;
    const metresPerPixelAtZoom0 = 156_543.03 * Math.cos((lat * Math.PI) / 180);
    const radius = Math.max(this.userAccuracy, 0);
    this.map.setPaintProperty(LAYER.userHalo, 'circle-radius', [
      'interpolate',
      ['exponential', 2],
      ['zoom'],
      0,
      Math.max(radius / metresPerPixelAtZoom0, 0),
      22,
      (radius / metresPerPixelAtZoom0) * 2 ** 22,
    ]);
  }

  setHighlightedArea(polygons: readonly Polygon[] | null): void {
    this.area = polygons;
    this.source(SOURCE.area)?.setData(this.areaGeoJson());
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

  setLabel(label: string): void {
    this.map.getCanvas().setAttribute('aria-label', label);
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

    const accent = this.scheme === 'dark' ? '#6FB0DE' : '#1D5D8A';
    // La zona marcada va debajo de los recorridos para no taparlos.
    map.addSource(SOURCE.area, { type: 'geojson', data: this.areaGeoJson() });
    map.addLayer({
      id: LAYER.areaFill,
      type: 'fill',
      source: SOURCE.area,
      paint: { 'fill-color': accent, 'fill-opacity': 0.12 },
    });
    map.addLayer({
      id: LAYER.areaOutline,
      type: 'line',
      source: SOURCE.area,
      paint: { 'line-color': accent, 'line-width': 3 },
    });

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
        'text-field': ['get', 'label'],
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
      // Las paradas rotuladas ("Cerca de mí") son el contenido principal: más grandes
      // y en naranja (distinto del punto azul del usuario), para verlas de un vistazo.
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          13,
          ['case', ['has', 'label'], 7, 3],
          17,
          ['case', ['has', 'label'], 11, 7],
        ],
        'circle-color': ['case', ['has', 'label'], '#D9480F', stopFill],
        'circle-stroke-color': ['case', ['has', 'label'], '#FFFFFF', stopStroke],
        'circle-stroke-width': ['case', ['has', 'label'], 3, 2],
      },
    });
    // Rótulo encima de las paradas que lo traen (las líneas que pasan, en "Cerca de mí").
    map.addLayer({
      id: LAYER.stopLabels,
      type: 'symbol',
      source: SOURCE.stops,
      filter: ['has', 'label'],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 12,
        'text-anchor': 'bottom',
        'text-offset': [0, -1.1],
        'text-max-width': 12,
      },
      paint: {
        'text-color': stopStroke,
        'text-halo-color': stopFill,
        'text-halo-width': 2,
      },
    });
    // Parada marcada: más grande y con color de acento, visible a cualquier zoom.
    map.addLayer({
      id: LAYER.selectedStop,
      type: 'circle',
      source: SOURCE.selectedStop,
      paint: {
        'circle-radius': 10,
        'circle-color': this.scheme === 'dark' ? '#6FB0DE' : '#1D5D8A',
        'circle-stroke-color': this.scheme === 'dark' ? '#000000' : '#FFFFFF',
        'circle-stroke-width': 3,
      },
    });
    // Cortes de tráfico: aviso naranja (gris si aún no ha empezado) con "!".
    map.addSource(SOURCE.traffic, { type: 'geojson', data: this.trafficGeoJson() });
    map.addLayer({
      id: LAYER.traffic,
      type: 'circle',
      source: SOURCE.traffic,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 6, 16, 11],
        'circle-color': ['case', ['get', 'active'], '#E8590C', '#868E96'],
        'circle-stroke-color': '#FFFFFF',
        'circle-stroke-width': 2,
      },
    });
    map.addLayer({
      id: LAYER.trafficLabels,
      type: 'symbol',
      source: SOURCE.traffic,
      minzoom: 12,
      layout: {
        'text-field': '!',
        'text-font': ['Noto Sans Bold'],
        'text-size': 12,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#FFFFFF' },
    });
    // Autobuses en tiempo real: punto grande del color de la línea con su número.
    map.addSource(SOURCE.vehicles, { type: 'geojson', data: this.vehiclesGeoJson() });
    // El estilo nuevo no trae los dibujos de bus: se vuelven a añadir.
    this.busImages.clear();
    this.ensureBusImages();
    map.addLayer({
      id: LAYER.vehicles,
      type: 'symbol',
      source: SOURCE.vehicles,
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-size': this.busIconSize(),
        'icon-rotate': ['get', 'bearing'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'symbol-sort-key': ['case', ['get', 'selected'], 1, 0],
      },
    });
    // Número de la línea sobre el bus, siempre derecho para leerlo.
    map.addLayer({
      id: LAYER.vehicleLabels,
      type: 'symbol',
      source: SOURCE.vehicles,
      minzoom: 12,
      layout: {
        'text-field': ['get', 'lineId'],
        'text-font': ['Noto Sans Bold'],
        'text-size': Math.round(11 * this.vehicleScale),
        'text-allow-overlap': true,
        'text-ignore-placement': true,
        'text-rotation-alignment': 'viewport',
      },
      paint: {
        'text-color': ['get', 'textColor'],
        'text-halo-color': ['get', 'color'],
        'text-halo-width': 2,
      },
    });
    // Posición del usuario: punto azul con halo, encima de todo.
    map.addSource(SOURCE.user, { type: 'geojson', data: this.userGeoJson() });
    map.addLayer({
      id: LAYER.userHalo,
      type: 'circle',
      source: SOURCE.user,
      paint: {
        'circle-radius': 0,
        'circle-color': '#1A73E8',
        'circle-opacity': 0.15,
        'circle-stroke-color': '#1A73E8',
        'circle-stroke-width': 1,
        'circle-stroke-opacity': 0.5,
      },
    });
    map.addLayer({
      id: LAYER.user,
      type: 'circle',
      source: SOURCE.user,
      paint: {
        'circle-radius': 8,
        'circle-color': '#1A73E8',
        'circle-stroke-color': '#FFFFFF',
        'circle-stroke-width': 3,
      },
    });
    this.applyUserAccuracy();
    this.applyFiltersAndHighlight();
    this.applyStopsZoomRange();
  }

  private applyStopsZoomRange(): void {
    if (!this.map.getLayer(LAYER.stops)) return;
    const minZoom = this.stops.length > MANY_STOPS ? MANY_STOPS_MIN_ZOOM : 0;
    this.map.setLayerZoomRange(LAYER.stops, minZoom, 24);
    this.map.setLayerZoomRange(LAYER.stopLabels, minZoom, 24);
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
          label: route.label ?? route.lineId,
          color: route.color,
          textColor: route.textColor,
          approximate: route.approximate,
        },
        geometry: { type: 'LineString', coordinates: route.points.map(([lat, lon]) => [lon, lat]) },
      })),
    };
  }

  private areaGeoJson(): FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: (this.area ?? []).map((polygon) => ({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: polygon.map((ring) => ring.map(([lat, lon]) => [lon, lat])),
        },
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

  private trafficGeoJson(): FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: this.traffic.map((item) => ({
        type: 'Feature',
        properties: { id: item.id, active: item.active },
        geometry: { type: 'Point', coordinates: [item.point[1], item.point[0]] },
      })),
    };
  }

  private vehiclesGeoJson(): FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: this.vehicles.map((vehicle) => ({
        type: 'Feature',
        properties: {
          id: vehicle.id,
          lineId: vehicle.lineId,
          color: vehicle.color,
          textColor: vehicle.textColor,
          icon: busImageName(vehicle.color),
          bearing: vehicle.bearing ?? 0,
          selected: vehicle.selected ?? false,
        },
        geometry: { type: 'Point', coordinates: [vehicle.lon, vehicle.lat] },
      })),
    };
  }

  private userGeoJson(): FeatureCollection {
    const point = this.userLocation;
    return {
      type: 'FeatureCollection',
      features: point
        ? [
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'Point', coordinates: [point[1], point[0]] },
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
        properties: stop.label
          ? { id: stop.id, name: stop.name, label: stop.label }
          : { id: stop.id, name: stop.name },
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
