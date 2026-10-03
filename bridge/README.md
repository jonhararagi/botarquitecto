# BRIDGE — ChatGPT two-tab loop

BRIDGE hace conversar dos pestañas normales de ChatGPT usando una extensión local de Chrome/Brave.

## Estado actual

El ciclo automático funciona desde el service worker de la extensión: cada turno terminado y verificado se reenvía directamente al siguiente rol.

Flujo:

Mensaje inicial → CEREBRO → respuesta completa y estable → OBRERO → respuesta completa y estable → CEREBRO → ...

No requiere copiar/pegar manualmente entre las dos pestañas.

## Qué garantiza BRIDGE

- La ventana de control no mantiene viva por sí sola la ejecución.
- El estado del ciclo se guarda en `chrome.storage.local`.
- CEREBRO y OBRERO tienen timeouts independientes.
- La respuesta debe ser nueva respecto de la respuesta existente antes de enviarse al siguiente rol.
- La respuesta debe permanecer estable durante una ventana de verificación antes de aceptarse.
- `[[BRIDGE_DONE]]` permite marcar explícitamente una respuesta como finalizada.
- `TRABAJO TERMINADO` detiene el ciclo sin reenviar esa respuesta.
- Se evita reenviar dos veces exactamente la misma respuesta mediante `lastForwarded`.
- Se detecta el cierre de las pestañas configuradas.
- PAUSAR evita iniciar el siguiente turno después del turno actual.
- DETENER invalida el turno activo y evita que una respuesta tardía continúe el ciclo.
- El timeout configurado mide el tiempo de generación/respuesta; la comprobación de estabilidad dispone además de una ventana de gracia de 30 segundos para evitar falsos timeouts.

## Limitación importante

Minimizar una ventana no es lo mismo que cerrar o descartar una pestaña.

BRIDGE no puede seguir ejecutando el contenido de una pestaña que:

- fue cerrada;
- fue descartada/suspendida por el navegador;
- perdió la página de ChatGPT y ya no contiene el content script.

Por eso debes mantener abiertas las dos pestañas ChatGPT. Si una necesita ser recargada, recárgala y vuelve a comprobar la conexión antes de iniciar un nuevo trabajo.

## Instalación

1. Descarga/clona este repositorio.
2. Abre Chrome o Brave.
3. Ve a `chrome://extensions/` en Chrome o `brave://extensions/` en Brave.
4. Activa Developer mode / Modo desarrollador.
5. Pulsa Load unpacked / Cargar descomprimida.
6. Selecciona la carpeta `bridge/`.
7. Si ya tenías una versión anterior instalada, pulsa Reload / Recargar sobre BRIDGE.
8. Recarga las dos pestañas ChatGPT para cargar `content.js`.

## Preparar las dos cuentas

Puedes usar dos pestañas ChatGPT normales, incluso con sesiones/cuentas distintas si el navegador las mantiene separadas.

1. Abre la pestaña que será CEREBRO.
2. Abre la pestaña que será OBRERO.
3. Comprueba que ambas muestran ChatGPT y que puedes escribir manualmente.
4. Después de instalar o recargar la extensión, recarga ambas pestañas.

## Iniciar un trabajo

1. Pulsa el icono de BRIDGE.
2. En CEREBRO, selecciona la primera pestaña.
3. En OBRERO, selecciona la segunda.
4. Escribe el mensaje inicial.
5. Ajusta:
   - Iteraciones: máximo de turnos.
   - Timeout CEREBRO: 120 segundos por defecto.
   - Timeout OBRERO: 900 segundos por defecto.
   - Espera mínima: evita aceptar demasiado rápido una respuesta recién iniciada.
6. Pulsa ACTIVAR BRIDGE.

BRIDGE envía el resultado comprobado al siguiente rol automáticamente.

## Finalización

Si una respuesta contiene exactamente:

`TRABAJO TERMINADO`

el ciclo pasa a `FINISHED` y no envía esa respuesta al otro rol.

También puede utilizarse:

`TRABAJO TERMINADO`

seguido de:

`[[BRIDGE_DONE]]`

El marcador se elimina antes de entregar el texto al siguiente componente.

## PAUSAR / CONTINUAR / DETENER

- PAUSAR: termina el turno que ya está en curso y no inicia el siguiente.
- CONTINUAR: retoma el siguiente turno.
- DETENER: marca el trabajo como detenido. Una respuesta de un turno ya invalidado se ignora al llegar.

## Si aparece un error de comunicación

Si BRIDGE dice que una pestaña no responde:

1. Ve a la pestaña CEREBRO u OBRERO afectada.
2. Recarga esa pestaña.
3. Espera a que ChatGPT termine de cargar.
4. Vuelve a abrir BRIDGE.
5. Comprueba las pestañas seleccionadas.
6. Inicia nuevamente.

## Consumo de RAM

BRIDGE no crea dos Chromiums adicionales. Usa las dos pestañas reales de Chrome/Brave que ya utilizas para ChatGPT. La ventana de control es una interfaz pequeña y no necesita permanecer visible durante el ciclo.

Minimizar Chrome o la ventana de control no es equivalente a cerrar las pestañas. El navegador puede, sin embargo, descartar una pestaña en segundo plano; si eso ocurre, el turno fallará de forma explícita.

## Verificación

La automatización real depende del DOM y del comportamiento del ChatGPT abierto en el navegador. El repositorio puede verificarse estáticamente mediante GitHub, pero una prueba end-to-end de dos pestañas reales requiere ejecutar la extensión dentro de Chrome/Brave con dos sesiones ChatGPT activas.

## Historial

Los cambios se mantienen en Git mediante commits separados. Antes de modificar una corrección existente, comprueba el commit y el estado de la rama para evitar sobrescribir trabajo anterior.

## Reutilización

La lógica se diseñó tomando como referencia el enfoque de Parley para automatización de chats y espera de respuestas completas. Parley está publicado bajo MIT:
https://github.com/Satyajeet-04/parley
