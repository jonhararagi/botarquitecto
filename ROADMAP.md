# BRIDGE — Roadmap de producto

La prioridad es ganar fiabilidad antes de sumar funciones. Ningún hito se considera completado por tener archivos escritos: necesita criterios de aceptación y evidencia.

## P0 — Control del proyecto y reproducibilidad
- [x] Definir protocolo CEREBRO/OBRERO y reglas de evidencia.
- [x] Registrar línea base inicial, riesgos y próxima tarea.
- [x] Crear validaciones automatizadas reproducibles y documentar cómo ejecutarlas (suite inicial de contratos estáticos; CI PASS_REAL en run 38025331572).
- [x] Añadir CI para validaciones estáticas y pruebas de contrato (`.github/workflows/bridge-validation.yml`; CI PASS_REAL en run 38025331572).
- [ ] Establecer política de versiones y registro de cambios.

## P1 — Integridad del bucle
- [ ] Extraer funciones puras para validación de sesiones, límites y transiciones cuando sea viable.
- [x] Ejecutar en CI la suite dinámica de inicio, finalización, error, pausa, reanudación y parada añadida en BRIDGE-002 (run 38033318280, success).
- [ ] Probar que cada respuesta se reenvía como máximo una vez y solo al rol correcto.
- [ ] Completar pruebas de timeout/expiración y respuestas posteriores al timeout; las respuestas vacías, duplicadas y stale job se prueban ya en el arnés.
- [x] Confirmar en CI el test determinista de START_LOOP concurrentes y reserva de pestañas (run 38033284641, success).
- [x] Suite de mocks comprueba la competencia por pestañas y aislamiento entre sesiones (run 38033284641, success); queda pendiente validación en navegador real.

## P2 — Resiliencia Manifest V3
- [ ] Definir qué ocurre al suspender/reiniciar service worker durante un turno.
- [ ] Recuperar estado sin reejecutar acciones peligrosas ni duplicar envíos.
- [ ] Validar cierre, recarga, navegación y pérdida de conectividad de pestañas.
- [ ] Limitar tamaño de logs y definir borrado/exportación de datos.
- [ ] Probar migración de esquema de almacenamiento con estados antiguos.

## P3 — Calidad de interacción
- [ ] Mejorar estados accesibles, foco, navegación por teclado y mensajes de error accionables.
- [ ] Hacer visibles el rol, sesión, turno, timeout, contador y acción de parada.
- [ ] Confirmar operaciones destructivas y evitar que los controles queden bloqueados sin explicación.
- [ ] Documentar configuración y recuperación de errores en español claro.

## P4 — Seguridad, privacidad y licencias
- [ ] Revisar permisos y hosts del manifiesto con principio de mínimo privilegio.
- [ ] Revisar validación de remitentes de mensajes y límites de confianza.
- [ ] Establecer política de datos local: qué se guarda, por cuánto tiempo y cómo se borra.
- [ ] Añadir inventario de componentes y activos externos con licencia, versión y atribución.
- [ ] Revisar riesgos de instrucciones maliciosas dentro del contenido automatizado.
- [ ] No publicar como estable hasta completar revisión de seguridad y pruebas.

## P5 — Distribución y mantenimiento
- [ ] Definir empaquetado, versión, notas de cambios y actualización.
- [ ] Preparar guía de instalación para Chrome y Brave con capturas propias.
- [ ] Probar instalación limpia y actualización sobre versión anterior.
- [ ] Crear checklist de release y canal de reporte de errores.

## Definición de listo para un hito
1. Criterios de aceptación cubiertos.
2. Pruebas identificadas por tipo y resultado.
3. Sin afirmar validación real si solo se hizo revisión estática.
4. Documentación y estado actualizados en el mismo ciclo.
5. Riesgos conocidos anotados y siguiente tarea única definida.

## BRIDGE-002 — evidencia pendiente de cierre

- [x] GitHub Actions run [38033318280](https://github.com/jonhararagi/botarquitecto/actions/runs/38033318280) terminó en success para el head `e1405f1127e05c13260e639f21f1951c896a0fb6`.
- [ ] Mantener pendientes la validación manual en Chrome/Brave, timeout real del content script y recuperación tras suspensión/reinicio real del service worker.
- [ ] No declarar producción lista por pasar la suite dinámica de Node.

## TIMER orientativo
- P0 automatización mínima: 2–4 h de implementación inicial + 1–2 h de pruebas.
- P1 integridad del bucle: 1–3 días según facilidad para aislar lógica y reproducir fallos.
- P2 resiliencia: 1–3 días incluyendo simulación de ciclo de vida.
- P3 calidad de interacción: 1–2 días.
- P4 seguridad/licencias: 1–2 días de revisión más correcciones.
- P5 distribución: 0.5–2 días.
Estas cifras son estimaciones de trabajo, no fechas comprometidas. La validación manual de navegador se registra aparte.


## BRIDGE-003 — política de recuperación y expiración (en curso)

- [x] Definir en código una recuperación conservadora que no reenvía turnos ambiguos al hidratar el worker.
- [x] Conservar una sesión pausada sin job pendiente, las sesiones inactivas y el historial válido; reparar el selector activo inválido.
- [x] Añadir pruebas automatizadas para reinicialización simulada, respuesta antigua, timeout informado al worker, duplicado del mismo job y estado persistido incompleto.
- [x] Añadir a CI una prueba del archivo real `content.js` con reloj simulado para que el timeout no dependa de esperas de pared.
- [ ] Verificar la CI posterior a estos cambios sobre el SHA final exacto.
- [ ] Demostrar todos los casos de timeout/respuesta tardía y la semántica STOP/PAUSE bajo pruebas deterministas completas.
- [ ] Validar suspensión natural, recarga y reinicio del service worker en Chrome o Brave real.
- [ ] Decidir si se necesita cancelación explícita del polling/generación del content script al recibir STOP; hoy el worker invalida la respuesta, pero no aborta directamente el polling ya iniciado.
- [ ] No declarar terminada la resiliencia Manifest V3 hasta completar la validación real de navegador y los casos pendientes.

**Evidencia actual:** `PASS_STATIC` revisión del código y workflow en la rama; `PASS_REAL` [CI run 38035650008](https://github.com/jonhararagi/botarquitecto/actions/runs/38035650008), success en SHA exacto `dfa5a00fbb46061d6a5e39be633716bd3536ef59`, incluidos syntax, contratos, suite dinámica y timeout del content script con reloj simulado. `NOT_RUN` ejecución local y navegador real.


## BRIDGE-004 — validación real de Chromium (bloqueada por entorno)

- [x] Reconfirmar SHA de `main`, rama de trabajo y PR #6 antes de cambios.
- [x] Inspeccionar manifiesto, service worker, content script, panel, workflow y pruebas automatizadas existentes.
- [x] Consultar estado/revisiones del PR y CI sobre el SHA de entrada.
- [x] Confirmar que el conector de navegador no está disponible; no simular una prueba real.
- [x] Preparar protocolo manual reproducible en `docs/qa/BRIDGE-004-CHROMIUM-MANUAL.md`.
- [ ] Cargar `bridge/` en Chrome o Brave real y registrar versión/SO/errores de inicialización.
- [ ] Observar suspensión natural/reactivación MV3 separada de recarga manual y reinicio del navegador.
- [ ] Validar recuperación de estado ambiguo, historial, no-replay y respuesta obsoleta en navegador real.
- [ ] Probar STOP con un turno pendiente en una pestaña real y documentar si el polling continúa hasta timeout.
- [ ] Revisar CI de GitHub Actions sobre el SHA final que resulte de la actualización documental.

**Estado:** `PARTIAL / NOT_READY`. El último run verificado antes de la documentación es [38035719789](https://github.com/jonhararagi/botarquitecto/actions/runs/38035719789), `success` en `69626bcaf814a4b5f00e482f8ba75fa9f396233d`. Es evidencia de automatización Node, no de Chromium. No hay corrección de producción porque no se ha reproducido un defecto real.

**Siguiente tarea única:** ejecutar el protocolo manual BRIDGE-004 en un Chrome o Brave accesible y adjuntar evidencia técnica no sensible.


### BRIDGE-004 — checkpoint CI de documentación

- [x] CI completada en el SHA `c7772931d5152da0922765f552cafcbff4761802`: [run 38036355246](https://github.com/jonhararagi/botarquitecto/actions/runs/38036355246), `success`.
- [ ] Ejecutar y documentar la validación real de Chrome/Brave; la CI verde no la reemplaza.


## BRIDGE-005 — auditoría de STOP y diseño de cancelación cooperativa

- [x] Reinspeccionar HEAD de rama, base `main` y estado del PR #6 antes de documentar.
- [x] Inspeccionar worker, content script, controles, popup, pruebas y workflow.
- [x] Documentar flujo de START/PAUSE/RESUME/STOP/timeout/TURN_COMPLETE y fallos de mensajería.
- [x] Diseñar identidad de cancelación, validación después de awaits, respuesta tardía, fallo de cancelación y recuperación MV3 conservadora.
- [x] Documentar tabla de transiciones y 11 escenarios de prueba, indicando Node/mocks, Chromium real o ambos.
- [ ] Añadir y ejecutar tests deterministas de intercalado STOP con `dispatchTurn()` y `finishTurn()`.
- [ ] Evaluar en Chrome/Brave real el envío de cancelación, polling y ciclo de vida natural MV3.
- [ ] No implementar cancelación en producción hasta tener los tests deterministas y una decisión de alcance separada.

**Documento:** `docs/qa/BRIDGE-005-STOP-CANCELLATION-DESIGN.md`.  
**Evidencia:** `PASS_STATIC` para inspección de fuentes; `NOT_RUN` para pruebas nuevas y Chromium real. CI histórica del SHA de entrada no valida cambios documentales posteriores.  
**Estado:** `PARTIAL / DESIGN_ONLY`; no producción.  
**Siguiente tarea única:** pruebas deterministas de intercalado STOP/dispatchTurn/finishTurn.  
**TIMER:** auditoría/documentación estimada 2–4 h, confianza media; implementación posterior 2–6 h si se autoriza, confianza baja; estabilización BRIDGE 3–7 días, confianza baja.


## BRIDGE-006 — STOP/dispatchTurn/finishTurn (en verificación)

- [x] Añadir barreras deterministas al arnés Node `vm` para `tabs.get()` y persistencia.
- [x] Añadir regresión A: STOP durante validación de pestaña y excepción tardía.
- [x] Añadir regresión B: STOP durante persistencia de `finishTurn()`, sin avanzar iteration/lastForwarded ni despachar.
- [x] Añadir regresión C: STOP + START nuevo antes de liberar la ejecución antigua, cubriendo ABA y respuesta antigua.
- [x] Añadir identidad de ejecución en memoria, invalidación de STOP y guardas después de awaits; no hay protocolo CANCEL ni cambios a content script.
- [ ] Verificar en GitHub Actions la suite completa en el SHA final exacto.
- [ ] Validar manualmente Chrome/Brave si se dispone de navegador; separar suspensión natural MV3 de la simulación Node.
- [ ] No marcar BRIDGE como producción lista ni declarar cancelación del polling validada.
- **Estado provisional:** `PARTIAL`, hasta CI exacta. Tiempo medido no disponible; 30–90 min estimados para CI/reconciliación; estabilización BRIDGE 3–7 días, confianza baja.
- **Siguiente tarea única:** revisar CI del SHA final exacto y reparar solo fallos demostrados.


- **Checkpoint CI intermedio:** run [38049197793](https://github.com/jonhararagi/botarquitecto/actions/runs/38049197793) falló en `bridge/tests/validation.test.mjs` porque un contrato estático esperaba la llamada antigua a `failSession()` sin token. La sintaxis pasó; las suites dinámicas no se ejecutaron en ese run. Se ajustó el contrato para exigir el token de ejecución. Esto fue un desajuste de la prueba estática tras el cambio de firma, no evidencia de que las pruebas A/B/C fallaran.
- **Corrección del contrato:** commit `69a29da8b2837f3b495ded81b4cf9941ef05bd98`. CI posterior para el SHA final aún pendiente de consulta; no marcar PASS hasta verificarlo.
