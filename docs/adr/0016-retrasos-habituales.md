# ADR 0016 — Retrasos habituales (Fase 10)

- Estado: aprobada por el desarrollador (17/10/2026): opción B de la Fase 10, recogida cada 5 min en GitHub, histórico en la rama `historico-retrasos` (pública, son datos abiertos) y uso en la app como corrección del horario.

## Contexto

Sin tiempo real (de lejos, o para mañana), la app solo tiene el horario programado, que no refleja que ciertas líneas van tarde a ciertas horas. La fuente de posiciones del Ayuntamiento no guarda histórico: hay que recogerlo.

## Decisión

- **Recogida** (`.github/workflows/delays.yml`, `pipeline/src/delays/collect.ts`): cada hora, un trabajo de unos 55 min mira la fuente cada 5 min. Para cada autobús nuevo calcula su retraso frente al viaje del horario publicado con la misma regla que la app (el viaje que debía pasar por su última parada más cerca de la hora del dato, entre 10 min adelantado y 40 tarde, prefiriendo tarde) y lo añade a `data/AAAAMMDD.csv` en la rama `historico-retrasos`. No se mide en la primera parada (puede estar esperando su hora). Se borran los días de hace más de 9 semanas.
- **Cálculo** (`pipeline/src/delays/delays.ts`, flujo "Datos", cada hora): junta los 56 días anteriores a hoy y publica `delays.json` con la mediana del retraso por línea, sentido, tipo de día (laborable, sábado, domingo), hora y tramo de 5 paradas. Un hueco con menos de 5 datos queda vacío; los retrasos se acotan entre −5 y 30 min. No cuenta en `dataVersion`.
- **Uso en la app**: los próximos buses del horario se suman con su retraso habitual (si es de 1 min o más) y lo dicen ("18:27 · +3 habitual"; abajo, "Horario con el retraso habitual a esta hora"). Lo usan los próximos buses, el panel de salidas, las favoritas y "Avísame". El tiempo real, cuando lo hay, manda. "Cómo llegar" sigue con el horario.

## Alternativas

- Recoger desde el móvil mientras la app está abierta: pocos datos y sesgados.
- Un trabajo por cada 5 min: 288 commits al día; con uno por hora son 24.
- Guardar el histórico en un servicio aparte: más coste y otra cuenta.

## Consecuencias y riesgos

- Hacen falta unas 2 semanas para que haya datos en la mayoría de huecos; hasta entonces la app usa el horario como antes.
- Los festivos entre semana cuentan como laborables (la fuente no dice qué días son festivos).
- GitHub puede retrasar o saltarse ejecuciones programadas; solo hace que haya menos datos.
- La rama `historico-retrasos` crece unos 2 MB al día (se recorta a 9 semanas).
