# ADR 0011 — Rutas andando por las calles con OpenStreetMap (opción 2B)

- Estado: pedida por el desarrollador (05/10/2026, "haz 2B"). La forma de hacerlo (red propia a partir de OpenStreetMap, sin servicio de rutas externo) es decisión mía.

## Contexto

"Cómo llegar" sumaba los tramos a pie (desde una calle, dirección o tu ubicación hasta la parada) en línea recta con un 30 % de rodeo y los dibujaba como una recta. El desarrollador pidió el camino real por las calles.

## Decisión

- El script de datos descarga de Overpass las vías de OpenStreetMap con `highway` por las que se puede andar en la zona de las paradas (+1 km), sin autopistas, autovías, vías en obras ni las que prohíben el paso a pie o son privadas. Las parte en los cruces, simplifica su dibujo (3 m), encarece las escaleras (×1,5) y se queda con la parte conectada más grande. Publica `walk-graph.json` (~1,8 MB; 0,8 MB comprimido).
- Se descarga como mucho una vez por semana: el flujo baja la red publicada y la reutiliza si tiene menos de 7 días; si Overpass falla o devuelve una red pequeña, se mantiene la anterior. No cuenta en `dataVersion`. Las descargas se identifican con un User-Agent del proyecto (Overpass rechaza las anónimas).
- La app la descarga al abrir "Cómo llegar", engancha cada punto al cruce más cercano (≤ 300 m) y calcula los caminos con Dijkstra acotado. Los minutos son metros / 80 (sin margen de rodeo). Sin red, la estimación anterior.

## Alternativas

- Servicio de rutas externo (OSRM, OpenRouteService, GraphHopper): sin datos que publicar, pero cada consulta enviaría origen y destino a un tercero, necesitaría conexión y, en algunos casos, clave de API (el repositorio es público).
- Descargar OSM cada hora con el resto de datos: innecesario y abusivo con un servicio gratuito.

## Consecuencias y riesgos

- Datos de OpenStreetMap (ODbL): se cita en "Acerca de" y en el manifest.
- La calidad depende de OSM (aceras o pasos que falten). Los transbordos a pie entre paradas siguen estimados en línea recta.
- Un punto a más de 300 m de cualquier calle conocida conserva la estimación en línea recta.
