const CHATGPT_PATTERNS = [
  /^https:\/\/chatgpt\.com\//,
  /^https:\/\/chat\.openai\.com\//
];

const state = {
  brainTabId: null,
  workerTabId: null,
  status: "IDLE",
  paused: false,
  stopRequested: false,
  iteration: 0,
  maxIterations: 10,
  timeoutMs: 120000,
  running: false,
  lastForwarded: ""
};

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

async function sendToTab(tabId, text) {
  if (!tabId) throw new Error("Tab ID not configured");
  const tab = await chrome.tabs.get(tabId);
  if (!isChatGPTTab(tab)) throw new Error("Configured tab is no longer a ChatGPT tab");

  const response = await chrome.tabs.sendMessage(tabId, {
    type: "SEND_AND_WAIT",
    text,
    timeoutMs: state.timeoutMs
  });

  if (!response?.ok) throw new Error(response?.error || "ChatGPT tab failed");
  return response.text;
}

function snapshot() {
  return {
    ...state,
    running: state.running,
    brainTabId: state.brainTabId,
    workerTabId: state.workerTabId
  };
}

async function waitWhilePaused() {
  while (state.paused && !state.stopRequested) {
    await new Promise(r => setTimeout(r, 200));
  }
  if (state.stopRequested) throw new Error("STOPPED");
}

async function runLoop(seed) {
  if (state.running) throw new Error("Loop already running");
  if (!state.brainTabId || !state.workerTabId) throw new Error("Select CEREBRO and OBRERO first");
  if (state.brainTabId === state.workerTabId) throw new Error("CEREBRO and OBRERO must be different tabs");

  state.running = true;
  state.status = "RUNNING";
  state.paused = false;
  state.stopRequested = false;
  state.iteration = 0;
  state.lastForwarded = "";

  try {
    let message = seed.trim();
    if (!message) throw new Error("Initial message is empty");

    let target = "brain";
    while (!state.stopRequested && state.iteration < state.maxIterations) {
      await waitWhilePaused();

      const targetTab = target === "brain" ? state.brainTabId : state.workerTabId;
      const result = await sendToTab(targetTab, message);

      if (!result?.trim()) throw new Error("Received an empty response");

      if (result.trim() === "TRABAJO TERMINADO") {
        state.status = "FINISHED";
        return;
      }

      if (result.trim() === state.lastForwarded) {
        throw new Error("Duplicate response detected; loop stopped");
      }

      state.lastForwarded = result.trim();
      message = result.trim();
      state.iteration += 1;

      target = target === "brain" ? "worker" : "brain";
    }

    if (state.stopRequested) state.status = "STOPPED";
    else if (state.iteration >= state.maxIterations) state.status = "LIMIT_REACHED";
  } catch (error) {
    if (error.message === "STOPPED") state.status = "STOPPED";
    else state.status = "ERROR: " + error.message;
  } finally {
    state.running = false;
  }
}

async function openControlWindow() {
  const windows = await chrome.windows.getAll({ populate: true });
  const existing = windows.flatMap(w => w.tabs || []).find(tab =>
    typeof tab.url === "string" && tab.url.startsWith(chrome.runtime.getURL("control.html"))
  );

  if (existing) {
    await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }

  await chrome.windows.create({
    url: chrome.runtime.getURL("control.html"),
    type: "popup",
    width: 620,
    height: 760
  });
}

chrome.action.onClicked.addListener(openControlWindow);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "LIST_CHATGPT_TABS") {
    getChatGPTTabs()
      .then(tabs => sendResponse({ ok: true, tabs, state: snapshot() }))
      .catch(error => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (message?.type === "SET_ROLES") {
    state.brainTabId = Number(message.brainTabId) || null;
    state.workerTabId = Number(message.workerTabId) || null;
    sendResponse({ ok: true, state: snapshot() });
    return;
  }

  if (message?.type === "START_LOOP") {
    state.maxIterations = Math.max(1, Math.min(100, Number(message.maxIterations) || 10));
    state.timeoutMs = Math.max(5000, Math.min(600000, Number(message.timeoutMs) || 120000));
    runLoop(String(message.seed || ""))
      .then(() => {})
      .catch(() => {});
    sendResponse({ ok: true, state: snapshot() });
    return;
  }

  if (message?.type === "PAUSE") {
    state.paused = true;
    state.status = state.running ? "PAUSED" : state.status;
    sendResponse({ ok: true, state: snapshot() });
    return;
  }

  if (message?.type === "RESUME") {
    state.paused = false;
    state.status = state.running ? "RUNNING" : state.status;
    sendResponse({ ok: true, state: snapshot() });
    return;
  }

  if (message?.type === "STOP") {
    state.stopRequested = true;
    state.paused = false;
    if (!state.running) state.status = "STOPPED";
    sendResponse({ ok: true, state: snapshot() });
    return;
  }

  if (message?.type === "GET_STATE") {
    sendResponse({ ok: true, state: snapshot() });
    return;
  }

  if (message?.type === "BRIDGE_CONTENT_READY") {
    sendResponse({ ok: true, tabId: sender.tab?.id ?? null });
  }
});