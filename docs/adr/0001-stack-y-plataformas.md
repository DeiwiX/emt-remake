# ADR 0001 – Stack y plataformas mínimas

- Estado: aprobado por el desarrollador (03/10/2026)
- Contexto: el requisito inicial pedía iOS 13+ y Android 8+ con Ionic + Capacitor + Angular.

## Problema

Según las páginas oficiales de soporte de Ionic y Capacitor (consultadas el 03/10/2026):

| Combinación | iOS mínimo | Estado |
| --- | --- | --- |
| Ionic 9 + Capacitor 8 + Angular 18–22 | iOS 16 (Ionic 9), iOS 15 (Capacitor 8) | Activo |
| Ionic 8 + Capacitor 8 | iOS 15 | Ionic 8 sin mantenimiento desde el 19/02/2027 |
| Ionic 6 + Capacitor 6 + Angular ≤ 15 | iOS 13 | Sin soporte ni parches de seguridad |

## Decisión

Ionic 9 + Capacitor 8 + Angular 22. Plataformas mínimas: **Android 8+** (WebView Chromium 89+) e **iOS 16+**.

## Consecuencias

- Los iPhone que no pueden actualizar a iOS 16 (iPhone 7 y anteriores) quedan fuera, también en la PWA, porque Ionic 9 requiere Safari 16+.
- Se evita depender de versiones sin parches de seguridad.
- Las compilaciones y pruebas de iOS requieren macOS con Xcode o un servicio de compilación en la nube.
