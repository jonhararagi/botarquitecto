# IA-CHAN-REPO-DISCOVERY-001 — Registro de continuidad

**Fecha del registro:** 2026-10-12  
**Estado:** `BLOCKED — IA_CHAN_REPOSITORY_NOT_IDENTIFIED`  
**Tipo:** descubrimiento de repositorio; solo lectura.  
**Origen:** informe entregado por BOT OBRERO y revisado por CEREBRO.  
**Propósito:** permitir que una conversación o agente nuevo retome la investigación sin pedir de nuevo el mismo informe ni asumir que un candidato es el repositorio correcto.

## Decisión

No se identificó con evidencia suficiente el repositorio del bot IA-chan de Python/Telegram con agentes, memoria y conocimiento. No se debe iniciar la auditoría de arquitectura ni implementar cambios hasta identificar el repositorio objetivo.

## Candidatos del informe de OBRERO

Los SHA de la tabla son los valores registrados por el informe entregado. El HEAD de `botarquitecto` se volvió a comprobar desde la conexión de GitHub para este registro; los otros SHA se conservan como datos del informe y deben revalidarse al retomar si resultan relevantes.

| Repositorio | Rama | HEAD reportado | Evaluación |
|---|---|---|---|
| [jonhararagi/botarquitecto](https://github.com/jonhararagi/botarquitecto) | `main` | `525cf1a5b666a95f1389a26a3f8d3282b17f10fc` | Descartado como bot IA-chan; es BRIDGE, una extensión Chromium CEREBRO/OBRERO. HEAD revalidado durante este registro. |
| [jonhararagi/vtuber](https://github.com/jonhararagi/vtuber) | `main` | `bbcd06c0e0706000cd95d85771b33452d11e7663` | Candidato débil, no confirmado; el README describe el bot VTuber local de escritorio y la integración Telegram no está activada. |
| [jonhararagi/botimagen](https://github.com/jonhararagi/botimagen) | `main` | `b508cfe7d3216eda801438d46dff8873842cea86` | Descartado; enfocado en assets/imágenes. |
| [jonhararagi/wordwaifu](https://github.com/jonhararagi/wordwaifu) | `main` | `c07ef226a61ad6e48b081890f1e3d96eecb585b5` | Sin evidencia pertinente en el informe recibido. |

## Evidencias buscadas

Rutas o nombres de referencia:
- `bot.py`
- `agentes/ia_chan/agente.py`
- `biblia/buscador.py`
- `biblia/contexto.py`
- `biblia/configuracion.py`
- `conocimiento/Biblia`
- componentes de Telegram, memoria, agentes y servicios OpenAI/Gemini.

El informe indica que se inspeccionaron README, árboles de archivos y algunos archivos candidatos. La búsqueda global de código fue limitada porque los repositorios propios consultados no aparecían indexados; por tanto, un resultado de búsqueda vacío no demuestra que el código no exista en repositorios no accesibles, ramas antiguas o copias locales.

## Qué se ha hecho y qué no

- Se recibieron y conservaron las conclusiones del informe `IA-CHAN-REPO-DISCOVERY-001`.
- Se revalidó que `jonhararagi/botarquitecto` tiene rama predeterminada `main` y HEAD `525cf1a5b666a95f1389a26a3f8d3282b17f10fc`.
- No se identificó el repositorio objetivo de IA-chan.
- No se modificó el código de IA-chan; el objetivo sigue sin identificarse.
- No se ejecutaron pruebas, CI ni workflows como parte de esta investigación.
- Este registro es documentación de continuidad en BRIDGE, no evidencia de que BRIDGE contenga o implemente IA-chan.

## Dato mínimo necesario para desbloquear

Obtener del usuario **un enlace o nombre parcial del repositorio correcto**, un enlace de commit/PR/rama antigua, o confirmar que el proyecto solo existe localmente en Windows. No volver a presentar `botarquitecto` o `vtuber` como confirmado sin nueva evidencia.

## Próxima tarea única

`IA-CHAN-REPO-DISCOVERY-002 — RESOLVE TARGET FROM USER-PROVIDED POINTER`

Cuando exista un enlace o nombre adicional, verificar propietario, rama predeterminada, HEAD remoto y estructura de archivos. Si no se proporciona nueva evidencia, detenerse y comunicar el bloqueo sin repetir toda la búsqueda anterior.

## Regla de continuidad

Todo informe de una tarea de CEREBRO/OBRERO —incluyendo `BLOCKED`, `PARTIAL` y auditorías sin cambios— debe quedar guardado en un archivo de handoff con ID de tarea, evidencia, limitaciones, acciones no realizadas y siguiente tarea. Añadir una entrada a `WORK_LOG.md` con enlace al handoff y HEAD BEFORE/AFTER. No exigir al usuario que vuelva a pegar un informe ya persistido; en una conversación nueva, leer primero el handoff y verificar el HEAD actual.
