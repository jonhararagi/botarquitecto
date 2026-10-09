# BRIDGE — Multi-session ChatGPT Bridge

BRIDGE funciona exclusivamente como extensión Chromium (Chrome, Brave y navegadores Chromium compatibles). No utiliza ejecutables externos, servidores locales, Native Messaging ni un segundo navegador.

BRIDGE sigue siendo una extensión Chromium. Ahora administra varias parejas CEREBRO ↔ OBRERO independientes dentro del mismo perfil de navegador.

## Arquitectura

- Sesión A → CEREBRO A ↔ OBRERO A
- Sesión B → CEREBRO B ↔ OBRERO B
- Sesión C → CEREBRO C ↔ OBRERO C

Cada sesión conserva su propio estado, timeout, iteraciones, historial y trabajo activo. Varias sesiones pueden ejecutarse simultáneamente. Una pestaña CEREBRO/OBRERO no puede pertenecer simultáneamente a dos sesiones activas: BRIDGE ahora lo valida y rechaza la segunda asignación.

## Chrome, Brave y perfiles

Una extensión instalada en un perfil no puede controlar directamente las pestañas de otro perfil aislado. Por eso cada perfil de Chrome/Brave debe tener su propia instalación de BRIDGE.

En un mismo perfil puedes crear múltiples sesiones. Para otro perfil de Chrome o Brave, instala BRIDGE allí también.

## Apertura de la interfaz

El botón de BRIDGE abre `control.html` como una pestaña normal de la extensión. Si ya existe una pestaña de control, la enfoca en lugar de crear otra ventana popup. Esto evita depender del comportamiento de ventanas popup y hace que la interfaz sea consistente en Brave y Chrome, incluso con varias ventanas del navegador abiertas.

## Por qué sigue siendo una extensión

Para el flujo actual, la extensión puede comunicarse directamente con las pestañas ChatGPT mediante content scripts y mensajería de pestañas. Convertirlo ahora en un programa externo añadiría otra capa de automatización de ventanas y comunicación sin resolver una necesidad del MVP.

La arquitectura deja abierta una futura aplicación central si más adelante necesitas controlar perfiles de Chrome y Brave desde un único panel.

## Flujo automático

Mensaje inicial → CEREBRO → respuesta completa → autoenvío → OBRERO → respuesta completa → autoenvío → CEREBRO → ...

BRIDGE no toma «el último texto del chat» a ciegas. Primero espera a que aparezca la respuesta nueva y a que la generación termine; después exige que el turno origen tenga disponible la acción «Copiar respuesta» de ChatGPT. Esa acción funciona como ancla del turno que acaba de responder y evita confundirlo con un mensaje recibido/reenviado.

El reenvío usa exclusivamente el texto del mismo nodo de respuesta que contiene «Copiar respuesta». Nunca busca un mensaje anterior del chat ni reutiliza el texto que BRIDGE acaba de enviar al otro lado. Si la acción «Copiar respuesta» no está disponible o el turno no puede identificarse de forma segura, BRIDGE bloquea ese reenvío en vez de adivinar.

El reenvío ocurre cuando el texto deja de cambiar durante aproximadamente 2 segundos, la generación ya no muestra el control de detener y la acción «Copiar respuesta» está disponible. El timeout de generación incluye además una pequeña ventana de gracia para completar esa comprobación de estabilidad, evitando falsos timeouts justo en el límite.

## Timeouts

- CEREBRO: 60 segundos máximo por defecto.
- OBRERO: 600 segundos (10 minutos) máximo por defecto.
- Espera mínima: 0 segundos por defecto.

Los timeouts son límites, no esperas obligatorias.

## Uso

1. Recarga BRIDGE desde chrome://extensions/ o brave://extensions/.
2. Recarga las pestañas ChatGPT después de actualizar la extensión.
3. Abre BRIDGE.
4. Crea una sesión por cada pareja.
5. En cada sesión selecciona sus pestañas CEREBRO y OBRERO.
6. Pon un nombre identificable.
7. Introduce el mensaje inicial.
8. Pulsa ACTIVAR SESIÓN.
9. Puedes iniciar otra sesión sin detener la anterior.

## Aislamiento

Cada turno lleva sessionId y jobId. BRIDGE valida que la respuesta proceda de una de las dos pestañas configuradas para esa sesión.

No reutilices la misma pestaña en dos sesiones activas.

## Persistencia

El watchdog de turnos usa `chrome.alarms` y los timestamps persistidos para detectar turnos que superan su timeout incluso si el service worker se reinicia. Al expirar, la sesión pasa a `ERROR` y BRIDGE intenta cancelar el turno en la pestaña origen. Si el service worker se reinicia durante la confirmación/guardado de una respuesta, BRIDGE falla de forma segura en vez de reenviar a ciegas o duplicar el ciclo.

**Precisión del timeout:** Chromium impone un intervalo mínimo de 30 segundos para alarmas periódicas y puede retrasarlas más bajo carga o suspensión del equipo. Por eso el watchdog es una protección de recuperación, no un cronómetro exacto al segundo.

El estado queda en chrome.storage.local. La pestaña de control es solo administración/monitorización.

Minimizar la ventana no detiene el Bridge. Cerrar una pestaña CEREBRO/OBRERO sí pone esa sesión en ERROR.

## Limitaciones

- Una extensión instalada en un perfil no puede administrar directamente otro perfil aislado.
- Chrome/Brave pueden descartar pestañas en segundo plano.
- ChatGPT puede cambiar su DOM; los selectores de content.js pueden necesitar mantenimiento.
- No se convirtió en programa de escritorio porque no aporta una ventaja necesaria para este MVP.