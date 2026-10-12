import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const CONTENT_PATH = new URL("../content.js", import.meta.url);

test("content script real expira un turno sin respuesta usando reloj simulado", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const source = await readFile(CONTENT_PATH, "utf8");
  const sent = [];
  const form = {
    querySelectorAll(selector) {
      if (selector === "button, [role='button']" || selector === "button") return [button];
      return [];
    },
    contains(node) { return node === input || node === button; }
  };
  const input = {
    tagName: "DIV",
    textContent: "",
    isConnected: true,
    parentElement: form,
    focus() {},
    matches() { return false; },
    closest(selector) { return selector === "form" ? form : null; },
    compareDocumentPosition(node) { return node === button ? 4 : 0; },
    dispatchEvent() {},
    getAttribute() { return null; }
  };
  const button = {
    tagName: "BUTTON",
    disabled: false,
    isConnected: true,
    closest(selector) { return selector === "form" ? form : null; },
    getAttribute(name) { return name === "data-testid" ? "send-button" : null; },
    click() {}
  };
  const document = {
    documentElement: { contains(node) { return node === input || node === button; } },
    activeElement: input,
    querySelectorAll(selector) {
      if (selector === "#prompt-textarea") return [input];
      if (selector === 'button[data-testid="send-button"]') return [button];
      if (selector === '[data-message-author-role="assistant"]' || selector === "article") return [];
      return [];
    },
    execCommand() { return true; }
  };
  const chrome = {
    runtime: {
      onMessage: { addListener(fn) { this.listener = fn; } },
      sendMessage(message) { sent.push(structuredClone(message)); return Promise.resolve({ ok: true }); }
    }
  };
  const context = vm.createContext({
    chrome, document, Date, setTimeout, clearTimeout, Promise,
    InputEvent: class { constructor() {} },
    KeyboardEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
    Event: class { constructor() {} },
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    console: { log() {}, warn() {}, error() {} }
  });
  vm.runInContext(source, context, { filename: "bridge/content.js" });
  const listener = context.chrome.runtime.onMessage.listener;
  let startResponse;
  listener({
    type: "START_TURN", jobId: "timeout-job", sessionId: "session-timeout",
    role: "CEREBRO", text: "prompt sintético", timeoutMs: 5, minTurnDelayMs: 0
  }, {}, value => { startResponse = value; });
  assert.equal(startResponse.ok, true);

  // Drive the actual content-script polling loop forward without wall-clock sleeps.
  for (let i = 0; i < 30 && !sent.some(m => m.type === "TURN_COMPLETE"); i++) {
    t.mock.timers.tick(250);
    for (let j = 0; j < 8; j++) await Promise.resolve();
  }

  const completion = sent.find(m => m.type === "TURN_COMPLETE");
  assert.ok(completion, "el script real debe informar la expiración");
  assert.equal(completion.jobId, "timeout-job");
  assert.equal(completion.ok, false);
  assert.match(completion.error, /ChatGPT no confirmó el envío/);
});
