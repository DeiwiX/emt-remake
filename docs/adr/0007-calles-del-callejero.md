# ADR 0007 — Buscar por calle con el callejero municipal

- Estado: aprobada por el desarrollador (04/10/2026), opciones 1A y 2A; la 2B queda para más adelante.

## Contexto

"Cómo llegar" y los buscadores solo admitían paradas, barrios y distritos. El desarrollador pidió poder escribir el nombre de una calle y ver en el mapa el camino a pie y su tiempo.

## Alternativas consideradas

1. Origen de las calles
   - **A. Callejero municipal** (vías, tipos de vía y números de portal del "Sistema de información cartográfica"): sin conexión, sin servidores externos, misma licencia que el resto. Solo calles y portales, no comercios.
   - B. Nominatim (OpenStreetMap) por internet: encuentra también comercios, pero envía cada búsqueda a un servidor externo, exige conexión y tiene límites de uso.
2. Camino a pie
   - **A. Línea recta discontinua** con los minutos (distancia × 1,3 de rodeo a 80 m/min).
   - B. Camino real por las calles: necesita un grafo de calles y un algoritmo de rutas (posible más adelante con los tramos del propio callejero).

## Decisión

- El script publica `streets.json`: cada vía en vigor con su nombre ("Calle Marques de Larios") y una muestra de sus portales separados al menos 40 m (número y posición). Unas 6.200 calles, ~200 KB comprimido; la app lo descarga la primera vez que se busca una calle.
- Calle sin número: las paradas a menos de 300 m de algún portal, cada una con los minutos andando desde el portal más cercano. Con número: el portal publicado más cercano a ese número y las paradas a 500 m (o 1 km), como "Mi ubicación".
- El planificador suma el tramo a pie al principio (origen) y al final (destino) y elige las paradas de subida y bajada que minimizan el total.

## Consecuencias

- El callejero municipal no lleva tildes en los nombres; la búsqueda no las distingue.
- La posición de un número puede desviarse unos 40 m (muestra de portales).
- El tramo a pie es una estimación en línea recta: puede no seguir las calles.
