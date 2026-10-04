# EMT remake

Aplicación **no oficial** para consultar los autobuses urbanos de Málaga (EMT): líneas, recorridos y paradas. Es una PWA con versiones Android e iOS desde una sola base de código. No está vinculada a la EMT Málaga ni al Ayuntamiento de Málaga. "EMT remake" es un nombre provisional.

## Estado

Fase 1 en construcción. Hechos: incremento 1 (esqueleto, navegación, idiomas ES/EN, lint y pruebas) incremento 2 (script de datos publicado cada noche) incremento 3 (capa de datos con caché en el dispositivo) e incremento 4 (listas de líneas y paradas, búsqueda y detalle de línea y parada), incremento 5 (mapa con los recorridos de todas las líneas) incremento 6 (mapa dentro del detalle de línea y de parada) e incremento 7 (ajustes de idioma, tema claro/oscuro/según el sistema y alto contraste, y pantalla «Acerca de»). Los tiempos de llegada quedan para la Fase 3.

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
  src/app/map/       adaptador del mapa con MapLibre (detrás de core/map/map-provider.ts)
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
| `zones.json` | barrios (419) y distritos (11): contorno simplificado y paradas de cada zona (dentro o a menos de 100 m del borde) | 58 KB |
| `report.json` | incidencias: sentidos con recorrido aproximado y paradas en conflicto | 1 KB |

Los trazados son polilíneas codificadas con el algoritmo de Google (precisión 1e-5). Si un sentido no tiene trazado oficial, se unen sus paradas con tramos rectos y se marca `shapeQuality: "approximate"`. El 03/10/2026 son las líneas 91, 92 y 93. Las líneas L y 20E del GTFS no aparecen porque no tienen viajes ni figuran en la fuente de líneas y paradas.

Si la descarga falla o los datos no son plausibles (por debajo de 20 líneas o 500 paradas, o una caída de más del 20 % frente a la publicación anterior), no se publica nada y se mantiene la versión anterior.

### Cómo los usa la app

1. Al arrancar muestra lo guardado en el dispositivo (IndexedDB) o, la primera vez, la copia incluida en `app/public/data-snapshot/`.
2. Después descarga `manifest.json`. Si `dataVersion` no ha cambiado no descarga nada más. Si ha cambiado, descarga `network.json`, comprueba su huella SHA-256 y su formato, y solo entonces sustituye la copia guardada.
3. Los trazados se descargan solo al abrir el mapa y también se guardan.
4. Si algo falla, se siguen mostrando los últimos datos válidos, con un aviso de que pueden estar desactualizados y la fecha de los datos.

Las pantallas solo usan las interfaces de `core/data/repositories.ts`. Para cambiar de fuente (API propia u oficial) basta con otra implementación registrada en `data/provide-data.ts`.

### Mapa y colores de línea

- El mapa usa MapLibre GL JS con los estilos `positron` (claro) y `dark` (oscuro) de OpenFreeMap. La librería se descarga solo al abrir el mapa (unos 230 KB comprimidos, más su *worker*).
- Si el dispositivo no tiene WebGL, el mapa muestra un aviso y enlaza a las listas.
- El mapa tiene su propio buscador de líneas y paradas: al elegir una línea se resalta, y al elegir una parada se marca y el mapa se centra en ella, sin salir del mapa.
- Cada línea tiene un color propio, generado en `core/map/line-palette.ts` (ADR 0004). Las pruebas comprueban:
  - que el número de la insignia tiene un contraste de al menos 4,5:1;
  - que el trazo tiene al menos 3:1 frente al fondo del mapa claro y del oscuro;
  - que dos colores cualesquiera se diferencian con claridad (CIE76 ≥ 10).

  Con daltonismo algunos pueden parecerse; el número de línea aparece siempre en las insignias y sobre los recorridos.
- El buscador del inicio y el del mapa también encuentran barrios y distritos. Al elegir uno en el inicio se abre el mapa con la zona marcada (`/map?zone=...`). En el mapa, al elegir uno se marca su contorno, se muestran sus paradas y se resaltan las líneas que pasan por ellas. Los límites proceden del "Sistema de información cartográfica" del Ayuntamiento (mismo portal y licencia).
- La sección Paradas tiene el mismo esquema que el mapa: mapa ancho con las paradas (las filtradas, si se filtra) y panel con la lista. Al elegir una, en la lista o en el mapa, se marca, se dibujan sus líneas y aparece su ficha con el próximo bus y el acceso al detalle.
- Capas del mapa: "Claro" y "Oscuro" (OpenFreeMap) y "Satélite" (PNOA del IGN, CC BY 4.0). El selector está en todos los mapas (Mapa, Cómo llegar, línea y parada) y la elección se recuerda en el dispositivo; hasta elegir una, el callejero sigue el tema de la app.

### Horario programado y "Cómo llegar"

- **Horario oficial:** el GTFS del portal municipal es el horario programado de la EMT. El script publica `timetables.json`: las salidas de cada línea y sentido por día de servicio, con los días de cada servicio (unos 17 KB comprimidos). La hora de paso por una parada se calcula como la salida más los minutos del sentido hasta esa parada, así que es aproximada. No es tiempo real (Fase 3).
- **Próximo bus:** en el detalle de parada y en la ficha de parada del mapa aparece "Próximo bus según horario", con la hora de Málaga. Si hoy no hay más, muestra el próximo día con servicio.
- **Cómo llegar:**
  - Origen y destino: parada, barrio o distrito.
  - Modos "Salir ahora", "Salir a las…" o "Llegar a las…", hoy u otro día dentro del horario publicado.
  - Propone líneas directas y combinaciones con un transbordo, en la misma parada o andando hasta otra a menos de 250 m.
  - Cada opción se encaja en el horario: qué bus coger, cuánto falta para que salga y a qué hora se llega.
  - La recomendada (la primera) es la que llega antes o, en "Llegar a las", la que sale más tarde. Se muestra en el mapa con solo los tramos del viaje, y cualquier otra opción puede verse en el mapa.
  - En pantallas anchas el mapa ocupa la columna derecha; en el móvil va entre el formulario y las opciones.
  - Las paradas de transbordo son botones que llevan a su ficha; al volver atrás se conserva el recorrido.
  - Las líneas sin horario (91–93) se estiman por distancia y se indica.
- Más adelante: usar la ubicación como origen (Fase 2), tiempo real (Fase 3) y buscar comercios o direcciones.

### Ajustes

- Idioma (español o inglés), tema (según el sistema, claro u oscuro), alto contraste y modo sencillo. Se aplican al momento y se guardan solo en el dispositivo (`localStorage`). La primera vez el idioma se elige según el del navegador.
- Si el sistema pide reducir el movimiento, se desactivan las animaciones de transición y las del mapa.
- **Modo sencillo** (RF-07): solo listas y texto, sin mapa. El inicio quita la tarjeta del mapa; los detalles de línea y parada y "Cómo llegar" no muestran mapa; Mapa y Paradas muestran solo su panel de texto (búsqueda de barrios, líneas y paradas, y la ficha de cada parada). Con él activo no se crea ningún mapa, así que la librería del mapa no se descarga. Si el dispositivo no tiene WebGL, la app funciona siempre en modo sencillo y el interruptor aparece desactivado.
- La capa elegida en los mapas (Claro, Oscuro o Satélite) también se guarda con los ajustes.

### Origen y licencia

Los datos proceden del portal de datos abiertos del Ayuntamiento de Málaga (datosabiertos.malaga.eu). Se tratan como CC BY-SA 4.0 (ver `docs/adr/0002-datos-preprocesados.md`).
