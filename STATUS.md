# Estado del proyecto BRIDGE

**Última inspección:** 2026-10-10 (UTC; consulta de GitHub y CI).  
**Rama de trabajo:** `worker/bridge-001-validation`  
**SHA inicial de BRIDGE-001:** `525cf1a5b666a95f1389a26a3f8d3282b17f10fc` (`main` al crear la rama).  
**SHA de implementación validado por CI:** `11ad7befd54e89196c7e4526da8ff98554187561`.  
**Estado:** `PARTIAL`. PR #6 abierto; cambios todavía no integrados en `main`.

## Estado comprobado

- Extensión Chromium Manifest V3 en `bridge/`, con panel, popup, service worker y content script.
- Sesiones múltiples, persistencia en `chrome.storage.local`, límites de iteración y timeout, vinculación de turnos por `jobId` y pestaña.
- Corrección en la rama de trabajo: `createSession()` usa `createSessionModel()`; se eliminó la referencia a la fábrica inexistente `createSessionObject()`.
- Se añadió una suite Node.js sin dependencias externas que comprueba contratos estáticos críticos y una workflow de GitHub Actions para sintaxis y pruebas.
- La CI del SHA de implementación terminó con éxito: [run 38025331572](https://github.com/jonhararagi/botarquitecto/actions/runs/38025331572).

## Evidencia y límites

- `PASS_STATIC`: inspección de service worker, content script y manifiesto; la suite incluye contratos para creación de sesión, aislamiento de pestañas, límites, asociación de job/remitente y permisos MV3.
- `PASS_REAL`: GitHub Actions ejecutó y completó con éxito los pasos `node --check` para los cuatro scripts y `node --test bridge/tests/*.test.mjs` en el SHA de implementación indicado.
- `NOT_RUN`: integración manual en Chrome/Brave, reinicio real del service worker y recorrido completo de dos sesiones.
- `PARTIAL`: los tests actuales inspeccionan contratos del código; aún no ejercitan dinámicamente las transiciones ni la concurrencia con mocks.
- `NOT_READY`: no declarar BRIDGE listo para producción.

## Riesgos abiertos

1. Carreras en inicios simultáneos de `START_LOOP` y transiciones de pausa/reanudación/parada.
2. Respuestas tardías, reinicio/suspensión del service worker y recuperación de estado persistido.
3. Dependencia de selectores DOM cambiantes de ChatGPT.
4. La suite no es aún una prueba dinámica del ciclo de sesiones.
5. No se realizó validación manual en navegador ni revisión de release/privacidad.

## Métrica de progreso

**Progreso global: 15% (estimación de gestión, confianza baja).** No se incrementa por añadir tests contractuales y CI únicamente: falta validar dinámicamente el bucle, la resiliencia MV3, la seguridad y la distribución. El avance de BRIDGE-001 se limita a su base inicial de validación y corrección estática, no a la estabilización total.

## Próxima tarea única recomendada

**BRIDGE-002: añadir pruebas dinámicas de transiciones de estado y concurrencia con mocks de Chrome**, sin automatizar mensajes reales de ChatGPT. Cubrir creación/selección, aislamiento, inicio concurrente, mensajes tardíos y estados PAUSE/RESUME/STOP; separar lógica pura solo donde reduzca acoplamiento y sin duplicar la arquitectura existente.

## TIMER

- **Medido por herramienta:** no disponible; no inventar tiempo invertido.
- **Estimación restante para cerrar BRIDGE-001:** revisión del diff y aprobación/integración del PR: 15–30 min; navegador manual: 30–60 min si Chrome/Brave está disponible.
- **Estimación restante para estabilizar BRIDGE:** aproximadamente 3–7 días de trabajo concentrado, incluyendo BRIDGE-002, resiliencia MV3, pruebas manuales y revisión de seguridad; confianza baja hasta medir el comportamiento real.
- **Proyecto completo:** no hay información suficiente para una estimación fiable; distribución, privacidad, accesibilidad y release aún no tienen evidencia de salida.
