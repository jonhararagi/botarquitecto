# Estado del proyecto BRIDGE

**Última revisión de referencia:** 2026-10-10  
**Rama de trabajo:** `main`  
**HEAD de referencia previo a esta documentación:** `e49419bfb6e29b0bd20e734e01712d291f10e770`  
**Commit de gobierno inicial:** `f3407963a33c5425c0f89253e38fef92fbef672d`  
**Estado:** `PARTIAL` · prototipo funcional en evolución; no declarar listo para producción sin pruebas reproducibles.

## Qué existe verificado por inspección estática

- Extensión Chromium Manifest V3 dentro de `bridge/`.
- Panel de control, popup, service worker y content script.
- Sesiones múltiples con asignación de pestañas CEREBRO/OBRERO.
- Persistencia mediante `chrome.storage.local`.
- Límites configurables de iteraciones y timeouts.
- Espera de respuesta estable y comprobación de la acción de copiar respuesta antes de reenviar.
- Registro de eventos por sesión y estados de ejecución.

## Riesgos y preguntas pendientes

1. **Regresión de flujo**: demostrar con pruebas que el ciclo no duplica, salta ni reenvía turnos viejos.
2. **Ciclo de vida MV3**: validar recuperación tras suspensión/reinicio del service worker y persistencia de sesiones activas.
3. **Concurrencia**: revisar mensajes tardíos, STOP/PAUSE/RESUME, pestañas compartidas y dos inicios simultáneos.
4. **Selectores DOM**: ChatGPT puede cambiar su interfaz; deben fallar de forma segura y tener pruebas de contrato.
5. **Límite de respuesta**: documentar truncamiento y límites de almacenamiento de logs.
6. **Accesibilidad y UX**: navegación por teclado, foco, estados accesibles, confirmación para operaciones destructivas.
7. **Validación automatizada**: no se verificó en esta revisión una suite automatizada ni ejecución real de navegador. Estado de pruebas: `NOT_RUN`.
8. **Publicación**: falta revisar estrategia de empaquetado, instrucciones de instalación/actualización, política de privacidad y licencia del producto.

## Métrica de progreso

**Progreso global: 15% (estimación inicial de gestión, confianza baja).** Es una línea base provisional, no un resultado de pruebas. La cifra solo debe cambiar cuando los hitos de `ROADMAP.md` tengan evidencia. El código existente no equivale a calidad de producción.

## Próxima tarea única recomendada

**BRIDGE-001: crear una base mínima de validación reproducible**: identificar defectos estáticos del service worker, añadir scripts de validación sin dependencias innecesarias y definir pruebas unitarias para aislamiento de sesiones, límites y transiciones de estado. TIMER: 2–4 h implementación inicial; 1–2 h pruebas y revisión; validación de navegador 30–60 min, sujeta a entorno disponible.

## Historial de esta revisión

- Añadido protocolo de dirección técnica en `cerebro/INSTRUCCIONES.md`.
- Esta línea base debe reconciliarse con el HEAD real de `main` antes del siguiente cambio de código.
