# BRIDGE — Multi-session ChatGPT Bridge

BRIDGE es una extensión Chromium Manifest V3 que coordina turnos entre pestañas ChatGPT con roles **CEREBRO** y **OBRERO**, con sesiones independientes dentro de un mismo perfil de navegador.

> Estado actual: prototipo en evolución. No se considera listo para producción hasta superar las pruebas y revisiones definidas en `ROADMAP.md`.

## Estructura

- `bridge/`: extensión Chromium (manifest, panel de control, popup, service worker y content script).
- `cerebro/INSTRUCCIONES.md`: protocolo obligatorio para agentes de planificación y auditoría.
- `STATUS.md`: estado, riesgos, métrica orientativa y próxima tarea.
- `ROADMAP.md`: hitos y condiciones de salida.
- `WORK_LOG.md`: bitácora de cambios y evidencia.

## Instalar para desarrollo

1. Descarga o clona este repositorio.
2. Abre `chrome://extensions` en Chrome o `brave://extensions` en Brave.
3. Activa el modo desarrollador.
4. Usa **Cargar descomprimida** y selecciona la carpeta `bridge/`.
5. Abre pestañas ChatGPT e inicia sesión normalmente.
6. Abre BRIDGE, crea una sesión, asigna dos pestañas distintas a CEREBRO y OBRERO, configura los límites y envía un mensaje inicial.
7. Recarga las pestañas ChatGPT después de cada actualización de la extensión.

Cada perfil aislado necesita su propia instalación. Una pestaña no debe pertenecer a dos sesiones activas.

## Límites conocidos

- Depende del DOM y de los selectores de ChatGPT, que pueden cambiar.
- La extensión solo puede gestionar pestañas dentro del perfil de navegador donde está instalada.
- El estado persistido en almacenamiento local no equivale a una garantía de recuperación transaccional después de un cierre abrupto.
- La automatización puede fallar por cambios de interfaz, límites de servicio, red o generación incompleta. Debe detenerse ante ambigüedad.
- La revisión documental y estática no demuestra que el flujo funcione en un navegador real.

## Calidad, seguridad y material externo

Consultar `cerebro/INSTRUCCIONES.md` y `ROADMAP.md` antes de cambiar el proyecto. No asumir que un recurso puede reutilizarse porque el uso previsto sea no comercial: registrar licencia, atribución y condiciones, y no incorporar materiales cuya autorización no esté clara.

## Estado y contribuciones

Todo ciclo de trabajo debe inspeccionar HEAD, definir una sola tarea, ejecutar pruebas, actualizar el estado y registrar evidencia real. Ver `WORK_LOG.md`. El porcentaje global de avance es provisional y no sustituye a los hitos de calidad.
