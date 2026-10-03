const brain = document.getElementById("brain");
const worker = document.getElementById("worker");
const seed = document.getElementById("seed");
const iterations = document.getElementById("iterations");
const brainTimeout = document.getElementById("brainTimeout");
const workerTimeout = document.getElementById("workerTimeout");
const minTurnDelay = document.getElementById("minTurnDelay");
const status = document.getElementById("status");
const log = document.getElementById("log");

let running = false;
let paused = false;
let stopRequested = false;
let iteration = 0;
let lastForwarded = "";

function setStatus(text) { status.textContent = text; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ensureTabAlive(tabId, role) {
  try {
    const tab = await chrome.tabs.get(Number(tabId));
    if (!tab) throw new Error("Tab not found");
    if (!tab.url || !/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(tab.url)) {
      throw new Error(role + " ya no es una pestaña ChatGPT");
    }
  } catch (e) {
    throw new Error(role + " no está disponible: " + (e.message || String(e)));
  }
}

function addLog(role, text) {
  const item = document.createElement("div");
  item.className = "msg " + (role === "CEREBRO" ? "brain" : role === "OBRERO" ? "worker" : "system");

  const who = document.createElement("div");
  who.className = "who";
  who.textContent = role + ":";

  const body = document.createElement("div");
  body.textContent = text;

  item.append(who, body);
  log.appendChild(item);
  log.scrollTop = log.scrollHeight;
}

function clearLog() {
  log.replaceChildren();
}

async function refreshTabs() {
  const response = await chrome.runtime.sendMessage({ type: "LIST_CHATGPT_TABS" });
  if (!response?.ok) throw new Error(response?.error || "No se pudieron obtener las pestañas");

  const tabs = response.tabs || [];
  brain.replaceChildren();
  worker.replaceChildren();

  for (const tab of tabs) {
    const label = "tabId=" + tab.id + " — " + (tab.title || "ChatGPT");
    brain.add(new Option(label, String(tab.id)));
    worker.add(new Option(label, String(tab.id)));
  }

  if (tabs.length >= 2) {
    brain.value = String(tabs[0].id);
    worker.value = String(tabs[1].id);
  }
  setStatus("IDLE — " + tabs.length + " pestañas ChatGPT detectadas");
}

async function sendAndWait(tabId, text, timeoutMs, minTurnDelayMs) {
  await ensureTabAlive(tabId, "ChatGPT");
  let response;
  try {
    response = await chrome.tabs.sendMessage(Number(tabId), {
      type: "SEND_AND_WAIT",
      text,
      timeoutMs,
      minTurnDelayMs
    });
  } catch (e) {
    throw new Error("No se pudo comunicar con la pestaña: " + (e.message || String(e)) + ". Recarga la pestaña ChatGPT para cargar BRIDGE.");
  }
  if (!response?.ok) throw new Error(response?.error || "La pestaña no pudo completar la operación");
  return response.text;
}

async function waitIfPaused() {
  while (paused && !stopRequested) {
    setStatus("PAUSED — iteración " + iteration);
    await sleep(200);
  }
  if (stopRequested) throw new Error("STOPPED");
}

async function runLoop() {
  if (running) return;
  if (!brain.value || !worker.value) throw new Error("Selecciona CEREBRO y OBRERO");
  if (brain.value === worker.value) throw new Error("CEREBRO y OBRERO deben ser pestañas distintas");
  if (!seed.value.trim()) throw new Error("Escribe el mensaje inicial");

  running = true;
  paused = false;
  stopRequested = false;
  iteration = 0;
  lastForwarded = "";
  clearLog();

  const maxIterations = Math.max(1, Math.min(100, Number(iterations.value) || 10));
  const brainTimeoutMs = Math.max(5000, Math.min(1800000, (Number(brainTimeout.value) || 120) * 1000));
  const workerTimeoutMs = Math.max(5000, Math.min(1800000, (Number(workerTimeout.value) || 900) * 1000));
  const minTurnDelayMs = Math.max(0, Math.min(60000, (Number(minTurnDelay.value) || 0) * 1000));

  try {
    let message = seed.value.trim();
    let target = Number(brain.value);
    addLog("USUARIO", message);

    while (!stopRequested && iteration < maxIterations) {
      await waitIfPaused();

      const isBrain = target === Number(brain.value);
      const role = isBrain ? "CEREBRO" : "OBRERO";
      const timeoutMs = isBrain ? brainTimeoutMs : workerTimeoutMs;

      addLog("BRIDGE", "Enviando a " + role + "...");
      setStatus("RUNNING — enviando a " + role + " — iteración " + (iteration + 1));

      const result = (await sendAndWait(target, message, timeoutMs, minTurnDelayMs)).trim();
      if (!result) throw new Error("Respuesta vacía");

      addLog(role, result);

      if (result === "TRABAJO TERMINADO") {
        setStatus("FINISHED — TRABAJO TERMINADO");
        return;
      }

      if (result === lastForwarded) {
        throw new Error("Respuesta duplicada detectada");
      }

      lastForwarded = result;
      message = result;
      iteration += 1;
      target = isBrain ? Number(worker.value) : Number(brain.value);
    }

    if (stopRequested) setStatus("STOPPED");
    else setStatus("LIMIT_REACHED — " + iteration + " iteraciones");
  } catch (error) {
    if (error.message === "STOPPED") setStatus("STOPPED");
    else {
      addLog("BRIDGE", "ERROR — " + error.message);
      setStatus("ERROR — " + error.message);
    }
  } finally {
    running = false;
  }
}

document.getElementById("refresh").onclick = () => refreshTabs().catch(e => setStatus("ERROR — " + e.message));
document.getElementById("start").onclick = () => runLoop().catch(e => setStatus("ERROR — " + e.message));
document.getElementById("pause").onclick = () => {
  if (running) {
    paused = true;
    setStatus("PAUSED — iteración " + iteration);
  }
};
document.getElementById("resume").onclick = () => {
  if (running) {
    paused = false;
    setStatus("RUNNING — iteración " + iteration);
  }
};
document.getElementById("stop").onclick = () => {
  stopRequested = true;
  paused = false;
  if (!running) setStatus("STOPPED");
};

refreshTabs().catch(e => setStatus("ERROR — " + e.message));