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
