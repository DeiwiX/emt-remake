# ADR 0002 – Datos preprocesados en hosting estático

- Estado: aprobado por el desarrollador (03/10/2026, opción A del Paso 0)
- Sustituye a la decisión inicial "la app consulta directamente las fuentes abiertas".

## Problema

Verificado el 03/10/2026 en datosabiertos.malaga.eu:

- Los ficheros de `/recursos/` no envían `Access-Control-Allow-Origin`: un `fetch` desde otro dominio falla en el navegador.
- El GTFS es un ZIP de 5,8 MB (`stop_times` ocupa 34,7 MB descomprimido), demasiado para móviles modestos.
- "Líneas y paradas" no incluye trazados; el GTFS sí, salvo en las líneas L, 20E, 91, 92 y 93.

## Alternativas consideradas

- A. Script de preprocesado que publica JSON pequeños en hosting estático con CORS. **Elegida.**
- B. Proxy CORS mínimo: el móvil seguiría descargando y procesando el ZIP.
- C. Consulta directa en nativo y proxy en web: dos caminos de datos que mantener.

## Decisión

- Un script (`pipeline/`) ejecutado cada noche con GitHub Actions descarga, valida y cruza las fuentes, simplifica los trazados y publica los resultados en GitHub Pages.
- Si la validación falla, no publica y se mantiene la versión anterior.
- La app guarda en el dispositivo la última copia válida.
- Las líneas sin trazado se dibujan uniendo sus paradas con tramos rectos, marcados como "recorrido aproximado".

## Consecuencias

- Hay alojamiento propio (estático, sin backend). GitHub Pages no ofrece SLA.
- Los datos derivados se publican bajo **CC BY-SA 4.0** con atribución al Ayuntamiento de Málaga. La ficha del portal es contradictoria (BY frente a BY-SA), así que se asume la más restrictiva hasta que el portal lo aclare.
