# BRIDGE — ChatGPT two-tab loop

MVP local para hacer conversar dos pestañas normales de ChatGPT del mismo Chrome.

## Qué hace

- Detecta pestañas existentes de `chatgpt.com` y `chat.openai.com`.
- Abre una ventana de control separada al pulsar el icono de BRIDGE.
- Permite seleccionar:
  - CEREBRO
  - OBRERO
- Envía un mensaje inicial a CEREBRO.
- Espera la respuesta completa.
- La envía al OBRERO.
- Espera la respuesta completa.
- Alterna entre ambas pestañas.
- Detecta respuestas duplicadas.
- Tiene timeout por respuesta.
- Permite PAUSAR, CONTINUAR y DETENER.
- Tiene límite de iteraciones.
- Si una respuesta es exactamente `TRABAJO TERMINADO`, termina con estado `FINISHED`.

## Carga en Chrome

1. Abrir `chrome://extensions/`.
2. Activar Developer mode.
3. Elegir Load unpacked.
4. Seleccionar la carpeta `bridge/` del repositorio.
5. Abrir dos pestañas normales de ChatGPT y mantener la sesión iniciada.
6. Pulsar el icono de BRIDGE.
7. Seleccionar las dos pestañas.
8. Escribir el mensaje inicial.
9. Pulsar INICIAR.

## Importante

Esta versión usa el DOM de ChatGPT desde content scripts. Los selectores están preparados con varios fallbacks, pero ChatGPT puede cambiar su interfaz.

La detección de respuesta espera que aparezca una respuesta nueva y que su texto permanezca estable durante aproximadamente 1.4 segundos antes de devolverla.

## Estado de verificación

La implementación fue escrita y subida al repositorio, pero todavía necesita una prueba manual real en el Chrome del usuario. No se debe considerar el MVP verificado hasta realizar esa prueba.

## Reutilización

La lógica se diseñó tomando como referencia el enfoque de Parley para automatización de chats y espera de respuestas completas. Parley está publicado bajo MIT:
https://github.com/Satyajeet-04/parley
