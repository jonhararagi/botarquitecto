import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const workerPath = new URL("../service-worker.js", import.meta.url);
const contentPath = new URL("../content.js", import.meta.url);

function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

async function harness(mode = "success", options = {}) {
  const callbacks = { message: null, removed: null, clicked: null };
  const tabs = new Map([
    [11, { id: 11, url: "https://chatgpt.com/", title: "CEREBRO", windowId: 1 }],
    [22, { id: 22, url: "https://chatgpt.com/c/worker", title: "OBRERO", windowId: 1 }]
  ]);
  const storage = {};
  const ready = deferred();
  const contents = new Map();
  const starts = [];
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
      async sendMessage(tabId, message) { starts.push({ tabId, message: structuredClone(message) }); return { ok: true }; },
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
    const useStructuralSendButton = options.workerSendVariant === "structural" && tabId === 22;
    const useKeyboardFallback = options.keyboardFallback === true && tabId === 11;
    const ambiguousClick = options.ambiguousClick === true && tabId === 11;
    const unrecognizedStopActive = options.unrecognizedStopActive === true && tabId === 11;
    const transientStop = options.transientStop === true && tabId === 11;
    const preserveComposer = options.preserveComposer === true && tabId === 11;
    const noAssistantResponse = options.noAssistantResponse === true && tabId === 11;
    const replaceComposerOnClick = options.replaceComposerOnClick === true && tabId === 11;
    const mutationObservers = [];
    class MockMutationObserver {
      constructor(callback) { this.callback = callback; this.active = false; mutationObservers.push(this); }
      observe(target) { this.target = target; this.active = true; }
      disconnect() { this.active = false; }
    }
    const sendAttempts = { click: 0, keyboard: 0 };
    let stopVisible = false;
    let stopVisibilityChecks = 0;
    let localizedSendButton;
    let structuralSendButton;
    const composerToolbar = {
      parentElement: null,
      querySelectorAll(selector) {
        if (selector !== "button, [role='button']") return [];
        const controls = [];
        if (structuralSendButton) controls.push(structuralSendButton);
        if (unrecognizedStopActive) controls.push(stopMarker);
        return controls;
      }
    };
    let input = {
      textContent: "",
      parentElement: composerToolbar,
      get innerText() { return this.textContent; },
      focus() {},
      matches: () => false,
      closest() { return null; },
      compareDocumentPosition(other) { return other === structuralSendButton ? 4 : 0; },
      dispatchEvent(event) {
        if (event.type === "keydown" && event.key === "Enter" && ambiguousClick) sendAttempts.keyboard++;
        if (event.type === "keydown" && event.key === "Enter" && useKeyboardFallback) { this.textContent = ""; assistant.push(node); }
        if (event.type === "input" && this.textContent) {
          if (localizedSendButton) localizedSendButton.disabled = false;
          if (structuralSendButton) structuralSendButton.disabled = false;
        }
      },
      getAttribute() { return null; }
    };
    const initialInput = input;
      const replyText = options.partialResponse && tabId === 11 ? "respuesta parcial" : tabId === 22 ? "respuesta OBRERO integrada" : "respuesta integrada";
      const node = {
      innerText: replyText + " [[BRIDGE_DONE]]",
      textContent: replyText + " [[BRIDGE_DONE]]",
      querySelector() { return null; },
      closest() { return null; }, getAttribute() { return "assistant"; }
    };
    const assistant = [];
    const stopMarker = {
      tagName: "BUTTON",
      disabled: false,
      getAttribute(name) { return name === "data-testid" ? "stop-generating" : null; },
      innerText: "", textContent: ""
    };
    function clickSend() {
      sendAttempts.click++;
      if (mode === "error") throw new Error("DOM integrado controlado");
      if (ambiguousClick) return;
      if (replaceComposerOnClick) {
        input = {
          textContent: "",
          parentElement: composerToolbar,
          get innerText() { return this.textContent; },
          focus() {},
          matches: () => false,
          closest() { return null; },
          compareDocumentPosition(other) { return other === structuralSendButton ? 4 : 0; },
          dispatchEvent() {},
          getAttribute() { return null; }
        };
        return;
      }
      stopVisible = true;
      if (transientStop) {
        stopMarker.transientWasVisible = true;
        for (const observer of mutationObservers) {
          if (observer.active && observer.target === document.documentElement) {
            queueMicrotask(() => observer.callback([{ type: "childList", addedNodes: [stopMarker], target: document.documentElement }]));
          }
        }
        stopVisible = false;
      }
      if (!useKeyboardFallback) {
        if (!noAssistantResponse) assistant.push(node);
        if (!preserveComposer) input.textContent = "";
      }
    }
    const sendButton = {
      disabled: true,
      getAttribute(name) { return name === "data-testid" ? "send-button" : null; },
      click: clickSend
    };
    localizedSendButton = {
      disabled: true,
      getAttribute(name) {
        if (name === "aria-label") return "Enviar mensaje";
        if (name === "type") return "submit";
        return null;
      },
      click: clickSend
    };
    structuralSendButton = {
      disabled: true,
      // Simulates an icon-only send control with no accessible label, test-id,
      // submit type, or wrapping form.
      getAttribute() { return null; },
      click: clickSend
    };
    const document = {
      documentElement: {},
      querySelectorAll(selector) {
        if (selector === "#prompt-textarea" || selector === 'textarea[name="prompt-textarea"]' ||
            selector === 'div[contenteditable="true"][role="textbox"]') return [input];
        if (selector === 'button[data-testid="send-button"]' || selector === 'button[data-testid*="send" i]') return useStructuralSendButton ? [] : [sendButton];
        if (selector === 'button[aria-label*="enviar" i]') return useStructuralSendButton ? [] : [localizedSendButton];
        if (selector === '[data-message-author-role="assistant"]' || selector === "article") return assistant;
        if (selector === "button, [role='button']" && (stopVisible || unrecognizedStopActive)) return [stopMarker];
        if (selector.includes("stop-button") || selector.includes("Stop") || selector.includes("Detener")) return [];
        return [];
      },
      execCommand() { return false; }
    };
    const runtimeListeners = { message: null };
    const chrome = {
      runtime: {
        onMessage: { addListener(fn) { runtimeListeners.message = fn; } },
        sendMessage(message) { return call(message, { tab: { id: tabId } }); }
      }
    };
    let fakeNow = 0;
    class FastDate extends Date { static now() { fakeNow += 500; return fakeNow; } }
    const context = vm.createContext({
      chrome, document, Date: FastDate, MutationObserver: MockMutationObserver,
      setTimeout: callback => { queueMicrotask(callback); return 1; }, clearTimeout: () => {},
      Promise, console, queueMicrotask,
      InputEvent: class { constructor(type) { this.type = type; } }, Event: class { constructor(type) { this.type = type; } }, KeyboardEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
      HTMLInputElement: class {}, HTMLTextAreaElement: class {},
      getComputedStyle: node => {
        if (node === stopMarker) {
          stopVisibilityChecks++;
          const visible = unrecognizedStopActive || (stopVisible && stopVisibilityChecks <= 1);
          return { display: visible ? "block" : "none", visibility: "visible" };
        }
        return { display: "block", visibility: "visible" };
      }
    });
    vm.runInContext(contentSource, context, { filename: "bridge/content.js" });
    const result = {
      listener: (m, s, respond) => runtimeListeners.message(m, s, respond),
      messages: [], attempts: sendAttempts,
      composerText: () => input.textContent,
      originalComposerText: () => initialInput.textContent,
      assistantCount: () => assistant.length
    };
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
    seed: "prompt sintético", maxIterations: options.maxIterations ?? 1, brainTimeoutMs: 5000, workerTimeoutMs: 5000 });
  assert.equal(start.ok, true, start.error);
  return { call, sessionId, contents, starts, getContent, state: async () => (await call({ type: "GET_STATE" })).state };
}

async function flush(rounds = 40) { for (let i = 0; i < rounds; i++) await Promise.resolve(); }

test("TURN_COMPLETE integrado conserva identidad y rechaza respuestas incorrectas", async t => {


  // A: START_TURN del worker inicia el content script real; su respuesta vuelve al listener real.
  const h = await harness("success");
  const active = (await h.state()).sessions[0];
  const content = await h.getContent(11);
  assert.ok(active.activeJobId);
  const startMessage = h.starts.find(item => item.message.type === "START_TURN").message;
  assert.equal(startMessage.sessionId, h.sessionId);
  content.listener(startMessage, {}, () => {});
  await flush(100);
  const report = content.messages.find(m => m.type === "TURN_COMPLETE");
  assert.ok(report, "el content script real debe enviar TURN_COMPLETE");
  assert.equal(report.sessionId, h.sessionId);
  assert.equal(report.jobId, active.activeJobId);
  assert.equal(report.role, "CEREBRO");
  assert.equal(report.ok, true);
  assert.equal(report.text, "respuesta integrada", "the exact assistant response must be delivered without a copy-action button");
  assert.equal(content.attempts.click, 1, "a valid send uses one click");
  assert.equal(content.attempts.keyboard, 0, "a valid send does not need a fallback keypress");
  assert.equal(content.composerText(), "", "the accepted send clears the active composer in this fixture");
  assert.equal(content.assistantCount(), 1, "exactly one new assistant response was produced");
  const completed = (await h.state()).sessions[0];
  assert.equal(completed.iteration, 1);
  assert.match(completed.status, /^LIMIT_REACHED/);

  // C: los mensajes incompletos, inexistentes, antiguos, con rol erróneo o remitente incorrecto se rechazan.
  const invalid = [
    [{ type: "TURN_COMPLETE", jobId: report.jobId, role: "CEREBRO", ok: true, text: "sin sesión" }, 11],
    [{ type: "TURN_COMPLETE", sessionId: "no-existe", jobId: report.jobId, role: "CEREBRO", ok: true, text: "sesión falsa" }, 11],
    [{ type: "TURN_COMPLETE", sessionId: h.sessionId, jobId: "job-antiguo", role: "CEREBRO", ok: true, text: "antiguo" }, 11],
    [{ type: "TURN_COMPLETE", sessionId: h.sessionId, jobId: report.jobId, role: "OBRERO", ok: true, text: "rol incorrecto" }, 22],
    [{ type: "TURN_COMPLETE", sessionId: h.sessionId, jobId: report.jobId, role: "CEREBRO", ok: true, text: "rol válido desde pestaña incorrecta" }, 22],
    [{ type: "TURN_COMPLETE", sessionId: h.sessionId, jobId: report.jobId, role: "CEREBRO", ok: "true", text: "ok no booleano" }, 11]
  ];
  for (const [message, tabId] of invalid) assert.equal((await h.call(message, { tab: { id: tabId } })).ok, false);
  assert.equal((await h.call(report, { tab: { id: 11 } })).ok, false, "el duplicado no se confirma como aceptado");
  const afterInvalid = (await h.state()).sessions[0];
  assert.equal(afterInvalid.iteration, 1);
  assert.match(afterInvalid.status, /^LIMIT_REACHED/);

  // B: error DOM controlado del content script, con identidad completa y transición ERROR.
  const bad = await harness("error");
  const failedContent = await bad.getContent(11);
  failedContent.listener(bad.starts.find(item => item.message.type === "START_TURN").message, {}, () => {});
  await flush(100);
  const failed = failedContent.messages.find(m => m.type === "TURN_COMPLETE");
  assert.ok(failed);
  assert.equal(failed.sessionId, bad.sessionId);
  const failedStart = bad.starts.find(item => item.message.type === "START_TURN");
  assert.ok(failedStart, "el worker debe haber emitido START_TURN para el caso fallido");
  assert.equal(failed.jobId, failedStart.message.jobId, "el error conserva exactamente el jobId original");
  assert.equal(failed.sessionId, failedStart.message.sessionId, "el error conserva la sesión de START_TURN");
  assert.equal(failed.role, "CEREBRO");
  assert.equal(failed.ok, false);
  assert.match(failed.error, /DOM integrado controlado/);
  const failedState = (await bad.state()).sessions[0];
  assert.equal(failedState.running, false);
  assert.match(failedState.status, /^ERROR/);

  // D: STOP seguido de una finalización tardía no reactiva la sesión.
  const stoppedHarness = await harness("success");
  let beforeStop;
  for (let attempt = 0; attempt < 20; attempt++) {
    await flush(40);
    beforeStop = (await stoppedHarness.state()).sessions[0];
    if (beforeStop.activeJobId) break;
  }
  assert.ok(beforeStop.activeJobId, "el trabajo inicial debe despacharse antes de STOP");
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
  let newState;
  for (let attempt = 0; attempt < 20; attempt++) {
    await flush(40);
    newState = (await stoppedHarness.state()).sessions[0];
    if (newState.activeJobId) break;
  }
  assert.ok(newState.activeJobId, "el nuevo trabajo debe quedar activo antes de probar la respuesta antigua");
  assert.notEqual(newState.activeJobId, beforeStop.activeJobId);
  const oldAfterRestart = await stoppedHarness.call({ type: "TURN_COMPLETE", sessionId: stoppedHarness.sessionId,
    jobId: beforeStop.activeJobId, role: "CEREBRO", ok: true, text: "antiguo tras reinicio" }, { tab: { id: 11 } });
  assert.equal(oldAfterRestart.ok, false);
  const preserved = (await stoppedHarness.state()).sessions[0];
  assert.equal(preserved.activeJobId, newState.activeJobId);
  assert.equal(preserved.iteration, 0);
  assert.equal(preserved.running, true);
});


test("CEREBRO→OBRERO completes when OBRERO exposes only an icon-only composer control", async () => {
  const h = await harness("success", { maxIterations: 2, workerSendVariant: "structural" });
  const brainContent = await h.getContent(11);
  const brainStart = h.starts.find(item => item.tabId === 11 && item.message.type === "START_TURN").message;

  brainContent.listener(brainStart, {}, () => {});
  await flush(150);

  const brainReport = brainContent.messages.find(message => message.type === "TURN_COMPLETE");
  assert.ok(brainReport, "CEREBRO must complete its first turn");
  assert.equal(brainReport.ok, true);
  assert.equal(brainReport.text, "respuesta integrada");

  const workerStartItem = h.starts.find(item => item.tabId === 22 && item.message.type === "START_TURN");
  assert.ok(workerStartItem, "verified CEREBRO output must be handed off to OBRERO");
  assert.equal(workerStartItem.message.text, "respuesta integrada");

  const workerContent = await h.getContent(22);
  workerContent.listener(workerStartItem.message, {}, () => {});
  await flush(150);

  const workerReport = workerContent.messages.find(message => message.type === "TURN_COMPLETE");
  assert.ok(workerReport, "OBRERO content script must report a terminal result");
  assert.equal(workerReport.role, "OBRERO");
  assert.equal(workerReport.ok, true);
  assert.equal(workerReport.text, "respuesta OBRERO integrada");

  const completed = (await h.state()).sessions[0];
  assert.equal(completed.iteration, 2);
  assert.match(completed.status, /^LIMIT_REACHED/);
  assert.ok(completed.log.some(entry => entry.role === "OBRERO" && entry.text === "respuesta OBRERO integrada"));
});


test("a transient Stop signal is retained when the response completes before the first polling sample", async () => {
  const h = await harness("success", { maxIterations: 1, transientStop: true });
  const content = await h.getContent(11);
  const startMessage = h.starts.find(item => item.tabId === 11 && item.message.type === "START_TURN").message;

  content.listener(startMessage, {}, () => {});
  await flush(300);

  const report = content.messages.find(message => message.type === "TURN_COMPLETE");
  assert.ok(report, "a completed fast response must reach the worker");
  assert.equal(report.ok, true, "briefly visible generation must be observed even if polling misses it");
  assert.equal(report.text, "respuesta integrada");
  const session = (await h.state()).sessions[0];
  assert.equal(session.iteration, 1);
  assert.match(session.status, /^LIMIT_REACHED/);
});

test("submission confirmation reads the active composer after ChatGPT replaces its DOM node", async () => {
  const h = await harness("success", {
    maxIterations: 1,
    replaceComposerOnClick: true,
    noAssistantResponse: true
  });
  const content = await h.getContent(11);
  const startMessage = h.starts.find(item => item.tabId === 11 && item.message.type === "START_TURN").message;

  content.listener(startMessage, {}, () => {});
  await flush(300);

  const report = content.messages.find(message => message.type === "TURN_COMPLETE");
  assert.ok(report, "the job must report a terminal state");
  assert.equal(report.ok, false, "a cleared composer without a new assistant answer is not success");
  assert.match(
    report.error,
    /Timeout esperando una respuesta nueva de ChatGPT/,
    "a replaced and cleared live composer should confirm submission and move to response waiting"
  );
  assert.equal(content.originalComposerText(), "prompt sintético", "the detached old node retains its old value");
  assert.equal(content.composerText(), "", "the current active composer is empty");
  assert.equal(content.assistantCount(), 0);
  assert.equal(content.attempts.click, 1);
  assert.equal(content.attempts.keyboard, 0);
});

test("a transient Stop insertion is positive evidence of submission even if the composer remains populated", async () => {
  const h = await harness("success", {
    maxIterations: 1,
    transientStop: true,
    preserveComposer: true,
    noAssistantResponse: true
  });
  const content = await h.getContent(11);
  const startMessage = h.starts.find(item => item.tabId === 11 && item.message.type === "START_TURN").message;

  content.listener(startMessage, {}, () => {});
  await flush(300);

  const report = content.messages.find(message => message.type === "TURN_COMPLETE");
  assert.ok(report, "the turn must terminate with an explicit result");
  assert.equal(report.ok, false, "without an assistant response BRIDGE must never report success");
  assert.match(
    report.error,
    /Timeout esperando una respuesta nueva de ChatGPT/,
    "an observed generation-start signal should advance past send confirmation to response waiting"
  );
  assert.equal(content.composerText(), "prompt sintético", "the fixture keeps the composer text visible");
  assert.equal(content.assistantCount(), 0, "no response was provided to the harness");
  assert.equal(content.attempts.click, 1, "observing submission must not trigger a second click");
  assert.equal(content.attempts.keyboard, 0, "observing submission must not trigger Enter");
});

test("an ambiguous post-click state never triggers a second automatic send", async () => {
  const h = await harness("success", { maxIterations: 1, ambiguousClick: true });
  const content = await h.getContent(11);
  const startMessage = h.starts.find(item => item.tabId === 11 && item.message.type === "START_TURN").message;

  content.listener(startMessage, {}, () => {});
  await flush(250);

  const report = content.messages.find(message => message.type === "TURN_COMPLETE");
  assert.ok(report, "ambiguous delivery must terminate with an explicit result");
  assert.equal(report.ok, false, "unknown delivery state must fail closed instead of being resent");
  assert.match(report.error, /no confirmó el envío/i);
  assert.equal(content.attempts.click, 1, "the composer receives only one automatic click");
  assert.equal(content.attempts.keyboard, 0, "do not submit again while the first click may already have been accepted");
  assert.equal(content.composerText(), "prompt sintético", "the unsubmitted message remains in the composer");
  assert.equal(content.assistantCount(), 0, "the no-send fixture creates no assistant response");
  assert.equal(content.messages.filter(message => message.type === "TURN_COMPLETE").length, 1);
  const session = (await h.state()).sessions[0];
  assert.equal(session.running, false);
  assert.match(session.status, /^ERROR/);
  assert.equal(h.starts.filter(item => item.message.type === "START_TURN").length, 1);
});

test("a click exception is terminal and is not retried with Enter", async () => {
  const h = await harness("error", { maxIterations: 1, keyboardFallback: true });
  const content = await h.getContent(11);
  const startMessage = h.starts.find(item => item.tabId === 11 && item.message.type === "START_TURN").message;

  content.listener(startMessage, {}, () => {});
  await flush(100);

  const report = content.messages.find(message => message.type === "TURN_COMPLETE");
  assert.ok(report);
  assert.equal(report.ok, false);
  assert.match(report.error, /DOM integrado controlado/);
  assert.equal(content.attempts.click, 1);
  assert.equal(content.attempts.keyboard, 0);
});

test("an unrecognized visible Stop control cannot make a partial answer look complete", async () => {
  const h = await harness("success", { maxIterations: 1, partialResponse: true, unrecognizedStopActive: true });
  const content = await h.getContent(11);
  const startMessage = h.starts.find(item => item.tabId === 11 && item.message.type === "START_TURN").message;

  content.listener(startMessage, {}, () => {});
  await flush(250);

  const report = content.messages.find(message => message.type === "TURN_COMPLETE");
  assert.ok(report);
  assert.equal(report.ok, false, "an unrecognized-but-visible Stop control means generation may still be active");
  assert.match(report.error, /Timeout esperando que terminara la respuesta de ChatGPT/);
  const session = (await h.state()).sessions[0];
  assert.equal(session.running, false);
  assert.match(session.status, /^ERROR/);
  assert.equal(session.iteration, 0, "partial output must not be accepted as a completed iteration");
});


test("duplicate START_TURN with the same jobId is idempotent and sends once", async () => {
  const h = await harness("success", { maxIterations: 1 });
  const content = await h.getContent(11);
  const startMessage = h.starts.find(item => item.tabId === 11 && item.message.type === "START_TURN").message;
  const acknowledgements = [];

  content.listener(startMessage, {}, value => acknowledgements.push(value));
  content.listener(startMessage, {}, value => acknowledgements.push(value));
  await flush(250);

  assert.equal(acknowledgements.length, 2);
  assert.equal(acknowledgements[0].ok, true);
  assert.equal(acknowledgements[1].ok, true, "duplicate delivery should be acknowledged without launching another run");
  assert.equal(content.attempts.click, 1, "same jobId must not cause a second click");
  assert.equal(content.messages.filter(message => message.type === "TURN_COMPLETE").length, 1);
  const session = (await h.state()).sessions[0];
  assert.equal(session.iteration, 1);
  assert.match(session.status, /^LIMIT_REACHED/);
});
