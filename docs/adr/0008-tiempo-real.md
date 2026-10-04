# ADR 0008 — Tiempo real y horario exacto (Fase 3)

- Estado: aprobada por el desarrollador (04/10/2026): opciones 1 + 2 + 3 y B1. Queda abierto investigar cómo mejorar la precisión.

## Contexto

La app oficial muestra llegadas en tiempo real; la nuestra, el horario programado con un tiempo medio por parada. El Ayuntamiento publica "Ubicaciones de autobuses EMT en tiempo real": por autobús, línea, sentido, última parada por la que pasó, posición y hora del dato.

Medido el 04/10/2026: ~106 autobuses; la fuente se actualiza en bloque cada ~5 minutos; el servidor no envía cabeceras CORS (un navegador no puede leerla); 93 de 105 registros casan con nuestras líneas, sentidos y paradas (las líneas 71, 72 y 75 no están en la red publicada).

## Decisión

1. Horario exacto: el script publica, por sentido, los perfiles de paso de cada viaje y el perfil de cada salida.
2. Llegada estimada en tiempo real = minutos programados entre la última parada del bus y la consultada − antigüedad del dato. Se marca siempre como estimación; no se usan datos de más de 15 min ni llegadas a más de 60 min.
3. Autobuses en los mapas (Mapa y detalle de línea).
- B1: solo en la app nativa (CapacitorHttp, sin CORS). En la web, solo horario.

## Alternativas

- B2: intermediario propio (p. ej. Cloudflare Workers) para la web: servicio externo que mantener y expuesto al ser el repositorio público.

## Consecuencias

- Con datos de hasta 5 min, el error de la estimación puede ser de varios minutos.
- `timetables.json` pasa de ~17 KB a ~63 KB comprimido.
- La app consulta la fuente cada minuto solo mientras hay una pantalla que la usa.
