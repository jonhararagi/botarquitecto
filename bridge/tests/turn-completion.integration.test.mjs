import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const workerPath = new URL("../service-worker.js", import.meta.url);
const contentPath = new URL("../content.js", import.meta.url);

function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

async function harness(mode = "success") {
  const callbacks = { message: null, removed: null, clicked: null };
  const tabs = new Map([
    [11, { id: 11, url: "https://chatgpt.com/", title: "CEREBRO", windowId: 1 }],
    [22, { id: 22, url: "https://chatgpt.com/c/worker", title: "OBRERO", windowId: 1 }]
  ]);
  const storage = {};
  const ready = deferred();
  const contents = new Map();
  const contentSource = await readFile(contentPath, "utf8");
  const workerChrome = {
    storage: { local: {
      async get(key) { return Object.hasOwn(storage, key) ? { [key]: structuredClone(storage[key]) } : {}; },
      async set(value) { Object.assign(storage, structuredClone(value)); ready.resolve(); }
    } },
    runtime: { onMessage: { addListener(fn) { callbacks.message = fn; } }, getURL: path => "chrome-extension://test/" + path },
    tabs: {
      onRemoved: { addListener(fn) { callbacks.removed = fn; } },
      async query() { return [...tabs.values()]; },
      async get(id) { if (!tabs.has(id)) throw new Error("tab missing"); return { ...tabs.get(id) }; },
      async sendMessage(tabId, message) { const c = await getContent(tabId); c.listener(message, {}, () => {}); return { ok: true }; },
      async create() { throw new Error("unexpected tab create"); },
      async update() {}
    },
    windows: { async update() {} },
    action: { onClicked: { addListener(fn) { callbacks.clicked = fn; } } }
  };
  async function call(message, sender = {}) {
    return new Promise((resolve, reject) => {
      let done = false;
      const respond = value => { if (!done) { done = true; resolve(structuredClone(value)); } };
      try {
        const ret = callbacks.message(message, sender, respond);
        if (ret !== true && !done) queueMicrotask(() => { if (!done) reject(new Error("worker did not answer")); });
      } catch (e) { reject(e); }
    });
  }
  async function getContent(tabId) {
    if (contents.has(tabId)) return contents.get(tabId);
    const input = {
      value: "", textContent: "", focus() {},
      matches: selector => selector === "textarea, input",
      dispatchEvent() {}, getAttribute() { return null; }
    };
    const copy = { disabled: false, getAttribute() { return null; } };
    const node = {
      innerText: "respuesta integrada [[BRIDGE_DONE]]",
      textContent: "respuesta integrada [[BRIDGE_DONE]]",
      querySelector(selector) {
        if (selector.includes("copy-turn-action-button") || selector.includes("Copy response") ||
            selector.includes("Copiar respuesta") || selector === 'button[aria-label="Copy" i]' ||
            selector === 'button[aria-label="Copiar" i]') return copy;
        return null;
      },
      closest() { return null; }, getAttribute() { return "assistant"; }
    };
    const assistant = [];
    const sendButton = {
      disabled: false, getAttribute() { return null; },
      click() { if (mode === "error") throw new Error("DOM integrado controlado"); assistant.push(node); }
    };
    const document = {
      querySelectorAll(selector) {
        if (selector === "#prompt-textarea" || selector === 'textarea[name="prompt-textarea"]' ||
            selector === 'div[contenteditable="true"][role="textbox"]') return [input];
        if (selector.includes("send-button") || selector.includes("Send prompt") ||
            selector.includes("Send message") || selector.includes("composer-submit-btn") ||
            selector.includes('button[aria-label="Send"]')) return [sendButton];
        if (selector === '[data-message-author-role="assistant"]' || selector === "article") return assistant;
        if (selector.includes("stop-button") || selector.includes("Stop") || selector.includes("Detener")) return [];
        return [];
      },
      execCommand() { return true; }
    };
    const runtimeListeners = { message: null };
    const chrome = {
      runtime: {
        onMessage: { addListener(fn) { runtimeListeners.message = fn; } },
        sendMessage(message) { return call(message, { tab: { id: tabId } }); }
      }
    };
    const context = vm.createContext({
      chrome, document, Date, setTimeout, clearTimeout, Promise, console,
      InputEvent: class { constructor() {} }, Event: class { constructor() {} },
      HTMLInputElement: class {}, HTMLTextAreaElement: class {},
      getComputedStyle: () => ({ display: "block", visibility: "visible" })
    });
    vm.runInContext(contentSource, context, { filename: "bridge/content.js" });
    const result = { listener: (m, s, respond) => runtimeListeners.message(m, s, respond), messages: [] };
    // Observe the actual terminal reports without altering the message delivered to the worker.
    const originalSend = chrome.runtime.sendMessage;
    chrome.runtime.sendMessage = message => { result.messages.push(structuredClone(message)); return originalSend(message); };
    contents.set(tabId, result);
    return result;
  }
  const workerSource = await readFile(workerPath, "utf8");
  const context = vm.createContext({
    chrome: workerChrome, crypto: webcrypto, structuredClone, Date, Math, Promise,
    console: { log() {}, warn() {}, error() {} }
  });
  vm.runInContext(workerSource, context, { filename: "bridge/service-worker.js" });
  await ready.promise;
  const initial = await call({ type: "GET_STATE" });
  assert.equal(initial.ok, true);
  const sessionId = initial.state.sessions[0].id;
  const start = await call({ type: "START_LOOP", sessionId, brainTabId: 11, workerTabId: 22,
    seed: "prompt sintético", maxIterations: 1, brainTimeoutMs: 5000, workerTimeoutMs: 5000 });
  assert.equal(start.ok, true, start.error);
  return { call, sessionId, contents, getContent, state: async () => (await call({ type: "GET_STATE" })).state };
}

async function flush(rounds = 40) { for (let i = 0; i < rounds; i++) await Promise.resolve(); }

test("TURN_COMPLETE integrado conserva identidad y rechaza respuestas incorrectas", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });

  // A: START_TURN del worker inicia el content script real; su respuesta vuelve al listener real.
  const h = await harness("success");
  const active = (await h.state()).sessions[0];
  const content = await h.getContent(11);
  assert.ok(active.activeJobId);
  for (let i = 0; i < 14; i++) { t.mock.timers.tick(250); await flush(); }
  const report = content.messages.find(m => m.type === "TURN_COMPLETE");
  assert.ok(report, "el content script real debe enviar TURN_COMPLETE");
  assert.equal(report.sessionId, h.sessionId);
  assert.equal(report.jobId, active.activeJobId);
  assert.equal(report.role, "CEREBRO");
  assert.equal(report.ok, true);
  const completed = (await h.state()).sessions[0];
  assert.equal(completed.iteration, 1);
  assert.match(completed.status, /^LIMIT_REACHED/);

  // C: los mensajes incompletos, inexistentes, antiguos, con rol erróneo o remitente incorrecto se rechazan.
  const invalid = [
    [{ type: "TURN_COMPLETE", jobId: report.jobId, role: "CEREBRO", ok: true, text: "sin sesión" }, 11],
    [{ type: "TURN_COMPLETE", sessionId: "no-existe", jobId: report.jobId, role: "CEREBRO", ok: true, text: "sesión falsa" }, 11],
    [{ type: "TURN_COMPLETE", sessionId: h.sessionId, jobId: "job-antiguo", role: "CEREBRO", ok: true, text: "antiguo" }, 11],
    [{ type: "TURN_COMPLETE", sessionId: h.sessionId, jobId: report.jobId, role: "OBRERO", ok: true, text: "rol incorrecto" }, 22],
    [{ type: "TURN_COMPLETE", sessionId: h.sessionId, jobId: report.jobId, role: "CEREBRO", ok: "true", text: "ok no booleano" }, 11]
  ];
  for (const [message, tabId] of invalid) assert.equal((await h.call(message, { tab: { id: tabId } })).ok, false);
  assert.equal((await h.call(report, { tab: { id: 11 } })).ok, false, "el duplicado no se confirma como aceptado");
  const afterInvalid = (await h.state()).sessions[0];
  assert.equal(afterInvalid.iteration, 1);
  assert.match(afterInvalid.status, /^LIMIT_REACHED/);

  // B: error DOM controlado del content script, con identidad completa y transición ERROR.
  const bad = await harness("error");
  await flush();
  const failedContent = await bad.getContent(11);
  const failed = failedContent.messages.find(m => m.type === "TURN_COMPLETE");
  assert.ok(failed);
  assert.equal(failed.sessionId, bad.sessionId);
  assert.equal(failed.role, "CEREBRO");
  assert.equal(failed.ok, false);
  assert.match(failed.error, /DOM integrado controlado/);
  const failedState = (await bad.state()).sessions[0];
  assert.equal(failedState.running, false);
  assert.match(failedState.status, /^ERROR/);

  // D: STOP seguido de una finalización tardía no reactiva la sesión.
  const stoppedHarness = await harness("success");
  const beforeStop = (await stoppedHarness.state()).sessions[0];
  await stoppedHarness.call({ type: "STOP", sessionId: stoppedHarness.sessionId });
  const late = await stoppedHarness.call({ type: "TURN_COMPLETE", sessionId: stoppedHarness.sessionId,
    jobId: beforeStop.activeJobId, role: "CEREBRO", ok: true, text: "tardío" }, { tab: { id: 11 } });
  assert.equal(late.ok, false);
  const afterStop = (await stoppedHarness.state()).sessions[0];
  assert.equal(afterStop.status, "STOPPED");
  assert.equal(afterStop.running, false);
  assert.equal(afterStop.activeJobId, null);

  stoppedHarness.contents.delete(11);
  const restarted = await stoppedHarness.call({ type: "START_LOOP", sessionId: stoppedHarness.sessionId,
    brainTabId: 11, workerTabId: 22, seed: "nuevo trabajo", maxIterations: 1 });
  assert.equal(restarted.ok, true, restarted.error);
  const newState = (await stoppedHarness.state()).sessions[0];
  assert.ok(newState.activeJobId);
  assert.notEqual(newState.activeJobId, beforeStop.activeJobId);
  const oldAfterRestart = await stoppedHarness.call({ type: "TURN_COMPLETE", sessionId: stoppedHarness.sessionId,
    jobId: beforeStop.activeJobId, role: "CEREBRO", ok: true, text: "antiguo tras reinicio" }, { tab: { id: 11 } });
  assert.equal(oldAfterRestart.ok, false);
  const preserved = (await stoppedHarness.state()).sessions[0];
  assert.equal(preserved.activeJobId, newState.activeJobId);
  assert.equal(preserved.iteration, 0);
  assert.equal(preserved.running, true);
});
