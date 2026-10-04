# ADR 0009 — Autobuses animados y avisos de llegada (Fase 4)

- Estado: pedida por el desarrollador (04/10/2026): autobús con su número en vez de un punto, que se mueva en tiempo real, tamaño en Ajustes, seguimiento y "avísame cuando falten X minutos". Los detalles de implementación son míos.

## Contexto

La fuente del Ayuntamiento (ADR 0008) publica, cada ~5 min, la posición y la última parada de cada autobús. Pintar solo eso hace que los autobuses salten cada 5 min y estén siempre algo atrasados. No indica el tipo de vehículo (simple o articulado).

## Decisión

1. **Posición estimada:** el trazado de cada sentido se recorre por distancia; el punto publicado se proyecta sobre él (desde su última parada) y desde ahí avanza al ritmo de los minutos programados entre paradas, con el tiempo transcurrido desde el dato. Se recalcula cada segundo (`VehicleTrackerService`); el rumbo del tramo gira el icono. Lógica pura en `core/realtime/vehicle-position.ts`.
2. **Icono:** un autobús dibujado en un canvas por color de línea (capa de símbolos de MapLibre, alineada con el mapa) con el número encima. Tamaño en Ajustes: 0,75×, 1× o 1,35×.
3. **Seguir:** al tocar un autobús se muestra su ficha; "Seguir" centra el mapa en su posición estimada cada vez que cambia.
4. **Avisos:** un aviso a la vez sobre un paso concreto por la parada: un autobús visto en tiempo real o un paso del horario (también de mañana, pedido por el desarrollador el 04/10/2026). Se programa una notificación local del sistema para X minutos antes y el aviso se guarda en `localStorage`. Con la app abierta, en cada dato nuevo se asocia el autobús en tiempo real que llega más cerca de la hora esperada (±10 min; una vez asociado se le sigue) y se reprograma la notificación; si ya toca avisar y la programada no había saltado, se avisa al momento. `ArrivalNotifier` abstrae el plugin (`@capacitor/local-notifications`, cargado bajo demanda); en la web no hay avisos.
5. Android: permiso `USE_EXACT_ALARM` para que el aviso llegue a su hora con el móvil en reposo. Se concede sin preguntar, pero Google Play lo limita a apps de alarmas: si se publicara habría que justificarlo o pasar a `SCHEDULE_EXACT_ALARM` (que el usuario concede en los ajustes del sistema).

## Alternativas

- Interpolar entre los dos últimos puntos publicados: los autobuses irían 5 min por detrás y en línea recta, no por la calle.
- Comprobar el aviso solo con la app abierta: no avisaría con el móvil en el bolsillo.
- Simple/articulado: no hay dato en la fuente. Se podría añadir una lista manual de autobuses articulados si se consiguiera.

## Consecuencias y riesgos

- La posición es una estimación: si el autobús va más lento o más rápido que el horario, se corrige de golpe al llegar el dato siguiente.
- Mientras la app está cerrada no se descargan datos nuevos: el aviso programado usa la última hora conocida (la del horario si el autobús aún no había salido). Ajustarlo en segundo plano requeriría tareas en segundo plano del sistema.
- La asociación por cercanía puede elegir otro autobús si uno anterior va muy retrasado.
