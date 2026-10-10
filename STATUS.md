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
