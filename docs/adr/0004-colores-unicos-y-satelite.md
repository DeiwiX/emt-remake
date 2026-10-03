# ADR 0004 – Un color por línea y foto aérea del PNOA

- Estado: aprobado por el desarrollador (03/10/2026)
- Modifica en parte el ADR 0003 (paleta de 7 colores) y amplía las capas del mapa.

## Colores de línea

### Problema

La paleta inicial tenía 7 colores validados para daltonismo. Con 49 líneas los colores se repetían, y el desarrollador pidió un color distinto para cada línea.

### Alternativas

- A. Un color único por línea. Es posible con buen contraste, pero con tantos colores no se puede garantizar que todos se distingan con daltonismo. **Elegida.**
- B. Mantener los 7 colores validados para daltonismo, que se repiten.

### Decisión

- `core/map/line-palette.ts` genera tantos colores como líneas.
- Se crean unos 360 candidatos (un tono cada 6° con 6 combinaciones de saturación y luminosidad). A cada uno se le ajusta la luminosidad para que el trazo tenga contraste ≥ 3:1 con el fondo del mapa claro y del oscuro.
- Se eligen los candidatos por "punto más lejano" en CIE Lab.
- El reparto da colores lo más distintos posible a las líneas que comparten paradas.

### Consecuencias

- Las pruebas garantizan, para 60 colores:
  - colores únicos;
  - número de la insignia ≥ 4,5:1;
  - trazo ≥ 3:1 en ambos temas;
  - diferencia CIE76 ≥ 10 entre dos colores cualesquiera, con visión normal.
- Con daltonismo, algunos colores pueden parecerse. El número de línea siempre visible (insignias y etiquetas sobre los recorridos) es lo que garantiza la identificación.

## Foto aérea

### Decisión

Se añade una capa "Satélite" con el PNOA del Instituto Geográfico Nacional:

- Servicio: WMTS `https://www.ign.es/wmts/pnoa-ma`.
- Licencia: CC BY 4.0 scne.es.
- CORS abierto, comprobado el 03/10/2026.

El mapa ofrece "Claro", "Oscuro" y "Satélite", independientes del tema de la app.

### Consecuencias

- La atribución "PNOA cedido por © Instituto Geográfico Nacional" aparece en el mapa y en "Acerca de".
- Es un servicio externo más, sin SLA. Si falla, se puede volver al callejero.
