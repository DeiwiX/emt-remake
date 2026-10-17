# ADR 0017 — Metro de Málaga (Fase 11)

- Estado: aprobada por el desarrollador (17/10/2026): opción C (tarjeta y pantalla propias del metro, y estaciones integradas en buscador, Cerca de mí, favoritos y "Cómo llegar"), con combinaciones bus + metro en "Cómo llegar".

## Contexto

Metro de Málaga publica su horario en GTFS (`https://metromalaga.es/GTFS/GTFS_METRO_MALAGA.zip`): L1 y L2, 19 estaciones, colores oficiales, trazados y transbordo en El Perchel y Guadalmedina. Se renueva cada ~6 semanas. No publica tiempo real abierto y no indica licencia (para un uso personal no es un problema; para publicar la app habría que preguntarles).

## Decisión

- **Datos** (`pipeline/src/build/build-metro.ts`): el script de datos descarga el GTFS del metro y lo publica dentro de `network.json`, trazados y `timetables.json`, con el mismo formato que la EMT. Líneas `L1` y `L2` con `mode: "metro"` y su color oficial; estaciones con código `M` + código del operador (`MPCH`) y `mode: "metro"`. Los andenes de cada línea se juntan en una sola estación, así el transbordo L1–L2 es en la misma parada. Es opcional: si la descarga falla se publica sin metro. Se añade antes de calcular barrios y distritos, para que sus estaciones cuenten en ellos.
- **App**: al ser líneas y paradas como las demás, el metro sale solo en el buscador, Cerca de mí (con filtro Todo / Bus / Metro), favoritos, el detalle de estación (próximos trenes y panel de salidas) y "Cómo llegar" (directo y con transbordo a pie entre bus y metro). Además: tarjeta "Metro" en el inicio y pantalla con el esquema de cada línea; colores oficiales en insignias y mapa; sin "Ubicar bus" en estaciones (no hay tiempo real).
- **"Cómo llegar"**: hasta 8 opciones (antes 6) y el mapa más bajo en el móvil (32 % de la pantalla, como mucho 240 px) para que se vean las opciones.

## Alternativas

- A. Solo tarjeta y pantalla propias: el metro no entraría en "Cómo llegar" ni en Cerca de mí.
- B. Todo mezclado sin pantalla propia: más completo pero sin una vista clara del metro.
- Publicar el metro en ficheros aparte: más código en la app para lo mismo.

## Consecuencias y riesgos

- Los códigos de estación (`MPCH`) se ven como "Estación de metro" en vez de "Código ...".
- Si Metro de Málaga cambia el formato del GTFS, el metro dejaría de publicarse (el resto sigue).
- Sin tiempo real, los trenes son los del horario (el metro es muy puntual).
