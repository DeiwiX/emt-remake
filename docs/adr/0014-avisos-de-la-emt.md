# ADR 0014 — Avisos de la EMT (Fase 7)

- Estado: aprobada por el desarrollador (15/10/2026): leer el RSS desde el móvil, 60 días por aviso de línea y 7 por aviso general, y mostrarlos en línea, parada, inicio y favoritas.

## Contexto

La EMT publica desvíos, paradas trasladadas y cortes como noticias en su web. El portal de datos abiertos del Ayuntamiento no tiene ningún conjunto con ellos. La web ofrece un canal RSS (`https://www.emtmalaga.es/rss.xml`) con las 6 últimas noticias: título que empieza por las líneas afectadas ("L-15-18-N2: …"), cuerpo en HTML, fecha de publicación y enlace (a una IP interna de la EMT). No dicen cuándo terminan ("hasta el final de las obras"). El servidor no envía cabeceras CORS.

## Decisión

- La app descarga el RSS con el cliente HTTP nativo de Capacitor (`CapacitorNoticeSource`), como el tiempo real, como mucho una vez cada 15 min y solo al abrir una pantalla que muestra avisos.
- Los avisos se guardan en el dispositivo (`localStorage`, `emt-remake.notices.v1`) y se juntan con los nuevos, así no se pierden cuando salen del canal.
- Cada aviso se ve 60 días desde su publicación si nombra líneas y 7 días si es general.
- Las líneas se leen solo del prefijo del título (`L-…:`). Los enlaces se rehacen con `https://www.emtmalaga.es`.
- Se muestran en el detalle de línea (los suyos y los generales), en el de parada (los de sus líneas y los generales), en el inicio (los generales y los de tus favoritas, solo el título) y con un punto naranja en las paradas favoritas afectadas. Cada aviso abre su página en la web de la EMT.

## Alternativas

- Publicarlos desde el script de datos en GitHub Pages: funcionaría en la web y guardaría el histórico en un solo sitio, pero volvería a publicar textos de la EMT en un sitio público.
- Leer también las líneas del cuerpo del aviso: más avisos asignados, pero más falsos positivos (los cuerpos mencionan paradas y calles con números).

## Consecuencias y riesgos

- En la web no hay avisos (como el tiempo real).
- Si un aviso dura más de 60 días deja de verse aunque siga vigente, y uno que termina antes se sigue viendo hasta entonces.
- Un aviso que entra y sale del canal mientras la app no se abre no llega a verse (el canal se renueva con unas 6 noticias cada una o dos semanas).
- Si la EMT cambia el formato del título o del canal, los avisos pasarían a ser generales o dejarían de llegar.
