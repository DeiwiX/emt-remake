# ADR 0012 — Retraso real y ritmo de cada autobús (Fase 6)

- Estado: Fase 6 propuesta por mí y aceptada por el desarrollador (05/10/2026, "empieza seguido con fase 6"). Los parámetros son decisión mía.

## Contexto

La llegada estimada (ADR 0008) usaba los minutos típicos del sentido desde la última parada del autobús y suponía que iba en hora. En hora punta los viajes del horario son más lentos, y con tráfico el autobús avanza más despacio que su horario.

## Decisión

1. **Viaje casado:** el autobús se casa con el viaje del horario cuyo paso por su última parada está más cerca de la hora del dato, entre 10 min adelantado y 40 min tarde; ir adelantado cuenta el triple (es raro). Se usan los tiempos de ese viaje y se muestra su retraso ("Va 3 min tarde", con ±2 min "Va en hora").
2. **Ritmo:** con el dato anterior distinto del mismo autobús (≥ 2 min antes), ritmo medido = minutos de horario avanzados / minutos reales. Se mezcla al 50 % con el del horario y se acota a 0,6–1,4. Lo que le queda se divide por el ritmo.
3. **Mapa sin saltos:** al llegar un dato nuevo la posición dibujada sigue avanzando y corrige la diferencia un 15 % cada segundo (~15 s); si la diferencia supera 1,5 km se coloca directamente.

## Alternativas

- Historial de tiempos por tramo y hora (aprendizaje): más preciso, pero necesita guardar datos de muchos días; se puede añadir después.
- Interpolar entre los dos últimos puntos publicados: iría siempre 5 min por detrás.

## Consecuencias y riesgos

- Con trayectos cada pocos minutos y retrasos grandes, el autobús se puede casar con el viaje siguiente; el retraso mostrado sería menor del real.
- El retraso se mide desde la hora del dato, no desde que pasó por la parada: puede sobrestimarse un par de minutos.
