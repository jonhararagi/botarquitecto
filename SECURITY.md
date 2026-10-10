# Seguridad de BRIDGE

## Alcance

BRIDGE es una extensión Chromium Manifest V3 que coordina conversaciones abiertas por el usuario en ChatGPT. El contenido de las respuestas puede pasar de una conversación asignada a CEREBRO a otra asignada a OBRERO. Por tanto, las instrucciones iniciales y las respuestas que se reenvían deben tratarse como datos que pueden salir de la conversación de origen y quedar visibles en la conversación de destino.

Este documento describe prácticas de uso seguro; no constituye una auditoría de seguridad independiente ni una garantía de ausencia de vulnerabilidades.

## Uso seguro

- Prueba primero con conversaciones nuevas, tareas inocuas y un perfil dedicado del navegador.
- No introduzcas contraseñas, tokens, claves API, datos personales sensibles ni información confidencial en una sesión automatizada.
- Revisa el texto inicial y las pestañas seleccionadas antes de activar una sesión. CEREBRO y OBRERO deben ser conversaciones distintas y pertenecer al mismo perfil del navegador.
- Configura límites bajos de iteraciones y timeouts al probar. Supervisa el ciclo y utiliza **Detener** si el comportamiento no es el esperado.
- Verifica el historial de ambas conversaciones después de una ejecución. Un estado interno de éxito no demuestra por sí solo que ChatGPT haya aceptado o mostrado el mensaje como se esperaba.
- Si BRIDGE no puede identificar una respuesta nueva de forma segura, trata el error como un bloqueo que requiere revisión; no des por válida una respuesta dudosa.
- Instala la extensión solo desde una copia del repositorio cuya rama y commit hayas revisado. No cargues extensiones de procedencia desconocida.

## Permisos y datos

El manifiesto de la rama candidata solicita los permisos `tabs`, `storage` y `alarms`, y limita los sitios declarados a `chatgpt.com` y `chat.openai.com`. Estos permisos son sensibles: antes de distribuir cualquier versión, revisa el manifiesto y el código asociado para comprobar que siguen siendo necesarios y están acotados al funcionamiento previsto.

El estado de la extensión se persiste mediante `chrome.storage.local` en el perfil del navegador. Ese almacenamiento no debe tratarse como un almacén cifrado de secretos. No presupongas que los datos de las conversaciones son privados frente a los servicios en los que se introducen: los mensajes enviados a ChatGPT se procesan según las condiciones y ajustes de la cuenta y del servicio.

Los selectores del DOM de ChatGPT pueden dejar de funcionar si cambia su interfaz. Después de cambios en el sitio, vuelve a validar el ciclo completo en un navegador real antes de usar BRIDGE para trabajos importantes.

## Cómo reportar una vulnerabilidad

1. No publiques exploits funcionales, datos de usuarios, capturas con información privada ni secretos en un issue público.
2. Si el repositorio ofrece **Private vulnerability reporting** o un aviso de seguridad privado en GitHub, utilízalo para comunicar los detalles de forma privada.
3. Si esa función no está disponible, contacta al mantenedor por un canal privado de GitHub antes de publicar detalles explotables.
4. Incluye la rama o el SHA afectado, navegador y versión, pasos mínimos para reproducir, impacto observado y una propuesta de mitigación si la tienes. Redacta tokens, URLs privadas y datos personales.
5. No afirmes que una vulnerabilidad está corregida hasta que el cambio haya sido revisado y la prueba correspondiente aporte evidencia.

## Puertas de seguridad antes de publicar

- [ ] Revisar los permisos del manifiesto y cualquier cambio en los hosts autorizados.
- [ ] Revisar cambios de código y dependencias; no incorporar recursos externos sin comprobar licencia y procedencia.
- [ ] Ejecutar la suite automatizada y verificar el resultado de CI en el SHA candidato.
- [ ] Ejecutar la validación manual E2E con dos conversaciones reales de ChatGPT, siguiendo [el checklist](bridge/MANUAL-E2E-CHECKLIST.md).
- [ ] Confirmar que STOP, timeout, recuperación y deduplicación se comportan como se espera en el navegador.
- [ ] Mantener el lanzamiento bloqueado si una comprobación obligatoria falla o no se ha ejecutado.

## Estado de validación

La existencia de esta política no implica que BRIDGE haya superado una auditoría formal. La validación E2E del navegador debe registrarse por separado y no puede sustituirse por pruebas unitarias o por CI verde.
