# ADR 0010 — Identidad visual "Mediterráneo al atardecer" (Fase 5)

- Estado: aprobada por el desarrollador (04/10/2026): mezcla de las propuestas A (Mediterráneo) y C (Atardecer en La Malagueta). Los detalles de la mezcla son míos.

## Contexto

La app usaba el azul por defecto de Ionic y la letra del sistema. El desarrollador pidió un rediseño de colores, letras, iconos y fondos "más malagueño, sin que sature". Se presentaron tres propuestas (A Mediterráneo, B Cal y azulejo, C Atardecer en La Malagueta) en un lienzo y en una imagen.

## Decisión

- Colores: fondo arena `#F7F2E8`, principal azul mar `#1D5D8A`, acento coral `#B9472F`, cabeceras azul noche `#1C2B4A`, sol `#F08A5D`. En oscuro: fondo `#0F1A22`, principal `#6FB0DE` (texto oscuro encima), acento `#F29A7E`. Definidos como variables de Ionic en `app/src/theme/brand.scss`; los componentes usan esas variables o las `--app-*`.
- Letras: Lexend (texto, pensada para la legibilidad) y Urbanist (títulos), incluidas en el paquete con `@fontsource-variable/*` (OFL) en vez de pedirlas a Google Fonts: funcionan sin conexión y no envían datos a terceros.
- Fondos: el inicio lleva una cabecera azul noche con el sol poniéndose y olas hacia el fondo arena; el resto de pantallas, barra azul noche.
- Iconos de la interfaz: los de Ionicons, de trazo, sobre pastillas azul mar o coral. Icono de la app: autobús ante el sol sobre el mar.
- Los colores de cada línea no cambian (ADR 0004); el alto contraste sigue con la paleta de Ionic, que tiene prioridad.

## Alternativas

- B (cal y azulejo con letra con serifa): más tradicional; descartada por el desarrollador.
- Cargar las letras desde Google Fonts: menos peso en el paquete, pero sin conexión fallan y cada apertura avisa a Google.

## Consecuencias y riesgos

- El paquete incluye los archivos de letra (latin y otros alfabetos; solo se descargan los que se usan en la web).
- Contrastes comprobados para texto normal (AA) en claro y oscuro; si se añaden colores nuevos hay que mantenerlos.
