const CHATGPT_PATTERNS = [
  /^https:\/\/chatgpt\.com\//,
  /^https:\/\/chat\.openai\.com\//
];

const STORAGE_KEY = "bridgeStateV3";

const DEFAULT_STATE = {
  brainTabId: null,
  workerTabId: null,
  status: "IDLE",
  paused: false,
  stopRequested: false,
  iteration: 0,
  maxIterations: 10,
  brainTimeoutMs: 120000,
  workerTimeoutMs: 900000,
  minTurnDelayMs: 10000,
  running: false,
  lastForwarded: "",
  activeRole: null,
  activeJobId: null,
  log: []
};

let state = { ...DEFAULT_STATE };
let hydrated = false;

async function hydrate() {
  if (hydrated) return;
  const saved = await chrome.storage.local.get(STORAGE_KEY);
  if (saved?.[STORAGE_KEY]) {
    state = { ...DEFAULT_STATE, ...saved[STORAGE_KEY] };
    if (!Array.isArray(state.log)) state.log = [];
  }
  hydrated = true;
}

async function saveState() {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function isChatGPTTab(tab) {
  return typeof tab?.url === "string" &&
    CHATGPT_PATTERNS.some(pattern => pattern.test(tab.url));
}

async function getChatGPTTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter(isChatGPTTab)
    .map(tab => ({
      id: tab.id,
      windowId: tab.windowId,
      title: tab.title || "ChatGPT",
      url: tab.url
    }));
}

function snapshot() {
  return { ...state, log: [...state.log] };
}

async function setState(patch) {
  Object.assign(state, patch);
  await saveState();
}

async function addLog(role, text) {
  state.log.push({
    id: Date.now() + "-" + Math.random().toString(36).slice(2, 8),
    role,
    text: String(text || ""),
    time: Date.now()
  });
  if (state.log.length > 120) state.log.splice(0, state.log.length - 120);
  await saveState();
}

async function ensureTabAlive(tabId, role) {
  if (!tabId) throw new Error(role + " no tiene pestaña configurada");
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    throw new Error(role + " fue cerrada");
  }
  if (!isChatGPTTab(tab)) throw new Error(role + " ya no es una pestaña ChatGPT");
}

async function dispatchTurn(role, text) {
  if (!state.running || state.stopRequested || state.paused) return;

  const tabId = role === "CEREBRO" ? state.brainTabId : state.workerTabId;
  const timeoutMs = role === "CEREBRO" ? state.brainTimeoutMs : state.workerTimeoutMs;
  const jobId = crypto.randomUUID();

  await ensureTabAlive(tabId, role);

  state.activeRole = role;
  state.activeJobId = jobId;
  state.status = "RUNNING — esperando a " + role;
  await saveState();
  await addLog("BRIDGE", "Enviando a " + role + "...");

  let response;
  try {
    response = await chrome.tabs.sendMessage(tabId, {
      type: "START_TURN",
      jobId,
      text,
      timeoutMs,
      minTurnDelayMs: state.minTurnDelayMs,
      role
    });
  } catch (error) {
    throw new Error(
      role + " no responde. Recarga esa pestaña ChatGPT para cargar BRIDGE. " +
      (error?.message || "")
    );
  }

  if (!response?.ok) throw new Error(response?.error || role + " no pudo iniciar el turno");
}

async function failRun(message) {
  state.running = false;
  state.activeRole = null;
  state.activeJobId = null;
  state.status = "ERROR — " + message;
  await addLog("BRIDGE", "ERROR — " + message);
  await saveState();
}

async function finishTurn(jobId, ok, role, text, error) {
  await hydrate();

  if (!state.running || state.stopRequested || jobId !== state.activeJobId) {
    return;
  }

  state.activeJobId = null;
  state.activeRole = null;

  if (!ok) {
    await failRun(role + " — " + (error || "error desconocido"));
    return;
  }

  const result = String(text || "").trim();
  if (!result) {
    await failRun(role + " devolvió una respuesta vacía");
    return;
  }

  await addLog(role, result);

  if (result === "TRABAJO TERMINADO") {
    state.running = false;
    state.status = "FINISHED — TRABAJO TERMINADO";
    await saveState();
    return;
  }

  if (result === state.lastForwarded) {
    await failRun("Respuesta duplicada detectada");
    return;
  }

  state.lastForwarded = result;
  state.iteration += 1;

  if (state.iteration >= state.maxIterations) {
    state.running = false;
    state.status = "LIMIT_REACHED — " + state.iteration + " iteraciones";
    await saveState();
    return;
  }

  const nextRole = role === "CEREBRO" ? "OBRERO" : "CEREBRO";

  if (state.paused) {
    state.status = "PAUSED — siguiente: " + nextRole;
    await saveState();
    return;
  }

  await saveState();

  try {
    await dispatchTurn(nextRole, result);
  } catch (nextError) {
    await failRun(nextError.message || String(nextError));
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await hydrate();
  if (!state.running) {
    state = { ...DEFAULT_STATE, log: state.log };
    await saveState();
  }
});

chrome.runtime.onStartup.addListener(() => hydrate());

chrome.action.onClicked.addListener(async () => {
  await hydrate();
  const windows = await chrome.windows.getAll({ populate: true });
  const existing = windows.flatMap(w => w.tabs || []).find(tab =>
    typeof tab.url === "string" && tab.url.startsWith(chrome.runtime.getURL("control.html"))
  );

  if (existing) {
    await chrome.windows.update(existing.windowId, { focused: true, state: "normal" });
    return;
  }

  await chrome.windows.create({
    url: chrome.runtime.getURL("control.html"),
    type: "popup",
    width: 620,
    height: 760
  });
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await hydrate();
  if (!state.running) return;

  if (tabId === state.brainTabId || tabId === state.workerTabId) {
    const role = tabId === state.brainTabId ? "CEREBRO" : "OBRERO";
    await failRun(role + " fue cerrada");
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    await hydrate();

    if (message?.type === "LIST_CHATGPT_TABS") {
      sendResponse({ ok: true, tabs: await getChatGPTTabs(), state: snapshot() });
      return;
    }

    if (message?.type === "SET_ROLES") {
      if (state.running) throw new Error("No cambies las pestañas mientras BRIDGE está activo");
      state.brainTabId = Number(message.brainTabId) || null;
      state.workerTabId = Number(message.workerTabId) || null;
      await saveState();
      sendResponse({ ok: true, state: snapshot() });
      return;
    }

    if (message?.type === "START_LOOP") {
      if (state.running) throw new Error("BRIDGE ya está activo");

      const seed = String(message.seed || "").trim();
      if (!seed) throw new Error("Escribe el mensaje inicial");

      state.brainTabId = Number(message.brainTabId) || state.brainTabId;
      state.workerTabId = Number(message.workerTabId) || state.workerTabId;
      state.maxIterations = Math.max(1, Math.min(100, Number(message.maxIterations) || 10));
      state.brainTimeoutMs = Math.max(5000, Math.min(1800000, Number(message.brainTimeoutMs) || 120000));
      state.workerTimeoutMs = Math.max(5000, Math.min(1800000, Number(message.workerTimeoutMs) || 900000));
      state.minTurnDelayMs = Math.max(0, Math.min(60000, Number(message.minTurnDelayMs) || 10000));
      state.running = true;
      state.paused = false;
      state.stopRequested = false;
      state.iteration = 0;
      state.lastForwarded = "";
      state.activeRole = null;
      state.activeJobId = null;
      state.log = [];
      state.status = "STARTING";
      await saveState();
      await addLog("USUARIO", seed);

      try {
        await dispatchTurn("CEREBRO", seed);
      } catch (error) {
        await failRun(error.message || String(error));
      }

      sendResponse({ ok: true, state: snapshot() });
      return;
    }

    if (message?.type === "PAUSE") {
      state.paused = true;
      if (state.running) state.status = "PAUSED — esperando terminar el turno actual";
      await saveState();
      sendResponse({ ok: true, state: snapshot() });
      return;
    }

    if (message?.type === "RESUME") {
      state.paused = false;
      if (state.running && !state.activeJobId) {
        const last = state.log.filter(x => x.role === "CEREBRO" || x.role === "OBRERO").at(-1);
        if (!last) throw new Error("No hay un turno pendiente para continuar");
        const nextRole = last.role === "CEREBRO" ? "OBRERO" : "CEREBRO";
        await dispatchTurn(nextRole, last.text);
      } else if (state.running) {
        state.status = "RUNNING — esperando a " + state.activeRole;
        await saveState();
      }
      sendResponse({ ok: true, state: snapshot() });
      return;
    }

    if (message?.type === "STOP") {
      state.stopRequested = true;
      state.running = false;
      state.paused = false;
      state.activeJobId = null;
      state.activeRole = null;
      state.status = "STOPPED";
      await saveState();
      sendResponse({ ok: true, state: snapshot() });
      return;
    }

    if (message?.type === "GET_STATE") {
      sendResponse({ ok: true, state: snapshot() });
      return;
    }

    if (message?.type === "TURN_COMPLETE") {
      if (sender.tab?.id !== state.brainTabId && sender.tab?.id !== state.workerTabId) {
        sendResponse({ ok: false, error: "Pestaña no autorizada" });
        return;
      }
      await finishTurn(
        String(message.jobId || ""),
        Boolean(message.ok),
        String(message.role || state.activeRole || "ChatGPT"),
        message.text,
        message.error
      );
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "BRIDGE_CONTENT_READY") {
      sendResponse({ ok: true, tabId: sender.tab?.id ?? null });
      return;
    }

    throw new Error("Mensaje BRIDGE desconocido");
  })()
    .then(() => {})
    .catch(error => {
      sendResponse({ ok: false, error: error.message || String(error) });
    });

  return true;
});

hydrate().catch(() => {});