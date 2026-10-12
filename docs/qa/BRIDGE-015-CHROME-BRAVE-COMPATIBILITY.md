# BRIDGE-015: compatibilidad de extensión con Chrome y Brave

**Estado:** `PARTIAL`. Esta guía no representa evidencia de que ninguno de los dos navegadores se haya probado.

## Resultado de la auditoría

- `bridge/manifest.json` usa Manifest V3, `service-worker.js` como service worker y `content.js` en `document_idle`.
- Los permisos son solo `tabs` y `storage`. El acceso del host se limita a `https://chatgpt.com/*` y `https://chat.openai.com/*`, coincidiendo con los patrones del content script.
- El código usa `chrome.*`, no depende de `browser.*` ni de un polyfill. Chrome y Brave son navegadores Chromium; no hay evidencia que justifique duplicar la abstracción de API.
- El content script registra un listener, anuncia `BRIDGE_CONTENT_READY` y atiende `BRIDGE_PING`. La detección del compositor/botón depende del DOM real de ChatGPT y los mocks no prueban la estructura actual.
- **Causa raíz:** no confirmada. No hay evidencia para culpar a Brave. Entre las hipótesis quedan el DOM/sincronización, una pestaña con content script obsoleto/desconectado o una configuración de acceso del sitio.

No se añadieron permisos, dependencias ni un segundo camino de envío. No se reintenta un resultado ambiguo.

## Instalar exactamente la revisión que se prueba

Desde PowerShell, en la copia local del repositorio:

```powershell
git status --short
git fetch origin
git switch worker/bridge-001-validation
git pull --ff-only origin worker/bridge-001-validation
git rev-parse HEAD
```

Verifica que el SHA impreso coincida con el checkpoint BRIDGE-015 o con el comentario final del PR. Si `git status --short` muestra cambios locales que necesitas conservar, detente antes de cambiar de rama o actualizar; no descartes ni sobrescribas esos cambios.

### Google Chrome

1. Abre `chrome://extensions`.
2. Activa **Modo desarrollador**.
3. Pulsa **Cargar descomprimida** y selecciona la carpeta `bridge/`.
4. En los detalles de BRIDGE, verifica que el acceso al sitio permita los dos dominios ChatGPT del manifiesto. No otorgues acceso global a todos los sitios.

### Brave

1. Abre `brave://extensions`.
2. Activa **Modo desarrollador**.
3. Pulsa **Cargar descomprimida** y selecciona la misma carpeta `bridge/`.
4. En los detalles de BRIDGE, comprueba el acceso a `chatgpt.com` y `chat.openai.com`. No desactives Brave Shields globalmente ni reduzcas protecciones generales.

En cada navegador pulsa **Recargar** en la extensión y luego recarga la pestaña de ChatGPT. Una pestaña anterior a la actualización puede conservar un content script antiguo o no tener el actual. Comprueba que ChatGPT carga normalmente y que la sesión esté iniciada.

## Una prueba controlada por navegador

Ejecuta esta secuencia una sola vez en Chrome y, por separado, una sola vez en Brave.

1. Abre una pestaña de ChatGPT y el panel BRIDGE. Asigna CEREBRO a esa pestaña, usa una sesión de prueba y limita la ejecución a **1 iteración**. No arranques una segunda sesión simultánea.
2. En la pestaña de ChatGPT correcta, abre DevTools (F12) y elige **Console**. Haz visible el nivel **Info** y filtra por `[BRIDGE_SEND_DIAG]`.
3. Inicia una sola ejecución con el prompt inocuo `Responde únicamente con el número 1`.
4. Observa compositor, historial y estado de BRIDGE. Anota si el prompt aparece en el compositor, si desaparece, si aparece un mensaje de usuario y si comienza la generación. No vuelvas a pulsar enviar.
5. Si falla, copia el JSON de `[BRIDGE_SEND_DIAG]` y el error técnico visible. Si no existe esa línea, copia solo el error del panel y errores relevantes de consola/service worker. No incluyas prompt/respuesta completos, cookies, tokens ni conversaciones.
6. Ante ambigüedad, detén la prueba. **No repitas el prompt, no pulses enviar manualmente y no pulses Enter** hasta revisar si el primer intento llegó al historial. El retorno de `click()` no prueba que ChatGPT aceptara el mensaje.

## Interpretar el diagnóstico

- `composer_not_found`: no se encontró el compositor visible.
- `composer_disconnected` / `composer_text_desynchronized`: el compositor se desconectó o dejó de contener el texto esperado.
- `text_insertion_failed`: el texto no permaneció en el campo tras la inserción y sincronización.
- `send_button_not_found`: no se identificó un botón de envío asociado.
- `send_button_disabled`: texto visible pero botón deshabilitado; BRIDGE no hizo clic.
- `send_control_changed_before_click` / `send_control_unavailable_or_unassociated`: control obsoleto, desconectado o no asociado; BRIDGE no hizo clic.
- `click_failed`: el clic produjo una excepción. No demuestra que el mensaje no se haya entregado.
- `submission_unconfirmed`: se intentó un solo clic, pero no hubo señal suficiente de aceptación. Verifica el historial antes de cualquier nueva acción.
- `response_timeout_after_submission`: hubo señal de envío, pero expiró la espera de respuesta. Trátalo como posiblemente enviado y no vuelvas a enviar el prompt.
- `send_operation_error`: fallo no clasificado; conserva solo el JSON sanitizado.

Si no aparece `[BRIDGE_SEND_DIAG]`, el fallo pudo ocurrir antes de `sendAndWait`, la consola puede estar en otra pestaña o puede haber un content script antiguo/desconectado. Revisa errores de la extensión, acceso al sitio y recarga de pestaña. No desactives protecciones para forzar el funcionamiento.

## Matriz de resultados independiente

| Campo | Chrome | Brave |
|---|---|---|
| Versión exacta | Pendiente | Pendiente |
| Sistema operativo | Pendiente | Pendiente |
| SHA probado | Pendiente | Pendiente |
| Extensión cargada sin error de manifiesto | `NOT_RUN` | `NOT_RUN` |
| Prompt visible en compositor | `NOT_RUN` | `NOT_RUN` |
| Señal de envío/generación | `NOT_RUN` | `NOT_RUN` |
| Código de diagnóstico | `NOT_RUN` | `NOT_RUN` |
| Resultado | `NOT_RUN` | `NOT_RUN` |

Usa `PASS_REAL`/`FAIL_REAL` solo después de ejecutar el navegador y guardar evidencia técnica sin contenido privado. Mocks y CI no son prueba real del navegador.

## Referencias técnicas

- [Chrome: Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
- [Chrome: content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome: declarar permisos](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- [Brave: instalar extensiones](https://support.brave.app/hc/en-us/articles/360017909112-How-can-I-add-extensions-to-Brave)

Mantén el PR #6 abierto y sin fusionar hasta obtener evidencia manual independiente de ambos navegadores.
