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
