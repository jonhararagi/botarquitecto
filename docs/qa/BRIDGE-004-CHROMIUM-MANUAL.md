# BRIDGE-004 — Protocolo manual Chromium MV3

**Estado inicial:** `NOT_RUN` en el checkpoint del 2026-10-10. Este documento es un protocolo, no evidencia de ejecución.

## Registro del entorno

Completar antes de probar:

- Navegador y versión exacta (Chrome o Brave):
- Sistema operativo y versión:
- Método de instalación: modo desarrollador / cargar descomprimida desde `bridge/`:
- SHA de la rama probada:
- Perfil de navegador de prueba (sin incluir datos personales):
- Fecha/hora con zona horaria:

No adjuntar prompts, respuestas ni capturas con contenido privado. Registrar solo estado de sesión, `sessionId`, `jobId`, rol, timestamps y mensajes de error técnicos.

## Precondiciones

1. Usar un perfil de prueba y no asignar la misma pestaña a dos sesiones activas.
2. Obtener el HEAD actual de `worker/bridge-001-validation`; instalar exactamente ese árbol de archivos desde `bridge/`.
3. Abrir la página de extensiones (`chrome://extensions` o `brave://extensions`), activar modo desarrollador y cargar la carpeta `bridge/`.
4. Revisar errores de manifiesto e inicialización. Abrir el panel y crear/seleccionar una sesión sin empezar aún un ciclo automático.
5. Anotar los estados iniciales y confirmar que el almacenamiento de la sesión persiste. No mantener DevTools del service worker abierto durante el periodo de reposo, porque la inspección puede alterar el ciclo de vida.

## Escenario A: carga básica

1. Recargar la extensión solo si es necesario para instalar el SHA exacto y registrar que se hizo una recarga manual.
2. Confirmar que panel/popup abre, crea y selecciona una sesión; revisar consola y errores de extensión.
3. Si se realiza una interacción con ChatGPT, usar únicamente una prueba manual inocua y controlada. No automatizar mensajes reales desde el harness.
4. Confirmar que las pestañas CEREBRO/OBRERO seleccionadas corresponden a los IDs configurados en la sesión. Registrar únicamente IDs técnicos.

**Esperado:** inicialización sin errores bloqueantes, sesión visible y persistida, asociación coherente de sesión y pestañas. Si falla, guardar error técnico y determinar primero si es entorno, extensión o dependencia externa.

## Escenario B: suspensión natural y recuperación MV3

1. Con una sesión de prueba inactiva, verificar estado persistido e historial; cerrar las herramientas de inspección del worker.
2. Dejar el navegador sin actividad de BRIDGE para permitir que Chromium gestione el ciclo de vida naturalmente. No enviar mensajes de sondeo ni mantener el worker vivo artificialmente.
3. No asumir suspensión por el mero paso del tiempo. Registrar suspensión/terminación solo si hay evidencia observable; si no puede confirmarse, marcar `UNKNOWN` o `NOT_RUN`.
4. Reactivar mediante una acción normal de la extensión y comprobar sesión, historial, estado y logs.
5. Para recuperación ambigua, usar solo un fixture de prueba no privado si existe una vía segura para preparar el storage. Confirmar que un estado previamente activo termina en error y no dispara otro `START_TURN` automáticamente.
6. Ejecutar aparte una **recarga manual** de extensión y, en otra fila, cierre/reapertura de pestaña. No etiquetar ninguna de estas acciones como suspensión natural.
7. El cierre y reinicio del navegador es otro escenario independiente; registrar `NOT_RUN` si no se realizó.

**Esperado:** la sesión y el historial válidos se conservan; el turno activo ambiguo no se reenvía automáticamente; una respuesta de un `jobId` viejo no cambia el estado actual.

## Escenario C: STOP con turno pendiente

1. Iniciar un único turno manual controlado y anotar `sessionId`, `jobId`, rol y estado pendiente.
2. Pulsar STOP mientras el turno está pendiente. Anotar de inmediato el estado visible del worker/sesión.
3. Observar la pestaña de destino sin intervenir la generación. Determinar si el indicador de generación/polling sigue activo y cuánto tarda en terminar o expirar.
4. Si llega respuesta tardía, comprobar que no se inicia un segundo turno, no se incrementa indebidamente la iteración y el estado STOPPED permanece.
5. No iniciar un turno nuevo hasta terminar la observación del anterior. No copiar contenido privado a logs.

**Esperado:** STOP invalida el job y evita que una respuesta obsoleta reactive el bucle. La implementación actual no dispone de una cancelación explícita del polling ya iniciado en `content.js`; que el polling continúe hasta timeout es un resultado posible que debe anotarse, no ocultarse.

## Escenario D: casos de borde

Probar por separado y registrar cada resultado:

- Cerrar la pestaña CEREBRO/OBRERO mientras un job está activo.
- Simular o provocar fallo de mensajería solo si puede hacerse de forma segura y reproducible.
- Entregar una respuesta tardía de un job anterior mediante el mecanismo de prueba disponible, sin fabricar evidencia de navegador.
- Comprobar sesión pausada sin job pendiente y turno ya finalizado.

No etiquetar los mocks Node como pruebas reales. La reinicialización VM y el reloj simulado son pruebas automatizadas independientes.

## Matriz de evidencias

| Escenario | Método | Resultado | Evidencia mínima | Limitación |
|---|---|---|---|---|
| A. Carga básica | Chrome/Brave real | `NOT_RUN` hasta ejecutar | versión, SO, errores, estado sesión | No demuestra MV3 lifecycle |
| B1. Suspensión natural | Observación Chromium sin keepalive | `NOT_RUN` hasta observar | evidencia de terminación/reactivación, estados antes/después | Si no se observa, no inferirla |
| B2. Recarga extensión | Recarga manual | `NOT_RUN` hasta ejecutar | hora, estado antes/después | No es suspensión natural |
| B3. Reinicio navegador | Cerrar y abrir navegador | `NOT_RUN` hasta ejecutar | estado antes/después, historial | Separado de recarga |
| C. STOP pendiente | Navegador real, acción manual | `NOT_RUN` hasta ejecutar | job invalidado, estado, polling, respuesta tardía | No registrar texto de conversación |
| D. Respuesta antigua | Prueba automatizada y/o mecanismo real explícito | Automatizada en CI; real `NOT_RUN` | job IDs, estado, contador, envíos | No mezclar tipos de prueba |

## Etiquetas y cierre

- `PASS_REAL`: observado y aprobado en el navegador/versión documentados.
- `PASS_STATIC`: revisión de código/documentación.
- `NOT_RUN`: no ejecutado por falta de entorno o de precondiciones.
- `UNKNOWN`: evidencia insuficiente para afirmar el resultado.
- `FAIL_REAL`: fallo reproducido en navegador real, con pasos y evidencia técnica.
- `PARTIAL / NOT_READY`: estado global si los escenarios reales centrales siguen pendientes.

Al terminar, actualizar `STATUS.md`, `ROADMAP.md` y `WORK_LOG.md` con SHA exacto, resultado de Actions en el SHA final y una única siguiente tarea. No hacer merge ni escribir en `main`.
