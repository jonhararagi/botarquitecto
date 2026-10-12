# Bitácora de trabajo

## 2026-10-10 — BRIDGE governance baseline

- **HEAD BEFORE:** `e49419bfb6e29b0bd20e734e01712d291f10e770`
- **Cambios persistidos:**
  - `cerebro/INSTRUCCIONES.md` — protocolo de dirección, evidencia, seguridad y licencias.
  - `STATUS.md` — línea base, riesgos y próxima tarea.
  - `ROADMAP.md` — hitos de calidad y criterios de release.
- **Commits:** `f3407963a33c5425c0f89253e38fef92fbef672d`, `1c9d535de7910ae64a541df0c6612ab48ef859bf`, `8a21f3e088da87675af0b5839fc3e7b466501c5d`.
- **HEAD AFTER esperado al cerrar este ciclo:** `8a21f3e088da87675af0b5839fc3e7b466501c5d`; volver a consultar GitHub antes de asumir que sigue siendo HEAD.
- **Verificación:** `PASS_STATIC` para existencia y contenido devuelto por la API de GitHub. `NOT_RUN` para tests automatizados, CI y navegador. No se modificó el código de la extensión.
- **Resultado:** documentación de continuidad inicial persistida; no es un release ni certifica preparación de producción.
- **TIMER:** documentación 20–40 min; tarea técnica siguiente 2–4 h de implementación, 1–2 h pruebas automatizadas y 30–60 min de validación de navegador si el entorno está disponible.

## Formato de próximas entradas

Cada entrada debe registrar fecha, ID de tarea, HEAD BEFORE/AFTER, archivos, commits, comandos ejecutados, evidencia etiquetada, limitaciones, TIMER y una sola siguiente tarea.

## 2026-10-10 — BRIDGE-001 initial validation foundation

- **HEAD BEFORE:** `525cf1a5b666a95f1389a26a3f8d3282b17f10fc` (main snapshot used to create branch).
- **Branch:** `worker/bridge-001-validation`.
- **Cambios de código:** `bridge/tests/validation.test.mjs`, `.github/workflows/bridge-validation.yml`, corrección de `createSessionObject()` inexistente a `createSessionModel()` en `bridge/service-worker.js`.
- **Objetivo:** establecer validación reproducible sin dependencias externas y detectar regresiones contractuales clave.
- **Evidencia:** `PASS_STATIC` inspección de fuentes y manifiesto. `PASS_REAL` GitHub Actions run [38025331572](https://github.com/jonhararagi/botarquitecto/actions/runs/38025331572), conclusión `success`; los pasos de sintaxis y pruebas de contrato terminaron con éxito en SHA `11ad7befd54e89196c7e4526da8ff98554187561`. `NOT_RUN` prueba manual de navegador.
- **Documentación de seguimiento:** `STATUS.md` reconciliado con la evidencia y los riesgos actuales; `README.md` documenta los comandos reproducibles; `ROADMAP.md` marca únicamente la suite inicial y CI como completadas y enlaza el run verificado. Commits de sincronización: `5d572658bc9e3d7ecc633ffa958de5ecec9e8a28`, `3ce83d1d11049344085fecddf16f565a577fd117`, `6422cbe92c2b9821c25f46bb053e0559121abcc0` y `02c903dc404e04ec72d5f445404af7664eb59898`.
- **Limitaciones:** los tests actuales comprueban contratos mediante inspección de código; no ejecutan todavía el bucle de sesiones con mocks ni verifican concurrencia real en navegador. El PR #6 continúa abierto y no está integrado en `main`.
- **Licencias/activos:** no se incorporaron materiales externos ni dependencias.
- **TIMER restante estimado:** 15–30 min para revisión del diff/PR; 30–60 min para validación manual en Chrome/Brave si disponible. No hay cronómetro de tiempo invertido.
- **Siguiente tarea única:** BRIDGE-002, pruebas dinámicas de transiciones de estado y concurrencia con mocks, sin automatizar mensajes reales de ChatGPT.

## 2026-10-10 — BRIDGE-002 dynamic service-worker harness (en progreso)

- **HEAD BEFORE:** `529b840e5a6f7d4848786a393432a465666015ef` (head de PR #6 inspeccionado al inicio).
- **Objetivo:** ejecutar la lógica real de `bridge/service-worker.js` bajo Node.js con mocks controlables de Chrome; no enviar mensajes reales a ChatGPT.
- **Archivos modificados:** `bridge/tests/service-worker.dynamic.test.mjs` (nuevo), `.github/workflows/bridge-validation.yml`, `README.md`, `STATUS.md`, `ROADMAP.md` y este registro.
- **Suite dinámica añadida:** inicialización/hidratación, creación/selección/eliminación, límites, START_LOOP válido e inválido, competencia concurrente determinista por pestañas, job/remitente, respuestas obsoletas, vacías, errores y duplicadas, PAUSE/RESUME/STOP, maxIterations, rechazo de sendMessage y tabs.onRemoved.
- **Concurrencia:** la prueba mantiene bloqueada de forma determinista la primera llamada simulada a `tabs.sendMessage` después de que la sesión marque `running`; intenta iniciar la segunda sesión con las mismas pestañas y exige su rechazo antes de liberar la primera llamada. No se afirma una carrera no reproducida.
- **Correcciones de producción:** ninguna aplicada todavía; los casos actuales no justifican modificar la máquina de estados sin evidencia de una regresión.
- **Comandos declarados para CI:** `node --check` de los cuatro scripts; `node --test bridge/tests/validation.test.mjs`; `node --test bridge/tests/service-worker.dynamic.test.mjs`. No se ha ejecutado localmente en este entorno.
- **Evidencia actual:** `PASS_STATIC` inspección de los archivos y del harness. `NOT_RUN` resultado de CI para el nuevo SHA: la consulta de estados/runs aún no devuelve evidencia; no declarar la suite dinámica como PASS_REAL hasta verificar el run. `NOT_RUN` Chrome/Brave manual, suspensión/reinicio real del service worker.
- **Commits BRIDGE-002 observados:** `f06bcc46b71cdee4a234739aeda0fdc19cd025b3` (suite inicial), `4138085f65b93c35fd1f90092c3e59f99ef3ef47` (CI separa contratos y dinámica), `98dd2610512424a3328884fa7d67eb28fe419ffc` (README), `3a77fe98b3a1112f159e245c20c7f7ebc3bb947b` (STATUS), `11d4fff2a26f2fb9800b570f6fbe115606538cf5` (concurrencia determinista), `ada0c7fe780e4638ebd90941ceacf5612932c9b9` (aislamiento de hidratación inicial) y `b3b6d5386d868d4360f225c7b62fb7d85b8c8160` (ROADMAP).
- **Limitaciones:** el VM no reproduce el ciclo de vida del service worker Chromium, timers reales ni DOM de ChatGPT. La expiración/timeout del content script no se prueba como timeout real; tampoco la respuesta recibida tras una expiración real. La prueba de pestaña cerrada sí invoca el listener de `tabs.onRemoved`.
- **TIMER:** tiempo invertido medido no disponible. Estimación restante 1–2 h para validar CI, corregir fallos y reconciliar documentación, más 30–60 min para navegador manual si está disponible.

## 2026-10-10 — BRIDGE-002 verification checkpoint

- **MAIN SHA observado:** `525cf1a5b666a95f1389a26a3f8d3282b17f10fc`.
- **HEAD BEFORE a esta reconciliación documental:** `e1405f1127e05c13260e639f21f1951c896a0fb6`; PR #6 abierto, base `main`, sin merge, compare `main...worker/bridge-001-validation` = 25 commits ahead / 0 behind.
- **Archivos inspeccionados:** `bridge/service-worker.js`, `bridge/content.js`, `bridge/tests/validation.test.mjs`, `bridge/tests/service-worker.dynamic.test.mjs`, `.github/workflows/bridge-validation.yml`, README, STATUS y ROADMAP.
- **Comandos ejecutados en CI (Node 22):** `node --check bridge/service-worker.js`, `node --check bridge/content.js`, `node --check bridge/control.js`, `node --check bridge/popup.js`, `node --test bridge/tests/validation.test.mjs`, `node --test bridge/tests/service-worker.dynamic.test.mjs`. Resultado de los pasos de GitHub Actions: todos `success` en [run 38033318280](https://github.com/jonhararagi/botarquitecto/actions/runs/38033318280).
- **Evidencia:** `PASS_REAL` para la ejecución de CI y el harness dinámico que evalúa el archivo real `service-worker.js` bajo Node `vm` con mocks de Chrome. `PASS_STATIC` para inspección de fuentes, manifiesto y workflow. `NOT_RUN` ejecución local, navegador manual, suspensión/reinicio real de MV3 y timeout real.
- **Cobertura dinámica:** hidratación inicial y persistida, selección/creación/eliminación, no eliminar sesión activa ni última sesión, inicio válido e inválido, clamps de configuración, intento de inicio duplicado, competencia determinista por pestañas, job/remitente, respuesta obsoleta, respuesta vacía/fallida/duplicada, PAUSE/RESUME/STOP y repetición de controles, límite de iteraciones, rechazo de `tabs.sendMessage` y cierre de pestaña.
- **Concurrencia:** el intercalado controlado comprueba que la segunda sesión se rechaza cuando la primera ya reservó `running` y alcanzó la llamada de envío. No prueba el scheduler de Chromium ni una carrera entre workers; la sección síncrona de comprobación y reserva no cede el event loop de JavaScript.
- **Defectos/correcciones:** no se cambió lógica de producción en BRIDGE-002; los casos ejecutados no justificaron una corrección de máquina de estados. La corrección previa de la fábrica `createSessionObject` pertenece a BRIDGE-001.
- **Limitaciones:** el service worker no implementa watchdog de timeout propio; el timeout del turno depende del content script y no se probó su expiración con reloj simulado. Falta comprobar respuesta después de timeout, respuesta durante pausa en todos los caminos, mensaje con marcador, reanudación después de reinicio, Chrome/Brave real y recuperación tras suspensión.
- **Documentación sincronizada:** `STATUS.md` (commit `3716913873819ecee257c1e4e9a89668cf05639a`) y `ROADMAP.md` (commit `b981741f8678cb980b31a4d060450ba06c6d0ac1`) apuntan al run más reciente verificado y conservan pendiente la validación de navegador/timeout.
- **TIMER:** tiempo invertido medido no disponible. Estimación restante para revisión de BRIDGE-002: 30–60 min de revisión de diff y decisión del BOT CEREBRO, más 30–60 min para navegador manual si hay entorno disponible. Estabilización total de BRIDGE: 3–7 días de trabajo concentrado, confianza baja.
- **Siguiente tarea única sugerida:** BRIDGE-003 — prueba de ciclo de vida MV3 en Chrome/Brave, incluidos suspensión/reinicio y recuperación sin reenvíos duplicados.


## 2026-10-10 — BRIDGE-003 recuperación MV3 y expiración segura (en progreso)

- **MAIN SHA inicial:** `525cf1a5b666a95f1389a26a3f8d3282b17f10fc`.
- **Rama:** `worker/bridge-001-validation`.
- **HEAD de rama observado al iniciar:** `bfb4e9bc1ca0c7ef4c07658c282b5bea8f708e2a` (checkpoint BRIDGE-002 anterior; se debe volver a resolver el SHA final en GitHub).
- **PR:** #6 abierto, base `main`; no se hizo merge ni se escribió en `main`.
- **Diagnóstico confirmado:** `hydrate()` restauraba sesiones persistidas sin reconciliar `running`/ `activeJobId`; `content.js` ya usa un deadline en `waitForCompletedResponse`, pero no tenía prueba determinista de expiración; `TURN_COMPLETE` se valida contra el job activo, por lo que la respuesta de un job ya invalidado no debe mutar la sesión.
- **Decisión:** recuperación conservadora. Si la sesión parece activa tras inicialización nueva, limpiar la identidad del job, detenerla y registrar `ERROR` por resultado ambiguo sin reenviar. Mantener pausada una sesión que no tiene job pendiente. Preservar historial y sesiones inactivas/finalizadas/detenidas. Normalizar objetos incompletos y reparar `activeSessionId`.
- **Archivos modificados:** `bridge/service-worker.js`, `bridge/tests/service-worker.dynamic.test.mjs`, nuevo `bridge/tests/content.timeout.test.mjs`, `.github/workflows/bridge-validation.yml`, `STATUS.md`, `ROADMAP.md`, `README.md` y este archivo.
- **Pruebas añadidas:** ejecución del service worker real en un nuevo contexto `vm` con el mismo snapshot de almacenamiento; sin replay de turno ambiguo; respuesta vieja tras reinicio; sesión pausada sin job; estado finalizado sin reprocesar; timeout reportado al worker y respuesta tardía ignorada; duplicado del mismo `jobId`; reparación de sesión incompleta; timeout del content script real con reloj simulado.
- **Commits BRIDGE-003 observados:** `21311645debbbecac58da5a6032160178ab79787` (recuperación conservadora), `1f415e7b1f131401083be74aeb01a738d3941ed3` (sesión pausada), `10a48b307ddc31682221159b7ceb04fec33cebdd` (tests de reinicialización), `a865c4f63e07ae414fea7c1e207c2d823956ee3d` (test de timeout real con reloj simulado), `fbcb0fcede545f76d07c78fc609bf69e127407dc` (workflow), `2619efe77d03decf7bd58d56bdca8263e88e1a90` (normalización de storage), `a8451240d7592c20148818a434f9e47b3aca0c44` (casos adicionales), `78eff0bf44d403d4f387221d9f249064c642d858` (STATUS), `cefbdd31d8fa155b2ce89978ebeb92906d34bf6f` (ROADMAP), `09fcab4629565d0035dafa50d65ba782b576f82e` (README).
- **Verificación:** `PASS_STATIC` inspección del código remoto y archivos. `NOT_RUN` ejecución local y CI para el SHA final; los tests nuevos aún necesitan resultado de Actions. `NOT_RUN` validación gráfica Chrome/Brave, suspensión natural del worker, recarga y reinicio real de navegador.
- **Limitación:** STOP invalida el job en el service worker, pero no aborta directamente el polling/generación ya iniciados en la pestaña. El worker ignora la respuesta obsoleta, pero el content script puede quedar ocupado hasta timeout. Se deja explícito; no se añade un watchdog ni permisos nuevos.
- **Comandos requeridos en CI:** `node --check bridge/service-worker.js`, `node --check bridge/content.js`, `node --check bridge/control.js`, `node --check bridge/popup.js`, `node --test bridge/tests/validation.test.mjs`, `node --test bridge/tests/service-worker.dynamic.test.mjs`, `node --test bridge/tests/content.timeout.test.mjs`. No se afirma que se hayan ejecutado localmente.
- **TIMER:** tiempo invertido medido no disponible. Estimación restante 1–3 h para CI y correcciones; 1–3 h adicionales para navegador si está disponible. Estabilización total BRIDGE: 3–7 días, confianza baja.
- **Siguiente tarea única recomendada:** BRIDGE-004 — validar en Chrome/Brave real el ciclo de vida MV3 y decidir con evidencia si STOP necesita cancelación activa del content script.


## 2026-10-10 — BRIDGE-003 verificación CI posterior a cambios

- **SHA exacto validado:** `dfa5a00fbb46061d6a5e39be633716bd3536ef59`.
- **Evidencia:** `PASS_REAL` GitHub Actions [run 38035650008](https://github.com/jonhararagi/botarquitecto/actions/runs/38035650008), conclusión `success` sobre ese SHA. El workflow ejecutó comprobaciones de sintaxis, contratos estáticos, pruebas dinámicas del service worker y prueba del content script con reloj simulado.
- **Importante:** esta CI valida la suite automatizada en Node, no suspensión natural ni reinicio real de Chromium. No se ejecutaron pruebas locales ni navegador gráfico; ambos siguen `NOT_RUN`.
- **Estado:** automatización verificada para el SHA indicado; BRIDGE-003 continúa parcial por validación de navegador y limitación de cancelación al recibir STOP.


## 2026-10-10 — BRIDGE-004 inspección y protocolo manual (PARTIAL)

- **HEAD BEFORE:** `69626bcaf814a4b5f00e482f8ba75fa9f396233d`; consultado directamente en GitHub. La rama `worker/bridge-001-validation` y PR #6 coincidían en ese SHA al iniciar.
- **MAIN SHA:** `525cf1a5b666a95f1389a26a3f8d3282b17f10fc`.
- **PR #6:** abierto, no fusionado. Consulta de revisiones e hilos: ninguno registrado en el momento de inspección.
- **Archivos inspeccionados:** `bridge/manifest.json`, `bridge/service-worker.js`, `bridge/content.js`, `bridge/control.js`, `bridge/popup.js`, `bridge/tests/validation.test.mjs`, `bridge/tests/service-worker.dynamic.test.mjs`, `bridge/tests/content.timeout.test.mjs`, `.github/workflows/bridge-validation.yml`, `STATUS.md`, `ROADMAP.md`, `README.md` y esta bitácora.
- **CI al entrar:** `PASS_REAL`, run [38035719789](https://github.com/jonhararagi/botarquitecto/actions/runs/38035719789), `success` en el SHA exacto `69626bcaf814a4b5f00e482f8ba75fa9f396233d`. Los comandos de sintaxis y suites automatizadas constan en el workflow. No se afirma ejecución local.
- **Entorno navegador:** `NOT_RUN`. El conector Opera respondió `Browser not connected`; el entorno de shell tampoco pudo resolver `github.com` al intentar consultar Git remotamente. No se pudo cargar una extensión unpacked ni inspeccionar una instalación real de Chrome/Brave.
- **Revisión estática:** `PASS_STATIC`. El manifiesto declara MV3 y `service-worker.js`; el worker invalida el job en STOP y filtra respuestas según el job activo. El content script mantiene polling de respuesta con deadline y no se encontró un handler explícito de cancelación de polling por STOP. Esta lectura no equivale a observación en navegador.
- **Cambios de producción:** ninguno; no hay defecto Chromium reproducido y no se introducen cambios preventivos.
- **Documentación:** se añade `docs/qa/BRIDGE-004-CHROMIUM-MANUAL.md` con precondiciones, resultados esperados y separación entre suspensión natural, recarga manual, cierre de pestaña, reinicio de navegador y reinicialización Node.
- **Verificación de este ciclo:** la CI previa sigue siendo válida solo para el SHA de entrada. La actualización documental debe disparar/recibir una ejecución de CI sobre el nuevo SHA antes de considerar verificada esa revisión final. No se ejecutaron comandos Node localmente.
- **Limitación/decisión:** el objetivo central de BRIDGE-004 sigue bloqueado por falta de navegador real. Estado `PARTIAL / NOT_READY`; PR #6 sigue abierto, sin merge y sin escritura en `main`.
- **TIMER:** tiempo invertido medido no disponible. Estimación restante 1–3 h de prueba manual con navegador conectado, más 30–60 min de reconciliación de evidencias y CI. Estimación de estabilización BRIDGE: 3–7 días de trabajo concentrado, confianza baja.
- **Siguiente tarea única:** ejecutar el protocolo manual de BRIDGE-004 en Chrome o Brave real y aportar los resultados técnicos sin datos privados.


### BRIDGE-004 — checkpoint de CI para el protocolo documental

- **SHA validado:** `c7772931d5152da0922765f552cafcbff4761802`.
- **Evidencia:** `PASS_REAL`, [GitHub Actions run 38036355246](https://github.com/jonhararagi/botarquitecto/actions/runs/38036355246), conclusión `success` sobre el SHA exacto. Los siete pasos de sintaxis, contratos estáticos, pruebas dinámicas y timeout con reloj simulado terminaron en `success`.
- **Alcance:** CI automatizada Node. No prueba Chrome/Brave real, suspensión natural MV3, reinicio del navegador ni polling real tras STOP.
- **Estado:** BRIDGE-004 sigue `PARTIAL / NOT_READY` hasta ejecutar la validación real descrita en `docs/qa/BRIDGE-004-CHROMIUM-MANUAL.md`.


## 2026-10-10 — BRIDGE-005 auditoría STOP/cancelación cooperativa (diseño solamente)

- **HEAD BEFORE:** `565beccaee678f2e3a75cc386250b9aa58c4043a`; rama y PR #6 verificados antes de escribir. `main` observado en `525cf1a5b666a95f1389a26a3f8d3282b17f10fc`; PR abierto, sin merge.
- **Commit documental inicial:** `5acc503abf1715b789737cb66d2d3f1284090003`, añade `docs/qa/BRIDGE-005-STOP-CANCELLATION-DESIGN.md`.
- **Fuentes inspeccionadas:** `bridge/service-worker.js` (hydrate, dispatchTurn, failSession, finishTurn y listeners de START_LOOP/PAUSE/RESUME/STOP/TURN_COMPLETE/tabs.onRemoved), `bridge/content.js` (waitForInput, waitForSendButton, waitForCompletedResponse, sendAndWait, runTurn y listener START_TURN), `bridge/control.js`, `bridge/popup.js`, `bridge/tests/validation.test.mjs`, `bridge/tests/service-worker.dynamic.test.mjs`, `bridge/tests/content.timeout.test.mjs`, `bridge/manifest.json`, workflow, STATUS y ROADMAP.
- **Diagnóstico estático:** el content script no tiene un handler CANCEL y el polling solo termina por resultado/deadline. STOP invalida el job en el worker pero no notifica a la pestaña. Además, `dispatchTurn()` puede reanudar después de `await ensureTabAlive()` y escribir el job sin revalidar estado; `finishTurn()` también tiene escrituras posteriores a awaits tras su guard inicial. Son riesgos de intercalado demostrados por estructura de código, pendientes de reproducción determinista.
- **Diseño documentado:** identidad `sessionId + jobId + tabId + role`, cancelación cooperativa idempotente, validación de estado tras awaits, resultados tardíos ignorados, fallos de mensajería marcados como no confirmados y recuperación MV3 conservadora sin replay automático. Incluye tabla de transiciones y 11 casos de prueba con clasificación Node/Chromium.
- **Cambios de producción/dependencias/permisos:** ninguno. No se cambió la semántica de PAUSE/RESUME/STOP. No se enviaron mensajes reales a ChatGPT.
- **Evidencia:** `PASS_STATIC` para lectura remota; `PASS_REAL` solo para la CI histórica del SHA de entrada `565beccaee678f2e3a75cc386250b9aa58c4043a` (run 38036415703, success según estado previo del PR); `NOT_RUN` para tests nuevos, ejecución local, navegador real y suspensión natural MV3. La CI histórica no valida este commit documental.
- **HEAD AFTER inicial:** `5acc503abf1715b789737cb66d2d3f1284090003`; reconciliar HEAD final y CI de la documentación al terminar.
- **Estado:** `PARTIAL / DESIGN_ONLY`, no listo para producción.
- **TIMER:** tiempo medido no disponible; auditoría/documentación estimada 2–4 h (confianza media); implementación futura si se autoriza 2–6 h iniciales (confianza baja); estabilización BRIDGE 3–7 días de trabajo concentrado (confianza baja).
- **Siguiente tarea única:** preparar tests deterministas de los intercalados STOP/dispatchTurn/finishTurn antes de implementar cancelación de producción.


## 2026-10-10 — BRIDGE-006 STOP interleavings and worker guards

- **HEAD de entrada declarado:** `b0711cbb2d19a5ab706c04f1f718ff1784b584c9`. La inspección remota confirmó ese SHA en la rama antes de iniciar los cambios; `main` permanece en `525cf1a5b666a95f1389a26a3f8d3282b17f10fc`. PR #6 abierto, sin merge.
- **Limitación del entorno:** se intentó `git clone` para ejecutar las pruebas localmente, pero el entorno no pudo resolver `github.com`. No se afirma ejecución local. La validación automatizada queda a cargo de GitHub Actions.
- **Reproducción añadida al arnés real Node `vm`:** (A) STOP mientras `tabs.get()` está diferido, seguido de excepción tardía; (B) STOP mientras la persistencia de un resultado está diferida en `finishTurn()`; (C) STOP y nuevo START antes de liberar la espera del trabajo anterior, caso ABA. Las barreras son promesas diferidas, sin `setTimeout()`.
- **Corrección de producción:** `bridge/service-worker.js` añade una identidad de ejecución solo en memoria por sesión, la invalida con STOP y la reemplaza con cada START. `dispatchTurn()` revalida tras `ensureTabAlive()`, persistencia, log y antes/después del envío; los errores de una ejecución invalidada no pueden marcar ERROR en una ejecución posterior. `finishTurn()` vuelve a validar tras las escrituras asíncronas antes de avanzar iteration/lastForwarded o despachar el siguiente rol.
- **Persistencia:** `saveState()` serializa un snapshot y detecta escrituras que terminaron obsoletas; si una escritura antigua termina después de una mutación más reciente, vuelve a persistir el estado actual. No se añade un campo al esquema persistido.
- **Arnés:** `bridge/tests/service-worker.dynamic.test.mjs` permite controlar `tabs.get()` y una operación de storage por invocación; las pruebas nuevas ejecutan el service worker real y no exportan funciones privadas ni añaden hooks a producción.
- **Mensajes reales/alcance:** no se añade `CANCEL_TURN`, no se modifica `bridge/content.js`, no se cambian permisos ni dependencias y no se envían prompts reales a ChatGPT.
- **Comprobación local:** `NOT_RUN` por falta de acceso DNS/red a GitHub; los comandos locales requeridos no se reportan como ejecutados. Consultar Actions sobre el SHA final antes de marcar la regresión automatizada como PASS.
- **Chromium real:** `NOT_RUN`; el VM Node no demuestra suspensión natural/reactivación MV3 ni cancela el polling de content script.
- **Commits de código/tests:** `155937c184c170b7b1febfff6a6c9920383aadb6` (identidad y guardas del worker), `7d716afcac7282c6a07ab14ff356400978b9b6d2` (reparación de persistencia obsoleta), `e66b482d7bb4f8b850f46e95cce4955ef52cf415` (pruebas A/B/C).
- **Estado provisional:** `PARTIAL` hasta verificar CI en el SHA final exacto. PR #6 continúa abierto y sin merge; no se escribió en `main`.
- **TIMER:** tiempo real medido no disponible. Estimación restante: 30–90 min para CI, corregir fallos y reconciliar evidencias; 1–3 h adicionales para navegador real si se dispone de Chrome/Brave. Estabilización BRIDGE: 3–7 días de trabajo concentrado, confianza baja.
- **Siguiente tarea única:** revisar el resultado de CI en el SHA final y corregir únicamente los fallos que reproduzca esa suite antes de iniciar la tarea separada de cancelación cooperativa.


- **Checkpoint CI intermedio:** run [38049197793](https://github.com/jonhararagi/botarquitecto/actions/runs/38049197793) falló en `bridge/tests/validation.test.mjs` porque un contrato estático esperaba la llamada antigua a `failSession()` sin token. La sintaxis pasó; las suites dinámicas no se ejecutaron en ese run. Se ajustó el contrato para exigir el token de ejecución. Esto fue un desajuste de la prueba estática tras el cambio de firma, no evidencia de que las pruebas A/B/C fallaran.
- **Corrección del contrato:** commit `69a29da8b2837f3b495ded81b4cf9941ef05bd98`. CI posterior para el SHA final aún pendiente de consulta; no marcar PASS hasta verificarlo.


- **CI de código y regresiones:** GitHub Actions [run 38049251019](https://github.com/jonhararagi/botarquitecto/actions/runs/38049251019), `success` en SHA exacto `0627b0a207a3f130b73f81c543bc9106854918fe`. Pasaron sintaxis, contratos estáticos, suite dinámica del worker real en Node `vm` y timeout del content script con reloj simulado. Las tres pruebas nuevas A/B/C están incluidas en esa suite dinámica.
- **Alcance de evidencia:** Node mocks, no Chromium. No se validan suspensión natural MV3 ni cancelación del polling. La anotación documental actual genera un SHA nuevo; comprobar también Actions en el HEAD final de documentación antes del cierre.


## 2026-10-10 — BRIDGE-007 persistencia concurrente serializada

- **SHA de entrada declarado y confirmado en PR antes de cambios:** `b2ceab3e688bc3774c93025e46db417998d2ea72`. **MAIN SHA:** `525cf1a5b666a95f1389a26a3f8d3282b17f10fc`. PR #6 abierto y sin merge.
- **Diagnóstico de la estrategia anterior:** `saveState()` lanzaba cada `storage.local.set()` en paralelo y, al detectar una revisión obsoleta, invocaba recursivamente `saveState()`. Si varias escrituras terminaban fuera de orden, podían disparar reparaciones adicionales; cada reparación era una nueva escritura no serializada. Además, el rechazo de una escritura impedía ejecutar la reparación y se propagaba, pero no existía una cola recuperable para solicitudes posteriores. El arnés previo no demostraba un ciclo infinito real, así que no se registra una reproducción de infinito.
- **Diseño elegido:** cola en memoria con un único escritor activo y coalescencia de las solicitudes pendientes. Cada batch captura una instantánea al comenzar la escritura; las llamadas que llegan durante esa escritura esperan en el batch siguiente y pueden compartir una sola escritura con el estado más reciente. No se añaden campos al esquema persistido ni dependencias/permisos.
- **Orden reproducido A:** PAUSE inicia la escritura 1 y queda diferida; STOP y SELECT_SESSION se solicitan mientras la primera escritura sigue pendiente; la escritura 1 termina con PAUSED; la escritura 2 guarda STOPPED. Resultado esperado y probado por el arnés: 3 solicitudes, 2 escrituras físicas, almacenamiento final STOPPED y ningún retorno exitoso de STOP antes de que termine la escritura terminal.
- **Orden reproducido B:** una escritura antigua queda pendiente, STOP muta el estado en memoria y se encola; al liberar la antigua se escribe primero PAUSED y después STOPPED. La prueba compara memoria y almacenamiento, confirma `running=false`, `stopRequested=true`, `activeJobId=null`, `activeRole=null` y exactamente 2 escrituras, sin reparación recursiva.
- **Orden reproducido C:** el primer `storage.local.set()` rechaza con un error determinista; el llamador recibe el error. Una solicitud STOP ya encolada se ejecuta después y persiste STOPPED. No hay reintento automático de la operación fallida ni ocultación de su rechazo; una llamada futura inicia una nueva cadena recuperada.
- **Coste y límites:** una escritura física como máximo activa; solicitudes concurrentes pendientes se agrupan en un batch; no hay recursión. Las solicitudes continuas pueden requerir sucesivos batches si llegan mientras cada escritura ya está activa, pero no crean escritores paralelos. La cola es deliberadamente volátil: si MV3 termina el worker, se pierde la cola en memoria y la próxima hidratación aplica la recuperación conservadora ya existente; no se promete persistencia de solicitudes que aún no llegaron a storage.
- **Archivos de código/pruebas:** `bridge/service-worker.js` reemplaza `saveRevision` y la reparación recursiva por la cola; `bridge/tests/service-worker.dynamic.test.mjs` añade tres pruebas deterministas de orden/coalescencia, STOP y fallo/recuperación; `bridge/tests/validation.test.mjs` protege el contrato estático contra el regreso de la recursión.
- **Regresión solicitada:** ejecutar en CI los cuatro `node --check` y tres comandos `node --test` del encargo. No se afirma ejecución local. Chromium/Brave real, suspensión natural MV3 y reinicialización del worker durante una escritura continúan `NOT_RUN`.
- **Evidencia CI:** pendiente de consultar el run asociado al SHA final de este cambio documental. No declarar PASS hasta confirmar la conclusión y el SHA exacto en Actions.
- **TIMER:** tiempo medido no disponible. Estimación restante para CI, correcciones y reconciliación: 30–90 min; Chrome/Brave manual: 1–2 h si hay navegador disponible. Estabilización BRIDGE estimada: 3–7 días concentrados, confianza baja.
- **Siguiente tarea única:** revisar la CI sobre el SHA final y corregir únicamente cualquier fallo reproducido por esa suite; después, validar el protocolo manual MV3 en Chrome/Brave real.


### BRIDGE-007 — regresión corregida y CI del código

- **Primera ejecución:** [run 38050753968](https://github.com/jonhararagi/botarquitecto/actions/runs/38050753968) detectó que la prueba BRIDGE-006 esperaba una escritura STOP paralela y quedaba bloqueada con la nueva cola serializada. Se adaptó la prueba para observar el estado en memoria, liberar la barrera y esperar las dos operaciones.
- **Segunda ejecución:** [run 38050849619](https://github.com/jonhararagi/botarquitecto/actions/runs/38050849619) mostró dos expectativas incorrectas en los nuevos casos: las sesiones de prueba no estaban activas, por lo que PAUSE conservaba `IDLE`. Se cambió la preparación para iniciar cada sesión antes de armar el mock de storage.
- **CI de código exitosa:** [run 38050951438](https://github.com/jonhararagi/botarquitecto/actions/runs/38050951438), conclusión `success`, SHA exacto `039e00987e3e3323e3af0a1fe9002f6790bf2e8a`. Pasaron sintaxis de JS, contratos estáticos, suite dinámica del worker real bajo Node VM con mocks de Chrome y timeout real del content script con reloj simulado.
- **Comandos cubiertos por el workflow:** `node --check bridge/service-worker.js`, `node --check bridge/content.js`, `node --check bridge/control.js`, `node --check bridge/popup.js`, `node --test bridge/tests/validation.test.mjs`, `node --test bridge/tests/service-worker.dynamic.test.mjs`, `node --test bridge/tests/content.timeout.test.mjs`. Se ejecutaron en GitHub Actions, no localmente.
- **Importante:** el SHA de CI anterior valida el código y las pruebas. Esta actualización documental produce un SHA posterior; consultar Actions sobre el HEAD final antes de cerrar BRIDGE-007.


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


- BRIDGE-008 checkpoint: run [38055735149](https://github.com/jonhararagi/botarquitecto/actions/runs/38055735149) volvió a pasar sintaxis, contratos estáticos, suite dinámica y timeout. La integración aún no observó `TURN_COMPLETE`: el reloj se drenaba antes de que la cadena asíncrona inicial programara sus primeros timers. Se añade un vaciado de microtareas antes de avanzar el reloj, conservando timers simulados y sin usar sleeps reales. CI final pendiente.

### BRIDGE-008 — finalización integrada

- **HEAD de entrada declarado:** `532aaadbcc876f7496295b74e56a88100ea8f91d`. La inspección confirmó que el código ya propagaba `sessionId`, `jobId` y `role` desde `START_TURN` a `TURN_COMPLETE` en las rutas de éxito y error; el worker ya verificaba sesión, job activo, rol y pestaña asignada.
- **Cambio BRIDGE-008:** se reforzó el test integrado del content script y service worker reales en Node `vm`: se rechaza una finalización enviada desde la pestaña del rol opuesto aunque declare el rol correcto, y el caso de error verifica que el `jobId` original no esté vacío.
- **Respuesta de entrega:** el content script solo considera confirmada la entrega con `ok:true` y `accepted:true`; si el worker rechaza o la promesa falla, registra un error de entrega sin reintentos y sin convertirlo en un resultado de ChatGPT.
- **Pruebas:** integración en CI falló inicialmente porque el reloj simulado se drenaba antes de que el polling programara sus timers. Se cambió la prueba para avanzar el reloj por ticks deterministas y permitir que cada continuación asíncrona programe el siguiente polling. Resultado final pendiente de CI sobre el SHA exacto.
- **Comandos locales:** no ejecutados localmente mediante GitHub; solo se considerará evidencia de regresión la ejecución remota del workflow.
- **Limitaciones:** Chrome/Brave real, suspensión natural MV3 y cancelación cooperativa continúan `NOT RUN`.
- **TIMER:** tiempo medido no disponible. Trabajo estimado 2–5 h, validación manual 1–2 h adicionales; estabilización BRIDGE restante 3–7 días de trabajo concentrado, confianza baja.

### BRIDGE-008 — verificación CI completada
- **SHA de código verificado:** `a9bb330b0a72b054267da82729c61c8538378a29`.
- **GitHub Actions:** [run 38056070845](https://github.com/jonhararagi/botarquitecto/actions/runs/38056070845), conclusión `success` sobre ese SHA exacto.
- Pasaron sintaxis JavaScript, contratos estáticos, pruebas dinámicas del service worker, timeout del content script y test integrado content script + service worker.
- No se ejecutaron comandos Node localmente mediante esta sesión. La validación Chrome/Brave real sigue `NOT RUN`; no declarar producción lista.


## 2026-10-10 — BRIDGE-010 · corrección del handoff de respuesta y del campo Iteraciones

- **HEAD BEFORE:** `100ae19607f7f7ed4e790ebb6231ba3b598038f8`.
- **Commit de implementación:** `bd2afa070f76c105c2ed50e0f9f28dc21cffbd5f`.
- **Archivos:** `bridge/content.js`, `bridge/control.js`, `bridge/tests/turn-completion.integration.test.mjs`, `bridge/tests/validation.test.mjs`, nuevo `bridge/tests/control.iterations.test.mjs`, `.github/workflows/bridge-validation.yml`.
- **Defecto del content script:** la detección del turno terminado se bloqueaba conceptualmente en selectores de botón de copiar que cambian entre versiones de ChatGPT, pese a que el texto del turno nuevo y estable ya estaba disponible. El contenido ahora se obtiene directamente del nodo assistant exacto y no exige ese botón como precondición.
- **Defecto del panel:** el refresco de estado periódico podía sobrescribir una edición de Iteraciones antes de que quedara guardada. El panel ahora protege el borrador, guarda la configuración y sincroniza el campo con el valor persistido. La nueva prueba dinámica verifica que el valor `2` no se cambie por `10` durante el polling ni al invocar `START_LOOP`.
- **Pruebas de regresión:** la prueba integrada del content script/service worker ya no simula un botón de copiar y exige que se entregue `respuesta integrada` correctamente. Se actualizó el contrato estático para prohibir que la dependencia vuelva a introducirse. La CI incluye la nueva suite del panel.
- **Evidencia CI para el commit de código:** [run 38061367991](https://github.com/jonhararagi/botarquitecto/actions/runs/38061367991), `success`, SHA exacto `bd2afa070f76c105c2ed50e0f9f28dc21cffbd5f`. Syntax, static contracts, dynamic service-worker tests, content timeout, UI iteration regression and integrated turn-completion test all passed.
- **Chrome/Brave real:** `NOT_RUN`. Aún debe ejecutarse la prueba manual con el perfil local; no se afirma que el handoff real ya esté validado. No se creó ni integró un cambio en `main`; PR #6 continúa abierto.
- **TIMER:** parche y pruebas automatizadas completados, aprox. 1–2 h de trabajo técnico. Restan 10–20 min para sincronizar la copia local y 15–30 min para la validación manual de Chrome, sujeto a la disponibilidad actual del DOM de ChatGPT.


## 2026-10-10 — BRIDGE-011 · los campos de configuración se sobrescribían por polling

- **HEAD BEFORE:** `48a7b4c86fc12c398ea91be243056fe5ddec9123`.
- **Commit de código:** `6254a563f5b1de0f6b0fee10da3a7c8358c8f285`.
- **Archivos:** `bridge/control.js`, `bridge/tests/control.iterations.test.mjs`, `bridge/tests/validation.test.mjs`.
- **Causa:** el panel consulta estado cada 700 ms. BRIDGE-010 había protegido Iteraciones, pero `brainTimeout`, `workerTimeout`, `minTurnDelay` y `sessionName` todavía se reescribían en `render()`; por eso el timeout de OBRERO regresaba a 600 segundos.
- **Corrección:** se agregaron banderas `dirty` independientes para todos los campos editables; el refresco no pisa el borrador mientras se edita, los cambios de sesión limpian esos estados y un guardado correcto reconcilia cada campo con el valor persistido.
- **Regresión dinámica:** la prueba simula polling con cambios locales y exige que CEREBRO=45 s, OBRERO=60 s, espera mínima=3 s, Iteraciones=2 y el nombre modificado sobrevivan hasta guardar; valida los mensajes reales que la UI arma para `SAVE_SESSION` y `START_LOOP`. OBRERO debe viajar como `60000` ms.
- **CI:** [run 38062133811](https://github.com/jonhararagi/botarquitecto/actions/runs/38062133811), `success` en el SHA exacto `6254a563f5b1de0f6b0fee10da3a7c8358c8f285`. Sintaxis, contratos estáticos, pruebas dinámicas, timeout, panel y test integrado completaron correctamente.
- **Límite:** CI ejecuta las suites en Node con mocks y no confirma aún el comportamiento del perfil real de Chrome. Prueba manual final sigue `NOT_RUN`; no modificar `main` ni fusionar PR #6.
- **TIMER:** cambios y pruebas automatizadas aprox. 30–60 min de trabajo técnico; quedan sincronización local y 15–30 min de prueba E2E manual. El tiempo medido no está disponible.


## 2026-10-11 — BRIDGE-012 · los selectores de pestañas revertían las elecciones del usuario

- **HEAD BEFORE:** `90bbeb1a45de131601076ac3926e722f74bf9ac7`.
- **Commit de código:** `ea36615b94d076db1659c566fad84f44be34e301`.
- **Archivos:** `bridge/control.js`, `bridge/tests/control.iterations.test.mjs`, `bridge/tests/validation.test.mjs`.
- **Causa:** en cada polling, `render()` reconstruía las listas y `fillTabs(el, x.brainTabId, selectedBrainTabId)` daba prioridad al ID persistido, por encima de la selección recién elegida. Lo mismo pasaba con OBRERO. La interfaz podía revertir la selección y enviar roles usando pestañas antiguas.
- **Corrección:** se añaden `brainSelectionDirty` y `workerSelectionDirty`; mientras el cambio no se guarde, cada selector se vuelve a pintar usando la selección local. El cambio de sesión descarta estos borradores y un guardado exitoso limpia las banderas; el estado persistido pasa a ser la fuente de verdad después del guardado.
- **Regresión dinámica:** la prueba selecciona CEREBRO en tab ID 22 y OBRERO en tab ID 11, provoca una actualización de estado y verifica que ambos sigan distintos; también comprueba que `SAVE_SESSION` y `START_LOOP` reciban estos mismos IDs. Mantiene cobertura para nombre, iteraciones, ambos timeouts y espera mínima.
- **CI:** [run 38119587246](https://github.com/jonhararagi/botarquitecto/actions/runs/38119587246), `success` en SHA exacto `ea36615b94d076db1659c566fad84f44be34e301`. Sintaxis, contratos, worker dinámico, timeout, panel e integración pasan.
- **Prueba manual real:** `NOT_RUN` tras la corrección. Requiere actualizar la carpeta local, recargar extensión y las dos páginas ChatGPT; no se declara validación real con base en Node/mocks.
- **TIMER:** arreglo y CI 30–60 min estimados; restan 5–10 min de sync local y 10–20 min de prueba manual. Medición real de tiempo no disponible.


## 2026-10-11 — BRIDGE-013 · botón de envío no encontrado o deshabilitado

- **HEAD BEFORE:** `298c00c9e287e910af5634cd93368136bcf5a371`.
- **Commits:** corrección de código `48a53241abd9b5bb6b0baaba9d1fc838994e0b3c`; verificación de lectura de contenteditable/test fixture `cbde2e91ef883b6f89667a623f679f2c9483a838`; aserción estática corregida `dd00121d7cfd224c5f80e1b248e4660319570e93`.
- **Archivos:** `bridge/content.js`, `bridge/tests/turn-completion.integration.test.mjs`, `bridge/tests/validation.test.mjs`.
- **Diagnóstico:** el fallo reportado se producía antes del envío del turno, no en el procesamiento de `TURN_COMPLETE`. La ruta de inserción anterior ignoraba el valor booleano de `document.execCommand("insertText")`: algunas implementaciones pueden devolver `false` sin lanzar excepción y dejar el compositor vacío. A su vez, `waitForSendButton` usaba el primer candidato visible; si estaba deshabilitado, no examinaba selectores alternativos.
- **Implementación:** el content script ahora lee el texto real según sea textarea/input o contenteditable, comprueba que coincida con el prompt, usa fallback si `execCommand` falla y genera eventos. Recorre cada selector buscando un botón visible y habilitado, reconoce etiquetas comunes en inglés y español y, como último recurso, inspecciona exclusivamente el formulario que contiene el compositor.
- **Mensajes diagnósticos:** se distinguen prompt no insertado, botón de envío reconocido pero deshabilitado y ausencia de botón de envío reconocible.
- **CI final:** [run 38122163277](https://github.com/jonhararagi/botarquitecto/actions/runs/38122163277), `success` sobre el SHA exacto `dd00121d7cfd224c5f80e1b248e4660319570e93`. Pasaron sintaxis, contratos, service worker dinámico, timeout, panel e integración.
- **CI transitoria:** run [38122091201](https://github.com/jonhararagi/botarquitecto/actions/runs/38122091201) falló únicamente en una aserción estática con coincidencia literal demasiado estricta del selector localizado; se reemplazó por una comprobación menos frágil. El run final incluye esa corrección y pasó.
- **Validación del usuario en navegador real:** `NOT_RUN` tras el parche.
- **TIMER:** código/pruebas automatizados 1–2 h estimadas; restan actualización local y 10–20 min de prueba real. No hay medición de tiempo real.


## 2026-10-11 — BRIDGE-014 · iteraciones 1 y persistencia del ajuste numérico

- **HEAD de entrada:** `5d6db61b4c9c9f0e53d00adb761cd68b5a9475e7`, rama `worker/bridge-001-validation`; PR #6 abierto y sin merge.
- **Incidencia reportada:** el campo Iteraciones vuelve a mostrar 10 al intentar reducirlo. El código vigente ya protegía borradores frente al polling, pero su cobertura dinámica usaba 2 y no reproducía el valor mínimo 1.
- **Cambio:** parser numérico explícito con límites y fallback solo para campo vacío/no numérico; tanto `SAVE_SESSION` como `START_LOOP` comparten la misma validación. Se cambia la regresión dinámica a exactamente 1 y el contrato estático exige ambas llamadas al parser.
- **Validación:** CI de este nuevo SHA pendiente. La prueba automatizada usa DOM/mocks en Node; todavía no equivale a una prueba de la sesión real de Chrome.
- **Próximo paso:** ejecutar CI y, si pasa, sincronizar la extensión local y recargar tanto la extensión como la pestaña del panel BRIDGE.
- **TIMER:** parche y prueba automatizada estimados en 30–60 min; sincronización local 5–10 min; comprobación real 10–20 min. Tiempo medido no disponible.


### BRIDGE-014 — CI de iteraciones = 1 verificada

- **Corrección inicial:** `c2bc01166fdc1aeb1151c48b283546ee6d65ee4f`; la primera CI, [run 38125372557](https://github.com/jonhararagi/botarquitecto/actions/runs/38125372557), detectó una aserción estática antigua, no un fallo de sintaxis ni de ejecución del panel. Se corrigieron las expectativas del contrato estático y la comparación del valor de campo.
- **SHA de código y pruebas validado:** `23b75be9540b117c0858d0e138545a5d4e409cbf`.
- **CI final:** [run 38125418024](https://github.com/jonhararagi/botarquitecto/actions/runs/38125418024), conclusión `success` sobre ese SHA exacto.
- **Cobertura:** el test simula el panel con polling cada 700 ms, edita Iteraciones a exactamente `1`, comprueba que no cambie a `10`, y confirma que `SAVE_SESSION` y `START_LOOP` reciben `1`. Se unificó el parseo acotado para Guardar e Iniciar.
- **Límite:** es una prueba automatizada del panel con DOM/Chrome API simulados en Node. La sesión del Chrome local aún no ha sido observada por esta herramienta; validación real `NOT_RUN`.
- **Estado:** PR #6 sigue abierto y `main` intacto. No afirmar que el loop CEREBRO→OBRERO real ya funciona hasta probar el navegador.
- **TIMER:** CI completada; quedan 5–10 min para sincronizar y recargar localmente, y 10–20 min para la prueba de Chrome real. Tiempo efectivo no medido.


## 2026-10-11 — BRIDGE-015 · botón de envío de OBRERO sin selector accesible estable

- **HEAD BEFORE:** `8c893eea50ee9e616a1ed13a7b97ff478f8ff496`. PR #6 abierto y sin merge; `main` permanece sin cambios.
- **Reproducción manual informada:** CEREBRO recibió `escribe 2`, devolvió `2`, y BRIDGE verificó la respuesta y escribió `2` en el compositor de OBRERO. El envío no ocurrió; el log terminó en `ERROR — OBRERO — No se encontró un botón de envío reconocible en el compositor de ChatGPT`.
- **Diagnóstico acotado:** los selectores conocidos y el fallback de formulario no cubren un control de envío que carezca de test-id/label estable y esté fuera de un `form`. No se afirma que este sea el único posible DOM real, pero concuerda con el error observado.
- **Cambio:** búsqueda estructural limitada a ancestros del compositor. Prioriza controles con etiqueta de envío o semántica submit. Como último recurso solo admite un grupo compacto (hasta cinco botones visibles), un control situado después del compositor en el orden DOM y excluye acciones reconocibles de voz, adjuntar, herramientas, stop, menú, etc. El timeout ahora también sabe que existe un candidato estructural visible.
- **Prueba de regresión:** pipeline integrado CEREBRO→OBRERO con dos iteraciones; el fixture de OBRERO oculta los selectores conocidos y presenta solo un botón icon-only sin etiqueta, test-id, tipo submit ni formulario. Se exige click, `TURN_COMPLETE` y finalización en dos iteraciones.
- **CI del nuevo SHA:** pendiente. La prueba usa DOM simulado, no la sesión real de Chrome; E2E local requiere repetición manual.
- **TIMER:** parche y regresión estimados 45–90 min; CI y ajuste 10–30 min; prueba manual local 10–20 min. Tiempo medido no disponible.


### BRIDGE-015 — checkpoint de CI

- La primera CI del cambio `0779b772e97626ac4b18fb9f3167926b4bdb00dd`, [run 38129433637](https://github.com/jonhararagi/botarquitecto/actions/runs/38129433637), pasó sintaxis pero falló en una aserción estática demasiado escapada para el selector `button, [role='button']`. Los tests dinámicos no se ejecutaron en ese run.
- Se sustituye esa aserción regex por una comprobación literal. La lógica productiva no cambia en este ajuste de prueba; nueva CI pendiente.


- **Segundo checkpoint CI:** [run 38129469661](https://github.com/jonhararagi/botarquitecto/actions/runs/38129469661) pasó sintaxis y los contratos estáticos, pero la integración falló porque el fixture usaba la misma respuesta para CEREBRO y OBRERO. El worker rechazó ese resultado repetido conforme a la protección de duplicados, así que el test no llegó a comprobar el límite 2. Se cambia la respuesta simulada de OBRERO por una distinta y se vuelve a ejecutar CI; no se interpreta este fallo de fixture como defecto productivo del envío.


### BRIDGE-015 — CI final aprobada

- Código y prueba integrada verificados en SHA `419f890468d4adcdb69ef0b0f6be11b66e1ad80b`.
- [GitHub Actions run 38129530337](https://github.com/jonhararagi/botarquitecto/actions/runs/38129530337) concluyó `success` sobre ese SHA exacto.
- La nueva regresión cubre el ciclo CEREBRO→OBRERO cuando el segundo compositor muestra un botón icon-only sin test-id, etiqueta accesible, tipo submit ni formulario.
- La suite es DOM simulado bajo Node; queda pendiente repetir el caso en Chrome real. PR #6 sigue abierto y `main` no cambia.
- **TIMER:** código/CI terminados; quedan 5–10 min de sincronización y 10–20 min de prueba manual, estimados.

## 2026-10-11 — BRIDGE-016 · confirmación post-click y reintento único

- **Código probado:** `9e681c1695933b94b4a41c98f17204319260f909`.
- **CI final:** [run 38131121319](https://github.com/jonhararagi/botarquitecto/actions/runs/38131121319) concluyó `success` sobre ese SHA exacto. Pasaron sintaxis, contratos estáticos, service worker, timeout, persistencia de Iteraciones e integración content-script/service-worker.
- Tras pulsar el control del compositor, el script comprueba si el texto sigue en el campo y si hay evidencia de envío. Si el texto sigue intacto y no hay nueva respuesta, intenta una sola vez `form.requestSubmit()` o eventos Enter. Si no puede verificar el envío, reporta un error específico.
- La regresión integrada cubre el fallback Enter; el test de timeout ahora espera el error explícito de mensaje no enviado.
- **Incidentes CI documentados:** los runs 38131067716/38131070692 fallaron porque el harness no definía `KeyboardEvent`; el run 38131094418 conservó la misma causa. Se añadió la API al fixture y se actualizó la expectativa del test para el diagnóstico nuevo. El run final pasó.
- **Límite de evidencia:** CI simula DOM/APIs; no prueba que el evento sintético Enter sea aceptado por la versión real de ChatGPT. Hace falta prueba manual en Chrome.
- **PR #6:** abierto, sin merge; `main` permanece intacta.
- **TIMER:** código y CI terminados; sincronización local 5–10 min y prueba manual 10–20 min estimados.

## 2026-10-11 — BRIDGE-010 · informe de auditoría y carga progresiva

### Estado de entrada
- HEAD remoto: `973143ad433f0753a9bf25a8c0e212dde47d787a`; `main`: `525cf1a5b666a95f1389a26a3f8d3282b17f10fc`.
- PR #6 abierto y no fusionado. El manifiesto se conserva Manifest V3; no se añadieron permisos, dependencias ni servicios externos.

### Hallazgos confirmados y correcciones
1. **Envío ambiguo, `bridge/content.js`, `sendAndWait()`.** Reproducción: el click deja el texto en el compositor y no hay confirmación observada a tiempo. El código antiguo lanzaba `requestSubmit()`/Enter; el test observó un segundo intento. **Corregido:** solo un click; si la entrega no puede confirmarse inequívocamente, termina con error y no reenvía.
2. **Stop inexistente/cambiado, `bridge/content.js`, detección de generación.** La regresión mostró que una respuesta parcial se reportaba como éxito al no coincidir con los selectores preferidos. **Corregido:** fallback semántico para controles visibles y finalización solo después de observar positivamente actividad de generación y su posterior desaparición.
3. **`START_TURN` duplicado, `bridge/content.js`, listener de mensajes.** El test ejecutó el mismo `jobId` dos veces y observó dos clicks. **Corregido:** mismo job activo responde como duplicado sin iniciar ejecución paralela; se bloquea el replay de los últimos 256 IDs terminales durante la vida del content script.
4. **Normalización**, `normalizeComposerText()`: se mantiene `replace(/\\s+/g, " ")` y el test estático impide que derive a `/\\\\s+/g`.

### Tabla de carga automatizada
| Carga | Iteraciones esperadas | Completadas | Duplicados aceptados | Errores en ruta feliz | Resultado |
|---|---:|---:|---:|---:|---|
| Nivel 1 | 1 | 1 | 0 | 0 | `PASS_AUTOMATED` |
| Nivel 2 | 3 | 3 | 0 | 0 | `PASS_AUTOMATED` |
| Nivel 3 | 5 | 5 | 0 | 0 | `PASS_AUTOMATED` |
| Nivel 4 | 10 | 10 | 0 | 0 | `PASS_AUTOMATED` |
| Nivel 5 | 2 sesiones × 3 turnos | 6 en total | 0 | 0 | `PASS_AUTOMATED` |

- En cada una de las 19 iteraciones de niveles 1/3/5/10 se inyectó una finalización duplicada y fue rechazada; contadores, log y estado persistido coincidieron. En concurrencia se usaron cuatro pestañas distintas; cada sesión conservó su contador/rol/log y generó tres despachos. Estas cifras corresponden al harness Node VM, no a conversaciones reales de ChatGPT.
- El primer CI de regresiones [run 38135816848](https://github.com/jonhararagi/botarquitecto/actions/runs/38135816848) pasó sintaxis, contratos, worker dinámico, timeout y panel, y falló la integración en los dos defectos iniciales. El siguiente CI [run 38135880725](https://github.com/jonhararagi/botarquitecto/actions/runs/38135880725) confirmó además el defecto de doble `START_TURN` (dos clicks frente a uno esperado).
- **SHA con correcciones de código:** `df03797b8f81e86adf81d78a9deeaff8a2e3f15d`.
- **CI final para ese SHA:** push [38136129721](https://github.com/jonhararagi/botarquitecto/actions/runs/38136129721) y pull request [38136133081](https://github.com/jonhararagi/botarquitecto/actions/runs/38136133081), ambos `success`.

### Riesgos y pruebas pendientes
- `NOT_RUN`: navegador Chrome/Brave real, selectores/DOM de ChatGPT en vivo, cargas reales 1/3/5/10, STOP observado en ejecución real, recuperación tras suspensión natural MV3, recarga de extensión, cierre de pestaña y reinicio del navegador.
- El STOP del worker invalida el job e impide despachos posteriores en las pruebas simuladas; el content script todavía no recibe cancelación cooperativa para abandonar el polling ya iniciado. Es una limitación pendiente, no una prueba real.
- El comportamiento seguro puede terminar con ERROR si no logra demostrar que el mensaje fue enviado o que la generación terminó; es preferible a reenviar algo potencialmente duplicado.
- PR #6 permanece abierto; no hubo merge y `main` sigue en `525cf1a5b666a95f1389a26a3f8d3282b17f10fc`.
- **Siguiente tarea única:** validación manual supervisada en Chrome/Brave con `docs/qa/BRIDGE-010-PROGRESSIVE-LOAD-MANUAL.md`.
- **TIMER:** tiempo efectivo no medido; auditoría/tests/correcciones estimados en 2–4 h y navegador real 1–2 h adicionales. Estabilización global provisional 3–7 días.


## 2026-10-12 — BRIDGE-015 auditoría Chrome/Brave

- **HEAD BEFORE:** `575e4cb3e9d0cb7e49bc0da065dde6a907f34cc6`; `main` observado en `525cf1a5b666a95f1389a26a3f8d3282b17f10fc`; PR #6 abierto sin merge.
- **Auditoría:** manifiesto, worker, content script, panel, popup, CI y suites existentes.
- **Hallazgos:** Manifest V3; solo API `chrome.*`; permisos `tabs`/`storage`; host permissions y matches limitados a ChatGPT. No hay evidencia de incompatibilidad específica de Brave ni motivo para duplicar la API.
- **Corrección:** `bridge/content.js` clasifica los fallos por fase y conserva `[BRIDGE_SEND_DIAG]` sin incluir prompt/respuesta. No se añaden reintentos, vías alternativas ni permisos.
- **Tests/documentación:** ampliados contratos de `bridge/tests/validation.test.mjs` y aserciones de integración para botón deshabilitado y excepción de clic. Añadida `docs/qa/BRIDGE-015-CHROME-BRAVE-COMPATIBILITY.md`.
- **Ejecución:** no se ejecutaron tests localmente ni una extensión real en Chrome/Brave durante esta edición. CI debe verificarse sobre el SHA final; los mocks no son evidencia real de navegador.
- **Causa raíz:** desconocida; no atribuir a Brave sin evidencia.
- **Seguridad:** sin cambios de permisos. Guía prohíbe desactivar Shields globalmente o repetir solicitudes ambiguas.
- **Tiempo invertido:** no medido. **Estimación restante:** CI y, después, 20–45 min para una prueba controlada por navegador.
- **Estado:** `PARTIAL / NOT_READY`; PR #6 abierto, `main` intacta.
- **Siguiente tarea:** ejecución manual Chrome/Brave y revisión del diagnóstico sanitizado.


### BRIDGE-015 — reconciliación de CI (2026-10-12)

- SHA exacto probado: `8a75177e3bca54d5095f5edbad6949d082b40483`.
- CI PASS_REAL: [run PR 38198677713](https://github.com/jonhararagi/botarquitecto/actions/runs/38198677713) y [run push 38198674338](https://github.com/jonhararagi/botarquitecto/actions/runs/38198674338), ambos `success`.
- Resultado resumido desde los logs del job: contratos estáticos 10/10; worker dinámico 32/32; timeout simulado 1/1; persistencia de panel 1/1; pruebas integradas 13/13. Total 57 pasadas, 0 fallidas.
- La prueba de extensión real no se ejecutó en Chrome ni Brave. No declarar compatibilidad real ni causa raíz confirmada.
- Esta entrada solo actualiza evidencia documental. PR #6 continúa abierto y sin merge; `main` no se modifica.
