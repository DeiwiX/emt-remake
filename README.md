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
npm run native:sync          # compila la web y la copia a los proyectos Android e iOS
```

### Apps nativas (Capacitor)

Android (8 o superior). Requisitos: Android Studio con el SDK de Android y **JDK 21** (Gradle 8.14 no admite Java 25; en Windows: `winget install EclipseAdoptium.Temurin.21.JDK`).

```bash
cd app
npm run native:sync
cd android
JAVA_HOME="C:/Program Files/Eclipse Adoptium/jdk-21..." ./gradlew assembleDebug
# APK de prueba: app/android/app/build/outputs/apk/debug/app-debug.apk
```

También se puede abrir `app/android` en Android Studio (que usa su propio Java; en Ajustes → Gradle JDK, elegir el 21) y ejecutar en un emulador o en el móvil.

iOS (16 o superior): el proyecto está en `app/ios`, pero compilarlo exige un Mac con Xcode (`npx cap open ios`).

Icono y pantalla de inicio: la fuente es `app/assets/icon.svg` (autobús blanco ante el sol poniéndose sobre el mar); los PNG de `app/assets/` se generan a partir de él y los recursos nativos con `npx @capacitor/assets generate --android --ios --iconBackgroundColor "#1c2b4a" --splashBackgroundColor "#f7f2e8" --splashBackgroundColorDark "#0f1a22"`. La web usa el mismo dibujo como `favicon.svg`.

El botón "atrás" de Android navega dentro de la app gracias al plugin `@capacitor/app`. La app no se publica en tiendas: el APK de depuración es para uso personal.

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
| `streets.json` | calles del callejero (6.206) con una muestra de sus portales (número y posición, separados al menos 40 m) | ~200 KB comprimido |
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
- Los buscadores (inicio, mapa y "Cómo llegar") encuentran también **calles**, con número de portal opcional ("larios", "marqués de larios 5"). Las calles salen del callejero municipal y se descargan la primera vez que se busca. Una calle sin número abarca las paradas a menos de 300 m de sus portales; con número, las paradas cercanas a ese portal (500 m o hasta 1 km). En el inicio, elegir una calle abre el mapa con sus paradas y líneas (`/map?street=...&n=5`).
- El buscador del inicio y el del mapa también encuentran barrios y distritos. Al elegir uno en el inicio se abre el mapa con la zona marcada (`/map?zone=...`). En el mapa, al elegir uno se marca su contorno, se muestran sus paradas y se resaltan las líneas que pasan por ellas. Los límites proceden del "Sistema de información cartográfica" del Ayuntamiento (mismo portal y licencia).
- Los detalles de línea y de parada también usan el esquema de mapa ancho y panel (en el móvil, mapa arriba y panel debajo).
- La sección Paradas tiene el mismo esquema que el mapa: mapa ancho con las paradas (las filtradas, si se filtra) y panel con la lista. Al elegir una, en la lista o en el mapa, se marca, se dibujan sus líneas y aparece su ficha con el próximo bus y el acceso al detalle.
- Capas del mapa: "Claro" y "Oscuro" (OpenFreeMap) y "Satélite" (PNOA del IGN, CC BY 4.0). El selector está en todos los mapas (Mapa, Cómo llegar, línea y parada) y la elección se recuerda en el dispositivo; hasta elegir una, el callejero sigue el tema de la app.

### Horario programado y "Cómo llegar"

- **Horario oficial:** el GTFS del portal municipal es el horario programado de la EMT. El script publica `timetables.json`: las salidas de cada línea y sentido por día de servicio, con los días de cada servicio (unos 17 KB comprimidos). La hora de paso por una parada se calcula como la salida más los minutos del sentido hasta esa parada, así que es aproximada. No es tiempo real (Fase 3).
- **Próximo bus:** en el detalle de parada y en la ficha de parada de Mapa y Paradas, cada línea muestra los tres próximos pasos según horario (hora de Málaga) en cápsulas: lo que falta ("8 min") y la hora; a más de una hora, la hora y el tiempo que falta; si hoy no hay más, el día. El primero va destacado.
- **Cómo llegar:**
  - Origen y destino: parada, barrio, distrito o calle (con número opcional). Desde o hasta una calle se suma el tramo a pie hasta la parada y se dibuja en el mapa como línea discontinua gris con sus minutos, por las calles (opción 2B, ver abajo). Como origen también "Usar mi ubicación": las paradas a menos de 500 m (o 1 km) con los minutos andando hasta cada una; el planificador los suma, elige la parada de subida que antes te deja en destino y muestra "Sal en N min" y el tramo a pie. Los trayectos desde "Mi ubicación" no se guardan en favoritos.
  - Modos "Salir ahora", "Salir a las…" o "Llegar a las…", hoy u otro día dentro del horario publicado.
  - Propone líneas directas y combinaciones con un transbordo, en la misma parada o andando hasta otra a menos de 250 m.
  - Cada opción se encaja en el horario: qué bus coger, cuánto falta para que salga y a qué hora se llega.
  - La recomendada (la primera) es la que llega antes o, en "Llegar a las", la que sale más tarde. Se muestra en el mapa con solo los tramos del viaje, y cualquier otra opción puede verse en el mapa.
  - En pantallas anchas el mapa ocupa la columna derecha; en el móvil va entre el formulario y las opciones.
  - Las paradas de transbordo son botones que llevan a su ficha; al volver atrás se conserva el recorrido.
  - Las líneas sin horario (91–93) se estiman por distancia y se indica.
- **Rutas andando por las calles (2B):** el script publica `walk-graph.json`, la red peatonal de OpenStreetMap (calles, aceras, paseos y escaleras; sin autopistas ni vías privadas) de la zona de la EMT: unos 82.000 tramos, 1,8 MB (0,8 MB comprimidos). Se descarga de Overpass como mucho una vez por semana (si falla, se mantiene la anterior) y no cuenta en `dataVersion`. La app la descarga al abrir "Cómo llegar" y calcula con ella los minutos andando reales (80 m/min) desde una calle, dirección o tu ubicación hasta cada parada, y dibuja el camino. Sin red, sigue la estimación en línea recta. Los transbordos a pie entre paradas siguen estimados en línea recta. ADR 0011.
- Más adelante: buscar comercios o direcciones.

### Tiempo real (Fase 3)

- **Horario exacto:** `timetables.json` incluye el paso de cada viaje por cada parada (perfiles compartidos entre viajes), así que el próximo bus y "Cómo llegar" usan la hora real de cada viaje y no un tiempo medio.
- **Llegada estimada:** en la app del móvil, cada línea de una parada muestra "Llega en ~X min" calculado con la posición de los autobuses que publica el Ayuntamiento (última parada por la que pasó + tiempo programado − antigüedad del dato), marcado como estimación y con la antigüedad del dato. La fuente se actualiza cada ~5 min y la app la consulta cada minuto mientras alguna pantalla la usa.
- **Autobuses en el mapa (Fase 4):** en Mapa (los de las líneas visibles) y en el detalle de línea (los de ese sentido), como un autobús con el color y el número de su línea, girado según su marcha. Entre un dato y el siguiente cada autobús avanza por el trazado de su línea al ritmo del horario desde donde se le vio por última vez (se recalcula cada segundo), así que se mueve en vez de saltar cada 5 min; es una estimación. Al tocar uno, el Mapa muestra su ficha (sentido, próxima parada, antigüedad del dato) y el botón **Seguir**, que mantiene el mapa centrado en él. El tamaño de los autobuses se elige en Ajustes (pequeño, normal o grande). La fuente no dice si un autobús es simple o articulado, así que todos usan el mismo dibujo.
- **Avísame cuando falten X min (Fase 4):** en los próximos buses de una parada, "Avísame" deja elegir el autobús (uno en tiempo real o uno de los próximos pasos del horario, también de mañana aunque ahora no haya servicio) y cuántos minutos antes avisar (2, 5, 10, 15, 20 o 30). La notificación queda programada en el sistema (`@capacitor/local-notifications`), así que llega aunque la app esté cerrada, y el aviso se guarda en el dispositivo. Mientras la app está abierta, el aviso se asocia al autobús en tiempo real que llega más cerca de esa hora (±10 min) y su hora se mueve sola si se adelanta o se retrasa. Un solo aviso a la vez. La primera vez se pide permiso de notificaciones (Android 13+).
- **Retraso real y ritmo (Fase 6):** cada autobús se casa con el viaje del horario que está haciendo (el que debía pasar por su última parada más cerca de la hora del dato, prefiriendo que vaya tarde a adelantado). La llegada usa los tiempos entre paradas de ese viaje y se muestra su retraso ("Va 3 min tarde", "Va en hora"). Con dos datos seguidos del mismo autobús se mide su ritmo frente al horario (mezclado al 50 % y acotado entre 0,6 y 1,4) y se aplica a lo que le queda; lo usan la llegada estimada, los avisos y los autobuses del mapa. Cuando llega un dato nuevo los autobuses del mapa corrigen su posición poco a poco (~15 s) en vez de saltar. ADR 0012.
- Solo en la app nativa: el servidor no permite CORS, así que en la web se usa solo el horario (ADR 0008).

### Cortes de tráfico

- `traffic.json` (se publica cada hora): cortes del Ayuntamiento ("Cortes de tráfico", CC BY-SA 4.0) e incidencias de la DGT (DATEX II) en la zona de Málaga, sin los ya terminados. Si una fuente falla se publica el resto; no cuenta en `dataVersion`, así que la app no vuelve a bajar la red cada hora.
- En el Mapa: aviso naranja (activo) o gris (empieza en los próximos 7 días); al tocarlo, ficha con tipo, dirección, descripción, fechas y fuente. Un botón los muestra u oculta.

### Favoritos

- Estrella en las listas de paradas (Paradas, búsqueda del inicio, detalle de línea), en el detalle de parada, en la ficha de parada de Mapa y Paradas, en el detalle de línea y en "Cómo llegar" (trayecto origen → destino).
- En el inicio, "Mis favoritos" muestra las paradas guardadas como tarjetas pequeñas en dos columnas (nombre, líneas y el próximo bus de cualquiera de ellas); al pulsar una se despliega a lo ancho con los próximos buses de cada línea y el acceso al detalle. También los trayectos (abren "Cómo llegar" ya rellenado: `/plan?from=stop:152&to=neighbourhood:...`) y las líneas.
- Las paradas guardadas admiten un nombre propio ("Casa", "Trabajo"; botón "Ponerle nombre" en la tarjeta desplegada), que se muestra encima del nombre de la parada.
- Se guardan solo en el dispositivo (`localStorage`), sin cuentas (ADR 0006).

### Cerca de mí

- Pantalla `/near`: pide tu ubicación al abrirla (y con el botón de actualizar) y lista las paradas a menos de 500 m, o hasta 1 km si no hay ninguna, de la más cercana a la más lejana, con la distancia y los minutos andando. Al elegir una aparece su ficha con el próximo bus. Tu posición se ve como un punto azul en el mapa.
- En la app nativa se pide el permiso del sistema (`@capacitor/geolocation`, que se carga solo al pedir la ubicación); en la web, el del navegador. La ubicación no se guarda ni se envía (ADR 0006).

### Ajustes

- Idioma (español o inglés), tema (según el sistema, claro u oscuro), alto contraste y modo sencillo. Se aplican al momento y se guardan solo en el dispositivo (`localStorage`). La primera vez el idioma se elige según el del navegador.
- Si el sistema pide reducir el movimiento, se desactivan las animaciones de transición y las del mapa.
- **Modo sencillo** (RF-07): solo listas y texto, sin mapa. El inicio quita la tarjeta del mapa; los detalles de línea y parada y "Cómo llegar" no muestran mapa; Mapa y Paradas muestran solo su panel de texto (búsqueda de barrios, líneas y paradas, y la ficha de cada parada). Con él activo no se crea ningún mapa, así que la librería del mapa no se descarga. Si el dispositivo no tiene WebGL, la app funciona siempre en modo sencillo y el interruptor aparece desactivado.
- La capa elegida en los mapas (Claro, Oscuro o Satélite) también se guarda con los ajustes.
- Tamaño de los autobuses en tiempo real en el mapa (pequeño, normal o grande; solo se ven en la app del móvil).

### Aspecto (Fase 5)

- Identidad "Mediterráneo al atardecer" (mezcla de las propuestas A y C, ADR 0010): fondo arena, azul mar como color principal, coral de atardecer como acento y barras superiores azul noche; en el inicio, el sol poniéndose y unas olas bajo la cabecera.
- Letras Lexend (texto) y Urbanist (títulos), incluidas en la app (`@fontsource-variable`), sin pedirlas a Google al abrirla.
- Los colores están en `app/src/theme/brand.scss` como variables de Ionic y `--app-*`, con su versión oscura; el alto contraste sigue usando la paleta de Ionic.

### Accesibilidad y rendimiento

Revisión del incremento 9 (04/10/2026):

- **axe-core 4.10** en las pantallas principales (inicio, búsqueda, líneas, detalle de línea, paradas, detalle de parada, mapa, "Cómo llegar" con resultados, ajustes y acerca de), en tema claro y oscuro: sin incidencias tras las correcciones. Se corrigieron una cabecera dentro del contenido principal, dos regiones de mapa con el mismo nombre (ahora el nombre va en el lienzo del mapa) y los radios de Ajustes dentro de una lista.
- **Texto al 200 % en 320 px:** nada se sale de la pantalla. Los botones parten el texto en varias líneas y el selector de capa del mapa se reparte en filas.
- **Carga** (compilación de producción, CPU ×4 y red "4G lenta" simulados, sin caché): primer contenido en unos 2,4 s y unos 270 KB transferidos, de los que 183 KB son el código inicial comprimido. El código inicial ocupa unos 800 KB sin comprimir: la mayor parte es Ionic (unos 360 KB) y Angular (unos 300 KB), así que bajar de 500 KB sin comprimir exigiría prescindir de Ionic. La librería del mapa (230 KB comprimidos) solo se descarga al abrir un mapa.
- Pendiente para el incremento 10 (apps nativas): probar con TalkBack en un Android real y con VoiceOver (necesita un Mac o un iPhone). La auditoría con axe no se automatiza en las pruebas (decisión del desarrollador, 04/10/2026).

### Origen y licencia

Los datos proceden del portal de datos abiertos del Ayuntamiento de Málaga (datosabiertos.malaga.eu). Se tratan como CC BY-SA 4.0 (ver `docs/adr/0002-datos-preprocesados.md`).
