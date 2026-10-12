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


---

# BRIDGE-016 · Reparación del flujo de interacción y botones

**Estado técnico:** automatización en CI aprobada; prueba real en Chrome/Brave pendiente.

## Hallazgo confirmado en el código del panel

En el SHA base `d5e126c2c3f9cb64570dd45e27afeaf3e097eedf`, el panel realizaba polling de estado cada 700 ms y `render()` volvía a establecer el estado visual desde el snapshot del worker. La función `poll()` silenciaba por completo los errores de comunicación con `catch{}`. Por eso, un fallo de acción que primero colocaba un mensaje `ERROR` podía ser reemplazado por el estado anterior, y una caída de comunicación del polling quedaba sin aviso. El código registraba los listeners en la página, pero no daba una señal fiable de que la acción hubiese terminado correctamente.

Se corrigió con avisos de estado persistentes frente al polling normal, mensajes de inicio/resultado/error con el marcador `[BRIDGE_UI_ACTION]`, timeout de la petición desde el panel, estado temporal visible mientras hay una operación, bloqueo de acciones simultáneas y restauración del estado de controles al terminar o fallar. La inicialización comprueba los IDs obligatorios antes de registrar listeners y comunica los que falten. No se registran prompts ni respuestas. Esta evidencia confirma el defecto del panel y su corrección bajo mocks; no demuestra todavía qué ocurre en el navegador real del usuario.

## Inventario de botones

| ID / etiqueta | Definición | Listener y mensaje | Resultado esperado | Error/recuperación |
|---|---|---|---|---|
| `newSession` / «＋ Nueva» | `bridge/control.html` | `control.js` → `CREATE_SESSION`, luego `LIST_CHATGPT_TABS` | Crear y seleccionar la sesión nueva | Cancelar el diálogo no envía; rechazo/timeout visible; botón se restaura |
| `deleteSession` / «Eliminar» | `bridge/control.html` | `control.js` → confirmación y `DELETE_SESSION` | Eliminar la sesión elegida, si el worker lo permite | Cancelar no envía; error visible |
| `refresh` / «Actualizar pestañas» | `bridge/control.html` | `control.js` → `LIST_CHATGPT_TABS` | Actualizar lista de pestañas y snapshot | Error de comunicación visible; se puede volver a pulsar tras comprobar el estado |
| `start` / «ACTIVAR SESIÓN» | `bridge/control.html` | `control.js` → `SAVE_SESSION`, valida semilla y envía `START_LOOP` | Guardar los ajustes e iniciar el ciclo | Validaciones o errores se muestran; en timeout revisar estado antes de volver a activar |
| `pause` / «PAUSAR» | `bridge/control.html` | `control.js` → `PAUSE` | Pausar según la máquina de estados del worker | Resultado o error visible; estado del botón restaurado |
| `resume` / «CONTINUAR» | `bridge/control.html` | `control.js` → `RESUME` | Reanudar según estado del worker | Resultado o error visible; sin reintento automático |
| `stop` / «DETENER» | `bridge/control.html` | `control.js` → `STOP` | Detener la sesión e invalidar el trabajo activo en el worker | Error visible en vez de quedar oculto por polling |
| `reset` / «LIMPIAR» | `bridge/control.html` | `control.js` → `RESET_SESSION` | Reiniciar estado de la sesión si está inactiva | Error visible; no oculta rechazo del worker |
| `refresh` / «Refresh» experimental | `bridge/popup.html` | `popup.js` → `LIST_CHATGPT_TABS` | Mostrar número y títulos de pestañas ChatGPT | Error visible, timeout y botón reactivado |

El manifiesto no declara `default_popup`: al pulsar el icono de extensión, el listener `chrome.action.onClicked` abre/focaliza `bridge/control.html`. La vista `popup.html` es una página experimental separada, no el panel que se abre por defecto desde el icono.

## Otros controles interactivos

- `session`: `onchange` envía `SELECT_SESSION` y vuelve a consultar las pestañas.
- `brain` y `worker`: cambian las selecciones locales; se validan para que sean dos pestañas distintas y se guardan mediante `SAVE_SESSION`.
- `sessionName`, `iterations`, `brainTimeout`, `workerTimeout` y `minTurnDelay`: sus eventos `input` marcan los valores como editados para que el polling no los reemplace hasta guardar.
- `seed`: contiene el mensaje inicial únicamente en la interfaz y se pasa en `START_LOOP`; los eventos de diagnóstico excluyen el texto.

## Cadena de diagnóstico

En la consola de la pestaña `control.html`, filtra `[BRIDGE_UI_ACTION]`. Los eventos indican `listener_invoked`, `action_started`, `message_send_started`, `message_response_received`, `message_transport_failed`, `message_rejected_by_receiver`, `action_completed` o `action_failed`. Solo se incluyen el nombre de la acción, el tipo de mensaje, la fase, si el worker aceptó la respuesta y el nombre de la excepción. No se registra el payload del mensaje.

En la consola de la pestaña de ChatGPT, filtra por separado `[BRIDGE_SEND_DIAG]` para el diagnóstico del compositor y de la acción de envío. El diagnóstico del panel no sustituye el del content script, y el retorno de `.click()` no demuestra que ChatGPT aceptara el prompt.

## Verificación automatizada BRIDGE-016

El código y las pruebas se ejecutaron sobre SHA `d8b723376b1388884df9ea0513165579594ac32e` en [GitHub Actions run 38204981854](https://github.com/jonhararagi/botarquitecto/actions/runs/38204981854): sintaxis y las seis suites pasaron. La nueva suite cubre inventario/IDs/listeners, acción única por botón, cambio de sesión, control obligatorio ausente, error que persiste frente a polling, timeout sin reintento y recuperación de popup. La suite de integración anterior del content script sigue comprobando botón global ajeno, botón obsoleto, inserción sin sincronización, botón deshabilitado, confirmación válida y envío ambiguo sin duplicados.

## Matriz manual por navegador

| Prueba | Chrome | Brave |
|---|---|---|
| El icono de extensión abre `control.html` | `NOT_RUN` | `NOT_RUN` |
| El botón Actualizar pestañas muestra un resultado | `NOT_RUN` | `NOT_RUN` |
| Nueva sesión / Eliminar muestran efecto | `NOT_RUN` | `NOT_RUN` |
| Pausar / Continuar / Detener / Limpiar muestran efecto | `NOT_RUN` | `NOT_RUN` |
| Rechazo de comunicación deja error visible | `NOT_RUN` | `NOT_RUN` |
| Timeout recupera los controles | `NOT_RUN` | `NOT_RUN` |
| Content script y worker se comunican | `NOT_RUN` | `NOT_RUN` |
| Compositor detectado e inserción sincronizada | `NOT_RUN` | `NOT_RUN` |
| Envío confirmado sin duplicados | `NOT_RUN` | `NOT_RUN` |
| Diagnóstico de fallo sin contenido privado | `NOT_RUN` | `NOT_RUN` |

## Pasos manuales pendientes

1. Actualiza la rama `worker/bridge-001-validation` al SHA publicado; si `git status --short` muestra cambios locales, consérvalos y no los sobrescribas.
2. Abre `chrome://extensions` en Chrome o `brave://extensions` en Brave, activa el modo desarrollador, carga la carpeta `bridge/` si no está instalada y pulsa **Recargar**.
3. Recarga la pestaña de ChatGPT. Pulsa **Actualizar pestañas** desde `control.html`; verifica que el estado cambie y que no queden controles permanentemente deshabilitados.
4. En DevTools de `control.html`, filtra `[BRIDGE_UI_ACTION]`. Usa los botones administrativos sobre una sesión de prueba sin ejecutar aún un prompt. Comprueba que cada clic tenga un único `listener_invoked`, un resultado terminal y que el botón vuelva a su estado normal.
5. Haz una sola prueba de envío por navegador con `Responde únicamente con el número 1`, con una iteración. En la pestaña de ChatGPT filtra `[BRIDGE_SEND_DIAG]`. Si el estado del envío es ambiguo, no repitas el prompt, no pulses Enter ni lo envíes manualmente hasta verificar el historial.
6. Registra versión exacta del navegador, SHA, resultado y el JSON técnico sanitizado. No compartas prompts, respuestas, cookies, tokens ni conversaciones.

**Conclusión:** el fallo de observabilidad del panel queda corregido y probado con mocks. El motivo específico por el que la versión instalada no actuaba en la máquina del usuario, y el estado real del botón de envío de ChatGPT, requieren todavía prueba en Chrome/Brave. Resultado global `PARTIAL`.
