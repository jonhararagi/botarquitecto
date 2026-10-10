# BOTARQUITECTO / BRIDGE

**BRIDGE** es una extensión Chromium que coordina un ciclo de trabajo entre dos conversaciones de ChatGPT: **CEREBRO** planifica y revisa; **OBRERO** ejecuta y devuelve evidencia. El objetivo es facilitar trabajos iterativos y auditables sin instalar un proceso externo.

> **Estado del proyecto:** la rama `recovery/reliable-turn-completion` contiene una recuperación del ciclo de turnos y pruebas de regresión. La integración no debe considerarse completa hasta superar la validación manual E2E descrita en `bridge/MANUAL-E2E-CHECKLIST.md`. La CI por sí sola no prueba el comportamiento real de ChatGPT en el navegador.

## Funcionalidades

- Varias sesiones independientes dentro del mismo perfil de Chrome o Brave.
- Asignación de pestañas distintas para CEREBRO y OBRERO.
- Reenvío automático entre roles y límites configurables de iteraciones y tiempo.
- Controles para pausar, continuar y detener una sesión.
- Persistencia local del estado en el perfil del navegador.
- Validación de `sessionId`, `jobId`, rol y pestaña de origen para reducir entregas duplicadas o cruzadas.
- Pruebas de regresión del service worker con Node.js.

## Requisitos

- Google Chrome, Brave u otro navegador basado en Chromium compatible con Manifest V3.
- Dos conversaciones de ChatGPT abiertas en el mismo perfil.
- Node.js 22 o 24 para ejecutar la suite de regresión.

BRIDGE no controla pestañas de otros perfiles aislados. Instala la extensión por separado en cada perfil que quieras usar.

## Instalación de desarrollo

1. Descarga o clona este repositorio.
2. Abre `chrome://extensions` o `brave://extensions`.
3. Activa **Modo de desarrollador**.
4. Selecciona **Cargar extensión sin empaquetar** y elige la carpeta `bridge/`.
5. Abre dos conversaciones distintas de ChatGPT y recárgalas después de instalar o actualizar la extensión.
6. Abre BRIDGE, actualiza la lista de pestañas y asigna una conversación a CEREBRO y otra a OBRERO.
7. Empieza con una instrucción inocua, pocas iteraciones y límites de tiempo conservadores.

## Pruebas automatizadas

Desde la carpeta `bridge/`:

```sh
node --check control.js
node --check popup.js
node --check service-worker.js
node --check content.js
npm test
```

La CI ejecuta la suite en Node.js 22 y 24. Estas pruebas validan lógica interna y regresiones, pero **no sustituyen** una prueba de la extensión instalada en Chrome o Brave.

## Puerta de aceptación antes de integrar

En la rama candidata, sigue [la lista de validación manual E2E](bridge/MANUAL-E2E-CHECKLIST.md). Registra el SHA probado, navegador y sistema operativo, y evidencia por caso. Como mínimo, verifica el ciclo básico, STOP durante generación, timeout, recuperación tras reinicio, ausencia de duplicados y aislamiento entre sesiones.

No marques el lanzamiento como GREEN completo mientras los casos obligatorios no tengan evidencia real. No fusiones automáticamente una rama que solo haya pasado CI.

## Seguridad y privacidad

- El estado se guarda en el almacenamiento local de la extensión dentro del perfil del navegador.
- Usa perfiles de prueba y conversaciones sin secretos, credenciales ni datos sensibles.
- STOP debe impedir que un turno obsoleto continúe el ciclo; si el origen de una respuesta no puede verificarse, el sistema debe fallar de forma explícita en vez de reenviar contenido dudoso.
- El éxito del estado interno no garantiza que la interfaz de ChatGPT haya aceptado o mostrado el mensaje. Verifica también ambas conversaciones.
- Revisa permisos del manifiesto y cambios de dependencias antes de distribuir la extensión.

## Principios de desarrollo

1. **GitHub es la fuente de verdad:** identifica la rama y el SHA exacto antes de validar.
2. **Cambios pequeños y revisables:** evita modificar `main` directamente para trabajo experimental.
3. **Evidencia sobre suposiciones:** separa pruebas automatizadas de comprobaciones manuales.
4. **Fallos seguros:** no adivines el turno de origen ni reenvíes una respuesta incierta.
5. **Licencias respetadas:** reutiliza código, imágenes y recursos externos solo después de comprobar sus licencias y conservar las atribuciones requeridas.

## Documentación

- [Arquitectura y uso de BRIDGE](bridge/README.md)
- [Checklist manual E2E](bridge/MANUAL-E2E-CHECKLIST.md) — disponible en la rama de recuperación
