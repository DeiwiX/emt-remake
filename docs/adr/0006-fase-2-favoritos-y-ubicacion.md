# ADR 0006 — Fase 2: favoritos y ubicación

- Estado: aprobada por el desarrollador (04/10/2026)

## Contexto

La fase 2 añade favoritos y "Cerca de mí". Hay que decidir qué se guarda, dónde y cómo se usa la ubicación, que es un dato personal.

## Decisión

- **Favoritos:** paradas, líneas y trayectos de "Cómo llegar" (origen y destino como referencia `tipo:id` más el nombre al guardarlo).
- **Almacenamiento:** solo en el dispositivo (`localStorage`, clave `emt-remake.favorites.v1`), sin cuentas ni nube. Si se borra la app o se cambia de móvil, se pierden.
- **Ubicación:** en la app nativa, permiso del sistema con `@capacitor/geolocation`; en la web, la del navegador. Solo con la app abierta y nunca sale del dispositivo.
- **"Cerca de mí":** paradas a 500 m o menos; si no hay ninguna, hasta 1 km.
- **Icono y pantalla de inicio propios** a partir del autobús del logotipo (incremento 14).

## Alternativas consideradas

- Sincronizar favoritos en la nube: exigiría cuentas y un servidor; fuera de alcance y contrario a "sin cuentas ni analítica".
- IndexedDB para los favoritos: innecesario para unos pocos registros; `localStorage` es síncrono y ya se usa para los ajustes.

## Consecuencias

- Un favorito cuyo lugar desaparece de los datos se ignora al mostrarlo (los trayectos conservan el nombre guardado).
- "Cómo llegar" acepta `?from=tipo:id&to=tipo:id`, que usan los trayectos guardados.
- La política de privacidad de "Acerca de" debe mencionar la ubicación cuando se añada.
