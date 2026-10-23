# Datos de MalaGo (EMT Málaga)

Este repositorio genera y publica los datos abiertos que usa la app MalaGo: líneas, paradas, trazados, horarios, calles, barrios, avisos, retrasos habituales de la EMT Málaga y capas del mapa (semáforos, desfibriladores, puntos de recarga, aparcamientos de bici y paradas con marquesina, en `places.json`). El código de la app está en un repositorio privado.

Se publican en GitHub Pages, en https://deiwix.github.io/emt-remake/data/v1/ (empieza por `manifest.json`).

## Cómo funciona

- `pipeline/`: script (Node 24 + TypeScript) que descarga, valida y cruza las fuentes y genera los JSON. Pruebas: `npm test`; tipos: `npm run typecheck`; generación local: `npm run build-data -- --out <carpeta>`.
- Workflow `Datos` (cada hora): genera los datos y los publica en Pages. Si la descarga o la validación fallan, no se publica nada y sigue la versión anterior.
- Workflow `Recogida de retrasos` (cada hora): guarda cuánto va tarde cada autobús en la rama `historico-retrasos` (un CSV por día, últimas 9 semanas).

## Origen y licencia

Los datos proceden del portal de datos abiertos del Ayuntamiento de Málaga (https://datosabiertos.malaga.eu) y se redistribuyen bajo CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/deed.es), la licencia más restrictiva de las que indica el portal.

Los trenes de Cercanías (C-1 y C-2) salen del horario de Renfe Data (https://data.renfe.com/dataset/horarios-cercanias, CC BY 4.0): Origen de los datos: Renfe Operadora.

Los semáforos y las marquesinas de `places.json` salen además de OpenStreetMap (© colaboradores de OpenStreetMap, ODbL 1.0, https://www.openstreetmap.org/copyright), como la red peatonal.
