# BRIDGE-005 — Auditoría de STOP y diseño de cancelación cooperativa

**Estado:** `PARTIAL / DESIGN_ONLY`  
**Rama inspeccionada:** `worker/bridge-001-validation`  
**HEAD de entrada:** `565beccaee678f2e3a75cc386250b9aa58c4043a`  
**MAIN observado:** `525cf1a5b666a95f1389a26a3f8d3282b17f10fc`  
**PR:** #6 abierto, sin merge.  
**Alcance:** análisis estático y diseño. No se modifica código de producción, permisos ni dependencias.

## 1. Archivos y funciones inspeccionados

- `bridge/service-worker.js`: `hydrate()`, `dispatchTurn()`, `failSession()`, `finishTurn()`, listener `chrome.tabs.onRemoved`, listener `chrome.runtime.onMessage` para `START_LOOP`, `PAUSE`, `RESUME`, `STOP` y `TURN_COMPLETE`.
- `bridge/content.js`: `waitForInput()`, `waitForSendButton()`, `waitForCompletedResponse()`, `sendAndWait()`, `runTurn()` y listener `chrome.runtime.onMessage` para `START_TURN`.
- `bridge/control.js`: `send()`, `startButton.onclick`, acciones de PAUSE/RESUME/STOP y `poll()`.
- `bridge/popup.js`: `refreshTabs()`.
- `bridge/tests/validation.test.mjs`: contratos estáticos de asociación de job/remitente, exclusión de trabajos simultáneos en el content script y restricciones de manifiesto.
- `bridge/tests/service-worker.dynamic.test.mjs`: harness del worker real bajo Node `vm`, mocks de Chrome y pruebas de estado/mensajería.
- `bridge/tests/content.timeout.test.mjs`: timeout del content script con reloj simulado.
- `bridge/manifest.json`, `.github/workflows/bridge-validation.yml`, `WORK_LOG.md`, `STATUS.md` y `ROADMAP.md`.

La inspección se hizo mediante contenido remoto de GitHub. No se ejecutó la suite localmente ni se dispuso de Chromium real.

## 2. Flujo observado

1. El panel manda `START_LOOP` con `sessionId`, IDs de pestañas y semilla.
2. El worker comprueba la sesión, reserva `running`, y `dispatchTurn()` genera un `jobId` UUID, asigna `activeRole`/`activeJobId`, y manda `START_TURN` a la pestaña seleccionada con `chrome.tabs.sendMessage`.
3. El content script acepta el trabajo si no tiene otro `activeJobId` distinto. `runTurn()` llama `sendAndWait()`; el content script inserta texto, hace clic en enviar y espera una respuesta nueva, estable y sin botón de generación visible.
4. El content script manda `TURN_COMPLETE` al worker con `jobId`, `role`, resultado y estado.
5. El worker valida sesión y pestaña remitente; `finishTurn()` compara el job recibido con el activo y decide fallo, finalización o reenvío al siguiente rol.
6. `STOP` actualmente cambia el estado local y borra el job activo, pero no manda cancelación al content script ni intenta detener explícitamente la generación externa.

## 3. Diagnóstico por nivel de evidencia

### Defectos/limitaciones demostrados por lectura estática

- `content.js` no tiene un tipo de mensaje de cancelación. `waitForInput()`, `waitForSendButton()` y `waitForCompletedResponse()` esperan por sus propios intervalos y deadlines; sus esperas no comprueban una señal de cancelación.
- `STOP` no envía una orden a la pestaña. Por tanto, no hay confirmación de que el polling haya terminado ni de que una generación de ChatGPT se haya detenido.
- `activeJobId` es una única variable por instancia de content script; el worker también mantiene un job activo por sesión. La asociación del resultado usa `sessionId`, `jobId` y el ID de pestaña remitente, pero no se observa un token de época adicional.
- `tabs.sendMessage` fallido durante el envío inicial provoca error de sesión; `tabs.onRemoved` falla sesiones activas asociadas a esa pestaña. No existe una vía de confirmación de cancelación porque no se envía ese mensaje.
- El timeout limita cuánto espera el content script, pero no equivale a abortar una generación externa ya iniciada.

### Riesgo de intercalado asíncrono que requiere prueba dirigida

`dispatchTurn()` comprueba `running`/`stopRequested` antes de esperar `ensureTabAlive()`. Después del `await`, asigna `activeRole` y `activeJobId` sin volver a comprobar que la sesión sigue activa. Si STOP se procesa mientras esa espera está pendiente, la continuación puede escribir estado de job después de STOP. Debe confirmarse con una prueba determinista usando una promesa diferida.

`finishTurn()` también comprueba el job al entrar, pero luego puede esperar al guardar el log. STOP podría intercalarse después de esa primera comprobación; al continuar, la función puede escribir campos de estado/log posteriores a STOP. `dispatchTurn()` tiene un guard inicial que puede impedir el siguiente envío, pero eso no garantiza por sí solo que el estado persistido final permanezca `STOPPED`. Es un riesgo de consistencia, no una afirmación de que ya se reprodujo en Chromium.

### Riesgos plausibles / cuestiones abiertas

- Una respuesta tardía puede llegar a un worker reinicializado o a una sesión cuyo estado fue recuperado. La recuperación actual borra jobs ambiguos y no reenvía automáticamente, pero el comportamiento bajo el ciclo de vida real MV3 debe probarse.
- La UI de ChatGPT puede seguir generando después de STOP. No se debe asumir que pulsar el botón visual Stop es siempre posible, seguro o inequívocamente asociado a la generación iniciada por BRIDGE.
- Si se reutilizara un `sessionId` o un `jobId`, una identidad solo basada en esos valores podría resultar ambigua. Actualmente las sesiones nuevas se crean con UUID y cada dispatch crea un UUID; aun así, se recomienda que una futura orden de cancelación incluya ambos IDs y que el worker valide la pestaña destinataria.
- Una cancelación dirigida a una pestaña equivocada debe rechazarse sin modificar la sesión de destino ni la sesión de origen.
- Solo una prueba en Chrome/Brave puede demostrar los efectos de la suspensión natural/reactivación MV3, el timing real de los mensajes y la interacción con el DOM actual de ChatGPT.

## 4. Diseño mínimo recomendado, no implementado

### Identidad y autoridad

- El service worker sigue siendo la autoridad de la máquina de estados y de si un job es válido.
- La identidad de una ejecución debe ser la tupla `sessionId + jobId + tabId + role`; no aceptar una cancelación solo por `sessionId`.
- Al recibir STOP, el worker invalida el job de forma síncrona en memoria antes de cualquier `await`, conserva el estado terminal `STOPPED` y persiste el cambio. Ninguna continuación asíncrona antigua debe volver a registrar ese job.
- Después de cada `await` que preceda una escritura de estado o un efecto externo, validar de nuevo que la sesión conserva el mismo `jobId`, continúa ejecutándose y no tiene STOP solicitado. La validación debe hacerse antes de emitir `TURN_COMPLETE` y antes de cualquier reenvío.
- No introducir una época persistida ni otro protocolo hasta que una prueba demuestre que `sessionId + jobId + tabId + role` y la revalidación cubren insuficientemente un caso real.

### Cancelación cooperativa en content script

- Añadir, en una tarea de implementación separada, un mensaje interno como `CANCEL_TURN` que incluya `sessionId`, `jobId` y `role`; enviarlo solo a la pestaña exacta del job invalidado.
- El content script debe comparar la identidad completa con el job local activo. Una orden duplicada o de un job viejo será idempotente y no podrá cancelar otro job.
- Una señal local cooperativa debe ser comprobada por `waitForInput()`, `waitForSendButton()` y `waitForCompletedResponse()`, y antes de hacer clic en enviar, leer/emitir resultado y mandar `TURN_COMPLETE`. Debe limpiar su job y recursos de forma segura en `finally`.
- El worker debe ignorar toda respuesta de job invalidado aunque el content script no confirme cancelación.
- La respuesta a CANCEL solo puede indicar que el content script registró la cancelación local. No prueba que la generación externa de ChatGPT haya terminado.
- Un `AbortController` solo sería útil para esperas o APIs que acepten explícitamente su señal; no cancela por sí mismo un clic ya realizado ni una generación externa que no soporte aborto.
- Si falla `tabs.sendMessage`, la pestaña se cerró o no responde, registrar cancelación **no confirmada**, mantener el job invalidado en el worker y no reintentar automáticamente la generación. El timeout sigue siendo un límite de seguridad.
- No agregar permisos: la comunicación con la pestaña usa el canal runtime/messaging existente.

### Recuperación del worker

No depender de variables en memoria como única fuente de autoridad después de reiniciar MV3. Mantener la política conservadora actual: un job persistido ambiguo no se reproduce. Una cancelación en curso recuperada tras reinicio no debe reiniciar sesión ni reenviar el turno; se registra como estado ambiguo/no confirmado hasta que el usuario decida continuar manualmente.

## 5. Tabla de transiciones propuesta

| Evento | Precondición | Acción autoritativa del worker | Efecto en content script | Resultado esperado |
|---|---|---|---|---|
| START | Sesión inactiva, pestañas válidas y no ocupadas | Crear job nuevo, reservar sesión y persistir antes del envío | Aceptar solo si no hay otro job incompatible | Un solo job activo |
| PAUSE | Sesión activa | Marcar pausa; conservar el job actual | No se redefine la semántica actual: el turno actual puede terminar | No iniciar el siguiente turno mientras siga pausada |
| RESUME | Sesión pausada | Quitar pausa; reanudar solo según lógica existente y estado verificable | No aceptar trabajos duplicados | Nunca reenviar un turno ambiguo automáticamente |
| STOP | Sesión identificada | Invalidar job primero; fijar `STOPPED`; persistir; intentar CANCEL a la pestaña exacta | Marcar ese job como cancelado localmente y abandonar polling cooperativamente | STOP no reactiva sesión; confirmación de pestaña separada del estado worker |
| Timeout | Job aún activo | Invalidar/fallar solo si el job sigue siendo el actual | Terminar espera y notificar error si aún puede comunicarlo | Timeout no implica cancelación de la generación externa |
| Respuesta válida | Sesión/job/pestaña/rol coinciden y job sigue activo | Aceptar una sola vez y continuar la máquina de estados | Limpiar el job local tras informar resultado | Sin doble finalización |
| Respuesta tardía | Job invalidado, cancelado, agotado o reemplazado | Descartar sin mutar estado ni reenviar | Puede limpiar recursos locales si sigue ejecutándose | Nunca falso éxito |
| CANCEL duplicado/tardío | Identidad ya cancelada o job diferente | Mantener estado sin cambios | Idempotente; no tocar job diferente | Sin efecto lateral |
| Worker reiniciado | Storage indica trabajo activo ambiguo | Recuperar de forma conservadora, invalidar el trabajo ambiguo y no hacer replay | No se presupone que el content script conserve memoria ni que el mensaje llegue | Revisión manual, no reenvío automático |

PAUSE/RESUME/STOP deben conservar su semántica de producto actual; esta tabla define garantías de aislamiento, no autoriza cambios de comportamiento fuera del alcance.

## 6. Matriz de pruebas propuesta

**N = Node/mocks**, **C = Chromium real**, **N+C = ambos**. Las pruebas de navegador no deben enviar prompts reales desde la suite automatizada. En navegador real, usar una página de prueba controlada o una sesión manual con contenido no sensible.

| Caso | Precondiciones y acciones | Resultado esperado | Entorno |
|---|---|---|---|
| STOP durante polling | Content script espera; emitir STOP para job actual | Worker invalida inmediatamente; polling cooperativo termina; no hay reenvío | N+C |
| STOP justo antes de respuesta | Pausar el handler de resultado con promesa diferida; procesar STOP y luego liberar respuesta | Resultado descartado; estado final permanece STOPPED | N; C para timing integrado |
| Respuesta tardía tras STOP | Invalidar job y enviar TURN_COMPLETE del job anterior | No cambia estado, log de resultado ni job nuevo | N+C |
| Nuevo turno tras STOP | STOP confirmado; usuario inicia START nuevo | UUID nuevo; respuesta vieja no completa el nuevo job | N+C |
| CANCEL a pestaña equivocada | Mandar CANCEL con tabId/identidad no coincidente | Rechazo/no-op seguro; ninguna otra sesión cambia | N+C |
| CANCEL duplicado | Entregar dos cancelaciones idénticas | Idempotencia, sin errores ni cancelación de job siguiente | N+C |
| Pestaña cerrada antes de CANCEL | Quitar pestaña entre invalidación y envío | Worker conserva STOPPED/job inválido; cancelación marcada no confirmada | N+C |
| Mensaje CANCEL rechazado | Mock de `tabs.sendMessage` que rechaza | No declarar cancelación confirmada; no replay automático | N+C |
| Timeout y STOP concurrentes | Diferir timeout y STOP para permutar orden | Solo un resultado terminal válido; no sobrescribir STOPPED ni aceptar respuesta tardía | N; C para reloj real |
| Worker reiniciado con job pendiente | Persistir estado activo ambiguo, crear contexto worker nuevo | No reenvío automático; respuesta vieja no resucita sesión | N+C |
| Dos sesiones aisladas | Dos sesiones y pestañas distintas; cancelar una y responder en la otra | Cancelación y respuestas solo afectan la tupla de sesión/job/pestaña correcta | N+C |

En cada test registrar IDs sintéticos, orden de eventos y estado final. No almacenar texto privado de conversaciones. Las pruebas Node prueban lógica y contratos bajo mocks, no el ciclo de vida de Chromium.

## 7. Invariantes de aceptación

1. Un `jobId` invalidado nunca completa un turno nuevo.
2. STOP no reactiva automáticamente la sesión.
3. No hay dos trabajos incompatibles simultáneos en una sesión/pestaña.
4. Un fallo de mensajería no se etiqueta como cancelación confirmada.
5. Un turno ambiguo tras recuperación no se reenvía automáticamente.
6. El diseño tolera que el service worker se suspenda y se reactive.
7. No se agregan permisos ni dependencias sin necesidad demostrada.

## 8. Evidencia y estado

- **PASS_STATIC:** fuentes remotas inspeccionadas en el HEAD de entrada indicado.
- **PASS_REAL (automatización existente):** el PR registra GitHub Actions run [38036415703](https://github.com/jonhararagi/botarquitecto/actions/runs/38036415703) como `success` para SHA `565beccaee678f2e3a75cc386250b9aa58c4043a`. Esto valida únicamente los pasos automatizados de esa ejecución, no el diseño nuevo ni Chromium.
- **NOT_RUN:** nuevos tests de intercalado propuestos; ejecución local; STOP/CANCEL real; suspensión natural/reactivación MV3; generación externa interrumpida por STOP.
- **Diseño propuesto, no implementado:** todo el protocolo de cancelación cooperativa de este documento.
- **Conclusión:** `PARTIAL / NOT_READY`. BRIDGE no está certificado para producción.

## 9. Próximo paso único

Implementar, solo tras aprobación, una tarea acotada de tests deterministas que reproduzca los intercalados STOP/dispatchTurn/finishTurn y fije los invariantes antes de introducir el mensaje CANCEL. Mantener los cambios de producción fuera de esa tarea de diagnóstico.

## TIMER

- Tiempo invertido medido: no disponible.
- Auditoría y documentación: estimación 2–4 h; confianza media, no es tiempo medido.
- Implementación posterior, si se autoriza: estimación inicial 2–6 h después del diagnóstico; confianza baja.
- Estabilización BRIDGE: 3–7 días de trabajo concentrado; confianza baja.
- Validación real Chrome/Brave: sigue pendiente y no está incluida como realizada.
