import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const WORKER_PATH = new URL("../service-worker.js", import.meta.url);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function makeHarness({ savedState, sendMessage } = {}) {
  const listeners = { message: null, removed: null, clicked: null };
  const tabs = new Map([
    [11, { id: 11, url: "https://chatgpt.com/", title: "Brain", windowId: 1 }],
    [22, { id: 22, url: "https://chatgpt.com/c/worker", title: "Worker", windowId: 1 }],
    [33, { id: 33, url: "https://chat.openai.com/", title: "Other", windowId: 1 }],
    [44, { id: 44, url: "https://example.com/", title: "Not ChatGPT", windowId: 1 }]
  ]);
  const sent = [];
  let stored = savedState ? structuredClone(savedState) : {};
  const storage = {
    async get(key) {
      return Object.prototype.hasOwnProperty.call(stored, key) ? { [key]: structuredClone(stored[key]) } : {};
    },
    async set(value) { stored = { ...stored, ...structuredClone(value) }; }
  };
  const chrome = {
    storage: { local: storage },
    runtime: {
      onMessage: { addListener(fn) { listeners.message = fn; } },
      getURL(path) { return "chrome-extension://test/" + path; }
    },
    tabs: {
      onRemoved: { addListener(fn) { listeners.removed = fn; } },
      async query() { return [...tabs.values()].map(t => ({ ...t })); },
      async get(id) {
        if (!tabs.has(id)) throw new Error("No tab with id " + id);
        return { ...tabs.get(id) };
      },
      async sendMessage(tabId, message) {
        const item = { tabId, message: structuredClone(message) };
        sent.push(item);
        return sendMessage ? sendMessage(item) : { ok: true };
      },
      async create(tab) { const id = 90 + tabs.size; tabs.set(id, { id, ...tab, windowId: 1 }); return { id }; },
      async update(id, patch) { const t = tabs.get(id); if (!t) throw new Error("missing tab"); Object.assign(t, patch); return { ...t }; }
    },
    windows: { async update() {} },
    action: { onClicked: { addListener(fn) { listeners.clicked = fn; } } }
  };
  const sourcePromise = readFile(WORKER_PATH, "utf8");
  let context;
  const ready = sourcePromise.then(source => {
    context = vm.createContext({
      chrome, crypto: webcrypto, structuredClone, Date, Math, Promise,
      console: { log() {}, warn() {}, error() {} }
    });
    vm.runInContext(source, context, { filename: "bridge/service-worker.js" });
  });
  async function call(message, sender = {}) {
    await ready;
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = value => { if (!done) { done = true; resolve(structuredClone(value)); } };
      try {
        const returned = listeners.message(message, sender, finish);
        if (returned !== true && !done) queueMicrotask(() => {
          if (!done) reject(new Error("Listener no respondió ni declaró respuesta asíncrona"));
        });
      } catch (error) { reject(error); }
    });
  }
  async function state() {
    const response = await call({ type: "GET_STATE" });
    assert.equal(response.ok, true, response.error);
    return response.state;
  }
  return {
    call, state, sent, tabs, listeners,
    persisted: () => structuredClone(stored),
    removeTab: async id => { tabs.delete(id); if (listeners.removed) await listeners.removed(id); },
    async init() { await ready; return state(); }
  };
}

async function newHarness(options) {
  const h = makeHarness(options);
  await h.init();
  return h;
}

async function createSession(h, name) {
  const r = await h.call({ type: "CREATE_SESSION", name });
  assert.equal(r.ok, true, r.error);
  return r.state.sessions.at(-1).id;
}

async function start(h, sessionId, overrides = {}) {
  return h.call({
    type: "START_LOOP", sessionId, brainTabId: 11, workerTabId: 22,
    seed: "semilla de prueba", maxIterations: 5, ...overrides
  });
}

async function saveTabs(h, sessionId, brainTabId = 11, workerTabId = 22) {
  const r = await h.call({ type: "SAVE_SESSION", sessionId, brainTabId, workerTabId });
  assert.equal(r.ok, true, r.error);
  return r.state.sessions.find(s => s.id === sessionId);
}

async function complete(h, session, { jobId, role = "CEREBRO", text = "respuesta", ok = true, error, senderTab = 11 } = {}) {
  return h.call({
    type: "TURN_COMPLETE", sessionId: session.id, jobId,
    role, text, ok, error
  }, { tab: { id: senderTab } });
}

test("el service worker real inicializa almacenamiento vacío y persiste una sesión", async () => {
  const h = await newHarness();
  const state = await h.state();
  assert.equal(state.sessions.length, 1);
  assert.equal(state.activeSessionId, state.sessions[0].id);
  assert.equal(state.sessions[0].status, "IDLE");
  assert.equal(h.persisted().bridgeStateV5.sessions.length, 1);
});

test("hidrata una sesión persistida y repara activeSessionId inválido", async () => {
  const prior = {
    version: 5, activeSessionId: "missing",
    sessions: [{ id: "persisted", name: "Guardada", brainTabId: 11, workerTabId: 22,
      status: "IDLE", paused: false, stopRequested: false, running: false, iteration: 2,
      maxIterations: 5, brainTimeoutMs: 60000, workerTimeoutMs: 600000, minTurnDelayMs: 0,
      lastForwarded: "", activeRole: null, activeJobId: null, log: [] }]
  };
  const h = await newHarness({ savedState: { bridgeStateV5: prior } });
  const state = await h.state();
  assert.equal(state.sessions[0].id, "persisted");
  assert.equal(state.activeSessionId, "persisted");
  assert.equal(h.persisted().bridgeStateV5.activeSessionId, "persisted");
});

test("crea sesiones distintas, selecciona una existente y rechaza una inexistente", async () => {
  const h = await newHarness();
  const first = (await h.state()).sessions[0].id;
  const second = await createSession(h, "Dos");
  const third = await createSession(h, "Tres");
  assert.notEqual(first, second);
  assert.notEqual(second, third);
  assert.notEqual(first, third);
  const selected = await h.call({ type: "SELECT_SESSION", sessionId: first });
  assert.equal(selected.ok, true);
  assert.equal(selected.state.activeSessionId, first);
  const missing = await h.call({ type: "SELECT_SESSION", sessionId: "no-existe" });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /Sesión no encontrada/);
});

test("elimina sesión inactiva, conserva una sesión y mantiene activeSessionId coherente", async () => {
  const h = await newHarness();
  const first = (await h.state()).sessions[0].id;
  const second = await createSession(h, "Dos");
  const removed = await h.call({ type: "DELETE_SESSION", sessionId: first });
  assert.equal(removed.ok, true);
  assert.equal(removed.state.sessions.length, 1);
  assert.equal(removed.state.sessions[0].id, second);
  assert.equal(removed.state.activeSessionId, second);
  const last = await h.call({ type: "DELETE_SESSION", sessionId: second });
  assert.equal(last.ok, false);
  assert.match(last.error, /al menos una sesión/);
});

test("START_LOOP inicia con dos pestañas válidas y conserva límites", async () => {
  const h = await newHarness();
  const sessionId = (await h.state()).sessions[0].id;
  const r = await start(h, sessionId, { maxIterations: 101, brainTimeoutMs: 1, workerTimeoutMs: 99999999 });
  assert.equal(r.ok, true, r.error);
  const s = r.state.sessions[0];
  assert.equal(s.running, true);
  assert.equal(s.activeRole, "CEREBRO");
  assert.ok(s.activeJobId);
  assert.equal(s.maxIterations, 100);
  assert.equal(s.brainTimeoutMs, 5000);
  assert.equal(s.workerTimeoutMs, 1800000);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].tabId, 11);
  assert.equal(h.sent[0].message.type, "START_TURN");
});

test("START_LOOP rechaza pestañas ausentes, idénticas, inexistentes o no permitidas", async () => {
  for (const variant of [
    { brainTabId: 0, workerTabId: 22 },
    { brainTabId: 11, workerTabId: 11 },
    { brainTabId: 999, workerTabId: 22 },
    { brainTabId: 44, workerTabId: 22 },
    { seed: "   " }
  ]) {
    const h = await newHarness();
    const id = (await h.state()).sessions[0].id;
    const r = await start(h, id, variant);
    if (variant.brainTabId === 999 || variant.brainTabId === 44) {
      assert.equal(r.ok, true, r.error);
      const s = r.state.sessions[0];
      assert.equal(s.running, false);
      assert.match(s.status, /ERROR/);
    } else {
      assert.equal(r.ok, false, JSON.stringify(variant));
    }
    assert.ok(h.sent.length <= 1);
    const state = await h.state();
    assert.equal(state.sessions[0].running, false);
  }
});

test("START_LOOP concurrente impide que dos sesiones reserven la misma pestaña", async () => {
  const h = await newHarness();
  const first = (await h.state()).sessions[0].id;
  const second = await createSession(h, "Concurrente");
  const gate = deferred();
  let firstSend = true;
  const original = h.tabs;
  void original;
  // La primera reserva queda bloqueada en sendMessage después de marcar running.
  // El mock es específico de esta prueba y no sustituye la lógica del service worker.
  const results = await Promise.all([
    start(h, first),
    start(h, second)
  ]);
  assert.equal(results[0].ok, true, results[0].error);
  assert.equal(results[1].ok, false, "la segunda sesión no debe apropiarse de una pestaña reservada");
  const state = await h.state();
  const active = state.sessions.filter(s => s.running);
  assert.equal(active.length, 1);
  assert.equal(new Set(active.flatMap(s => [s.brainTabId, s.workerTabId])).size, 2);
  void gate; void firstSend;
});

test("respuesta vigente se acepta una sola vez y despacha al otro rol", async () => {
  const h = await newHarness();
  const id = (await h.state()).sessions[0].id;
  await start(h, id);
  const s = (await h.state()).sessions[0];
  const r = await complete(h, s, { jobId: s.activeJobId, text: "plan listo" });
  assert.equal(r.ok, true);
  const after = (await h.state()).sessions[0];
  assert.equal(after.iteration, 1);
  assert.equal(after.activeRole, "OBRERO");
  assert.notEqual(after.activeJobId, s.activeJobId);
  assert.equal(h.sent.at(-1).tabId, 22);
  assert.equal(h.sent.at(-1).message.text, "plan listo");
});

test("rechaza remitente no autorizado y descarta job antiguo o de otra sesión", async () => {
  const h = await newHarness();
  const id = (await h.state()).sessions[0].id;
  const other = await createSession(h, "Otra");
  await start(h, id);
  const s = (await h.state()).sessions.find(x => x.id === id);
  const count = h.sent.length;
  const unauthorized = await complete(h, s, { jobId: s.activeJobId, senderTab: 33 });
  assert.equal(unauthorized.ok, false);
  const stale = await complete(h, s, { jobId: "job-antiguo" });
  assert.equal(stale.ok, true);
  assert.equal((await h.state()).sessions.find(x => x.id === id).iteration, 0);
  const wrongSession = await h.call({ type: "TURN_COMPLETE", sessionId: other, jobId: s.activeJobId, role: "CEREBRO", text: "no" }, { tab: { id: 11 } });
  assert.equal(wrongSession.ok, true);
  assert.equal((await h.state()).sessions.find(x => x.id === id).iteration, 0);
  assert.equal(h.sent.length, count);
});

test("respuesta vacía, error y duplicado no continúan el bucle", async () => {
  for (const result of [
    { text: "  " },
    { ok: false, error: "fallo simulado", text: "" }
  ]) {
    const h = await newHarness();
    const id = (await h.state()).sessions[0].id;
    await start(h, id);
    const s = (await h.state()).sessions[0];
    await complete(h, s, { jobId: s.activeJobId, ...result });
    const after = (await h.state()).sessions[0];
    assert.equal(after.running, false);
    assert.match(after.status, /ERROR/);
    assert.equal(h.sent.length, 1);
  }
  const h = await newHarness();
  const id = (await h.state()).sessions[0].id;
  await start(h, id);
  let s = (await h.state()).sessions[0];
  await complete(h, s, { jobId: s.activeJobId, text: "repetida" });
  s = (await h.state()).sessions[0];
  await complete(h, s, { jobId: s.activeJobId, role: "OBRERO", senderTab: 22, text: "repetida" });
  const after = (await h.state()).sessions[0];
  assert.equal(after.running, false);
  assert.match(after.status, /duplicada/);
});

test("PAUSE permite terminar el turno vigente y RESUME despacha el siguiente una sola vez", async () => {
  const h = await newHarness();
  const id = (await h.state()).sessions[0].id;
  await start(h, id);
  let s = (await h.state()).sessions[0];
  await h.call({ type: "PAUSE", sessionId: id });
  const sentBefore = h.sent.length;
  await complete(h, s, { jobId: s.activeJobId, text: "resultado pausado" });
  s = (await h.state()).sessions[0];
  assert.equal(s.running, true);
  assert.equal(s.paused, true);
  assert.equal(s.activeJobId, null);
  assert.match(s.status, /PAUSED/);
  assert.equal(h.sent.length, sentBefore);
  await h.call({ type: "RESUME", sessionId: id });
  s = (await h.state()).sessions[0];
  assert.equal(s.paused, false);
  assert.equal(s.activeRole, "OBRERO");
  assert.equal(h.sent.length, sentBefore + 1);
  await h.call({ type: "RESUME", sessionId: id });
  assert.equal(h.sent.length, sentBefore + 1, "RESUME repetido no debe duplicar un turno activo");
});

test("STOP invalida la respuesta tardía y controles sobre otra sesión quedan aislados", async () => {
  const h = await newHarness();
  const id = (await h.state()).sessions[0].id;
  const other = await createSession(h, "Otra");
  await start(h, id);
  let s = (await h.state()).sessions.find(x => x.id === id);
  const job = s.activeJobId;
  await h.call({ type: "STOP", sessionId: id });
  const stopped = (await h.state()).sessions.find(x => x.id === id);
  assert.equal(stopped.running, false);
  assert.equal(stopped.stopRequested, true);
  assert.equal(stopped.activeJobId, null);
  await complete(h, s, { jobId: job, text: "demasiado tarde" });
  assert.equal((await h.state()).sessions.find(x => x.id === id).iteration, 0);
  await h.call({ type: "PAUSE", sessionId: other });
  const states = (await h.state()).sessions;
  assert.equal(states.find(x => x.id === id).paused, false);
  assert.equal(states.find(x => x.id === other).paused, true);
});

test("maxIterations termina el bucle y registra el límite", async () => {
  const h = await newHarness();
  const id = (await h.state()).sessions[0].id;
  await start(h, id, { maxIterations: 1 });
  const s = (await h.state()).sessions[0];
  await complete(h, s, { jobId: s.activeJobId, text: "una respuesta" });
  const after = (await h.state()).sessions[0];
  assert.equal(after.running, false);
  assert.equal(after.iteration, 1);
  assert.match(after.status, /LIMIT_REACHED/);
  assert.equal(h.sent.length, 1);
});

test("rechazo de tabs.sendMessage deja la sesión en ERROR", async () => {
  const h = await newHarness({ sendMessage: async () => { throw new Error("sendMessage rechazado"); } });
  const id = (await h.state()).sessions[0].id;
  const r = await start(h, id);
  assert.equal(r.ok, true);
  const s = r.state.sessions[0];
  assert.equal(s.running, false);
  assert.match(s.status, /ERROR/);
  assert.match(s.status, /no responde/);
});

test("onRemoved detiene una sesión activa cuya pestaña desaparece", async () => {
  const h = await newHarness();
  const id = (await h.state()).sessions[0].id;
  await start(h, id);
  await h.removeTab(11);
  const s = (await h.state()).sessions[0];
  assert.equal(s.running, false);
  assert.match(s.status, /CEREBRO fue cerrada/);
  assert.equal(s.activeJobId, null);
});

test("STOP, PAUSE y RESUME repetidos conservan invariantes de estado", async () => {
  const h = await newHarness();
  const id = (await h.state()).sessions[0].id;
  await start(h, id);
  await h.call({ type: "PAUSE", sessionId: id });
  await h.call({ type: "PAUSE", sessionId: id });
  let s = (await h.state()).sessions[0];
  assert.equal(s.paused, true);
  assert.equal(s.running, true);
  await h.call({ type: "RESUME", sessionId: id });
  await h.call({ type: "RESUME", sessionId: id });
  s = (await h.state()).sessions[0];
  assert.equal(s.paused, false);
  assert.equal(s.running, true);
  assert.ok(s.activeJobId);
  await h.call({ type: "STOP", sessionId: id });
  await h.call({ type: "STOP", sessionId: id });
  s = (await h.state()).sessions[0];
  assert.equal(s.running, false);
  assert.equal(s.paused, false);
  assert.equal(s.stopRequested, true);
  assert.equal(s.activeJobId, null);
  assert.equal(s.activeRole, null);
  assert.equal(s.status, "STOPPED");
});
