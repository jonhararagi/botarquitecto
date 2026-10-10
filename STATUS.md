# Estado del proyecto BRIDGE

**Última inspección:** 2026-10-10 (UTC; BRIDGE-002 con CI dinámica verificada).  
**Rama de trabajo:** `worker/bridge-001-validation`  
**SHA inicial de BRIDGE-002:** `529b840e5a6f7d4848786a393432a465666015ef`.  
**Estado:** `PARTIAL`. Arnés dinámico y CI pasan; quedan escenarios de timeout y navegador real. PR #6 abierto; no integrado en `main`.

## Estado comprobado

- Extensión Chromium Manifest V3 en `bridge/`, con panel, popup, service worker y content script.
- Persistencia mediante `chrome.storage.local`, sesiones múltiples, límites de iteración/timeout y asociación de turnos por `jobId` y pestaña.
- BRIDGE-001 añadió contratos estáticos, comprobaciones de sintaxis y CI. El run anterior [38025331572](https://github.com/jonhararagi/botarquitecto/actions/runs/38025331572) valida el SHA de implementación de BRIDGE-001, no los nuevos tests dinámicos.
- BRIDGE-002 añade `bridge/tests/service-worker.dynamic.test.mjs`, que ejecuta el archivo real `bridge/service-worker.js` en un contexto Node `vm` con mocks de Chrome. La CI se separó en pasos para contratos y pruebas dinámicas.
- La suite dinámica se ejecutó en GitHub Actions run [38033318280](https://github.com/jonhararagi/botarquitecto/actions/runs/38033318280), sobre el head de rama `e1405f1127e05c13260e639f21f1951c896a0fb6`; los pasos de sintaxis, contratos estáticos y pruebas dinámicas terminaron con `success`. La verificación de navegador sigue pendiente.

## Evidencia y límites

- `PASS_STATIC`: revisión del service worker, content script, contratos existentes y manifiesto.
- `PASS_REAL`: GitHub Actions run [38033318280](https://github.com/jonhararagi/botarquitecto/actions/runs/38033318280) concluyó `success`; los pasos de sintaxis, contratos estáticos y suite dinámica finalizaron correctamente en el SHA de rama `e1405f1127e05c13260e639f21f1951c896a0fb6`.
- `PASS_REAL`: el arnés dinámico ejecutó el service worker real y pasó pruebas de hidratación, creación/selección/eliminación, límites, inicio válido/inválido, competencia concurrente por pestañas, asociación de respuestas, respuestas obsoletas, duplicados, pausa/reanudación/parada, límite de iteraciones, error de mensajería, cierre de pestaña, eliminación de sesión activa y doble inicio.
- `NOT_RUN`: no se ejecutó localmente en este entorno. Tampoco se hizo prueba manual en Chrome/Brave.
- `NOT_RUN`: suspensión y reinicio real del service worker, recuperación tras cierre abrupto, expiración real del content script y recorrido de extremo a extremo en navegador.
- Las pruebas usan mensajes sintéticos dentro del arnés; no se enviaron mensajes reales a ChatGPT.
- El test de concurrencia debe evaluarse con el resultado de CI; no se presupone una carrera sin reproducción.

## Riesgos abiertos

1. El mock Node no modela por completo el event loop, el ciclo de vida ni la suspensión de un service worker Chromium.
2. No hay validación manual en Chrome/Brave.
3. Selectores DOM de ChatGPT sujetos a cambios.
4. Timeout/expiración del turno y respuesta posterior a timeout no se simulan como temporizador dinámico; siguen pendientes. El service worker delega el timeout al content script y no mantiene un watchdog propio.
5. Sin revisión final de seguridad, privacidad, distribución o release.

## Métrica de progreso

**Progreso global: 15% (estimación de gestión, confianza baja).** Se conserva el porcentaje anterior; añadir cobertura de pruebas no demuestra por sí solo la estabilidad global del producto.

## Próxima tarea única recomendada

**BRIDGE-003: validar recuperación y seguridad de ciclo de vida Manifest V3 en Chrome/Brave**, incluyendo suspensión/reinicio del service worker, cierre/navegación de pestañas y evitar reenvíos tras recuperar estado.

## TIMER

- **Tiempo invertido medido:** no disponible en este entorno; no se inventa.
- **Estimación restante BRIDGE-002:** 30–60 min para revisión del diff/PR y decisión del BOT CEREBRO; 30–60 min adicionales si se dispone de navegador para comprobación manual. La cobertura dinámica actual y su CI están verificadas.
- **Estimación restante para estabilizar BRIDGE:** 3–7 días de trabajo concentrado, confianza baja.
- **Incertidumbre:** depende de los resultados reales de CI, la disponibilidad de Chrome/Brave y la complejidad de los casos de suspensión/reinicio y respuestas tardías.


## BRIDGE-003 — recuperación MV3 y timeout (en progreso)

- **Política implementada en la rama, pendiente de CI:** durante la hidratación, cualquier sesión que parezca activa (`running`, `activeJobId` o estado `STARTING`/`RUNNING`/`AUTO_FORWARD`) se detiene en `ERROR` y se limpian `activeJobId`/`activeRole`. No se reenvía el turno ambiguo. Se conserva el log. Una sesión pausada sin job pendiente queda pausada; sesiones inactivas, detenidas, finalizadas y con límite alcanzado conservan su estado.
- **Estado persistido incoherente:** se normalizan objetos de sesión incompletos, se conserva el historial válido y se repara `activeSessionId`. Los registros nulos no contienen una sesión recuperable y se descartan.
- **Timeout:** el content script ya tiene deadline en `waitForCompletedResponse`; se añade un test que ejecuta el archivo real `bridge/content.js` con reloj simulado. El service worker trata el error de timeout como fallo terminal del job; `jobId` ya no activo impide que una respuesta tardía modifique o reenvíe el flujo.
- **Pruebas añadidas:** reinicialización del service worker real en un nuevo contexto `vm` con el mismo snapshot de storage; turno activo ambiguo sin replay; sesión pausada sin job; sesión finalizada; `TURN_COMPLETE` tardío tras reinicio; timeout, respuesta tardía, duplicado del mismo job y estado incompleto.
- **Evidencia actual:** `PASS_STATIC` para revisión de los cambios remotos. `PASS_REAL` GitHub Actions [run 38035650008](https://github.com/jonhararagi/botarquitecto/actions/runs/38035650008), conclusión success sobre el SHA exacto `dfa5a00fbb46061d6a5e39be633716bd3536ef59`; incluye sintaxis, contratos estáticos, suite dinámica y test real de timeout con reloj simulado. `NOT_RUN` ejecución local y Chrome/Brave, suspensión natural y reinicio real de Chromium.
- **Límite funcional conocido:** STOP invalida el job en el service worker, pero no cancela directamente la generación o el polling ya iniciado en la pestaña ChatGPT. Una respuesta tardía se ignora en el worker, aunque el content script puede seguir ocupado hasta su timeout. Se documenta como limitación para una corrección acotada posterior si la revisión exige cancelación activa.
- **Estado del proyecto:** `PARTIAL / NOT_READY`. No es producción ni resiliencia MV3 demostrada.

### TIMER BRIDGE-003

- Tiempo invertido medido: no disponible.
- Tiempo restante estimado: 1–3 h para CI, corregir errores y revisar el diff; 1–3 h adicionales para validar Chrome/Brave si hay entorno gráfico.
- Estabilización global BRIDGE: 3–7 días de trabajo concentrado, confianza baja. La estimación no implica que se haya medido tiempo real.


## BRIDGE-004 — checkpoint actual (2026-10-10)

**Decisión: `PARTIAL / NOT_READY`.** La validación real solicitada no pudo ejecutarse: el conector de navegador devolvió `Browser not connected`, y el entorno de ejecución no tiene acceso de red a GitHub ni a una instalación local de Chrome/Brave. No se atribuye esta limitación al código de la extensión.

- **MAIN SHA:** `525cf1a5b666a95f1389a26a3f8d3282b17f10fc`.
- **HEAD de entrada verificado:** `69626bcaf814a4b5f00e482f8ba75fa9f396233d`; es también el SHA actual de la rama al comenzar BRIDGE-004.
- **PR #6:** abierto, no fusionado; sin reviews ni hilos de revisión registrados en la consulta realizada.
- **CI de entrada:** `PASS_REAL`, GitHub Actions [run 38035719789](https://github.com/jonhararagi/botarquitecto/actions/runs/38035719789), `success` en el SHA exacto de entrada. Esa CI es automatización en Node, no prueba de navegador.
- **`PASS_STATIC`:** inspección remota del manifiesto, service worker, content script, panel, workflow y suites existentes.
- **`NOT_RUN`:** carga en Chrome/Brave; creación y selección visual de sesión; suspensión natural MV3; recuperación después de reactivación; recarga manual; cierre/reinicio del navegador; STOP en pestaña real; polling del content script observado en navegador; respuesta tardía real. El conector Opera no estaba conectado y no se usó como sustituto.
- **STOP según código y pruebas simuladas:** el worker invalida `activeJobId`, detiene el bucle y descarta respuestas que ya no coinciden con el job activo. El content script no expone una orden explícita de cancelación del polling en curso, por lo que puede seguir esperando hasta su timeout. Esto es una limitación del comportamiento actual, no una prueba real de navegador.
- **Cambios de producción:** ninguno. No se reprodujo un defecto en Chromium que justifique modificar semánticas o añadir cancelación preventiva.
- **Protocolo manual:** `docs/qa/BRIDGE-004-CHROMIUM-MANUAL.md` contiene precondiciones, escenarios separados y evidencias que deben registrarse sin contenido privado.
- **TIMER:** tiempo invertido medido no disponible. Estimación restante para completar BRIDGE-004: 1–3 h de validación manual una vez disponible un navegador conectado, más 30–60 min para registrar evidencias y reconciliar CI/documentación. BRIDGE global: 3–7 días de trabajo concentrado, confianza baja; recalibrar tras las pruebas reales.

Este checkpoint prevalece sobre las estimaciones históricas de BRIDGE-002/003 incluidas en entradas anteriores. El porcentaje global sigue en 15% con confianza baja; no se aumenta sin evidencia adicional.


### BRIDGE-004 — verificación de CI documental

- **SHA validado:** `c7772931d5152da0922765f552cafcbff4761802`.
- **CI:** `PASS_REAL`, GitHub Actions [run 38036355246](https://github.com/jonhararagi/botarquitecto/actions/runs/38036355246), conclusión `success` sobre ese SHA exacto. Pasaron sintaxis, contratos estáticos, pruebas dinámicas del service worker y test de timeout del content script con reloj simulado.
- **No cubre:** navegador real, suspensión natural MV3 ni STOP durante un turno real. Esos escenarios siguen `NOT_RUN`.
- Este resultado corresponde al SHA indicado; la siguiente actualización documental, si la hubiera, requiere comprobar CI de nuevo sobre su propio HEAD.


## BRIDGE-005 — auditoría STOP/cancelación cooperativa (diseño, no implementación)

- **HEAD de entrada:** `565beccaee678f2e3a75cc386250b9aa58c4043a`; **MAIN:** `525cf1a5b666a95f1389a26a3f8d3282b17f10fc`; PR #6 abierto y sin merge al iniciar la tarea.
- **Diseño:** `docs/qa/BRIDGE-005-STOP-CANCELLATION-DESIGN.md`.
- **Hallazgos estáticos:** STOP invalida `activeJobId` en el worker, pero no manda cancelación a `content.js`; el polling continúa hasta resultado o deadline. Se identificó un riesgo de intercalado: `dispatchTurn()` espera `ensureTabAlive()` y luego puede escribir estado sin revalidar STOP; `finishTurn()` también hace trabajo asíncrono tras la comprobación inicial del job. Hace falta prueba determinista, no se afirma que ya haya ocurrido en Chromium.
- **Diseño propuesto, no implementado:** cancelación idempotente por `sessionId + jobId + tabId + role`; revalidación tras awaits y antes de efectos/resultados; errores de mensajería significan cancelación no confirmada; respuesta tardía descartada; recuperación MV3 sin replay automático.
- **Cambios de producción/permisos/dependencias:** ninguno. No se modificaron las semánticas de PAUSE/RESUME/STOP.
- **Evidencia:** `PASS_STATIC` inspección remota; `PASS_REAL` solo para CI histórica en SHA de entrada (run 38036415703, success reportado previamente); `NOT_RUN` para tests nuevos, Chromium real y suspensión natural MV3. Se debe consultar CI para el SHA final documental.
- **Estado:** `PARTIAL / DESIGN_ONLY`, no producción.
- **Siguiente tarea única:** añadir pruebas deterministas de intercalado STOP/dispatchTurn/finishTurn, sin cambiar producción.
- **TIMER:** auditoría/documentación 2–4 h estimadas, confianza media; implementación posterior 2–6 h estimadas si se autoriza, confianza baja; estabilización BRIDGE 3–7 días, confianza baja. Tiempo medido no disponible.


## BRIDGE-006 — intercalados deterministas STOP/dispatchTurn/finishTurn

- **Entrada:** rama `worker/bridge-001-validation`, HEAD declarado/verificado al iniciar `b0711cbb2d19a5ab706c04f1f718ff1784b584c9`; `main` `525cf1a5b666a95f1389a26a3f8d3282b17f10fc`; PR #6 abierto y sin merge.
- **Cambios:** `bridge/service-worker.js` usa un token de ejecución en memoria, invalida la autoridad al recibir STOP, comprueba la identidad después de awaits y antes de efectos externos, y evita que una escritura de storage obsoleta quede como snapshot final. No se añaden campos persistentes ni protocolo de cancelación.
- **Tests añadidos en `bridge/tests/service-worker.dynamic.test.mjs`:** A, STOP durante `tabs.get()` y excepción tardía; B, STOP durante persistencia en `finishTurn()`; C, START B antes de liberar la espera de A (ABA), respuesta antigua de A y conservación del job B. Barreras con promesas diferidas, sin temporizadores arbitrarios.
- **Comandos locales:** `NOT_RUN`; `git clone` falló porque este entorno no pudo resolver `github.com`. No afirmar resultados locales. Los comandos de sintaxis y las tres suites deben verificarse en CI para el SHA final exacto.
- **CI final:** pendiente de consulta para el SHA final posterior a esta documentación. No reutilizar runs de SHA anteriores como evidencia del HEAD actual.
- **Chromium real / suspensión natural MV3 / cancelación del polling:** `NOT_RUN`. Esta tarea no implementa cancelación cooperativa del content script.
- **Estado provisional:** `PARTIAL` hasta confirmar Actions y revisar cualquier fallo reproducido.
- **TIMER:** tiempo medido no disponible; estimación restante 30–90 min para CI y reconciliación; 1–3 h para navegador real si está accesible. Estabilización BRIDGE 3–7 días, confianza baja.
- **Siguiente tarea única:** obtener y revisar CI del SHA final exacto, sin ampliar el alcance a cancelación del content script.


- **Checkpoint CI intermedio:** run [38049197793](https://github.com/jonhararagi/botarquitecto/actions/runs/38049197793) falló en `bridge/tests/validation.test.mjs` porque un contrato estático esperaba la llamada antigua a `failSession()` sin token. La sintaxis pasó; las suites dinámicas no se ejecutaron en ese run. Se ajustó el contrato para exigir el token de ejecución. Esto fue un desajuste de la prueba estática tras el cambio de firma, no evidencia de que las pruebas A/B/C fallaran.
- **Corrección del contrato:** commit `69a29da8b2837f3b495ded81b4cf9941ef05bd98`. CI posterior para el SHA final aún pendiente de consulta; no marcar PASS hasta verificarlo.


- **CI de código y regresiones:** GitHub Actions [run 38049251019](https://github.com/jonhararagi/botarquitecto/actions/runs/38049251019), `success` en SHA exacto `0627b0a207a3f130b73f81c543bc9106854918fe`. Pasaron sintaxis, contratos estáticos, suite dinámica del worker real en Node `vm` y timeout del content script con reloj simulado. Las tres pruebas nuevas A/B/C están incluidas en esa suite dinámica.
- **Alcance de evidencia:** Node mocks, no Chromium. No se validan suspensión natural MV3 ni cancelación del polling. La anotación documental actual genera un SHA nuevo; comprobar también Actions en el HEAD final de documentación antes del cierre.


## BRIDGE-007 — persistencia concurrente (CI pendiente)

- `saveState()` ahora serializa las escrituras con un único escritor activo y agrupa solicitudes pendientes en batches. Se eliminó la reparación recursiva por revisión obsoleta.
- Pruebas dinámicas añadidas: escrituras solapadas y coalescencia (3 solicitudes / 2 escrituras), STOP mientras una escritura antigua está pendiente (STOPPED es el estado persistido final), y rechazo de storage con propagación del error y recuperación mediante una solicitud posterior.
- El error de una escritura se devuelve a sus propios llamadores; no se reintenta automáticamente. La cola es volátil y no añade campos al esquema. Si el worker termina antes de persistir una solicitud, se aplica la recuperación conservadora existente al reiniciar.
- Estado actual: `PARTIAL` hasta verificar CI en el SHA final exacto. Pruebas locales no ejecutadas; Chrome/Brave real y suspensión natural MV3 siguen pendientes. No se modifican `content.js`, permisos ni dependencias. PR #6 abierto, sin merge.
- TIMER: tiempo medido no disponible; 30–90 min estimados para CI/correcciones y 1–2 h para validación manual si hay navegador. Estabilización BRIDGE: 3–7 días, confianza baja.


### BRIDGE-007 — checkpoint automatizado

- CI de código: [run 38050951438](https://github.com/jonhararagi/botarquitecto/actions/runs/38050951438) pasó en el SHA exacto `039e00987e3e3323e3af0a1fe9002f6790bf2e8a`. Los cuatro checks de sintaxis y las tres suites de pruebas pasaron.
- Dos ejecuciones previas detectaron problemas en las pruebas de intercalado, no en sintaxis: una prueba antigua esperaba escrituras paralelas y otra no había iniciado la sesión. Ambas expectativas quedaron corregidas y la suite dinámica pasó en la ejecución posterior.
- La bitácora actualizada genera un SHA nuevo; consultar CI del HEAD final. Chrome/Brave real sigue pendiente. Estado BRIDGE global: `PARTIAL / NOT_READY`.


## BRIDGE-008 — contrato integrado TURN_COMPLETE

- Entrada: rama `worker/bridge-001-validation`, HEAD `532aaadbcc876f7496295b74e56a88100ea8f91d`; main `525cf1a5b666a95f1389a26a3f8d3282b17f10fc`; PR #6 abierto y sin merge. CI de entrada: run 38051025430, success sobre el SHA de entrada.
- Diagnóstico: `dispatchTurn()` ya propagaba `sessionId` en `START_TURN`, pero ambas rutas de `runTurn()` omitían `sessionId` en `TURN_COMPLETE`. El worker permitía que cualquiera de las dos pestañas enviara resultados de cualquier rol y respondía `ok: true` aunque el job obsoleto se ignorara.
- Corrección: propagar la identidad original en un único reporte terminal; validar sesión, job, rol permitido, booleano `ok`, job/rol activos y coincidencia exacta entre `sender.tab.id` y pestaña asignada al rol. Un rechazo de entrega no genera un segundo reporte y se registra separado del error de respuesta.
- Chromium adjunta `sender.tab.id` como metadato al worker; el content script no lo falsifica.
- Suite integrada añadida al workflow para éxito, fallo DOM controlado, identidad inválida/duplicada y respuesta posterior a STOP. Resultado definitivo pendiente de CI del SHA final exacto.
- Chromium/Brave real, suspensión natural MV3 y cancelación cooperativa: `NOT_RUN`; BRIDGE sigue `PARTIAL / NOT_READY` hasta validar navegador real.
- TIMER: tiempo medido no disponible; 2–5 h estimadas para esta tarea, 1–2 h adicionales para navegador real; estabilización BRIDGE 3–7 días, confianza baja.


- BRIDGE-008 checkpoint: run [38055411681](https://github.com/jonhararagi/botarquitecto/actions/runs/38055411681) falló en sintaxis de la suite estática por una expresión regular mal escapada; no ejecutó suites dinámicas. Corregida la aserción para usar comprobaciones literales. Se actualizan expectativas previas para que jobs antiguos sean rechazados explícitamente, y se amplía D para comprobar que un job nuevo permanece intacto frente a una respuesta del job anterior. CI posterior pendiente.


- BRIDGE-008 checkpoint: run [38055617828](https://github.com/jonhararagi/botarquitecto/actions/runs/38055617828) pasó sintaxis y contratos estáticos, pero detectó una expectativa antigua en la prueba de recuperación tras reinicio: el test esperaba `ok: true` para un job obsoleto. Se alinea con el nuevo contrato de rechazo explícito. Las pruebas dinámicas restantes de esa ejecución pasaron; el siguiente run debe validar el ajuste y la suite integrada.


- BRIDGE-008 checkpoint: run [38055666417](https://github.com/jonhararagi/botarquitecto/actions/runs/38055666417) pasó sintaxis, contratos estáticos, suite dinámica del worker y timeout del content script, pero la nueva prueba integrada no observó el reporte terminal dentro del bucle de ticks. Se cambia el avance del reloj simulado a `runAll()` para drenar de forma determinista los timers pendientes; no se atribuye el fallo a producción sin aislarlo. Nueva CI pendiente.
