# CLAUDE.md

Instrucciones de Claude Code para este proyecto.

## Protocolo

El protocolo de desarrollo completo está en AGENTS.md y se carga
mediante esta importación:

@AGENTS.md

Sigue todas sus reglas, también en tareas que parezcan sencillas.
Este archivo no repite AGENTS.md: solo añade lo específico de la
integración con Claude Code.

## Prioridad entre instrucciones

1. Las instrucciones de mayor prioridad de la plataforma y sus
   requisitos de seguridad, que se respetan siempre.
2. Las instrucciones explícitas del desarrollador en la conversación
   actual.
3. Las reglas del proyecto en AGENTS.md.
4. Las instrucciones específicas de integración de este archivo.
5. Los comportamientos predeterminados de la herramienta.

Si una instrucción de la conversación entra en conflicto con una
aprobación pendiente, una regla de seguridad o una operación delicada
(destructiva, irreversible o con efectos externos), identifica el
conflicto y solicita aclaración cuando sea necesario antes de actuar.

Si dos instrucciones entran en conflicto y este orden no lo resuelve,
detente y pregunta.

## Específico de Claude Code

- Las instrucciones escritas no sustituyen a los permisos de las
  herramientas. Usa los mecanismos de autorización de Claude Code y
  no intentes eludirlos.
- Durante la fase de análisis usa solo herramientas y comandos de
  lectura.
- No crees ramas ni commits, no abras pull requests y no ejecutes push
  ni merge sin autorización explícita, aunque la herramienta o el
  entorno lo hagan por defecto (AGENTS.md, sección 12).
- No guardes en la memoria de Claude reglas que ya estén en estos
  archivos. Si una regla debe ser permanente, propón añadirla a
  AGENTS.md.

## Contexto del proyecto

El stack, la estructura y los comandos se documentan en la sección
"Contexto del proyecto" de AGENTS.md, no aquí.
