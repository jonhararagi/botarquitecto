import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const CONTROL_PATH = new URL("../control.js", import.meta.url);

class FakeElement {
  constructor(id = "") {
    this.id = id;
    this.value = "";
    this.disabled = false;
    this.options = [];
    this.children = [];
    this.listeners = {};
    this.textContent = "";
    this.scrollHeight = 0;
    this.scrollTop = 0;
  }
  add(option) {
    this.options.push(option);
    if (this.value === "") this.value = String(option.value);
  }
  replaceChildren(...children) {
    this.options = [];
    this.children = [...children];
    this.value = "";
  }
  addEventListener(type, callback) {
    (this.listeners[type] ||= []).push(callback);
  }
  dispatch(type) {
    for (const callback of this.listeners[type] || []) callback({ type, target: this });
  }
  append(...children) { this.children.push(...children); }
}

const ticks = async (count = 20) => {
  for (let i = 0; i < count; i++) await Promise.resolve();
};

test("periodic polling cannot overwrite edited settings and START_LOOP receives the persisted values", async () => {
  const source = await readFile(CONTROL_PATH, "utf8");
  const ids = [
    "session", "sessionName", "brain", "worker", "seed", "iterations", "brainTimeout",
    "workerTimeout", "minTurnDelay", "status", "log", "start", "deleteSession",
    "newSession", "refresh", "pause", "resume", "stop", "reset"
  ];
  const elements = Object.fromEntries(ids.map(id => [id, new FakeElement(id)]));
  const document = {
    activeElement: null,
    getElementById(id) { return elements[id] ||= new FakeElement(id); },
    createElement() { return new FakeElement(); }
  };
  const session = {
    id: "session-1", name: "Local test", brainTabId: 11, workerTabId: 22,
    status: "IDLE", running: false, paused: false, stopRequested: false, iteration: 0,
    maxIterations: 10, brainTimeoutMs: 60000, workerTimeoutMs: 600000,
    minTurnDelayMs: 0, activeRole: null, activeJobId: null, log: []
  };
  let pollCallback = null;
  let savedSettings = null;
  let startedSettings = null;
  const snapshot = () => structuredClone({ version: 5, activeSessionId: session.id, sessions: [session] });
  const tabs = [
    { id: 11, title: "CEREBRO", url: "https://chatgpt.com/", windowId: 1 },
    { id: 22, title: "OBRERO", url: "https://chatgpt.com/c/worker", windowId: 1 }
  ];
  const chrome = {
    runtime: {
      async sendMessage(message) {
        if (message.type === "LIST_CHATGPT_TABS" || message.type === "GET_STATE") {
          return { ok: true, tabs, state: snapshot() };
        }
        if (message.type === "SAVE_SESSION") {
          savedSettings = structuredClone(message);
          Object.assign(session, {
            name: message.name, brainTabId: message.brainTabId, workerTabId: message.workerTabId,
            maxIterations: message.maxIterations, brainTimeoutMs: message.brainTimeoutMs,
            workerTimeoutMs: message.workerTimeoutMs, minTurnDelayMs: message.minTurnDelayMs
          });
          return { ok: true, state: snapshot() };
        }
        if (message.type === "START_LOOP") {
          startedSettings = structuredClone(message);
          session.running = true;
          session.status = "STARTING";
          session.maxIterations = message.maxIterations;
          return { ok: true, state: snapshot() };
        }
        if (message.type === "PAUSE" || message.type === "RESUME" || message.type === "STOP" || message.type === "RESET_SESSION") {
          return { ok: true, state: snapshot() };
        }
        throw new Error("Unexpected test message: " + message.type);
      }
    }
  };
  const context = vm.createContext({
    chrome, document, Option: class { constructor(text, value) { this.text = text; this.value = String(value); } },
    setInterval(callback) { pollCallback = callback; return 1; }, clearInterval() {},
    console, Promise, structuredClone
  });
  vm.runInContext(source, context, { filename: "bridge/control.js" });
  for (let attempt = 0; attempt < 20 && !pollCallback; attempt++) await ticks();
  assert.ok(pollCallback, "the control panel should start its state poll");
  assert.equal(elements.iterations.value, 10);

  elements.sessionName.value = "Manual test";
  elements.sessionName.dispatch("input");
  elements.iterations.value = "2";
  elements.iterations.dispatch("input");
  elements.brainTimeout.value = "45";
  elements.brainTimeout.dispatch("input");
  elements.workerTimeout.value = "60";
  elements.workerTimeout.dispatch("input");
  elements.minTurnDelay.value = "3";
  elements.minTurnDelay.dispatch("input");
  document.activeElement = elements.start;
  await pollCallback();
  assert.equal(elements.sessionName.value, "Manual test", "poll must not replace edited session name");
  assert.equal(elements.iterations.value, "2", "poll must not replace edited iteration limit 2 with 10");
  assert.equal(elements.brainTimeout.value, "45", "poll must not replace edited CEREBRO timeout 45 with saved 60");
  assert.equal(elements.workerTimeout.value, "60", "poll must not replace edited OBRERO timeout 60 with saved 600");
  assert.equal(elements.minTurnDelay.value, "3", "poll must not replace edited minimum delay");

  elements.seed.value = "synthetic seed";
  await elements.start.onclick();
  assert.equal(savedSettings.name, "Manual test");
  assert.equal(savedSettings.maxIterations, 2, "SAVE_SESSION must persist the edited iteration limit");
  assert.equal(savedSettings.brainTimeoutMs, 45000, "SAVE_SESSION must persist CEREBRO timeout in ms");
  assert.equal(savedSettings.workerTimeoutMs, 60000, "SAVE_SESSION must persist OBRERO timeout in ms");
  assert.equal(savedSettings.minTurnDelayMs, 3000, "SAVE_SESSION must persist minimum delay in ms");
  assert.equal(startedSettings.maxIterations, 2, "START_LOOP must receive the same iteration limit");
  assert.equal(startedSettings.brainTimeoutMs, 45000, "START_LOOP must receive saved CEREBRO timeout");
  assert.equal(startedSettings.workerTimeoutMs, 60000, "START_LOOP must receive saved OBRERO timeout rather than 600000");
  assert.equal(startedSettings.minTurnDelayMs, 3000, "START_LOOP must receive saved minimum delay");
  assert.equal(session.name, "Manual test");
  assert.equal(session.maxIterations, 2);
  assert.equal(session.brainTimeoutMs, 45000);
  assert.equal(session.workerTimeoutMs, 60000);
  assert.equal(elements.iterations.value, 2);
  assert.equal(elements.brainTimeout.value, 45);
  assert.equal(elements.workerTimeout.value, 60);
  assert.equal(elements.minTurnDelay.value, 3);
});
