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
- [ ] Verificar en CI la suite dinámica de inicio, finalización, error, pausa, reanudación y parada añadida en BRIDGE-002.
- [ ] Probar que cada respuesta se reenvía como máximo una vez y solo al rol correcto.
- [ ] Probar respuestas vacías, duplicadas, tardías, timeout y mensajes con marcador.
- [ ] Confirmar con CI el test determinista de START_LOOP concurrentes y reserva de pestañas.
- [ ] Completar la evidencia de aislamiento entre sesiones; los mocks nuevos comprueban la competencia por pestañas, pendiente de CI.

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

- [ ] Confirmar resultado verde de GitHub Actions para el SHA final de la rama.
- [ ] Mantener pendientes la validación manual en Chrome/Brave y la recuperación tras suspensión/reinicio real del service worker.
- [ ] No declarar producción lista por pasar la suite dinámica de Node.

## TIMER orientativo
- P0 automatización mínima: 2–4 h de implementación inicial + 1–2 h de pruebas.
- P1 integridad del bucle: 1–3 días según facilidad para aislar lógica y reproducir fallos.
- P2 resiliencia: 1–3 días incluyendo simulación de ciclo de vida.
- P3 calidad de interacción: 1–2 días.
- P4 seguridad/licencias: 1–2 días de revisión más correcciones.
- P5 distribución: 0.5–2 días.
Estas cifras son estimaciones de trabajo, no fechas comprometidas. La validación manual de navegador se registra aparte.
