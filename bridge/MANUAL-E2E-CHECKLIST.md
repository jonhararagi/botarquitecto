# BRIDGE — Validación manual E2E antes de integrar

Este checklist cubre la prueba que la suite de Node no puede demostrar: el comportamiento real de la extensión instalada en Chrome o Brave, con dos conversaciones de ChatGPT abiertas.

## Reglas de seguridad

- Ejecutar primero con una tarea inocua y sin acciones externas.
- No usar conversaciones que contengan secretos, credenciales o datos sensibles.
- Mantener `main` sin cambios; probar la rama candidata en un perfil de navegador dedicado.
- No considerar aprobada la prueba si solo se ve el estado `RUNNING`: comprobar también el contenido recibido y el historial de ambas conversaciones.
- Registrar fallos y capturas sin incluir información privada.

## Preparación

- [ ] Instalar temporalmente la carpeta `bridge/` de la rama candidata mediante «Cargar extensión sin empaquetar».
- [ ] Confirmar que BRIDGE aparece habilitada y que no hay errores de carga en la página de extensiones.
- [ ] Abrir dos conversaciones ChatGPT distintas en el mismo perfil: una para CEREBRO y otra para OBRERO.
- [ ] Abrir el panel de BRIDGE, actualizar la lista de pestañas y asignar dos pestañas distintas.
- [ ] Configurar un límite bajo de iteraciones (por ejemplo, 4) y tiempos de espera adecuados para la prueba.
- [ ] Registrar el SHA exacto probado y la versión del navegador antes de ejecutar los casos.

## Datos de la ejecución

| Campo | Valor |
| --- | --- |
| Fecha y hora (incluye zona horaria) | Pendiente |
| SHA de la rama probada | Pendiente |
| Navegador y versión | Pendiente |
| Sistema operativo | Pendiente |
| Perfil de prueba aislado | Pendiente |

## Casos de aceptación

| ID | Escenario | Procedimiento | Resultado esperado |
| --- | --- | --- | --- |
| E2E-01 | Ciclo básico | Iniciar con una instrucción inocua que solicite una respuesta breve de cada rol. | CEREBRO recibe el inicio; la respuesta completa se envía una sola vez a OBRERO y luego vuelve a CEREBRO. |
| E2E-02 | Respuesta aún generándose | Enviar una tarea que produzca una respuesta relativamente larga. | BRIDGE espera a que la generación termine y el texto se estabilice; no reenvía texto parcial. |
| E2E-03 | STOP durante generación | Iniciar una respuesta larga y pulsar STOP mientras ChatGPT genera. | La sesión queda detenida; no comienza otro turno. Si el inicio estaba en vuelo, la cancelación tardía detiene ese job. |
| E2E-04 | STOP durante el despacho | Pulsar STOP justo después de iniciar la sesión, antes de que aparezca una respuesta. | No se publica ni se mantiene un job obsoleto y no se produce un reenvío posterior. |
| E2E-05 | Timeout | Usar un timeout corto y una tarea que previsiblemente lo exceda, sin depender de una conversación sensible. | La sesión pasa a ERROR, muestra un diagnóstico útil y no reenvía una respuesta incierta. |
| E2E-06 | Reinicio del service worker | Con una sesión activa de prueba, provocar el reinicio del service worker desde las herramientas de extensión, si el navegador lo permite. | BRIDGE recupera el estado de forma segura; si el turno no es recuperable, se detiene con diagnóstico en vez de duplicarlo. |
| E2E-07 | Sin duplicados | Dejar que un turno complete y observar el siguiente rol. | Un mismo job no avanza dos veces; el historial contiene una sola entrega de la respuesta. |
| E2E-08 | Aislamiento entre sesiones | Configurar dos sesiones con cuatro pestañas distintas y ejecutar tareas cortas e inocuas. | Ninguna sesión usa las pestañas, resultados ni estado de la otra. |
| E2E-09 | Pestaña cerrada o recargada | Durante una sesión de prueba, cerrar o recargar una de las pestañas asignadas. | La sesión falla de forma explícita; no queda eternamente RUNNING ni se reenvía contenido incierto. |
| E2E-10 | Límite de iteraciones | Iniciar con un máximo pequeño de iteraciones. | La sesión se detiene al alcanzar el límite configurado. |

## Registro de evidencia por caso

Completar una fila por cada ejecución. No marcar PASS basándose únicamente en una inspección del código o en el estado RUNNING. Si se repite un caso, añadir otra fila con la fecha y el SHA probados.

| ID | Resultado | Pasos observados / resultado real | Captura o registro redactado | Incidencia / notas |
| --- | --- | --- | --- | --- |
| E2E-01 | NOT RUN | Pendiente | Pendiente | |
| E2E-02 | NOT RUN | Pendiente | Pendiente | |
| E2E-03 | NOT RUN | Pendiente | Pendiente | |
| E2E-04 | NOT RUN | Pendiente | Pendiente | |
| E2E-05 | NOT RUN | Pendiente | Pendiente | |
| E2E-06 | NOT RUN | Pendiente | Pendiente | |
| E2E-07 | NOT RUN | Pendiente | Pendiente | |
| E2E-08 | NOT RUN | Pendiente | Pendiente | |
| E2E-09 | NOT RUN | Pendiente | Pendiente | |
| E2E-10 | NOT RUN | Pendiente | Pendiente | |

Valores permitidos para Resultado:

- **PASS:** se ejecutó el caso y se observó el resultado esperado; adjuntar evidencia.
- **FAIL:** el comportamiento observado contradice el resultado esperado; registrar pasos reproducibles y detener la integración.
- **BLOCKED:** no se pudo ejecutar por limitaciones del navegador, red, cuenta o entorno; no equivale a PASS.
- **NOT RUN:** aún no existe evidencia de ejecución.

## Criterio de salida

- Mantener el PR en borrador hasta que E2E-01, E2E-03, E2E-05 y E2E-07 tengan evidencia PASS.
- Completar los diez casos antes de declarar la validación E2E completa.
- La CI verde valida las regresiones automatizadas, pero no sustituye esta prueba manual.
