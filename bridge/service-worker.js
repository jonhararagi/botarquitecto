const CHATGPT_PATTERNS = [
  /^https:\/\/chatgpt\.com\//,
  /^https:\/\/chat\.openai\.com\//
];

const STORAGE_KEY = "bridgeStateV4";
const LEGACY_STORAGE_KEY = "bridgeStateV3";

// La espera de copia es independiente del tiempo de generación.
// Primer mini-análisis a los 30 s y timeout máximo de copia a los 120 s.
const COPY_CHECKPOINTS_MS = {
  CEREBRO: [30000, 120000],
  OBRERO: [30000, 120000]
};

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
  awaitingCopyRole: null,
  awaitingCopyText: "",
  awaitingCopySince: 0,
  awaitingCopyCheckpoint: 0,
  log: []
};

let state = { ...DEFAULT_STATE };
let hydrated = false;

async function hydrate() {
  if (hydrated) return;
  const saved = await chrome.storage.local.get([STORAGE_KEY, LEGACY_STORAGE_KEY]);
  const stored = saved?.[STORAGE_KEY] || saved?.[LEGACY_STORAGE_KEY];
  if (stored) {
    state = { ...DEFAULT_STATE, ...stored };
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

function copyAlarmName(role) {
  return "bridge-copy-" + role;
}

async function clearCopyAlarm(role) {
  if (!role) return;
  await chrome.alarms.clear(copyAlarmName(role));
}

function getCopyCheckpoints(role) {
  return COPY_CHECKPOINTS_MS[role] || [];
}

async function scheduleNextCopyCheckpoint() {
  if (!state.running || !state.awaitingCopyRole || !state.awaitingCopySince) return;
  const role = state.awaitingCopyRole;
  const checkpoints = getCopyCheckpoints(role);
  const index = Number(state.awaitingCopyCheckpoint) || 0;
  if (index >= checkpoints.length) return;
  const elapsed = Date.now() - state.awaitingCopySince;
  const remaining = Math.max(1000, checkpoints[index] - elapsed);
  await chrome.alarms.clear(copyAlarmName(role));
  await chrome.alarms.create(copyAlarmName(role), { when: Date.now() + remaining });
}

async function inspectCopyWait(role) {
  await hydrate();
  if (!state.running || state.awaitingCopyRole !== role || !state.awaitingCopySince) return;

  const checkpoints = getCopyCheckpoints(role);
  const elapsed = Date.now() - state.awaitingCopySince;
  let index = Number(state.awaitingCopyCheckpoint) || 0;

  try {
    await ensureTabAlive(role === "CEREBRO" ? state.brainTabId : state.workerTabId, role);
  } catch (error) {
    await failRun(error.message || String(error));
    return;
  }

  while (index < checkpoints.length && elapsed >= checkpoints[index]) {
    const seconds = Math.floor(elapsed / 1000);
    const checkpointSeconds = Math.floor(checkpoints[index] / 1000);
    const finalCheckpoint = index === checkpoints.length - 1;
    await addLog("ANÁLISIS", role + " sigue activo; esperando copia. " + seconds + " s / " + checkpointSeconds + " s.");

    if (finalCheckpoint) {
      await failRun("Timeout esperando copia de " + role + " (" + seconds + " s)");
      return;
    }
    index += 1;
  }

  state.awaitingCopyCheckpoint = index;
  const nextLimit = checkpoints[index];
  const seconds = Math.floor(elapsed / 1000);
  const remaining = Math.max(0, Math.ceil((nextLimit - elapsed) / 1000));
  state.status = "WAITING_COPY — " + role + " | " + seconds + " s | próximo análisis en " + remaining + " s";
  await saveState();
  await scheduleNextCopyCheckpoint();
}

chrome.alarms.onAlarm.addListener(async alarm => {
  await hydrate();
  if (alarm.name === copyAlarmName("CEREBRO")) {
    await inspectCopyWait("CEREBRO");
  } else if (alarm.name === copyAlarmName("OBRERO")) {
    await inspectCopyWait("OBRERO");
  }
});

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
  state.awaitingCopyRole = null;
  state.awaitingCopyText = "";
  state.awaitingCopySince = 0;
  state.awaitingCopyCheckpoint = 0;
  await clearCopyAlarm("CEREBRO");
  await clearCopyAlarm("OBRERO");
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

  const nextRole = role === "CEREBRO" ? "OBRERO" : "CEREBRO";

  state.lastForwarded = result;
  state.iteration += 1;
  state.awaitingCopyRole = null;
  state.awaitingCopyText = "";
  state.awaitingCopySince = 0;
  state.awaitingCopyCheckpoint = 0;

  await clearCopyAlarm("CEREBRO");
  await clearCopyAlarm("OBRERO");

  if (state.iteration >= state.maxIterations) {
    state.running = false;
    state.status = "LIMIT_REACHED — " + state.iteration + " iteraciones";
    await saveState();
    return;
  }

  if (state.paused) {
    state.status = "PAUSED — siguiente: " + nextRole;
    await saveState();
    return;
  }

  state.status = "AUTO_FORWARD — " + role + " → " + nextRole;
  await addLog("BRIDGE", "Respuesta verificada. Enviando automáticamente a " + nextRole + ".");
  await saveState();

  try {
    await dispatchTurn(nextRole, result);
  } catch (error) {
    await failRun(error.message || String(error));
  }
}

async function handleExplicitCopy(senderTabId, copiedText) {
  await hydrate();

  if (!state.running || !state.awaitingCopyRole || !state.awaitingCopyText) {
    return { ok: false, ignored: true, reason: "No hay una respuesta esperando copia" };
  }

  const expectedTabId = state.awaitingCopyRole === "CEREBRO"
    ? state.brainTabId
    : state.workerTabId;

  if (senderTabId !== expectedTabId) {
    return { ok: false, ignored: true, reason: "La copia no proviene de la pestaña que está esperando BRIDGE" };
  }

  const copied = String(copiedText || "").trim();
  if (!copied) {
    return { ok: false, ignored: true, reason: "Copia vacía" };
  }

  if (!state.awaitingCopyText.includes(copied)) {
    return { ok: false, ignored: true, reason: "El texto copiado no pertenece a la respuesta del asistente" };
  }

  const role = state.awaitingCopyRole;
  await clearCopyAlarm(role);
  const nextRole = role === "CEREBRO" ? "OBRERO" : "CEREBRO";

  state.lastForwarded = copied;
  state.iteration += 1;
  state.awaitingCopyRole = null;
  state.awaitingCopyText = "";
  state.awaitingCopySince = 0;
  state.awaitingCopyCheckpoint = 0;

  await addLog("COPIA", copied);

  if (state.iteration >= state.maxIterations) {
    state.running = false;
    state.status = "LIMIT_REACHED — " + state.iteration + " iteraciones";
    await saveState();
    return { ok: true, forwarded: false, finished: true };
  }

  if (state.paused) {
    state.status = "PAUSED — siguiente: " + nextRole;
    await saveState();
    return { ok: true, forwarded: false, paused: true };
  }

  await saveState();

  try {
    await dispatchTurn(nextRole, copied);
    return { ok: true, forwarded: true, nextRole };
  } catch (error) {
    await failRun(error.message || String(error));
    return { ok: false, error: error.message || String(error) };
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await hydrate();
  if (!state.running) {
    state = { ...DEFAULT_STATE, log: state.log };
    await saveState();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await hydrate();
  if (state.running && state.awaitingCopyRole) await inspectCopyWait(state.awaitingCopyRole);
});

chrome.runtime.onSuspend.addListener(() => {
  // State is persisted; alarms restore copy-wait checkpoints after the worker sleeps.
});

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
      state.awaitingCopyRole = null;
      state.awaitingCopyText = "";
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
      if (state.running && state.awaitingCopyRole) {
        state.status = "WAITING_COPY — esperando copia de " + state.awaitingCopyRole;
        await saveState();
      } else if (state.running && !state.activeJobId) {
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
      state.awaitingCopyRole = null;
      state.awaitingCopyText = "";
      state.awaitingCopySince = 0;
      state.awaitingCopyCheckpoint = 0;
      await clearCopyAlarm("CEREBRO");
      await clearCopyAlarm("OBRERO");
      state.status = "STOPPED";
      await saveState();
      sendResponse({ ok: true, state: snapshot() });
      return;
    }

    if (message?.type === "RESET_STATE") {
      if (state.running) throw new Error("Detén BRIDGE antes de limpiar el historial");
      await clearCopyAlarm("CEREBRO");
      await clearCopyAlarm("OBRERO");
      state = { ...DEFAULT_STATE };
      await saveState();
      sendResponse({ ok: true, state: snapshot() });
      return;
    }

    if (message?.type === "GET_STATE") {
      sendResponse({ ok: true, state: snapshot() });
      return;
    }

    if (message?.type === "EXPLICIT_COPY") {
      const result = await handleExplicitCopy(
        sender.tab?.id ?? null,
        message.text
      );
      sendResponse(result);
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
