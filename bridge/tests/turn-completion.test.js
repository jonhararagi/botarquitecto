const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const root = path.resolve(__dirname, "..");

function loadWorker() {
  const stored = {};
  const sent = [];
  const tabs = new Map([
    [11, { id: 11, url: "https://chatgpt.com/c/brain", title: "CEREBRO" }],
    [22, { id: 22, url: "https://chatgpt.com/c/worker", title: "OBRERO" }]
  ]);
  const listeners = {};
  const chrome = {
    storage: {
      local: {
        async get(key) { return { [key]: stored[key] }; },
        async set(value) { Object.assign(stored, value); }
      }
    },
    tabs: {
      async query() { return [...tabs.values()]; },
      async get(id) {
        if (!tabs.has(id)) throw new Error("Tab not found");
        return tabs.get(id);
      },
      async sendMessage(tabId, message) {
        sent.push({ tabId, message });
        return { ok: true };
      },
      onRemoved: { addListener(fn) { listeners.onRemoved = fn; } }
    },
    action: { onClicked: { addListener(fn) { listeners.onClicked = fn; } } },
    runtime: {
      onMessage: { addListener(fn) { listeners.onMessage = fn; } },
      getURL(file) { return "chrome-extension://test/" + file; }
    }
  };

  const source = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
  vm.runInNewContext(source, {
    chrome,
    crypto: webcrypto,
    structuredClone,
    console,
    Date,
    Math,
    String,
    Number,
    Boolean,
    Array,
    Object,
    Error,
    Promise,
    setTimeout,
    clearTimeout
  }, { filename: "service-worker.js" });

  return { listeners, sent, stored };
}

function send(listeners, message, tabId) {
  return new Promise((resolve, reject) => {
    if (!listeners.onMessage) return reject(new Error("Message listener not registered"));
    const returned = listeners.onMessage(message, { tab: { id: tabId } }, resolve);
    if (returned !== true) reject(new Error("Async message listener did not keep the channel open"));
  });
}

async function readyWorker() {
  const worker = loadWorker();
  await new Promise(resolve => setTimeout(resolve, 10));
  return worker;
}

test("TURN_COMPLETE requires the session id and rejects unknown sessions", async () => {
  const { listeners } = await readyWorker();
  const result = await send(listeners, {
    type: "TURN_COMPLETE", jobId: "job-x", role: "CEREBRO", ok: true, text: "answer"
  }, 11);
  assert.equal(result.ok, false);
  assert.match(result.error, /Sesión no encontrada/);
});

test("TURN_COMPLETE validates the active job, role, and source tab before forwarding", async () => {
  const { listeners, sent } = await readyWorker();
  let result = await send(listeners, { type: "GET_STATE" });
  const session = result.state.sessions[0];

  result = await send(listeners, {
    type: "SAVE_SESSION", sessionId: session.id, name: session.name,
    brainTabId: 11, workerTabId: 22, maxIterations: 10,
    brainTimeoutMs: 60000, workerTimeoutMs: 600000, minTurnDelayMs: 0
  });
  assert.equal(result.ok, true);

  result = await send(listeners, {
    type: "START_LOOP", sessionId: session.id, brainTabId: 11, workerTabId: 22,
    seed: "Start task", maxIterations: 10, brainTimeoutMs: 60000,
    workerTimeoutMs: 600000, minTurnDelayMs: 0
  });
  assert.equal(result.ok, true);
  const started = result.state.sessions.find(item => item.id === session.id);
  const firstJob = started.activeJobId;
  assert.ok(firstJob);
  assert.equal(sent.at(-1).tabId, 11);

  const stale = await send(listeners, {
    type: "TURN_COMPLETE", sessionId: session.id, jobId: "wrong-job",
    role: "CEREBRO", ok: true, text: "stale response"
  }, 11);
  assert.equal(stale.ok, false);

  const wrongRole = await send(listeners, {
    type: "TURN_COMPLETE", sessionId: session.id, jobId: firstJob,
    role: "OBRERO", ok: true, text: "wrong role"
  }, 11);
  assert.equal(wrongRole.ok, false);

  const completed = await send(listeners, {
    type: "TURN_COMPLETE", sessionId: session.id, jobId: firstJob,
    role: "CEREBRO", ok: true, text: "CEREBRO response"
  }, 11);
  assert.equal(completed.ok, true);

  const after = await send(listeners, { type: "GET_STATE" });
  const updated = after.state.sessions.find(item => item.id === session.id);
  assert.equal(updated.activeRole, "OBRERO");
  assert.notEqual(updated.activeJobId, firstJob);
  assert.equal(sent.at(-1).tabId, 22);
  assert.equal(sent.at(-1).message.text, "CEREBRO response");

  const stopped = await send(listeners, { type: "STOP", sessionId: session.id });
  assert.equal(stopped.ok, true);
  assert.equal(stopped.state.sessions.find(item => item.id === session.id).status, "STOPPED");
  assert.equal(sent.at(-1).tabId, 22);
  assert.equal(sent.at(-1).message.type, "CANCEL_TURN");
  assert.ok(sent.at(-1).message.jobId);
});

test("content script includes session identity and checks the completion acknowledgement", () => {
  const source = fs.readFileSync(path.join(root, "content.js"), "utf8");
  assert.match(source, /sessionId:\s*String\(message\.sessionId\s*\|\|\s*""\)/);
  assert.match(source, /if\s*\(!response\?\.ok\)/);
  assert.match(source, /reportTurnComplete\(message,\s*\{\s*ok:\s*true,\s*text\s*\}\)/);
  assert.match(source, /message\?\.type === "CANCEL_TURN"/);
  assert.match(source, /activeJobCancelled = true/);
  assert.match(source, /async function waitForInput\(timeoutMs, shouldCancel = \(\) => false\)/);
  assert.match(source, /async function waitForCompletedResponse\([^\n]+shouldCancel = \(\) => false\)/);
  assert.match(source, /if \(shouldCancel\(\)\) throw new Error\("Turno cancelado por BRIDGE"\)/);
});
