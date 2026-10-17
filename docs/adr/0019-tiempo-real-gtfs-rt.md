# ADR 0019 — Tiempo real oficial de la EMT (GTFS-RT)

- Estado: pedida por el desarrollador (17/10/2026, hilo "Tiempo real y API de la EMT"): integrar el GTFS-RT de la EMT, con permiso para instalar una librería de protobuf, y quitar el código que quede obsoleto. Los detalles de implementación son míos. Sustituye a la fuente y a la estimación de los ADR 0008 y 0012, y cambia cómo se mide en los ADR 0013 y 0015.

## Contexto

Hasta ahora el tiempo real salía de las "Ubicaciones de autobuses EMT" del Ayuntamiento: última parada por la que pasó cada bus, renovada cada ~5 min. La app estimaba la llegada (casando el bus con su viaje del horario, midiendo su ritmo, moviéndolo por el mapa segundo a segundo).

La EMT publica GTFS-RT (Mobility Database mdb-2213/2214/2215), comprobado el 17/10/2026 desde el PC:

- `https://gtfs.emtmalaga.es/GTFSRTapi/api/vehicleposition` y `.../tripupdate`: sin clave, responden en ~0,25 s, se renuevan cada 60 s (posiciones GPS y llegada prevista de cada viaje a sus paradas). Sin cabeceras CORS. No se han encontrado condiciones de uso publicadas.
- Los viajes solo traen `stop_sequence` (no la parada). Sus `trip_id` (`G2606S_F21_072-03_13`) coinciden con el GTFS publicado salvo la variante del horario (`F21` no está en el GTFS; sí el resto: horario, bloque y número de viaje). 224 de 227 viajes se reconocen así.

## Decisión

- **Datos**: `timetables.json` publica `livePatterns` (cada recorrido distinto: línea, sentido, paradas y minutos) y `liveTrips` (horario → bloque → recorrido de cada número de viaje). Unos 86 KB sin comprimir.
- **App** (solo en el móvil, por CORS, como antes): `CapacitorRealtimeSource` descarga los dos feeds cada 30 s mientras alguna pantalla los usa y los lee con `gtfs-realtime-bindings` (cargado bajo demanda). `core/realtime/realtime.ts` (lógica pura) cruza cada viaje con su recorrido: la llegada a una parada es la del feed o, si no la trae, la de la anterior que la trae más los minutos del horario entre las dos (regla del estándar); las suprimidas (`SKIPPED`) no cuentan. El retraso se calcula con la salida programada (`start_time`).
- **Mapa**: posición GPS colocada sobre el recorrido (entre la parada anterior y la próxima), mirando hacia donde va; sin movimiento estimado entre datos.
- **Avisos**: se asocian a un viaje (`trip_id`), no a un autobús. El servicio nativo de Android recibe los viajes del sentido que pasan por la parada y lee el feed con un lector de protobuf propio y mínimo (`GtfsRtReader`, ~200 líneas) para no añadir protobuf-java al APK.
- **Atascos**: se apunta cuándo deja atrás cada autobús una parada y se compara con el horario.
- **Se quita**: la fuente del Ayuntamiento en la app, la estimación propia (`live-estimate`, ritmo, tiempo parado en paradas, movimiento suavizado, contexto de llegada) y `FeedEstimator.java`. El histórico de retrasos habituales (ADR 0016) sigue recogiéndose de la fuente del Ayuntamiento.

## Consecuencias

- Llegadas calculadas por la EMT y posiciones de hace ≤1 min, en vez de una estimación sobre datos de hasta 5 min.
- Sin el GTFS publicado con `liveTrips` (publicaciones anteriores) no hay tiempo real: la app usa el horario.
- Los viajes de variantes que no estén en el GTFS (3 de 227 el 17/10/2026) no salen en tiempo real.
- Si la EMT cambia el formato de los `trip_id`, hay que revisar `tripKeyParts` (app) y `TripEstimator.tripKey` (Android).
- Cada móvil consulta a la EMT directamente; si un día se publica la app para mucha gente, conviene un proxy con caché (análisis del 17/10/2026).
- Los avisos guardados con la versión anterior (asociados a un autobús) se descartan.
