const CHATGPT_PATTERNS = [
  /^https:\/\/chatgpt\.com\//,
  /^https:\/\/chat\.openai\.com\//
];

const STORAGE_KEY = "bridgeStateV5";
const DEFAULT_SETTINGS = { brainTimeoutMs: 60000, workerTimeoutMs: 600000, minTurnDelayMs: 0, maxIterations: 10 };
const WATCHDOG_ALARM = "bridge-turn-watchdog";

function makeId() { return "session-" + crypto.randomUUID(); }
function createSessionModel(name = "Sesión 1") {
  return { id: makeId(), name, brainTabId: null, workerTabId: null, status: "IDLE", paused: false, stopRequested: false, running: false, iteration: 0, maxIterations: DEFAULT_SETTINGS.maxIterations, brainTimeoutMs: DEFAULT_SETTINGS.brainTimeoutMs, workerTimeoutMs: DEFAULT_SETTINGS.workerTimeoutMs, minTurnDelayMs: DEFAULT_SETTINGS.minTurnDelayMs, lastForwarded: "", activeRole: null, activeJobId: null, activeJobStartedAt: null, activeJobTimeoutMs: null, completingJobId: null, diagnostic: null, log: [] };
}

const DEFAULT_STATE = { version: 5, activeSessionId: null, sessions: [] };
let state = structuredClone(DEFAULT_STATE);
let hydrated = false;
let hydrationPromise = null;

async function hydrate() {
  if (hydrated) return;
  // Runtime messages can arrive concurrently during MV3 worker startup.
  // Share one in-flight hydration so a second request cannot reload stale
  // storage over state mutations performed by the first request.
  if (hydrationPromise) return hydrationPromise;

  hydrationPromise = (async () => {
    const saved = await chrome.storage.local.get(STORAGE_KEY);
    if (saved?.[STORAGE_KEY]?.sessions) state = saved[STORAGE_KEY];
    if (!Array.isArray(state.sessions)) state.sessions = [];
    if (!state.sessions.length) {
      const s = createSessionModel("Sesión 1");
      state.sessions.push(s);
      state.activeSessionId = s.id;
    }
    if (!state.activeSessionId || !state.sessions.some(s => s.id === state.activeSessionId)) state.activeSessionId = state.sessions[0].id;
    hydrated = true;
    await saveState();
    await reconcileRunningSessions();
  })();

  try {
    await hydrationPromise;
  } finally {
    hydrationPromise = null;
  }
}
// Serialize persistence writes so a slower, older storage operation cannot
// overwrite a newer transition (for example STOP racing with TURN_COMPLETE).
let saveQueue = Promise.resolve();
async function saveState() {
  // Capture this transition now; never serialize the mutable live object later.
  const snapshot = structuredClone(state);
  const pending = saveQueue.catch(() => {}).then(() =>
    chrome.storage.local.set({ [STORAGE_KEY]: snapshot })
  );
  saveQueue = pending;
  await pending;
}

async function updateWatchdogAlarm() {
  if (!chrome.alarms) return;
  const hasActiveTurn = state.sessions.some(s => s.running && s.activeJobId);
  try {
    if (hasActiveTurn) {
      // MV3 alarms have a 30-second minimum interval in current Chromium releases.
      await chrome.alarms.create(WATCHDOG_ALARM, { delayInMinutes: 0.5, periodInMinutes: 0.5 });
    } else {
      await chrome.alarms.clear(WATCHDOG_ALARM);
    }
  } catch (error) {
    console.error("BRIDGE no pudo actualizar el watchdog", error);
  }
}

async function expireActiveTurn(s, reason) {
  const role = s.activeRole;
  const jobId = s.activeJobId;
  const tabId = role === "CEREBRO" ? s.brainTabId : role === "OBRERO" ? s.workerTabId : null;
  await failSession(s, reason);
  if (tabId != null && jobId) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "CANCEL_TURN", jobId });
    } catch {
      // The session is already failed; an unavailable tab cannot restart it.
    }
  }
}

async function checkActiveTurnDeadlines() {
  const now = Date.now();
  for (const s of [...state.sessions]) {
    if (!s.running || !s.activeJobId || s.completingJobId === s.activeJobId) continue;
    const startedAt = Number(s.activeJobStartedAt) || 0;
    const timeoutMs = Number(s.activeJobTimeoutMs) || 0;
    if (!startedAt || !timeoutMs) {
      await expireActiveTurn(s, "No se puede recuperar el turno activo: faltan datos de timeout persistidos");
    } else if (now - startedAt >= timeoutMs) {
      await expireActiveTurn(s, s.activeRole + " superó el timeout de " + Math.round(timeoutMs / 1000) + " segundos");
    }
  }
  await updateWatchdogAlarm();
}

async function reconcileRunningSessions() {
  for (const s of [...state.sessions]) {
    if (s.running && s.completingJobId && s.completingJobId === s.activeJobId) {
      await failSession(s, "Recuperación segura: el servicio se reinició durante la confirmación de un turno");
    } else if (s.running && (!s.activeJobId || !s.activeRole)) {
      await failSession(s, "Recuperación segura: la sesión figuraba activa pero no tenía un turno recuperable");
    }
  }
  await checkActiveTurnDeadlines();
}
function getSession(id) { return state.sessions.find(s => s.id === id) || null; }
function snapshot() { return { version: state.version, activeSessionId: state.activeSessionId, sessions: state.sessions.map(s => ({ ...s, log: [...s.log] })) }; }
async function addLog(s, role, text) {
  s.log.push({ id: Date.now() + "-" + Math.random().toString(36).slice(2, 8), role, text: String(text || ""), time: Date.now() });
  if (s.log.length > 120) s.log.splice(0, s.log.length - 120);
  await saveState();
}
function isChatGPTTab(tab) { return typeof tab?.url === "string" && CHATGPT_PATTERNS.some(p => p.test(tab.url)); }
async function getChatGPTTabs() {
  return (await chrome.tabs.query({})).filter(isChatGPTTab).map(tab => ({ id: tab.id, windowId: tab.windowId, title: tab.title || "ChatGPT", url: tab.url }));
}
async function ensureTabAlive(tabId, role) {
  if (!tabId) throw new Error(role + " no tiene pestaña configurada");
  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch { throw new Error(role + " fue cerrada"); }
  if (!isChatGPTTab(tab)) throw new Error(role + " ya no es una pestaña ChatGPT");
}

async function dispatchTurn(s, role, text) {
  if (!s.running || s.stopRequested || s.paused) return;
  const tabId = role === "CEREBRO" ? s.brainTabId : s.workerTabId;
  const timeoutMs = role === "CEREBRO" ? s.brainTimeoutMs : s.workerTimeoutMs;
  const jobId = crypto.randomUUID();
  await ensureTabAlive(tabId, role);
  // STOP may arrive while ensureTabAlive awaits chrome.tabs.get(). Recheck
  // before publishing a new active job, otherwise STOP can leave a stale job
  // in persisted state even though no START_TURN was dispatched.
  if (!s.running || s.stopRequested) return;
  s.activeRole = role; s.activeJobId = jobId; s.activeJobStartedAt = Date.now(); s.activeJobTimeoutMs = timeoutMs; s.completingJobId = null;
  s.status = "RUNNING — " + s.name + " — " + role;
  await saveState();
  await updateWatchdogAlarm();
  await addLog(s, "BRIDGE", "Enviando a " + role + "...");
  // STOP or another state transition may occur while persistence is pending.
  if (!s.running || s.stopRequested || s.activeJobId !== jobId) return;
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "START_TURN", jobId, text, timeoutMs, minTurnDelayMs: s.minTurnDelayMs, role, sessionId: s.id });
    if (!response?.ok) throw new Error(response?.error || role + " no pudo iniciar el turno");

    // STOP can race with the asynchronous START_TURN acknowledgement. If the
    // tab received the start after STOP already cancelled the job, cancel it
    // again after the acknowledgement so a late message cannot keep running.
    if (!s.running || s.stopRequested || s.activeJobId !== jobId) {
      try {
        await chrome.tabs.sendMessage(tabId, { type: "CANCEL_TURN", jobId });
      } catch {
        // The session is already stopped; a closed tab cannot restart it.
      }
    }
  } catch (error) {
    throw new Error(role + " no responde. Recarga esa pestaña ChatGPT para cargar BRIDGE. " + (error?.message || ""));
  }
}

function classifyDiagnostic(message, role) {
  const reason = String(message || "Error no especificado");
  if (/timeout|super[oó] el timeout/i.test(reason)) return { category: "timeout", title: "Se agotó el tiempo de espera", recovery: "Comprueba que la pestaña siga abierta y que ChatGPT haya terminado de responder. Si está bloqueada, recárgala y vuelve a iniciar la sesión." };
  if (/fue cerrada|pestaña.*cerrada/i.test(reason)) return { category: "tab-closed", title: "Se cerró una pestaña necesaria", recovery: "Abre de nuevo ChatGPT, selecciona la conversación correspondiente, actualiza las pestañas y vuelve a iniciar la sesión." };
  if (/ya no es una pestaña ChatGPT|no tiene pestaña configurada/i.test(reason)) return { category: "tab-invalid", title: "La pestaña asignada no es válida", recovery: "Selecciona una pestaña de ChatGPT válida para ese rol y comprueba que CEREBRO y OBRERO sean pestañas distintas." };
  if (/no responde|no pudo iniciar el turno/i.test(reason)) return { category: "tab-unresponsive", title: "La pestaña no respondió a BRIDGE", recovery: "Recarga la pestaña de ChatGPT para volver a cargar BRIDGE, espera a que termine de cargar y prueba otra vez." };
  if (/respuesta vacía/i.test(reason)) return { category: "empty-response", title: "La respuesta recibida estaba vacía", recovery: "Comprueba si ChatGPT generó una respuesta visible. Si la conversación quedó a medio generar, recárgala y vuelve a intentarlo." };
  if (/duplicada/i.test(reason)) return { category: "duplicate-response", title: "Se detectó una respuesta duplicada", recovery: "No se reenvió esa respuesta. Revisa el historial de ambas conversaciones y vuelve a iniciar con una instrucción que pida una salida nueva." };
  if (/reinici[oó] durante|servicio se reinici[oó]|no se puede recuperar|no tenía un turno recuperable/i.test(reason)) return { category: "recovery", title: "BRIDGE no pudo recuperar el turno de forma segura", recovery: "La sesión se detuvo para evitar un reenvío incierto. Revisa ambas conversaciones y reinicia la sesión desde el último resultado confirmado." };
  return { category: "error", title: "La sesión se detuvo por un error", recovery: "Revisa el motivo y la pestaña indicada. Corrige la causa y vuelve a iniciar la sesión; BRIDGE no reanuda automáticamente un turno fallido." };
}
async function failSession(s, message) {
  const reason = String(message || "Error no especificado");
  const roleMatch = reason.match(/^(CEREBRO|OBRERO)(?:\s*[—-]|\s+)/i);
  const role = roleMatch ? roleMatch[1].toUpperCase() : s.activeRole;
  const tabId = role === "CEREBRO" ? s.brainTabId : role === "OBRERO" ? s.workerTabId : null;
  const details = classifyDiagnostic(reason, role);
  s.diagnostic = { ...details, reason, role: role || null, tabId: tabId ?? null, timestamp: Date.now() };
  s.running = false; s.activeRole = null; s.activeJobId = null;
  s.activeJobStartedAt = null; s.activeJobTimeoutMs = null; s.completingJobId = null;
  s.status = "ERROR — " + message;
  await addLog(s, "BRIDGE", "ERROR — " + message);
  await saveState();
  await updateWatchdogAlarm();
}

async function finishTurn(s, jobId, ok, role, text, error) {
  if (!s.running || s.stopRequested || jobId !== s.activeJobId) return;
  if (!ok) {
    s.activeJobId = null; s.activeRole = null; s.activeJobStartedAt = null; s.activeJobTimeoutMs = null; s.completingJobId = null;
    await updateWatchdogAlarm();
    return failSession(s, role + " — " + (error || "error desconocido"));
  }
  const result = String(text || "").trim();
  if (!result) {
    s.activeJobId = null; s.activeRole = null; s.activeJobStartedAt = null; s.activeJobTimeoutMs = null; s.completingJobId = null;
    await updateWatchdogAlarm();
    return failSession(s, role + " devolvió una respuesta vacía");
  }
  if (s.completingJobId === jobId) return;
  // Keep the active job identity while persisting the result. This lets STOP cancel
  // the real tab and makes concurrent duplicate acknowledgements idempotent.
  s.completingJobId = jobId;
  await saveState();
  if (!s.running || s.stopRequested || s.activeJobId !== jobId) {
    if (s.completingJobId === jobId) s.completingJobId = null;
    s.status = "STOPPED";
    return saveState();
  }
  await addLog(s, role, result);
  // STOP may arrive while the log is being persisted. Never restart the loop afterwards.
  if (!s.running || s.stopRequested || s.activeJobId !== jobId) {
    if (s.completingJobId === jobId) s.completingJobId = null;
    s.status = "STOPPED";
    return saveState();
  }
  s.activeJobId = null; s.activeRole = null; s.activeJobStartedAt = null; s.activeJobTimeoutMs = null; s.completingJobId = null;
  await updateWatchdogAlarm();
  if (result === "TRABAJO TERMINADO") { s.running = false; s.status = "FINISHED — TRABAJO TERMINADO"; await saveState(); await updateWatchdogAlarm(); return; }
  if (result === s.lastForwarded) return failSession(s, "Respuesta duplicada detectada");

  const nextRole = role === "CEREBRO" ? "OBRERO" : "CEREBRO";
  s.lastForwarded = result; s.iteration++;
  if (s.iteration >= s.maxIterations) { s.running = false; s.status = "LIMIT_REACHED — " + s.iteration + " iteraciones"; await saveState(); await updateWatchdogAlarm(); return; }
  if (s.paused) { s.status = "PAUSED — siguiente: " + nextRole; await saveState(); await updateWatchdogAlarm(); return; }

  s.status = "AUTO_FORWARD — " + role + " → " + nextRole;
  await addLog(s, "BRIDGE", "Respuesta verificada. Enviando automáticamente a " + nextRole + ".");
  await saveState();
  try { await dispatchTurn(s, nextRole, result); } catch (e) { await failSession(s, e.message || String(e)); }
}

async function createSession(name) {
  const normalizedName = String(name || "").trim() || "Sesión " + (state.sessions.length + 1);
  const s = createSessionModel(normalizedName);
  state.sessions.push(s);
  state.activeSessionId = s.id;
  await saveState();
  return s;
}
async function removeSession(id) {
  const s = getSession(id);
  if (!s) throw new Error("Sesión no encontrada");
  if (s.running) throw new Error("Detén la sesión antes de eliminarla");
  if (state.sessions.length === 1) throw new Error("Debe existir al menos una sesión");
  state.sessions = state.sessions.filter(x => x.id !== id);
  if (state.activeSessionId === id) state.activeSessionId = state.sessions[0].id;
  await saveState();
}

if (chrome.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener(async alarm => {
    if (alarm?.name !== WATCHDOG_ALARM) return;
    await hydrate();
    await checkActiveTurnDeadlines();
  });
}

if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(async () => {
    await hydrate();
    await checkActiveTurnDeadlines();
  });
}

chrome.tabs.onRemoved.addListener(async tabId => {
  await hydrate();
  for (const s of state.sessions) if (s.running && (tabId === s.brainTabId || tabId === s.workerTabId)) {
    await failSession(s, (tabId === s.brainTabId ? "CEREBRO" : "OBRERO") + " — pestaña fue cerrada");
  }
});

chrome.action.onClicked.addListener(async () => {
  await hydrate();
  const controlUrl = chrome.runtime.getURL("control.html");
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find(tab => tab.url === controlUrl);

  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }

  await chrome.tabs.create({ url: controlUrl, active: true });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    await hydrate();
    if (message?.type === "LIST_CHATGPT_TABS") { sendResponse({ ok: true, tabs: await getChatGPTTabs(), state: snapshot() }); return; }

    if (message?.type === "CREATE_SESSION") {
      const s = createSessionModel(String(message.name || "").trim() || "Sesión " + (state.sessions.length + 1));
      state.sessions.push(s); state.activeSessionId = s.id; await saveState();
      sendResponse({ ok: true, state: snapshot() }); return;
    }
    if (message?.type === "DELETE_SESSION") { await removeSession(String(message.sessionId || "")); sendResponse({ ok: true, state: snapshot() }); return; }
    if (message?.type === "SELECT_SESSION") {
      const s = getSession(String(message.sessionId || "")); if (!s) throw new Error("Sesión no encontrada");
      state.activeSessionId = s.id; await saveState(); sendResponse({ ok: true, state: snapshot() }); return;
    }
    if (message?.type === "SAVE_SESSION") {
      const s = getSession(String(message.sessionId || "")); if (!s) throw new Error("Sesión no encontrada");
      if (s.running) throw new Error("No cambies una sesión mientras está activa");
      s.name = String(message.name || s.name).trim() || s.name;
      s.brainTabId = Number(message.brainTabId) || null; s.workerTabId = Number(message.workerTabId) || null;
      s.maxIterations = Math.max(1, Math.min(100, Number(message.maxIterations) || 10));
      s.brainTimeoutMs = Math.max(5000, Math.min(1800000, Number(message.brainTimeoutMs) || 60000));
      s.workerTimeoutMs = Math.max(5000, Math.min(1800000, Number(message.workerTimeoutMs) || 600000));
      s.minTurnDelayMs = Math.max(0, Math.min(60000, Number(message.minTurnDelayMs) || 0));
      await saveState(); sendResponse({ ok: true, state: snapshot() }); return;
    }
    if (message?.type === "START_LOOP") {
      const s = getSession(String(message.sessionId || "")); if (!s) throw new Error("Sesión no encontrada");
      if (s.running) throw new Error("Esta sesión ya está activa");
      const requestedBrainTabId = Number(message.brainTabId) || s.brainTabId;
      const requestedWorkerTabId = Number(message.workerTabId) || s.workerTabId;
      if (!requestedBrainTabId || !requestedWorkerTabId || requestedBrainTabId === requestedWorkerTabId) {
        throw new Error("CEREBRO y OBRERO deben ser dos pestañas ChatGPT distintas");
      }
      for (const other of state.sessions) {
        if (other.id === s.id || !other.running) continue;
        if ([other.brainTabId, other.workerTabId].includes(requestedBrainTabId) ||
            [other.brainTabId, other.workerTabId].includes(requestedWorkerTabId)) {
          throw new Error("Una de las pestañas seleccionadas ya está ocupada por otra sesión activa");
        }
      }
      const seed = String(message.seed || "").trim(); if (!seed) throw new Error("Escribe el mensaje inicial");
      s.brainTabId = requestedBrainTabId; s.workerTabId = requestedWorkerTabId;
      s.maxIterations = Math.max(1, Math.min(100, Number(message.maxIterations) || 10));
      s.brainTimeoutMs = Math.max(5000, Math.min(1800000, Number(message.brainTimeoutMs) || 60000));
      s.workerTimeoutMs = Math.max(5000, Math.min(1800000, Number(message.workerTimeoutMs) || 600000));
      s.minTurnDelayMs = Math.max(0, Math.min(60000, Number(message.minTurnDelayMs) || 0));
      s.running = true; s.paused = false; s.stopRequested = false; s.iteration = 0; s.lastForwarded = ""; s.diagnostic = null; s.activeRole = null; s.activeJobId = null; s.activeJobStartedAt = null; s.activeJobTimeoutMs = null; s.completingJobId = null; s.log = []; s.status = "STARTING";
      state.activeSessionId = s.id; await saveState(); await addLog(s, "USUARIO", seed);
      try { await dispatchTurn(s, "CEREBRO", seed); } catch (e) { await failSession(s, e.message || String(e)); }
      sendResponse({ ok: true, state: snapshot() }); return;
    }
    if (["PAUSE","RESUME","STOP"].includes(message?.type)) {
      const s = getSession(String(message.sessionId || state.activeSessionId)); if (!s) throw new Error("Sesión no encontrada");
      let cancelTurn = null;
      if (message.type === "PAUSE") { s.paused = true; if (s.running) s.status = "PAUSED — esperando terminar el turno actual"; }
      if (message.type === "RESUME") {
        s.paused = false;
        if (s.running && !s.activeJobId) {
          const last = s.log.filter(x => x.role === "CEREBRO" || x.role === "OBRERO").at(-1);
          if (!last) throw new Error("No hay un turno pendiente para continuar");
          try {
            await dispatchTurn(s, last.role === "CEREBRO" ? "OBRERO" : "CEREBRO", last.text);
          } catch (error) {
            // A paused session has no active job to protect it with the watchdog.
            // If its next tab is unavailable, fail closed instead of leaving it
            // marked as running with no recoverable turn.
            await failSession(s, error.message || String(error));
          }
        } else if (s.running) s.status = "RUNNING — esperando a " + s.activeRole;
      }
      if (message.type === "STOP") {
        const stoppedRole = s.activeRole;
        const stoppedTabId = stoppedRole === "CEREBRO" ? s.brainTabId : stoppedRole === "OBRERO" ? s.workerTabId : null;
        s.diagnostic = { category: "stopped", title: "Sesión detenida manualmente", reason: "Detenida por el usuario", role: stoppedRole || null, tabId: stoppedTabId ?? null, timestamp: Date.now(), recovery: "Cuando quieras continuar, revisa la última respuesta confirmada y pulsa Activar sesión para iniciar un ciclo nuevo." };
        if (s.activeJobId && s.activeRole) {
          cancelTurn = {
            tabId: s.activeRole === "CEREBRO" ? s.brainTabId : s.workerTabId,
            jobId: s.activeJobId
          };
        }
        s.stopRequested = true;
        s.running = false;
        s.paused = false;
        s.activeJobId = null;
        s.activeRole = null;
        s.activeJobStartedAt = null;
        s.activeJobTimeoutMs = null;
        s.completingJobId = null;
        s.status = "STOPPED";
      }
      await saveState();
      await updateWatchdogAlarm();
      if (cancelTurn?.tabId != null) {
        try {
          await chrome.tabs.sendMessage(cancelTurn.tabId, {
            type: "CANCEL_TURN",
            jobId: cancelTurn.jobId
          });
        } catch {
          // The session is already stopped; a closed/unresponsive tab cannot restart it.
        }
      }
      sendResponse({ ok: true, state: snapshot() });
      return;
    }
    if (message?.type === "RESET_SESSION") {
      const s = getSession(String(message.sessionId || state.activeSessionId)); if (!s) throw new Error("Sesión no encontrada");
      if (s.running) throw new Error("Detén la sesión antes de limpiarla");
      const id = s.id;
      const name = s.name, brainTabId = s.brainTabId, workerTabId = s.workerTabId;
      Object.assign(s, createSessionModel(name));
      // RESET_SESSION resets the model, not the session's public identity.
      // Keep activeSessionId and any UI references valid after the reset.
      s.id = id;
      s.brainTabId = brainTabId;
      s.workerTabId = workerTabId;
      await saveState(); sendResponse({ ok: true, state: snapshot() }); return;
    }
    if (message?.type === "GET_STATE") { sendResponse({ ok: true, state: snapshot() }); return; }
    if (message?.type === "TURN_COMPLETE") {
      const sessionId = String(message.sessionId || "");
      const jobId = String(message.jobId || "");
      const role = String(message.role || "");
      const s = getSession(sessionId);

      if (!s) {
        sendResponse({ ok: false, error: "Sesión no encontrada para finalizar el turno" });
        return;
      }

      const senderTabId = sender.tab?.id;
      if (senderTabId !== s.brainTabId && senderTabId !== s.workerTabId) {
        sendResponse({ ok: false, error: "Pestaña no autorizada para esta sesión" });
        return;
      }

      if (s.completingJobId && s.completingJobId === jobId) {
        sendResponse({ ok: true, duplicate: true });
        return;
      }

      // A late completion from a stopped/replaced turn must never advance the loop.
      if (!s.running || s.stopRequested || !s.activeJobId) {
        sendResponse({ ok: true, ignored: true });
        return;
      }

      const expectedTabId = s.activeRole === "CEREBRO" ? s.brainTabId
        : s.activeRole === "OBRERO" ? s.workerTabId
        : null;

      if (jobId !== s.activeJobId || role !== s.activeRole || senderTabId !== expectedTabId) {
        sendResponse({ ok: false, error: "Finalización de turno obsoleta o no coincidente" });
        return;
      }

      await finishTurn(s, jobId, Boolean(message.ok), role, message.text, message.error);
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "BRIDGE_CONTENT_READY") { sendResponse({ ok: true, tabId: sender.tab?.id ?? null }); return; }
    throw new Error("Mensaje BRIDGE desconocido");
  })().catch(error => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

hydrate().catch(() => {});
