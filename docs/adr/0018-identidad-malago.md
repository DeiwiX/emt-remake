# ADR 0018 — Identidad MalaGo

- Estado: aprobada por el desarrollador (17/10/2026) en el hilo "Identidad visual MalaGo": nombre MalaGo, logo e icono A ("Sol en el mapa"), tipografía 3 (Bricolage Grotesque + Figtree) y el "Estilo aplicado". Permiso para instalar las fuentes el mismo día.

## Contexto

La app deja de ser solo de la EMT (metro, más adelante interurbanos) y el nombre provisional "EMT remake" no servía. Se mantiene la paleta "Mediterráneo al atardecer" (ADR 0010).

## Decisión

- **Nombre** visible: MalaGo (app, Android, iOS, textos y README). El identificador `io.github.deiwix.emtremake` no cambia: cambiarlo instalaría otra app y se perderían favoritos y ajustes.
- **Logo e icono**: chincheta de mapa con una ventana al atardecer (cielo #FFD7A8, medio sol #F08A5D, mar #1D5D8A y una ola). Icono de la app: chincheta blanca sobre #1C2B4A (`app/assets/icon.svg`), con versión monocroma para los iconos con tema de Android 13+ (`ic_launcher_monochrome.xml`). En la cabecera del inicio, la chincheta y "Mala**Go**" ("Go" en el color del sol).
- **Tipografía**: Bricolage Grotesque (títulos) y Figtree (texto), incluidas con `@fontsource-variable/*` (OFL); se quitan Lexend y Urbanist.
- **Colores**: se añaden `--app-sky` (#FFD7A8) y un color por tipo de transporte (`--app-mode-bus` #1D5D8A, `--app-mode-metro` #6A3D9A, `--app-mode-interurban` #2F7D5B), solo para iconos y etiquetas de tipo. Cada línea conserva su color.

## Consecuencias

- Bricolage Grotesque es algo más ancha que Urbanist: los títulos largos parten antes de línea.
- Los ADR anteriores siguen hablando de "EMT remake": es el nombre que tenía entonces.
