# BRIDGE-010 · Protocolo manual de carga progresiva Chrome/Brave

## Propósito y límites

Este protocolo valida la extensión real ubicada en `bridge/`. GitHub Actions ejecuta el JavaScript real contra harnesses Node VM y APIs/DOM simulados; **no es una prueba real de Chrome/Brave ni del DOM en vivo de ChatGPT**.

Usar conversaciones de prueba separadas, no confidenciales, y mensajes simples. No registrar el contenido de conversaciones, cookies, tokens ni credenciales. No iniciar diez iteraciones sin completar antes los niveles inferiores.

## Preparación

En PowerShell dentro de un clon de trabajo:

```powershell
git fetch origin
git checkout worker/bridge-001-validation
git pull --ff-only origin worker/bridge-001-validation
git rev-parse HEAD
```

Comparar el SHA con el HEAD remoto mostrado en PR #6: https://github.com/jonhararagi/botarquitecto/pull/6

Abrir `chrome://extensions` o `brave://extensions`, habilitar **Developer mode**, usar **Load unpacked** y seleccionar la carpeta `bridge/` del clon sincronizado. Revisar errores de carga, abrir el panel BRIDGE y actualizar las dos pestañas ChatGPT para cargar el content script nuevo. Asignar dos pestañas distintas a CEREBRO y OBRERO. Limpiar la sesión antes de cada nivel y comprobar el límite de iteraciones mostrado y guardado.

## Cargas ordenadas

Cada nivel usa una sesión aislada con límite explícito. En la implementación actual, el contador representa respuestas aceptadas, no necesariamente un par completo CEREBRO+OBRERO.

1. **Nivel 1, una respuesta:** iniciar con una instrucción benigna como “Responde únicamente con la palabra PRUEBA”. Confirmar un único prompt enviado, resultado nuevo, contador incrementado una sola vez y sesión terminada en el límite.
2. **Nivel 2, tres respuestas:** solo si el nivel anterior no tuvo errores/duplicados, limpiar la sesión, poner el límite en 3 y repetir. Verificar alternancia de rol y que no se despache el siguiente turno antes de aceptar el actual.
3. **Nivel 3, cinco respuestas:** repetir solo después de que el nivel 2 pase. Confirmar contador final 5 y ausencia de respuestas viejas o despachos extra.
4. **Nivel 4, diez respuestas:** ejecutar solo después de que 1, 3 y 5 pasen. Confirmar contador final 10 y ningún despacho número 11.
5. **Nivel 5, dos sesiones simultáneas:** usar cuatro pestañas separadas y dos sesiones con límites bajos (3 respuestas cada una). Confirmar que ninguna sesión toma la respuesta, rol, log o contador de la otra.

No reintentar automáticamente un nivel si el estado del envío es ambiguo. La versión corregida debe detenerse con error explícito si no puede confirmar el envío; inspeccionar el compositor y último turno antes de decidir recuperación. No pulsar START de nuevo sobre una sesión que pudo haber enviado el mensaje.

## STOP y recuperación

- **STOP con turno pendiente:** detener durante una respuesta lenta. Confirmar `STOPPED`, que no arranque otro turno y que una respuesta tardía no aumente el contador ni despache al rol siguiente.
- **Recarga manual de extensión:** conservar el estado previo, usar Reload en la página de extensiones y verificar que un job ambiguo no se reenvíe automáticamente.
- **Cierre de pestaña:** cerrar una pestaña asignada durante un test corto y confirmar estado terminal ERROR, sin despacho nuevo.
- **Suspensión/reanudación natural MV3:** no sustituirla por Reload, reinicio de navegador o mocks. Registrar evidencia observable que distinga suspensión natural de una recarga.
- **Reinicio del navegador:** registrarlo como escenario separado; no inferir que suspensión natural quedó probada.

Si un paso se desvía de lo previsto, detener la sesión y conservar únicamente metadatos técnicos. No continuar al siguiente nivel después de un error.

## Evidencia sin contenido privado

Registrar navegador/versión, SO, fecha/hora/zona, SHA de la extensión cargada, nivel y límite configurado, alias de sesión (no compartir prompts privados), conteo esperado/real, estado final, número de errores/duplicados, si el compositor conservó el texto tras el intento, si se observó un control Stop activo y luego su desaparición, y si hubo un turno posterior a STOP. Adjuntar capturas solo si no exponen chats ni identificadores sensibles.

Estados permitidos: `PASS_AUTOMATED` para harness/CI, `PASS_REAL` para evidencia observada en navegador, `NOT_RUN` para escenarios no ejecutados, y `FAIL` si se reproduce un comportamiento contrario al contrato. Nunca etiquetar una simulación como `PASS_REAL`.

## Timer

Tiempo de ejecución medido no disponible. Estimación manual: 1–2 horas si los niveles pasan de forma progresiva; los errores reales pueden ampliar el trabajo. La estimación no es un resultado de prueba.
