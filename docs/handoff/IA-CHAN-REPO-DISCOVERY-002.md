# IA-CHAN-REPO-DISCOVERY-002 — Inventario ampliado de repositorios y ramas

**Fecha:** 2026-10-12  
**Estado:** `BLOCKED — IA_CHAN_REPOSITORY_NOT_IDENTIFIED`  
**Modo:** código de proyectos solo lectura; persistencia documental autorizada únicamente en `jonhararagi/botarquitecto`.  
**Propósito:** ampliar la cobertura de `IA-CHAN-REPO-DISCOVERY-001` mediante inventario de repositorios, ramas y árboles remotos; no iniciar una auditoría de arquitectura sin identidad confirmada.

## HEAD del repositorio de coordinación

- **Repositorio:** [jonhararagi/botarquitecto](https://github.com/jonhararagi/botarquitecto)
- **Rama:** `main`
- **HEAD BEFORE:** `a998ed3f4a77e526fbda1772e6e00de368c89c4d`
- **HEAD AFTER (persistencia documental principal):** `8b5fca3d75e896da5be88874b8fc77f57addf2ef`.
- **Evidencia:** consulta remota de `/repos/jonhararagi/botarquitecto/branches/main`; el HEAD cambió desde el valor registrado en DISCOVERY-001. No se modificó ninguna rama de producto.

## Método y cobertura

Se consultaron las dos conexiones GitHub expuestas. La enumeración de repositorios devolvió 9 repositorios en la conexión personal y 1 en la otra conexión; este último es duplicado de la primera lista. No se devolvieron organizaciones en las consultas de membresía. Se enumeraron las ramas remotas de los 9 repositorios: **237 refs de rama en total**.

Se consultaron árboles recursivos del HEAD predeterminado de los 9 repositorios. Además, se inspeccionaron árboles recursivos de todas las ramas de los seis repositorios con señales de Python, memoria/IA, bot o posibles integraciones: `motowaifus` (85), `baseball-waifus` (54), `botarquitecto` (10), `vtuber` (9), `botimagen` (14) y `wordwaifu` (9). En conjunto son 181 ramas con árboles inspeccionados. Las 54 ramas restantes de `animeart` se enumeraron, pero no se recorrieron individualmente porque el árbol predeterminado y los nombres de rama apuntan a un editor web/Android de dibujo; el árbol predeterminado no contiene Python ni las rutas buscadas. Los dos repositorios restantes tienen una sola rama cada uno y sus árboles predeterminados fueron inspeccionados.

Búsqueda por rutas/nombres en árboles: `bot.py`, `agentes/`, `ia_chan`, `biblia/`, `conocimiento/`, variantes de memoria, Telegram, OpenAI/Gemini, archivos de configuración Python y módulos de simulación. También se ejecutaron búsquedas de código en los repositorios accesibles; los resultados no devolvieron coincidencias, pero el índice de código no se considera evidencia de ausencia. Se buscaron commits/PR con “IA-chan” en los candidatos principales; solo aparecieron los commits documentales de este proceso. La conexión GitHub no aceptó las URLs de colecciones de tags ni de Gists; por tanto, esos espacios no pudieron verificarse mediante esta herramienta.

## Inventario de repositorios

| Repositorio | Rama predeterminada / HEAD | Ramas | Evaluación para IA-chan |
|---|---|---:|---|
| [jonhararagi/motowaifus](https://github.com/jonhararagi/motowaifus) | `main` / `3b6948688b35aae80a5b577b4dc768cb9a3ecdbe` | 85 | **DISCARDED como identidad confirmada.** La rama `cari-studio` (`65903f8805616537c5db4c5e35d620439ae8b49c`) contiene Python, `app/brain/`, `app/memory/`, `app/intelligence/llm.py`, `app/twitch/` y `run_twitch.py`; el README la identifica explícitamente como VTuber Cari local-first y documenta TwitchIO. No aparecen `agentes/ia_chan`, `biblia/` ni un bot Python de Telegram. En la rama `feat/tma-telegram-persistence-hardware` la coincidencia Telegram es JavaScript de Telegram Mini App (`webapp/js/scavenged/telegram/`), no el bot solicitado. Es el parecido arquitectónico más fuerte, pero no hay evidencia para afirmar que sea IA-chan. |
| [jonhararagi/baseball-waifus](https://github.com/jonhararagi/baseball-waifus) | `main` / `988c0fa3c7c17077d18e5f7f0722726cae39a197` | 54 | **DISCARDED.** README: prototipo Godot de béisbol. Sus ramas incluyen `tools/character_ai/` y `tools/streaming_bridge/` con herramientas Python; no se hallaron las rutas/símbolos objetivo ni un bot Telegram de IA-chan. La rama `t063a-meta-gacha-telegram-qa` también fue inspeccionada y no reveló las rutas buscadas. |
| [jonhararagi/botarquitecto](https://github.com/jonhararagi/botarquitecto) | `main` / `a998ed3f4a77e526fbda1772e6e00de368c89c4d` | 10 | **DISCARDED.** README/instrucciones lo identifican como BRIDGE, una extensión Chromium CEREBRO/OBRERO. Los árboles de las 10 ramas no muestran módulos Python de IA-chan ni integración Telegram. |
| [jonhararagi/vtuber](https://github.com/jonhararagi/vtuber) | `main` / `bbcd06c0e0706000cd95d85771b33452d11e7663` | 9 | **DISCARDED.** README: base Windows local-first para VTuber; la integración Telegram no está activada y el proyecto está migrando a C#/.NET/WPF. Las 9 ramas tienen una estructura Python de aplicación de escritorio como referencia temporal, sin las rutas de IA-chan/Biblia. |
| [jonhararagi/botimagen](https://github.com/jonhararagi/botimagen) | `main` / `b508cfe7d3216eda801438d46dff8873842cea86` | 14 | **DISCARDED.** README y árboles describen una herramienta de intake/generación de imágenes con API local; sus 14 ramas no contienen las rutas de IA-chan ni señales de Telegram/memoria del bot buscado. |
| [jonhararagi/wordwaifu](https://github.com/jonhararagi/wordwaifu) | `main` / `c07ef226a61ad6e48b081890f1e3d96eecb585b5` | 9 | **DISCARDED.** Proyecto de aprendizaje de vocabulario/narrativa; las ramas inspeccionadas contienen utilidades Python de validación/preview, no el bot solicitado. |
| [jonhararagi/animeart](https://github.com/jonhararagi/animeart) | `main` / `c8b1c7994fba9960de94a27b77027dca84c9f424` | 54 | **DISCARDED preliminar.** README y árbol predeterminado describen un editor de dibujo web-first con base Android; no hay Python ni rutas objetivo en el árbol predeterminado. Las 54 ramas fueron enumeradas, pero no se inspeccionaron individualmente todas sus trees. |
| [jonhararagi/motowaifus-empty-backup-20261011](https://github.com/jonhararagi/motowaifus-empty-backup-20261011) | `main` / `1e60a2a9337d671295931ef43bd082372638623b` | 1 | **DISCARDED.** Árbol de un solo elemento; no contiene estructura del bot. |
| [jonhararagi/botimagen-referencias-privadas](https://github.com/jonhararagi/botimagen-referencias-privadas) | `main` / `f000ceb600cb0691f398ac752ec636709768460b` | 1 | **DISCARDED preliminar.** Árbol de 17 elementos sin rutas objetivo; no se encontró README en la ruta raíz. El acceso a este repositorio está disponible, pero no ofrece evidencia de IA-chan. |

**Otros espacios y permisos:** las conexiones solo expusieron las cuentas de usuario `jonhararagi` y `araragijona-coder`; no se devolvieron organizaciones. La lista de repositorios accesibles incluyó el repositorio privado `botimagen-referencias-privadas`, que fue inspeccionado. Gists y colecciones de tags no pudieron consultarse mediante el conector disponible. No se puede descartar código en repositorios de otras cuentas no conectadas, ramas eliminadas, repositorios no accesibles o copias locales de Windows.

## Candidatos

- **CONFIRMED:** ninguno.
- **PROBABLE:** ninguno. `motowaifus/cari-studio` es solo un parecido arquitectónico parcial (Python, memoria, pipeline de IA, Twitch), no una identidad verificada de IA-chan.
- **DISCARDED:** los repositorios de coordinación, VTuber, juegos, imagen, editor y aprendizaje enumerados arriba, según las evidencias concretas de cada uno.
- **UNKNOWN:** cualquier repositorio fuera de las cuentas/permisos conectados y las copias locales de Windows.

## Estado de las fases

- **PASS_REAL:** inventario remoto de repositorios accesibles, HEAD predeterminados, ramas y árboles descritos en la sección de cobertura.
- **PASS_STATIC:** evaluación de rutas, READMEs y archivos seleccionados.
- **NOT_RUN:** tests, CI, workflows y ejecución local del bot; no eran necesarios y no se ejecutaron.
- **BLOCKED:** identidad del repositorio IA-chan no resuelta.
- **No se asigna porcentaje global:** esta tarea produce cobertura de búsqueda, no un hito funcional del producto.

## Siguiente tarea única

`IA-CHAN-REPO-DISCOVERY-003 — LOCATE OUT-OF-SCOPE SOURCE`.

Solicitar únicamente una nueva pista local o externa que permita ampliar el alcance: ruta de carpeta de Windows (por ejemplo, ubicación del proyecto), nombre parcial de carpeta/archivo, URL de repositorio/commit/PR, o una cuenta/organización adicional que deba conectarse. No repetir el mismo inventario ni iniciar `IA-CHAN-AUDIT-001` hasta identificar el repositorio con evidencia.

## No realizado

- No se modificó código de ningún producto.
- No se instalaron dependencias.
- No se ejecutaron workflows, CI ni pruebas.
- No se fusionaron PRs ni se cambiaron ramas.
- No se leyeron ni expusieron secretos, tokens o datos privados de conversaciones.
