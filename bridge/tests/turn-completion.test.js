const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const root = path.resolve(__dirname, "..");

function loadWorker(initialStorage = {}, options = {}) {
  const stored = { ...initialStorage };
  const sent = [];
  const tabs = new Map([
    [11, { id: 11, url: "https://chatgpt.com/c/brain", title: "CEREBRO" }],
    [22, { id: 22, url: "https://chatgpt.com/c/worker", title: "OBRERO" }]
  ]);
  const listeners = {};
  const alarmState = new Map();
  const chrome = {
    storage: {
      local: {
        async get(key) { return { [key]: stored[key] }; },
        async set(value) {
          const snapshot = options.cloneWrites ? structuredClone(value) : value;
          const cleanup = options.onSet?.(snapshot);
          const delayMs = options.delayFor?.(snapshot) || 0;
          try {
            if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
            Object.assign(stored, snapshot);
          } finally {
            if (typeof cleanup === "function") cleanup();
          }
        }
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
    alarms: {
      async create(name, info) { alarmState.set(name, info); },
      async clear(name) { return alarmState.delete(name); },
      onAlarm: { addListener(fn) { listeners.onAlarm = fn; } }
    },
    action: { onClicked: { addListener(fn) { listeners.onClicked = fn; } } },
    runtime: {
      onMessage: { addListener(fn) { listeners.onMessage = fn; } },
      onStartup: { addListener(fn) { listeners.onStartup = fn; } },
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

  return { listeners, sent, stored, alarmState };
}

function send(listeners, message, tabId) {
  return new Promise((resolve, reject) => {
    if (!listeners.onMessage) return reject(new Error("Message listener not registered"));
    const returned = listeners.onMessage(message, { tab: { id: tabId } }, resolve);
    if (returned !== true) reject(new Error("Async message listener did not keep the channel open"));
  });
}

async function readyWorker(options = {}) {
  const worker = loadWorker({}, options);
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

  const duplicate = await send(listeners, {
    type: "TURN_COMPLETE", sessionId: session.id, jobId: firstJob,
    role: "CEREBRO", ok: true, text: "CEREBRO response"
  }, 11);
  assert.equal(duplicate.ok, false, "a repeated completion must not advance the next turn");

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

test("extension JavaScript parses and manifest declares an MV3 content script", () => {
  const { execFileSync } = require("node:child_process");
  for (const file of ["content.js", "service-worker.js", "control.js", "popup.js"]) {
    execFileSync(process.execPath, ["--check", path.join(root, file)]);
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.content_scripts.some(script => script.js.includes("content.js")));
  assert.ok(manifest.background.service_worker);
});


test("startup recovery expires and cancels a persisted turn past its deadline", async () => {
  const { listeners, sent, stored, alarmState } = await readyWorker();
  const initial = await send(listeners, { type: "GET_STATE" });
  const session = initial.state.sessions[0];

  const started = await send(listeners, {
    type: "START_LOOP", sessionId: session.id, brainTabId: 11, workerTabId: 22,
    seed: "Watchdog test", maxIterations: 10, brainTimeoutMs: 5000,
    workerTimeoutMs: 600000, minTurnDelayMs: 0
  });
  assert.equal(started.ok, true);
  const active = started.state.sessions.find(item => item.id === session.id);
  const jobId = active.activeJobId;
  assert.ok(jobId);
  assert.ok(active.activeJobStartedAt);
  assert.equal(active.activeJobTimeoutMs, 5000);
  assert.ok(stored.bridgeStateV5);
  assert.ok(alarmState.has("bridge-turn-watchdog"));

  const persisted = stored.bridgeStateV5.sessions.find(item => item.id === session.id);
  persisted.activeJobStartedAt = Date.now() - 6000;
  // A service-worker restart reloads the persisted snapshot, then reconciles
  // expired work against the persisted deadline instead of relying on object aliasing.
  const restarted = loadWorker({ bridgeStateV5: stored.bridgeStateV5 });
  await new Promise(resolve => setTimeout(resolve, 10));
  const final = await send(restarted.listeners, { type: "GET_STATE" });
  const failed = final.state.sessions.find(item => item.id === session.id);
  assert.equal(failed.running, false);
  assert.equal(failed.activeJobId, null);
  assert.match(failed.status, /ERROR/);
  assert.match(failed.status, /timeout/i);
  assert.ok(restarted.sent.some(item => item.tabId === 11 && item.message.type === "CANCEL_TURN" && item.message.jobId === jobId));
});



test("service-worker restart fails closed if completion persistence was interrupted", async () => {
  const first = await readyWorker();
  const initial = await send(first.listeners, { type: "GET_STATE" });
  const session = initial.state.sessions[0];

  const started = await send(first.listeners, {
    type: "START_LOOP", sessionId: session.id, brainTabId: 11, workerTabId: 22,
    seed: "Restart recovery test", maxIterations: 10, brainTimeoutMs: 60000,
    workerTimeoutMs: 600000, minTurnDelayMs: 0
  });
  assert.equal(started.ok, true);
  const active = started.state.sessions.find(item => item.id === session.id);
  const persisted = JSON.parse(JSON.stringify(first.stored.bridgeStateV5));
  const savedSession = persisted.sessions.find(item => item.id === session.id);
  savedSession.completingJobId = active.activeJobId;

  const restarted = loadWorker({ bridgeStateV5: persisted });
  await new Promise(resolve => setTimeout(resolve, 10));
  const recovered = await send(restarted.listeners, { type: "GET_STATE" });
  const sessionAfterRestart = recovered.state.sessions.find(item => item.id === session.id);
  assert.equal(sessionAfterRestart.running, false);
  assert.equal(sessionAfterRestart.activeJobId, null);
  assert.match(sessionAfterRestart.status, /ERROR/);
  assert.match(sessionAfterRestart.status, /reinició durante la confirmación/i);
});


test("concurrent state transitions serialize storage writes", async () => {
  let activeWrites = 0;
  let maxActiveWrites = 0;
  let completingSnapshotSeen;
  const completingSnapshot = new Promise(resolve => { completingSnapshotSeen = resolve; });

  const worker = await readyWorker({
    cloneWrites: true,
    delayFor(snapshot) {
      const session = snapshot.bridgeStateV5?.sessions?.find(item => item.completingJobId);
      return session ? 60 : 0;
    },
    onSet(snapshot) {
      activeWrites++;
      maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
      if (snapshot.bridgeStateV5?.sessions?.some(item => item.completingJobId)) {
        completingSnapshotSeen();
      }
      return () => { activeWrites--; };
    }
  });

  const initial = await send(worker.listeners, { type: "GET_STATE" });
  const session = initial.state.sessions[0];
  const started = await send(worker.listeners, {
    type: "START_LOOP", sessionId: session.id, brainTabId: 11, workerTabId: 22,
    seed: "Persistence race test", maxIterations: 10, brainTimeoutMs: 60000,
    workerTimeoutMs: 600000, minTurnDelayMs: 0
  });
  assert.equal(started.ok, true);
  const active = started.state.sessions.find(item => item.id === session.id);

  const completionPromise = send(worker.listeners, {
    type: "TURN_COMPLETE", sessionId: session.id, jobId: active.activeJobId,
    role: "CEREBRO", ok: true, text: "completion during STOP"
  }, 11);

  await completingSnapshot;
  const stopped = await send(worker.listeners, { type: "STOP", sessionId: session.id });
  assert.equal(stopped.ok, true);
  await completionPromise;
  await new Promise(resolve => setTimeout(resolve, 10));

  assert.equal(maxActiveWrites, 1, "storage writes must never overlap");
  const persisted = worker.stored.bridgeStateV5.sessions.find(item => item.id === session.id);
  assert.equal(persisted.status, "STOPPED");
  assert.equal(persisted.running, false);
});
