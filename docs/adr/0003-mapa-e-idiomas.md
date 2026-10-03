# ADR 0003 – Librería de mapas e idiomas

- Estado: aprobado por el desarrollador (03/10/2026)

## Mapa: MapLibre GL JS + teselas vectoriales de OpenFreeMap

- **Ventajas:** estilos recoloreables (temas claro, oscuro y alto contraste del mapa base) y resaltado o atenuado de líneas sin redibujar. OpenFreeMap es gratuito, sin clave ni cookies, y permite uso comercial.
- **Inconvenientes:** unos 150 KB comprimidos de código (medido en maplibre-gl 6.11.2) frente a unos 42 KB de Leaflet. Requiere WebGL. OpenFreeMap no tiene SLA.
- **Mitigaciones:**
  - Carga diferida del mapa.
  - Paso automático al modo sencillo si no hay WebGL.
  - Interfaz `MapProvider` y URL de estilo configurable para cambiar de proveedor.
- **Alternativa descartada:** Leaflet con teselas OSM. Las normas de uso de OSM prohíben la descarga previa, permiten bloquear el acceso sin aviso y no ofrecen mapa base oscuro ni de alto contraste.
- **Atribución obligatoria:** "OpenFreeMap © OpenMapTiles Data from OpenStreetMap".

## Idiomas: Transloco

- Permite cambiar entre español e inglés sin recargar la app.
- El i18n nativo de Angular exige una compilación por idioma.
- Los textos se guardan en `app/public/i18n/<idioma>.json`. Una prueba comprueba que ambos idiomas tienen las mismas claves.
