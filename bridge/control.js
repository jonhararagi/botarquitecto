const brain = document.getElementById("brain");
const worker = document.getElementById("worker");
const seed = document.getElementById("seed");
const iterations = document.getElementById("iterations");
const brainTimeout = document.getElementById("brainTimeout");
const workerTimeout = document.getElementById("workerTimeout");
const minTurnDelay = document.getElementById("minTurnDelay");
const status = document.getElementById("status");
const log = document.getElementById("log");
const startButton = document.getElementById("start");

let pollTimer = null;
let lastRenderedLog = "";

function setStatus(text) {
  status.textContent = text;
}

function addLog(role, text) {
  const item = document.createElement("div");
  item.className = "msg " + (
    role === "CEREBRO" ? "brain" :
    role === "OBRERO" ? "worker" : "system"
  );

  const who = document.createElement("div");
  who.className = "who";
  who.textContent = role + ":";

  const body = document.createElement("div");
  body.textContent = text;

  item.append(who, body);
  log.appendChild(item);
}

function renderState(state) {
  if (!state) return;

  setStatus(state.status || "IDLE");

  const serializedLog = JSON.stringify(state.log || []);
  if (serializedLog !== lastRenderedLog) {
    lastRenderedLog = serializedLog;
    log.replaceChildren();

    for (const entry of state.log || []) {
      addLog(entry.role, entry.text);
    }

    log.scrollTop = log.scrollHeight;
  }

  const active = Boolean(state.running);
  startButton.disabled = active;
  brain.disabled = active;
  worker.disabled = active;
  iterations.disabled = active;
  brainTimeout.disabled = active;
  workerTimeout.disabled = active;
  minTurnDelay.disabled = active;

  if (state.brainTabId && [...brain.options].some(o => o.value === String(state.brainTabId))) {
    brain.value = String(state.brainTabId);
  }
  if (state.workerTabId && [...worker.options].some(o => o.value === String(state.workerTabId))) {
    worker.value = String(state.workerTabId);
  }
}

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || "BRIDGE rechazó la operación");
  if (response.state) renderState(response.state);
  return response;
}

async function refreshTabs() {
  const response = await send({ type: "LIST_CHATGPT_TABS" });
  const tabs = response.tabs || [];

  const oldBrain = brain.value;
  const oldWorker = worker.value;

  brain.replaceChildren();
  worker.replaceChildren();

  for (const tab of tabs) {
    const label = "tabId=" + tab.id + " — " + (tab.title || "ChatGPT");
    brain.add(new Option(label, String(tab.id)));
    worker.add(new Option(label, String(tab.id)));
  }

  if ([...brain.options].some(o => o.value === oldBrain)) brain.value = oldBrain;
  if ([...worker.options].some(o => o.value === oldWorker)) worker.value = oldWorker;

  if (!brain.value && tabs.length >= 1) brain.value = String(tabs[0].id);
  if (!worker.value && tabs.length >= 2) worker.value = String(tabs[1].id);

  const state = response.state;
  if (state?.brainTabId) brain.value = String(state.brainTabId);
  if (state?.workerTabId) worker.value = String(state.workerTabId);

  renderState(state);
}

async function pollState() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    if (response?.ok) renderState(response.state);
  } catch {
    // La ventana de control puede perder momentáneamente el service worker.
    // El proceso no depende de esta ventana; el siguiente sondeo lo recupera.
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollState, 700);
  pollState();
}

document.getElementById("refresh").onclick = () => {
  refreshTabs().catch(e => setStatus("ERROR — " + e.message));
};

startButton.onclick = async () => {
  try {
    if (!brain.value || !worker.value) throw new Error("Selecciona CEREBRO y OBRERO");
    if (brain.value === worker.value) throw new Error("CEREBRO y OBRERO deben ser pestañas distintas");
    if (!seed.value.trim()) throw new Error("Escribe el mensaje inicial");

    await send({
      type: "START_LOOP",
      brainTabId: Number(brain.value),
      workerTabId: Number(worker.value),
      seed: seed.value.trim(),
      maxIterations: Number(iterations.value) || 10,
      brainTimeoutMs: (Number(brainTimeout.value) || 120) * 1000,
      workerTimeoutMs: (Number(workerTimeout.value) || 900) * 1000,
      minTurnDelayMs: (Number(minTurnDelay.value) || 10) * 1000
    });
  } catch (e) {
    setStatus("ERROR — " + e.message);
  }
};

document.getElementById("pause").onclick = () => {
  send({ type: "PAUSE" }).catch(e => setStatus("ERROR — " + e.message));
};

document.getElementById("resume").onclick = () => {
  send({ type: "RESUME" }).catch(e => setStatus("ERROR — " + e.message));
};

document.getElementById("stop").onclick = () => {
  send({ type: "STOP" }).catch(e => setStatus("ERROR — " + e.message));
};

refreshTabs()
  .catch(e => setStatus("ERROR — " + e.message))
  .finally(startPolling);
