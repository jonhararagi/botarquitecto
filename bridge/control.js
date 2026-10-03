const brain = document.getElementById("brain");
const worker = document.getElementById("worker");
const seed = document.getElementById("seed");
const iterations = document.getElementById("iterations");
const timeout = document.getElementById("timeout");
const status = document.getElementById("status");

let running = false;
let paused = false;
let stopRequested = false;
let iteration = 0;
let lastForwarded = "";

function setStatus(text) { status.textContent = text; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

async function sendAndWait(tabId, text, timeoutMs) {
  const response = await chrome.tabs.sendMessage(Number(tabId), {
    type: "SEND_AND_WAIT",
    text,
    timeoutMs
  });
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

  const maxIterations = Math.max(1, Math.min(100, Number(iterations.value) || 10));
  const timeoutMs = Math.max(5000, Math.min(600000, (Number(timeout.value) || 120) * 1000));

  try {
    let message = seed.value.trim();
    let target = Number(brain.value);

    while (!stopRequested && iteration < maxIterations) {
      await waitIfPaused();
      setStatus("RUNNING — enviando a " + (target === Number(brain.value) ? "CEREBRO" : "OBRERO") + " — iteración " + (iteration + 1));

      const result = (await sendAndWait(target, message, timeoutMs)).trim();
      if (!result) throw new Error("Respuesta vacía");

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
      target = target === Number(brain.value) ? Number(worker.value) : Number(brain.value);
    }

    if (stopRequested) setStatus("STOPPED");
    else setStatus("LIMIT_REACHED — " + iteration + " iteraciones");
  } catch (error) {
    if (error.message === "STOPPED") setStatus("STOPPED");
    else setStatus("ERROR — " + error.message);
  } finally {
    running = false;
  }
}

document.getElementById("refresh").onclick = () => refreshTabs().catch(e => setStatus("ERROR — " + e.message));
document.getElementById("start").onclick = () => runLoop();
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