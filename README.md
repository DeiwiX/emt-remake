# EMT remake

Aplicación **no oficial** para consultar los autobuses urbanos de Málaga (EMT): líneas, recorridos y paradas. Es una PWA con versiones Android e iOS desde una sola base de código. No está vinculada a la EMT Málaga ni al Ayuntamiento de Málaga. "EMT remake" es un nombre provisional.

## Estado

Fase 1 en construcción. El incremento 1 está hecho: esqueleto, navegación entre pantallas vacías, idiomas ES/EN configurados, lint y pruebas.

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
```

## Estructura

```
app/        Aplicación Ionic 9 + Angular 22
  src/app/core/      configuración transversal (i18n)
  src/app/features/  pantallas, cargadas de forma diferida
  src/app/shared/    componentes reutilizables
  public/i18n/       textos en español e inglés
docs/adr/   decisiones de arquitectura
```

## Datos y licencias

Los datos proceden del portal de datos abiertos del Ayuntamiento de Málaga (datosabiertos.malaga.eu). Se tratan como CC BY-SA 4.0 (ver `docs/adr/0002-datos-preprocesados.md`).
