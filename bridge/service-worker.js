const CHATGPT_PATTERNS = [
  /^https:\/\/chatgpt\.com\//,
  /^https:\/\/chat\.openai\.com\//
];

const STORAGE_KEY = "bridgeStateV5";
const DEFAULT_SETTINGS = { brainTimeoutMs: 60000, workerTimeoutMs: 600000, minTurnDelayMs: 0, maxIterations: 10 };

function makeId() { return "session-" + crypto.randomUUID(); }
function createSessionModel(name = "Sesión 1") {
  return { id: makeId(), name, brainTabId: null, workerTabId: null, status: "IDLE", paused: false, stopRequested: false, running: false, iteration: 0, maxIterations: DEFAULT_SETTINGS.maxIterations, brainTimeoutMs: DEFAULT_SETTINGS.brainTimeoutMs, workerTimeoutMs: DEFAULT_SETTINGS.workerTimeoutMs, minTurnDelayMs: DEFAULT_SETTINGS.minTurnDelayMs, lastForwarded: "", activeRole: null, activeJobId: null, log: [] };
}

const DEFAULT_STATE = { version: 5, activeSessionId: null, sessions: [] };
let state = structuredClone(DEFAULT_STATE);
let hydrated = false;
let executionSequence = 0;
const executionTokens = new WeakMap();
function beginExecution(s) { const token = { id: ++executionSequence }; executionTokens.set(s, token); return token; }
function invalidateExecution(s) { executionTokens.set(s, { id: ++executionSequence }); }
function isCurrentExecution(s, token) { return Boolean(token) && executionTokens.get(s) === token && s.running && !s.stopRequested; }

async function hydrate() {
  if (hydrated) return;
  const saved = await chrome.storage.local.get(STORAGE_KEY);
  if (saved?.[STORAGE_KEY]?.sessions) state = saved[STORAGE_KEY];
  if (!Array.isArray(state.sessions)) state.sessions = [];
  state.sessions = state.sessions.filter(s => s && typeof s === "object").map(s => {
    const defaults = createSessionModel("Sesión recuperada");
    return {
      ...defaults,
      ...s,
      id: typeof s.id === "string" && s.id ? s.id : defaults.id,
      log: Array.isArray(s.log) ? s.log : []
    };
  });
  if (!state.sessions.length) {
    const s = createSessionModel("Sesión 1");
    state.sessions.push(s);
    state.activeSessionId = s.id;
  }

  // A persisted "running" flag cannot prove that a turn still exists after MV3
  // worker termination. Recover conservatively: never replay an ambiguous send.
  for (const s of state.sessions) {
    if (s.running === true && s.paused === true && !s.activeJobId) {
      // A paused session with no pending job can safely remain paused.
      s.running = false;
      s.activeRole = null;
      s.status = "PAUSED — Recuperada tras reinicio; pulsa RESUME para continuar.";
    } else {
      const appearsActive = s.running === true || Boolean(s.activeJobId) ||
        /^(STARTING|RUNNING|AUTO_FORWARD)/.test(String(s.status || ""));
      if (appearsActive) {
        s.running = false;
        s.activeJobId = null;
        s.activeRole = null;
        if (s.status !== "FINISHED — TRABAJO TERMINADO" &&
            s.status !== "STOPPED" &&
            !String(s.status || "").startsWith("LIMIT_REACHED")) {
          s.status = "ERROR — Recuperación MV3: el resultado del turno anterior es ambiguo. Revisa ChatGPT y reinicia manualmente.";
        }
      }
    }
  }

  if (!state.activeSessionId || !state.sessions.some(s => s.id === state.activeSessionId)) {
    state.activeSessionId = state.sessions[0].id;
  }
  hydrated = true;
  await saveState();
}
async function saveState() { await chrome.storage.local.set({ [STORAGE_KEY]: state }); }
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

async function dispatchTurn(s, role, text, token = executionTokens.get(s)) {
  if (!isCurrentExecution(s, token) || s.paused) return;
  const tabId = role === "CEREBRO" ? s.brainTabId : s.workerTabId;
  const timeoutMs = role === "CEREBRO" ? s.brainTimeoutMs : s.workerTimeoutMs;
  const jobId = crypto.randomUUID();
  await ensureTabAlive(tabId, role);
  if (!isCurrentExecution(s, token) || s.paused) return;
  s.activeRole = role; s.activeJobId = jobId; s.status = "RUNNING — " + s.name + " — " + role;
  await saveState();
  if (!isCurrentExecution(s, token) || s.activeJobId !== jobId || s.paused) return;
  await addLog(s, "BRIDGE", "Enviando a " + role + "...");
  if (!isCurrentExecution(s, token) || s.activeJobId !== jobId || s.paused) return;
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "START_TURN", jobId, text, timeoutMs, minTurnDelayMs: s.minTurnDelayMs, role, sessionId: s.id });
    if (!isCurrentExecution(s, token) || s.activeJobId !== jobId) return;
    if (!response?.ok) throw new Error(response?.error || role + " no pudo iniciar el turno");
  } catch (error) {
    if (!isCurrentExecution(s, token) || s.activeJobId !== jobId) return;
    throw new Error(role + " no responde. Recarga esa pestaña ChatGPT para cargar BRIDGE. " + (error?.message || ""));
  }
}

async function failSession(s, message, token = executionTokens.get(s)) {
  if (token && executionTokens.get(s) !== token) return;
  s.running = false; s.activeRole = null; s.activeJobId = null; s.status = "ERROR — " + message;
  await addLog(s, "BRIDGE", "ERROR — " + message);
  if (token && executionTokens.get(s) !== token) return;
  await saveState();
}

async function finishTurn(s, jobId, ok, role, text, error) {
  const token = executionTokens.get(s);
  if (!isCurrentExecution(s, token) || jobId !== s.activeJobId) return;
  s.activeJobId = null; s.activeRole = null;
  if (!ok) return failSession(s, role + " — " + (error || "error desconocido"), token);
  const result = String(text || "").trim();
  if (!result) return failSession(s, role + " devolvió una respuesta vacía", token);
  await addLog(s, role, result);
  if (!isCurrentExecution(s, token)) return;
  if (result === "TRABAJO TERMINADO") { s.running = false; s.status = "FINISHED — TRABAJO TERMINADO"; return saveState(); }
  if (result === s.lastForwarded) return failSession(s, "Respuesta duplicada detectada", token);
  const nextRole = role === "CEREBRO" ? "OBRERO" : "CEREBRO";
  s.lastForwarded = result; s.iteration++;
  if (s.iteration >= s.maxIterations) { s.running = false; s.status = "LIMIT_REACHED — " + s.iteration + " iteraciones"; return saveState(); }
  if (s.paused) { s.status = "PAUSED — siguiente: " + nextRole; return saveState(); }
  s.status = "AUTO_FORWARD — " + role + " → " + nextRole;
  await addLog(s, "BRIDGE", "Respuesta verificada. Enviando automáticamente a " + nextRole + ".");
  if (!isCurrentExecution(s, token)) return;
  await saveState();
  if (!isCurrentExecution(s, token)) return;
  try { await dispatchTurn(s, nextRole, result, token); } catch (e) { await failSession(s, e.message || String(e), token); }
}

async function createSession(name) {
  const s = createSessionModel(name);
  state.sessions.push(s); state.activeSessionId = s.id; await saveState(); return s;
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

chrome.tabs.onRemoved.addListener(async tabId => {
  await hydrate();
  for (const s of state.sessions) if (s.running && (tabId === s.brainTabId || tabId === s.workerTabId)) {
    await failSession(s, (tabId === s.brainTabId ? "CEREBRO" : "OBRERO") + " fue cerrada");
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
      s.running = true; s.paused = false; s.stopRequested = false; s.iteration = 0; s.lastForwarded = ""; s.activeRole = null; s.activeJobId = null; s.log = []; s.status = "STARTING";
      const executionToken = beginExecution(s);
      state.activeSessionId = s.id; await saveState();
      if (!isCurrentExecution(s, executionToken)) { sendResponse({ ok: true, state: snapshot() }); return; }
      await addLog(s, "USUARIO", seed);
      if (!isCurrentExecution(s, executionToken)) { sendResponse({ ok: true, state: snapshot() }); return; }
      try { await dispatchTurn(s, "CEREBRO", seed, executionToken); } catch (e) { await failSession(s, e.message || String(e), executionToken); }
      sendResponse({ ok: true, state: snapshot() }); return;
    }
    if (["PAUSE","RESUME","STOP"].includes(message?.type)) {
      const s = getSession(String(message.sessionId || state.activeSessionId)); if (!s) throw new Error("Sesión no encontrada");
      if (message.type === "PAUSE") { s.paused = true; if (s.running) s.status = "PAUSED — esperando terminar el turno actual"; }
      if (message.type === "RESUME") {
        s.paused = false;
        if (s.running && !s.activeJobId) {
          const last = s.log.filter(x => x.role === "CEREBRO" || x.role === "OBRERO").at(-1);
          if (!last) throw new Error("No hay un turno pendiente para continuar");
          await dispatchTurn(s, last.role === "CEREBRO" ? "OBRERO" : "CEREBRO", last.text, executionTokens.get(s));
        } else if (s.running) s.status = "RUNNING — esperando a " + s.activeRole;
      }
      if (message.type === "STOP") { invalidateExecution(s); s.stopRequested = true; s.running = false; s.paused = false; s.activeJobId = null; s.activeRole = null; s.status = "STOPPED"; }
      await saveState(); sendResponse({ ok: true, state: snapshot() }); return;
    }
    if (message?.type === "RESET_SESSION") {
      const s = getSession(String(message.sessionId || state.activeSessionId)); if (!s) throw new Error("Sesión no encontrada");
      if (s.running) throw new Error("Detén la sesión antes de limpiarla");
      const name = s.name, brainTabId = s.brainTabId, workerTabId = s.workerTabId;
      Object.assign(s, createSessionModel(name)); s.brainTabId = brainTabId; s.workerTabId = workerTabId;
      await saveState(); sendResponse({ ok: true, state: snapshot() }); return;
    }
    if (message?.type === "GET_STATE") { sendResponse({ ok: true, state: snapshot() }); return; }
    if (message?.type === "TURN_COMPLETE") {
      const s = getSession(String(message.sessionId || ""));
      if (!s || (sender.tab?.id !== s.brainTabId && sender.tab?.id !== s.workerTabId)) { sendResponse({ ok: false, error: "Pestaña no autorizada" }); return; }
      await finishTurn(s, String(message.jobId || ""), Boolean(message.ok), String(message.role || s.activeRole || "ChatGPT"), message.text, message.error);
      sendResponse({ ok: true }); return;
    }
    if (message?.type === "BRIDGE_CONTENT_READY") { sendResponse({ ok: true, tabId: sender.tab?.id ?? null }); return; }
    throw new Error("Mensaje BRIDGE desconocido");
  })().catch(error => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

hydrate().catch(() => {});
