# ADR 0013 — "Siguiendo tu bus": avisos con la app cerrada (Fase 6)

- Estado: aprobada por el desarrollador (05/10/2026): opción 1 (seguimiento activo con notificación fija) frente a revisar cada 15 min o dejarlo como estaba.

## Contexto

Los avisos de llegada (ADR 0009) se reprogramaban con cada dato nuevo solo mientras la app estaba abierta. Android no deja a una app normal consultar datos en segundo plano más de una vez cada 15 min (WorkManager).

## Decisión

- Plugin propio de Capacitor en `app/android/app/src/main/java/.../tracker` (Java): `BusTracker.start({ alert })` guarda el aviso y arranca el servicio; `stop()` lo anula.
- `BusTrackerService`: servicio en primer plano (tipo `specialUse`) con notificación fija. Cada minuto descarga la fuente del Ayuntamiento, calcula la llegada del autobús del aviso (misma regla que la app: minutos del horario desde su última parada menos la antigüedad del dato; si aún no tiene autobús, el que llega más cerca de la hora esperada, ±10 min) y mueve la hora del aviso. Avisa cuando faltan los minutos elegidos (sin datos, a la hora prevista) y se detiene; también 5 min después de la llegada esperada.
- Avisos lejanos: una alarma exacta arranca el seguimiento 45 min antes de la llegada.
- En Android la app ya no programa la notificación local para estos avisos: la da el servicio, así no hay duplicados. En iOS sigue la notificación programada.

## Alternativas

- Revisar cada 15 min (Background Runner / WorkManager): sin notificación fija, pero no sirve para avisos de pocos minutos.
- Dejarlo como estaba: el aviso solo se ajusta con la app abierta.

## Consecuencias y riesgos

- Gasta algo de batería y datos (una descarga de ~60 KB por minuto) solo mientras dura el aviso.
- El servicio usa la regla sencilla (sin el viaje casado ni el ritmo de la ADR 0012); con la app abierta, la app le envía la hora afinada.
- `specialUse` y `USE_EXACT_ALARM` habría que justificarlos si se publicara en Google Play.
- Si el móvil se reinicia, el seguimiento programado se pierde.
