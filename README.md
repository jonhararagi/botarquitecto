# BRIDGE — Multi-session ChatGPT Bridge

BRIDGE es una extensión Chromium Manifest V3 que coordina turnos entre pestañas ChatGPT con roles **CEREBRO** y **OBRERO**, con sesiones independientes dentro de un mismo perfil de navegador.

> Estado actual: prototipo en evolución. No se considera listo para producción hasta superar las pruebas y revisiones definidas en `ROADMAP.md`.

## Estructura

- `bridge/`: extensión Chromium (manifest, panel de control, popup, service worker y content script).
- `bridge/tests/validation.test.mjs`: pruebas contractuales estáticas de fuentes y manifiesto.
- `bridge/tests/service-worker.dynamic.test.mjs`: ejecuta el código real de `service-worker.js` dentro de un contexto Node `vm`, con mocks controlables de Chrome.
- `.github/workflows/bridge-validation.yml`: CI de sintaxis, contratos estáticos y pruebas dinámicas.
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

## Ejecutar la suite completa

Se necesita Node.js 22. No hay dependencias npm para estas pruebas. Desde la raíz del repositorio:

```sh
node --check bridge/service-worker.js
node --check bridge/content.js
node --check bridge/control.js
node --check bridge/popup.js
node --test bridge/tests/validation.test.mjs
node --test bridge/tests/service-worker.dynamic.test.mjs
```

La suite dinámica evalúa el propio archivo `bridge/service-worker.js` y captura sus listeners de Chrome en un contexto `vm`. Simula almacenamiento, pestañas, mensajes y cierre de pestañas; no automatiza ni envía mensajes reales a ChatGPT. Los mocks verifican lógica interna y contratos, pero no reemplazan una prueba en Chrome/Brave ni demuestran el comportamiento de suspensión/reinicio real de Manifest V3.

La workflow `.github/workflows/bridge-validation.yml` ejecuta sintaxis, pruebas contractuales y pruebas dinámicas por separado.

## Límites conocidos

- Depende del DOM y de los selectores de ChatGPT, que pueden cambiar.
- La extensión solo puede gestionar pestañas dentro del perfil de navegador donde está instalada.
- El estado persistido en almacenamiento local no equivale a una garantía de recuperación transaccional después de un cierre abrupto.
- La suite de mocks no representa completamente la planificación del event loop de Chromium, la suspensión del service worker ni la latencia real de mensajería.
- La automatización puede fallar por cambios de interfaz, límites de servicio, red o generación incompleta. Debe detenerse ante ambigüedad.
- La revisión documental y las pruebas automatizadas no demuestran que el flujo funcione en un navegador real.

## Calidad, seguridad y material externo

Consultar `cerebro/INSTRUCCIONES.md` y `ROADMAP.md` antes de cambiar el proyecto. No asumir que un recurso puede reutilizarse porque el uso previsto sea no comercial: registrar licencia, atribución y condiciones, y no incorporar materiales cuya autorización no esté clara.

## Estado y contribuciones

Todo ciclo de trabajo debe inspeccionar HEAD, definir una sola tarea, ejecutar pruebas, actualizar el estado y registrar evidencia real. Ver `WORK_LOG.md`. El porcentaje global de avance es provisional y no sustituye a los hitos de calidad.


## Recuperación MV3 y pruebas de timeout

La suite de BRIDGE-003 incluye un test de `bridge/content.js` con reloj simulado. Ejecuta el script real en un contexto de prueba y avanza los temporizadores sin esperar varios minutos ni enviar mensajes reales a ChatGPT. La suite dinámica del service worker también reinicializa el código real en un contexto Node nuevo conservando el snapshot de `chrome.storage.local`.

Para ejecutar la suite ampliada con Node.js 22, desde la raíz:

```sh
node --check bridge/service-worker.js
node --check bridge/content.js
node --check bridge/control.js
node --check bridge/popup.js
node --test bridge/tests/validation.test.mjs
node --test bridge/tests/service-worker.dynamic.test.mjs
node --test bridge/tests/content.timeout.test.mjs
```

La reinicialización en Node **no es** una suspensión real de Chromium. No reproduce el planificador MV3, la terminación natural del worker ni todos los efectos de mensajería de Chrome. Al hidratar storage, BRIDGE no reenvía automáticamente un turno que estaba marcado como activo: lo pone en error por resultado ambiguo y requiere revisión/reinicio manual. Una sesión pausada sin turno pendiente permanece pausada.

### Validación manual en Chrome o Brave

1. Carga `bridge/` desde `chrome://extensions` o `brave://extensions` con modo desarrollador.
2. Revisa errores del manifiesto y abre el panel de BRIDGE; crea y selecciona sesiones.
3. Con dos pestañas de ChatGPT, inicia un turno controlado y confirma estado/job activo.
4. Prueba STOP durante la espera y confirma que una respuesta tardía no reactive el bucle.
5. Para probar una **recarga** de extensión, usa el botón Recargar en la página de extensiones; anota que esto no demuestra suspensión natural.
6. Para observar suspensión natural, deja que Chromium gestione el ciclo de vida sin recargar manualmente; inspecciona el estado persistido después de que el worker vuelva a activarse. No declares este caso probado sin observarlo directamente.
7. Registra por separado cierre de pestaña, recarga de extensión, reinicio del navegador y suspensión natural. No envíes datos privados en logs o capturas.

El test automatizado de timeout prueba la expiración del polling del content script con reloj simulado; no certifica la latencia real de ChatGPT ni el ciclo de vida del navegador. Consulta `STATUS.md`, `ROADMAP.md` y `WORK_LOG.md` para el SHA exacto verificado y los casos `NOT_RUN`.
