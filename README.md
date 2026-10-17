# MalaGo

Aplicación **no oficial** para consultar los autobuses urbanos de Málaga (EMT): líneas, recorridos y paradas. Es una PWA con versiones Android e iOS desde una sola base de código. No está vinculada a la EMT Málaga ni al Ayuntamiento de Málaga. Se llamaba "EMT remake" mientras era solo de la EMT; desde el 17/10/2026 se llama **MalaGo** (también metro y, más adelante, interurbanos).

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
npm run e2e                  # extremo a extremo (Playwright con el Chrome instalado; arranca ng serve en el puerto 4300 y usa los datos de public/data-snapshot)
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

Icono y pantalla de inicio: la fuente es `app/assets/icon.svg` (logo de MalaGo: chincheta blanca sobre azul noche con el sol poniéndose sobre el mar, opción A elegida el 17/10/2026); el icono monocromo de Android (iconos con tema) está en `app/android/app/src/main/res/drawable/ic_launcher_monochrome.xml`; los PNG de `app/assets/` se generan a partir de él y los recursos nativos con `npx @capacitor/assets generate --android --ios --iconBackgroundColor "#1c2b4a" --splashBackgroundColor "#f7f2e8" --splashBackgroundColorDark "#0f1a22"`. La web usa el mismo dibujo como `favicon.svg`.

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
5. Al volver a la app (Android puede tenerla en segundo plano días) se vuelve a comprobar, como mucho cada 30 min. Si llegan datos nuevos, el horario se recarga solo, sin cerrar la app. Si el horario guardado ya no cubre hoy, un aviso lo dice mientras se actualiza (antes podía decir que no había buses).

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

- **Parada como origen o destino (16/10/2026):** cuenta también las paradas a menos de 300 m, con los minutos andando desde (o hasta) la elegida. Antes solo valía la parada exacta y, si sus líneas no iban al destino, no salía nada (p. ej. de Parque - Ayuntamiento a Postas, que ahora propone andar 1 min hasta Parque - Rectorado y coger la línea 1). Tampoco se ofrecen opciones que llegan más de 90 min después que la mejor (o, en "Llegar a las", que salen 90 min antes) ni que tardan 90 min más.
- **Dos transbordos (16/10/2026):** si no hay nada directo ni con uno, o si ahorran al menos 10 min, se buscan viajes con dos transbordos (como mucho tres opciones, una por línea intermedia). Las líneas nocturnas se miran al final, para que no quiten el sitio a una de día.
- **Sin esperas de horas:** en cada transbordo se coge el último bus que todavía enlaza con el siguiente (antes, de noche, proponía un búho a la 01:36 para esperar hasta las 07:46). Si dos opciones llegan a la vez, se recomienda la que sale más tarde.
- **Transbordos a pie por la calle:** con la red peatonal cargada, los minutos andando entre paradas de un transbordo son los del camino real (antes, línea recta con margen).
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
- **Tiempo real oficial de la EMT (17/10/2026, ADR 0019):** en la app del móvil, los minutos que faltan son los que publica la EMT en su GTFS-RT (`tripupdate`: llegada prevista de cada viaje a sus paradas) y los autobuses del mapa están en su posición GPS (`vehicleposition`). Los dos se renuevan cada minuto, sin clave; la app los pide cada 30 s mientras alguna pantalla los usa. Como el feed solo da la posición de cada parada en el viaje, `timetables.json` publica los recorridos (`livePatterns`) y qué recorrido hace cada viaje (`liveTrips`). Una parada sin dato toma el retraso de la anterior que lo tenga. Sin CORS: en la web no hay tiempo real. Si el feed falla, la app usa el horario.
- **Autobuses en el mapa (Fase 4):** en Mapa (los de las líneas visibles) y en el detalle de línea (los de ese sentido), como un autobús con el color y el número de su línea, en su posición GPS colocada sobre el recorrido y mirando hacia donde va. Al tocar uno, el Mapa muestra su ficha (sentido, próxima parada, retraso y antigüedad del dato) y el botón **Seguir**, que mantiene el mapa centrado en él. Si mueves el mapa mientras lo sigues, deja de centrarlo 12 s (cada movimiento vuelve a contar) y aparece un botón coral con un autobús para volver a él al momento. El tamaño de los autobuses se elige en Ajustes (pequeño, normal o grande).
- **Avísame cuando falten X min (Fase 4):** en los próximos buses de una parada, "Avísame" deja elegir el autobús (uno en tiempo real o uno de los próximos pasos del horario, también de mañana aunque ahora no haya servicio; "Más horarios" ofrece hasta 12). En la app del móvil también basta con tocar cualquiera de las horas de los próximos buses (llevan una campanita) para ir directo a elegir los minutos; la hora elegida (y la del aviso activo) se ve en coral y cuántos minutos antes avisar (2, 5, 10, 15, 20 o 30). La notificación queda programada en el sistema (`@capacitor/local-notifications`), así que llega aunque la app esté cerrada, y el aviso se guarda en el dispositivo. Mientras la app está abierta, el aviso se asocia al viaje en tiempo real que llega más cerca de esa hora (±10 min) y su hora se mueve sola si se adelanta o se retrasa. Un solo aviso a la vez. La primera vez se pide permiso de notificaciones (Android 13+).
- **Siguiendo tu bus (Fase 6, Android):** mientras haya un aviso, un servicio nativo en primer plano (`app/android/.../tracker`) consulta la llegada prevista por la EMT (GTFS-RT) cada 30 s aunque la app esté cerrada, con una notificación fija ("Siguiendo tu bus · Línea 3 · Llega a … en ~7 min"). Mueve la hora del aviso si el autobús se adelanta o se retrasa y avisa él mismo cuando faltan los minutos elegidos (sin datos, a la hora prevista). La app le envía los viajes del sentido que pasan por la parada para que los reconozca en el feed, que lee con un lector de protobuf propio y mínimo (`GtfsRtReader`). Para avisos lejanos (p. ej. de mañana) no sigue toda la noche: arranca con una alarma exacta 45 min antes de la llegada. En iOS el aviso sigue siendo una notificación programada. Pruebas: `gradlew testDebugUnitTest` en `app/android/`. ADR 0013 y 0019.
- **Navegación (07/10/2026):** barra inferior fija con Inicio · Mapa · Cómo llegar · Favoritos (en modo sencillo, Líneas en vez de Mapa); también se pasa de una a otra deslizando el dedo en horizontal (salvo sobre el mapa, que se arrastra). La barra es una píldora azul noche flotante y la pestaña activa sale por arriba en un "sol" coral que viaja hasta la nueva y suelta ondas; las pantallas cambian con un deslizamiento suave en el sentido del cambio (`core/theme/page-transition.ts`). Pantalla `/favorites` con todas las paradas, trayectos y líneas guardados.
- **Inicio:** franja del aviso activo (con "Quitar") y todas las favoritas, cerradas (la más cercana primero si se pide con "¿Cuál tengo más cerca?", que además la abre); cada una se abre y se cierra con sus próximos buses, "Ubicar bus" y "Avísame".
- **Fecha de los datos** corta (07/10/2026) en la cabecera de cada pantalla; el banner solo aparece si hay un problema con los datos.
- **Panel de salidas (17/10/2026):** en el detalle de parada, "Próximas salidas" junta las 8 siguientes de todas sus líneas, ordenadas por la que pasa antes (punto verde: tiempo real; el resto, del horario).
- **"Cómo llegar" con tiempo real (17/10/2026):** con "Salir ahora", si el autobús del primer tramo se ve en tiempo real (y da tiempo a llegar andando a la parada), su llegada estimada marca la salida y el resto del viaje se encadena desde ahí; el tramo lleva la marca "Bus en tiempo real". Los transbordos a pie se calculan por la calle solo para las opciones que salen (antes, para todas las paradas: medio segundo o más).
- **Próximos buses:** las cápsulas verdes son llegadas en tiempo real y el resto, del horario (sin la línea aparte "Llega en ~X min").
- **Mapa:** la ficha de una línea deja elegir los dos sentidos o uno (recorrido, paradas y autobuses); botones redondos "Mi ubicación" (en todos los mapas) y "Actualizar" en el lateral. Si ya se dio permiso de ubicación, cada mapa muestra tu posición al abrirse (sin preguntar ni moverse); si no, "Mi ubicación" aparece con texto para activarla.
- **Mapa despejado (05/10/2026):** el Mapa empieza sin líneas ni cortes de tráfico; las líneas se eligen tocando sus números (fichas) y se ven con sus paradas y sus autobuses. "Mostrar todas" sigue disponible.
- **Ubicar bus más cercano:** en la ficha de una parada (Cerca de mí, Mapa), lleva al Mapa siguiendo el autobús que antes llega a esa parada (`/map?bus=640`); si llega en más de una hora, dice a cuántas paradas está.
- **Detalle de parada:** su mapa muestra los autobuses en tiempo real de las líneas y sentidos que pasan por ella.
- **Botón "Actualizar"** en el Mapa: pide ya el tiempo real (la EMT lo renueva cada minuto).
- **Retraso:** con la salida programada de cada viaje (la trae el feed) se dice cuánto va tarde o adelantado ("Va 3 min tarde", "Va en hora").
- **Ahorro de datos y batería (17/10/2026):** las posiciones se piden cada 30 s, salvo en los 3 min siguientes a un dato nuevo (la fuente se renueva cada ~5 min y no permite preguntar "solo si ha cambiado"; cada descarga son unos 4 KB comprimidos). Con la app en segundo plano no se descarga ni se mueve nada, y al volver se pide al momento. Solo se calcula cada segundo la posición de los autobuses de las líneas que se ven.
- Solo en la app nativa: el servidor no permite CORS, así que en la web se usa solo el horario (ADR 0008).

### Avisos de la EMT (Fase 7)

- La app lee las noticias de la web de la EMT (`https://www.emtmalaga.es/rss.xml`), donde publica desvíos, paradas trasladadas y cortes, como mucho cada 15 min y solo en la app del móvil (el servidor no permite CORS). Se guardan en el dispositivo, así no se pierden cuando salen del canal (que solo trae los 6 últimos).
- Las líneas afectadas se leen del principio del título ("L-15-18-N2: ..."); sin ese prefijo el aviso es general. Cada aviso se ve 60 días desde que se publica (los generales, 7).
- Dónde se ven: en el detalle de línea y en el de parada (los de sus líneas y los generales), en el inicio (los generales y los de tus favoritas, solo el título; cada uno se cierra con la ✕ o todos con "Cerrar todos", y cerrados no vuelven a salir ahí aunque siguen en los detalles) y con un punto naranja en las paradas favoritas afectadas. Al tocar uno se abre su página en la web de la EMT. Los que cierras en el inicio pasan abajo del todo y un triángulo rojo animado en el lateral lleva a ellos. No se muestran en el metro (no le afectan). ADR 0014.

### Atascos estimados (Fase 8)

- En el Mapa, "Mostrar atascos" pinta encima de los recorridos los tramos que los autobuses acaban de recorrer más despacio que su horario: naranja si van lentos (2 min de más y un 50 % más de lo previsto) y rojo si hay atasco (5 min de más y el doble). El panel los lista con la línea, las paradas y los minutos de más.
- Desde el 17/10/2026 se mide con el tiempo real de la EMT: la app apunta cuándo deja atrás cada autobús una parada (con un minuto de margen) y compara lo que tarda entre paradas, o lo que lleva en un tramo, con su horario. Hace falta tener el mapa abierto unos minutos para ver dos paradas seguidas. No se mide en la primera parada. Solo en la app del móvil. ADR 0015 y 0019.

### Metro de Málaga (Fase 11)

- El script de datos añade el horario oficial del Metro de Málaga (GTFS de metromalaga.es): líneas L1 y L2 con sus colores oficiales y 19 estaciones (códigos `M...`), dentro de los mismos ficheros que la EMT. Si su descarga falla, se publica sin metro. ADR 0017.
- En la app: tarjeta "Metro" en el inicio con el esquema de cada línea (con el próximo tren en cada sentido en cada estación y, según el horario, dónde va cada tren y cuánto le falta a la siguiente estación; "Ver en el mapa" abre el mapa con el trayecto de la línea entero); las estaciones salen en el buscador, Cerca de mí (filtro Todo / Bus / Metro), favoritos y el detalle con los próximos trenes; "Cómo llegar" combina bus y metro (con transbordo a pie entre paradas cercanas). No hay tiempo real del metro.
- "Cómo llegar" muestra hasta 8 opciones y su mapa es más bajo en el móvil para que se vean las opciones.

### Retrasos habituales (Fase 10)

- El flujo "Recogida de retrasos" de GitHub mira cada 5 min dónde va cada autobús, calcula cuánto va tarde frente a su viaje del horario y lo guarda en la rama `historico-retrasos` (`data/AAAAMMDD.csv`). Se puede lanzar a mano con `npm run collect-delays -- --history <carpeta> --rounds 1` en `pipeline/`.
- El script de datos junta las 8 últimas semanas (`--delays-history <carpeta>`) y publica `delays.json`: la mediana del retraso por línea, sentido, tipo de día, hora y tramo de 5 paradas (no cuenta en `dataVersion`).
- En la app, las horas del horario se corrigen con ese retraso y lo dicen ("18:27 · +3 habitual"). El tiempo real, cuando lo hay, manda. Hacen falta unas 2 semanas de datos para que se note. ADR 0016.

### Sentido de las líneas en el mapa (17/10/2026)

- Cada recorrido lleva flechas de su color que indican hacia dónde va. La vuelta se dibuja en un tono más claro que la ida y cada sentido va un poco desplazado a su derecha, así no se tapan cuando comparten calle.

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
- Letras Figtree (texto) y Bricolage Grotesque (títulos) desde el 17/10/2026 (antes Lexend y Urbanist), incluidas en la app (`@fontsource-variable`), sin pedirlas a Google al abrirla. Identidad MalaGo: ADR 0018.
- Los colores están en `app/src/theme/brand.scss` como variables de Ionic y `--app-*`, con su versión oscura; el alto contraste sigue usando la paleta de Ionic.

### Accesibilidad y rendimiento

Revisión del incremento 9 (04/10/2026):

- **axe-core 4.10** en las pantallas principales (inicio, búsqueda, líneas, detalle de línea, paradas, detalle de parada, mapa, "Cómo llegar" con resultados, ajustes y acerca de), en tema claro y oscuro: sin incidencias tras las correcciones. Se corrigieron una cabecera dentro del contenido principal, dos regiones de mapa con el mismo nombre (ahora el nombre va en el lienzo del mapa) y los radios de Ajustes dentro de una lista.
- **Texto al 200 % en 320 px:** nada se sale de la pantalla. Los botones parten el texto en varias líneas y el selector de capa del mapa se reparte en filas.
- **Carga** (compilación de producción, CPU ×4 y red "4G lenta" simulados, sin caché): primer contenido en unos 2,4 s y unos 270 KB transferidos, de los que 183 KB son el código inicial comprimido. El código inicial ocupa unos 800 KB sin comprimir: la mayor parte es Ionic (unos 360 KB) y Angular (unos 300 KB), así que bajar de 500 KB sin comprimir exigiría prescindir de Ionic. La librería del mapa (230 KB comprimidos) solo se descarga al abrir un mapa.
- Pendiente para el incremento 10 (apps nativas): probar con TalkBack en un Android real y con VoiceOver (necesita un Mac o un iPhone). La auditoría con axe no se automatiza en las pruebas (decisión del desarrollador, 04/10/2026).

Revisión de la Fase 9 (15/10/2026), dentro de la app Android (WebView, con datos reales):

- **axe-core 4.10** en inicio, Mapa (con una línea elegida, cortes y atascos a la vista), Cómo llegar (con resultados), Favoritos, Líneas, detalle de línea y de parada (con el selector del aviso abierto), Cerca de mí, Paradas, Ajustes y Acerca de, en claro y oscuro. Se corrigió el contraste del enlace "Ver en la web de la EMT" de los avisos y dos regiones de búsqueda sin nombre en "Cómo llegar".
- **Árbol de accesibilidad de la WebView** (lo que lee TalkBack): los campos de búsqueda se anunciaban como "search text" porque Ionic copia su nombre antes de que llegue la traducción; ahora lo pone la directiva `appSearchbarLabel`. Los botones "Avísame" de una parada dicen de qué línea son ("Avísame de la línea 3"). Botones de icono, pestañas de la barra inferior y avisos tienen nombre.
- Pendiente: recorrerla con TalkBack a mano en un móvil real (en el emulador el diálogo de permisos de TalkBack no deja usarlo por adb) y con VoiceOver (necesita un Mac o un iPhone).

### Origen y licencia

Los datos proceden del portal de datos abiertos del Ayuntamiento de Málaga (datosabiertos.malaga.eu). Se tratan como CC BY-SA 4.0 (ver `docs/adr/0002-datos-preprocesados.md`).
