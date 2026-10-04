# ADR 0005 — Apps nativas con Capacitor

- Estado: aprobada por el desarrollador (04/10/2026)
- Contexto: incremento 10 de la fase 1.

## Contexto

La app es una PWA Ionic/Angular. El ADR 0001 fijó Capacitor 8 para Android 8+ e iOS 16+. Faltaba crear los proyectos nativos y decidir cómo compilarlos en el PC del desarrollador (Windows, sin Mac).

## Decisión

- Capacitor 8.5.2 (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios`) y `@capacitor/app` 8.1.2 para el botón "atrás" de Android, que sin él cerraba la app.
- Identificador `io.github.deiwix.emtremake` y nombre visible "EMT remake" (temporal).
- Android: `minSdkVersion` 26 (Android 8), `targetSdkVersion` 36. iOS: `IPHONEOS_DEPLOYMENT_TARGET` 16.0.
- Compilación de Android con JDK 21 (Temurin), instalado aparte: el Java del sistema y el de Android Studio son la versión 25, que Gradle 8.14 no admite.
- Solo APK de depuración para uso personal; no se publica en tiendas.

## Alternativas consideradas

- Actualizar Gradle a 9.x para usar Java 25: cambia la plantilla de Capacitor y el plugin de Android (AGP 8.13) no está probado con ella. Se descartó.
- Publicar en Google Play o TestFlight: fuera del alcance (el desarrollador quiere la app solo para él).

## Consecuencias

- `app/android` y `app/ios` se versionan; sus `.gitignore` excluyen compilaciones y la copia de la web.
- Antes de compilar hay que ejecutar `npm run native:sync`.
- iOS queda preparado pero sin compilar ni probar hasta disponer de un Mac o un servicio en la nube.
- `@capacitor/cli` trae `uuid` 7 (aviso moderado de npm audit), solo como dependencia de desarrollo (herramienta de proyectos Xcode); no se incluye en la app.
- Icono y pantalla de inicio propios desde el incremento 14 (ADR 0006). Pendiente: pruebas con TalkBack y VoiceOver.
