# EMT remake

Aplicación **no oficial** para consultar los autobuses urbanos de Málaga (EMT): líneas, recorridos y paradas. Es una PWA con versiones Android e iOS desde una sola base de código. No está vinculada a la EMT Málaga ni al Ayuntamiento de Málaga. "EMT remake" es un nombre provisional.

## Estado

Fase 1 en construcción. Hechos: incremento 1 (esqueleto, navegación, idiomas ES/EN, lint y pruebas) incremento 2 (script de datos publicado cada noche) incremento 3 (capa de datos con caché en el dispositivo) e incremento 4 (listas de líneas y paradas, búsqueda y detalle en texto de línea y parada; el detalle con mapa llega en los incrementos 5 y 6).

## Requisitos

- Node.js 24 y npm 11 (versiones con las que se ha probado)
- Para Android (más adelante): Android Studio y SDK
- Para iOS (más adelante): macOS con Xcode

## Uso

```bash
cd app
npm install
npm start                    # servidor de desarrollo en http://localhost:4200
npm test -- --watch=false    # pruebas unitarias (Vitest)
npm run lint                 # ESLint, con reglas de accesibilidad de plantillas
npm run build                # compilación de producción en app/dist/
npm run data:snapshot        # actualiza la copia de datos incluida en la app (public/data-snapshot)
```

Script de datos:

```bash
cd pipeline
npm install
npm run build-data -- --out out              # descarga las fuentes y genera out/*.json
npm run build-data -- --out out --previous viejo/manifest.json   # además compara con una publicación anterior
npm test                                     # pruebas (node:test)
npm run typecheck                            # comprobación de tipos estricta
```

## Estructura

```
app/        Aplicación Ionic 9 + Angular 22
  src/app/core/      modelo de dominio, interfaces de repositorio, búsqueda, i18n
  src/app/data/      implementación de la Fase 1: ficheros publicados + caché IndexedDB
  src/app/features/  pantallas, cargadas de forma diferida
  src/app/shared/    componentes reutilizables
  public/i18n/       textos en español e inglés
pipeline/   Script que descarga, valida y cruza las fuentes y genera los JSON de la app
  src/sources/   lectura y validación de cada fuente
  src/build/     cruce de fuentes, trazados, simplificación y comprobaciones
  src/output-schema.ts   formato publicado (contrato con la app)
docs/adr/   decisiones de arquitectura
.github/workflows/   CI y publicación nocturna de datos
```

## Datos y licencias

### Datos publicados

El workflow `Datos` se ejecuta cada día a las 05:30 UTC y publica en GitHub Pages, en https://deiwix.github.io/emt-remake/data/v1/ (con CORS abierto):

| Fichero | Contenido | Tamaño aprox. (gzip, 03/10/2026) |
| --- | --- | --- |
| `manifest.json` | versión de los datos (`dataVersion`), recuentos, huellas SHA-256 de cada fichero, fuentes y licencia | 1 KB |
| `network.json` | líneas, sentidos con paradas en orden y destino, y paradas | 34 KB |
| `shapes-overview.json` | trazados simplificados a 25 m (vista general) | 7 KB |
| `shapes-detail.json` | trazados simplificados a 4 m (zoom cercano) | 14 KB |
| `report.json` | incidencias: sentidos con recorrido aproximado y paradas en conflicto | 1 KB |

Los trazados son polilíneas codificadas con el algoritmo de Google (precisión 1e-5). Si un sentido no tiene trazado oficial, se unen sus paradas con tramos rectos y se marca `shapeQuality: "approximate"`. El 03/10/2026 son las líneas 91, 92 y 93. Las líneas L y 20E del GTFS no aparecen porque no tienen viajes ni figuran en la fuente de líneas y paradas.

Si la descarga falla o los datos no son plausibles (por debajo de 20 líneas o 500 paradas, o una caída de más del 20 % frente a la publicación anterior), no se publica nada y se mantiene la versión anterior.

### Cómo los usa la app

1. Al arrancar muestra lo guardado en el dispositivo (IndexedDB) o, la primera vez, la copia incluida en `app/public/data-snapshot/`.
2. Después descarga `manifest.json`. Si `dataVersion` no ha cambiado no descarga nada más. Si ha cambiado, descarga `network.json`, comprueba su huella SHA-256 y su formato, y solo entonces sustituye la copia guardada.
3. Los trazados se descargan solo al abrir el mapa y también se guardan.
4. Si algo falla, se siguen mostrando los últimos datos válidos, con un aviso de que pueden estar desactualizados y la fecha de los datos.

Las pantallas solo usan las interfaces de `core/data/repositories.ts`. Para cambiar de fuente (API propia u oficial) basta con otra implementación registrada en `data/provide-data.ts`.

### Origen y licencia

Los datos proceden del portal de datos abiertos del Ayuntamiento de Málaga (datosabiertos.malaga.eu). Se tratan como CC BY-SA 4.0 (ver `docs/adr/0002-datos-preprocesados.md`).
