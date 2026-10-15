# ADR 0015 — Atascos estimados con los autobuses (Fase 8)

- Estado: el desarrollador pidió seguir con la siguiente fase (15/10/2026) entre las propuestas, y la siguiente era la 5B ("atascos estimados a partir de la velocidad de los autobuses"). Los umbrales y la forma de mostrarlos los he elegido yo; se pueden ajustar.

## Contexto

No hay una fuente abierta de atascos en Málaga. La fuente de posiciones de la EMT da, para cada autobús y cada ~5 min, la última parada por la que pasó y la hora del dato. La app ya guarda el dato anterior de cada autobús (ADR 0012) y lo casa con su viaje del horario.

## Decisión

- Con dos datos seguidos del mismo autobús (mismo día, línea y sentido, separados entre 2 y 20 min) se compara lo que ha tardado entre sus dos últimas paradas con lo que marca su viaje del horario (que ya incluye el tiempo parado en cada parada).
- **Lento** (naranja): al menos 2 min de más y un 50 % más de lo previsto. **Atasco** (rojo): al menos 5 min de más y el doble. Un tramo de horario de menos de 1 min cuenta como 1 min.
- Si entre los dos datos no ha pasado ninguna parada, se mide el tramo hasta la siguiente. En la primera parada del sentido no se mide (puede estar esperando su hora de salida) ni en la última.
- En el Mapa, con el botón "Mostrar atascos" (oculto al abrir, como los cortes): el trozo de recorrido entre esas paradas se pinta encima de las líneas, y el panel lista cada tramo con su línea, paradas y minutos de más. Solo en la app del móvil (tiempo real).

## Alternativas

- Calcularlo en el script de datos (GitHub Actions) y publicarlo: habría datos al abrir la app, pero el script corre cada hora, así que estarían viejos.
- Usar solo el retraso de cada autobús frente a su horario: con un dato basta, pero no dice dónde se ha retrasado.

## Consecuencias y riesgos

- Hace falta tener el mapa abierto unos 5 min (dos datos de cada autobús) para que aparezca algo.
- Es una estimación: un autobús que espera en una parada de regulación a mitad de recorrido, o una avería, se ve como tramo lento. Los umbrales evitan que un semáforo o una parada con mucha gente cuenten como atasco.
- Un tramo se basa en un solo autobús; donde pasan varias líneas puede haber varios tramos encima.
