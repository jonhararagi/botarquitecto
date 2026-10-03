# BRIDGE — ChatGPT two-tab loop

BRIDGE hace conversar dos pestañas normales de ChatGPT usando una extensión local de Chrome/Brave.

## Qué cambió en 0.3.0

El ciclo automático ya **no depende de que la ventana visual de BRIDGE permanezca abierta o visible**.

El botón **🟢 ACTIVAR BRIDGE** inicia el trabajo en el service worker de la extensión. Cada turno se ejecuta dentro de la pestaña ChatGPT correspondiente y, cuando termina, la pestaña avisa a BRIDGE para continuar con la siguiente.

Esto permite:

- Minimizar la ventana de BRIDGE sin detener el ciclo.
- Minimizar la ventana de Chrome/Brave sin que BRIDGE dependa de su visibilidad.
- Cerrar la ventana de control sin detener deliberadamente el ciclo.
- Mantener el estado y el registro de la conversación en almacenamiento local de la extensión.
- Usar timeouts independientes para CEREBRO y OBRERO.
- Detectar si una de las pestañas fue cerrada.
- Continuar CEREBRO → OBRERO → CEREBRO hasta TRABAJO TERMINADO, STOP o el límite de iteraciones.
- Esperar a que cada respuesta termine de escribirse antes de aceptarla.
- **No reenviar automáticamente una respuesta solo porque apareció o cambió en el chat.**
- Requerir una **copia explícita del usuario** (selección + copiar/Ctrl+C) dentro de la última respuesta del asistente para pasar ese texto al siguiente chat.
- Ignorar texto que el usuario esté escribiendo y palabras sueltas detectadas fuera de una copia explícita.

### Limitación importante

Minimizar una ventana **no es lo mismo que cerrar o descartar una pestaña**.

BRIDGE no puede seguir ejecutando el contenido de una pestaña que:

- fue cerrada;
- fue descartada/suspendida por el navegador;
- perdió la página de ChatGPT y ya no contiene el content script.

Por eso debes mantener abiertas las dos pestañas ChatGPT. Si una necesita ser recargada, recárgala y vuelve a comprobar la conexión antes de iniciar un nuevo trabajo.

## Instalación

1. Descarga/clona este repositorio.
2. Abre Chrome o Brave.
3. Ve a chrome://extensions/ en Chrome o brave://extensions/ en Brave.
4. Activa Developer mode / Modo desarrollador.
5. Pulsa Load unpacked / Cargar descomprimida.
6. Selecciona la carpeta bridge/.
7. Si ya tenías una versión anterior instalada, pulsa Reload / Recargar sobre BRIDGE.

## Preparar las dos cuentas

Puedes usar dos pestañas ChatGPT normales, incluso con sesiones/cuentas distintas si el navegador las mantiene separadas.

1. Abre la pestaña que será CEREBRO.
2. Abre la pestaña que será OBRERO.
3. Comprueba que ambas muestran ChatGPT y que puedes escribir manualmente.
4. Si acabas de instalar/recargar la extensión, recarga ambas pestañas para cargar content.js.

## Iniciar un trabajo

1. Pulsa el icono de BRIDGE.
2. En CEREBRO, selecciona la primera pestaña.
3. En OBRERO, selecciona la segunda.
4. Escribe el mensaje inicial.
5. Ajusta:
   - Iteraciones: máximo de turnos.
   - Timeout CEREBRO: 120 segundos por defecto.
   - Timeout OBRERO: 900 segundos por defecto.
   - Espera mínima: evita reenviar demasiado rápido una respuesta recién terminada.
6. Pulsa 🟢 ACTIVAR BRIDGE.

El flujo será:

Mensaje inicial → CEREBRO → espera respuesta completa → **espera copia explícita** → OBRERO → espera respuesta completa → **espera copia explícita** → CEREBRO → ...

Para evitar falsos envíos, BRIDGE no usa el texto que estés escribiendo como señal. Solo acepta una copia realizada sobre la respuesta del asistente que acaba de terminar. El texto copiado debe pertenecer a esa respuesta.

Cuando cualquiera de los dos responda exactamente:

TRABAJO TERMINADO

BRIDGE pasa a FINISHED sin necesidad de reenviarlo al otro chat.

## Minimizar mientras trabaja

Una vez que aparece RUNNING:

1. Puedes minimizar la ventana de BRIDGE.
2. Puedes minimizar Chrome/Brave.
3. Puedes trabajar en otra aplicación.

No necesitas dejar BRIDGE visible.

El estado se conserva en el almacenamiento local de la extensión y la ventana de control funciona principalmente como monitor.

## PAUSAR / CONTINUAR / DETENER

- PAUSAR: termina el turno que ya está en curso y no inicia el siguiente.
- CONTINUAR: retoma el turno siguiente.
- DETENER: marca el trabajo como detenido. La respuesta de un turno que ya estaba ejecutándose se ignora al llegar.

## Si aparece un error de comunicación

Si BRIDGE dice que una pestaña no responde:

1. Ve a la pestaña CEREBRO u OBRERO afectada.
2. Recarga esa pestaña.
3. Espera a que ChatGPT termine de cargar.
4. Vuelve a abrir BRIDGE.
5. Comprueba las pestañas seleccionadas.
6. Inicia nuevamente.

## Importante sobre consumo de RAM

BRIDGE **no crea dos Chromiums adicionales**.

Usa las dos pestañas reales de Chrome/Brave que ya utilizas para ChatGPT. La ventana de control es una pequeña interfaz separada y el ciclo automático no necesita que permanezca visible.

## Verificación

La arquitectura 0.3.0 está preparada para que la ventana de control no sea el proceso que mantiene el ciclo. Aun así, el comportamiento real debe probarse en el Chrome/Brave del usuario porque ChatGPT puede cambiar su DOM y el navegador puede descartar pestañas en segundo plano.

## Reutilización

La lógica se diseñó tomando como referencia el enfoque de Parley para automatización de chats y espera de respuestas completas. Parley está publicado bajo MIT:
https://github.com/Satyajeet-04/parley
