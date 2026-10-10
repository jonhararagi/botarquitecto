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

function makeHarness({ savedState, sendMessage, getTab, setStorage } = {}) {
  const listeners = { message: null, removed: null, clicked: null };
  const tabs = new Map([
    [11, { id: 11, url: "https://chatgpt.com/", title: "Brain", windowId: 1 }],
    [22, { id: 22, url: "https://chatgpt.com/c/worker", title: "Worker", windowId: 1 }],
    [33, { id: 33, url: "https://chat.openai.com/", title: "Other", windowId: 1 }],
    [44, { id: 44, url: "https://example.com/", title: "Not ChatGPT", windowId: 1 }]
  ]);
  const sent = [];
  let stored = savedState ? structuredClone(savedState) : {};
  const initialSaved = deferred();
  const storage = {
    async get(key) {
      return Object.prototype.hasOwnProperty.call(stored, key) ? { [key]: structuredClone(stored[key]) } : {};
    },
    async set(value) {
      if (setStorage) await setStorage(structuredClone(value), next => { stored = { ...stored, ...structuredClone(next) }; });
      else stored = { ...stored, ...structuredClone(value) };
      initialSaved.resolve();
    }
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
        if (getTab) return getTab(id, tabs);
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
  const ready = sourcePromise.then(source => {
    const context = vm.createContext({
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
    async init() { await ready; await initialSaved.promise; return state(); }
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

test("START_LOOP concurrente impide reservar una pestaña ya ocupada con intercalado determinista", async () => {
  const enteredSend = deferred();
  const releaseSend = deferred();
  let sends = 0;
  const h = await newHarness({
    sendMessage: async () => {
      sends++;
      if (sends === 1) {
        enteredSend.resolve();
        await releaseSend.promise;
      }
      return { ok: true };
    }
  });
  const first = (await h.state()).sessions[0].id;
  const second = await createSession(h, "Concurrente");

  const firstStart = start(h, first);
  await enteredSend.promise; // La primera sesión ya reservó running y llegó a sendMessage.
  const secondResult = await start(h, second);
  assert.equal(secondResult.ok, false, "la segunda sesión no debe apropiarse de una pestaña reservada");
  releaseSend.resolve();
  const firstResult = await firstStart;
  assert.equal(firstResult.ok, true, firstResult.error);

  const state = await h.state();
  const active = state.sessions.filter(s => s.running);
  assert.equal(active.length, 1);
  assert.equal(new Set(active.flatMap(s => [s.brainTabId, s.workerTabId])).size, 2);
  assert.equal(sends, 1, "solo la sesión ganadora puede enviar un turno");
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
  assert.equal(wrongSession.ok, false, "una sesión distinta no debe aceptar la pestaña de la sesión original");
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
  const s = (await h.state()).sessions.find(x => x.id === id);
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

test("no permite eliminar una sesión activa ni iniciar dos veces la misma sesión", async () => {
  const h = await newHarness();
  const id = (await h.state()).sessions[0].id;
  await start(h, id);
  const deletion = await h.call({ type: "DELETE_SESSION", sessionId: id });
  assert.equal(deletion.ok, false);
  assert.match(deletion.error, /Detén la sesión/);
  const duplicateStart = await start(h, id);
  assert.equal(duplicateStart.ok, false);
  assert.match(duplicateStart.error, /ya está activa/);
  const s = (await h.state()).sessions[0];
  assert.equal(s.running, true);
  assert.ok(s.activeJobId);
});

test("la respuesta del turno anterior se descarta después de iniciar un turno nuevo", async () => {
  const h = await newHarness();
  const id = (await h.state()).sessions[0].id;
  await start(h, id);
  const first = (await h.state()).sessions[0];
  const oldJob = first.activeJobId;
  await complete(h, first, { jobId: oldJob, text: "respuesta uno" });
  const second = (await h.state()).sessions[0];
  assert.notEqual(second.activeJobId, oldJob);
  const sentBefore = h.sent.length;
  await complete(h, second, { jobId: oldJob, role: "CEREBRO", senderTab: 11, text: "respuesta tardía vieja" });
  const after = (await h.state()).sessions[0];
  assert.equal(after.activeJobId, second.activeJobId);
  assert.equal(after.iteration, 1);
  assert.equal(h.sent.length, sentBefore);
});


test("reinicializar el worker real conserva almacenamiento y no reenvía un turno ambiguo", async () => {
  const h = await newHarness();
  const activeId = (await h.state()).sessions[0].id;
  const idleId = await createSession(h, "Inactiva conservada");
  await start(h, activeId);
  const beforeRestart = (await h.state()).sessions.find(s => s.id === activeId);
  const oldJobId = beforeRestart.activeJobId;
  const persistedBeforeRestart = h.persisted();

  // A new VM runs the actual service-worker source against the same stored snapshot.
  const restarted = await newHarness({ savedState: persistedBeforeRestart });
  const state = await restarted.state();
  const recovered = state.sessions.find(s => s.id === activeId);
  const idle = state.sessions.find(s => s.id === idleId);

  assert.equal(restarted.sent.length, 0, "hydration must never replay START_TURN");
  assert.equal(recovered.running, false);
  assert.equal(recovered.activeJobId, null);
  assert.equal(recovered.activeRole, null);
  assert.match(recovered.status, /ERROR.*resultado.*ambiguo/);
  assert.equal(idle.status, "IDLE", "un estado inactivo no necesita recuperación");
  assert.equal(idle.running, false);

  const stale = await complete(restarted, recovered, {
    jobId: oldJobId, role: "CEREBRO", text: "respuesta tras reinicio"
  });
  assert.equal(stale.ok, true);
  const afterStale = (await restarted.state()).sessions.find(s => s.id === activeId);
  assert.equal(afterStale.status, recovered.status);
  assert.equal(afterStale.iteration, 0);
  assert.equal(restarted.sent.length, 0);
  assert.equal(restarted.persisted().bridgeStateV5.sessions.find(s => s.id === activeId).activeJobId, null);
});

test("la sesión pausada sin turno pendiente sigue pausada tras reinicializar el worker", async () => {
  const h = await newHarness();
  const id = (await h.state()).sessions[0].id;
  await start(h, id);
  let s = (await h.state()).sessions[0];
  await h.call({ type: "PAUSE", sessionId: id });
  await complete(h, s, { jobId: s.activeJobId, text: "resultado antes de pausar" });
  s = (await h.state()).sessions[0];
  assert.equal(s.paused, true);
  assert.equal(s.activeJobId, null);

  const restarted = await newHarness({ savedState: h.persisted() });
  const recovered = (await restarted.state()).sessions[0];
  assert.equal(recovered.running, false);
  assert.equal(recovered.paused, true);
  assert.equal(recovered.activeJobId, null);
  assert.match(recovered.status, /^PAUSED/);
  assert.equal(restarted.sent.length, 0, "la recuperación pausada no debe iniciar el siguiente turno");
});

test("un turno finalizado no se vuelve a procesar al reinicializar el worker", async () => {
  const h = await newHarness();
  const id = (await h.state()).sessions[0].id;
  await start(h, id);
  let s = (await h.state()).sessions[0];
  await complete(h, s, { jobId: s.activeJobId, text: "TRABAJO TERMINADO" });
  s = (await h.state()).sessions[0];
  assert.equal(s.running, false);
  assert.match(s.status, /^FINISHED/);

  const restarted = await newHarness({ savedState: h.persisted() });
  const recovered = (await restarted.state()).sessions[0];
  assert.match(recovered.status, /^FINISHED/);
  assert.equal(recovered.iteration, 0);
  assert.equal(restarted.sent.length, 0);
});


test("timeout del turno pone la sesión en ERROR y descarta la respuesta tardía original", async () => {
  const h = await newHarness();
  const id = (await h.state()).sessions[0].id;
  await start(h, id);
  const pending = (await h.state()).sessions[0];
  const timedOutJob = pending.activeJobId;
  await complete(h, pending, {
    jobId: timedOutJob, role: "CEREBRO", ok: false,
    error: "Timeout esperando una respuesta nueva de ChatGPT", text: ""
  });
  const afterTimeout = (await h.state()).sessions[0];
  assert.equal(afterTimeout.running, false);
  assert.equal(afterTimeout.activeJobId, null);
  assert.match(afterTimeout.status, /ERROR.*Timeout/);
  const sendsAfterTimeout = h.sent.length;

  await complete(h, afterTimeout, {
    jobId: timedOutJob, role: "CEREBRO", ok: true, text: "respuesta tardía"
  });
  const afterLateReply = (await h.state()).sessions[0];
  assert.equal(afterLateReply.status, afterTimeout.status);
  assert.equal(afterLateReply.iteration, 0);
  assert.equal(h.sent.length, sendsAfterTimeout);
});

test("un TURN_COMPLETE duplicado del mismo job no incrementa dos veces la iteración", async () => {
  const h = await newHarness();
  const id = (await h.state()).sessions[0].id;
  await start(h, id);
  const first = (await h.state()).sessions[0];
  const oldJob = first.activeJobId;
  await complete(h, first, { jobId: oldJob, role: "CEREBRO", text: "resultado único" });
  const afterFirst = (await h.state()).sessions[0];
  const iteration = afterFirst.iteration;
  const nextJob = afterFirst.activeJobId;
  const sends = h.sent.length;

  await complete(h, afterFirst, { jobId: oldJob, role: "CEREBRO", text: "resultado único" });
  const afterDuplicate = (await h.state()).sessions[0];
  assert.equal(afterDuplicate.iteration, iteration);
  assert.equal(afterDuplicate.activeJobId, nextJob);
  assert.equal(h.sent.length, sends);
});

test("la hidratación repara sesiones incompletas sin romper el resto del almacenamiento", async () => {
  const h = await newHarness({
    savedState: {
      bridgeStateV5: {
        version: 5, activeSessionId: "id-ausente",
        sessions: [
          { id: "sana", name: "Sana", status: "IDLE", running: false, paused: false, log: [{ role: "USUARIO", text: "historial conservado" }] },
          { name: "Sin id ni log", running: true, status: "RUNNING — incompleta", activeJobId: "job-ambiguo" },
          null
        ]
      }
    }
  });
  const state = await h.state();
  assert.equal(state.sessions.length, 2);
  assert.equal(state.activeSessionId, "sana");
  assert.equal(state.sessions.find(s => s.id === "sana").log[0].text, "historial conservado");
  const repaired = state.sessions.find(s => s.name === "Sin id ni log");
  assert.ok(repaired.id);
  assert.deepEqual(repaired.log, []);
  assert.equal(repaired.running, false);
  assert.equal(repaired.activeJobId, null);
  assert.match(repaired.status, /ERROR.*ambiguo/);
  assert.equal(h.persisted().bridgeStateV5.activeSessionId, "sana");
});


test("STOP durante tabs.get invalida dispatchTurn y una excepción tardía no reemplaza STOPPED", async () => {
  const entered = deferred();
  const release = deferred();
  const h = await newHarness({ getTab: async (id, tabs) => {
    entered.resolve();
    await release.promise;
    if (!tabs.has(id)) throw new Error("pestaña desaparecida después de STOP");
    return { ...tabs.get(id) };
  } });
  const id = (await h.state()).sessions[0].id;
  const starting = start(h, id);
  await entered.promise;
  const stop = await h.call({ type: "STOP", sessionId: id });
  assert.equal(stop.ok, true);
  assert.equal(stop.state.sessions[0].status, "STOPPED");
  assert.equal(stop.state.sessions[0].running, false);
  assert.equal(stop.state.sessions[0].stopRequested, true);
  h.tabs.delete(11);
  release.resolve();
  await starting;
  const s = (await h.state()).sessions[0];
  assert.equal(s.status, "STOPPED");
  assert.equal(s.running, false);
  assert.equal(s.stopRequested, true);
  assert.equal(s.activeJobId, null);
  assert.equal(s.activeRole, null);
  assert.equal(h.sent.length, 0, "la continuación invalidada no debe enviar START_TURN");
});

test("STOP mientras finishTurn espera persistencia no avanza iteration ni lastForwarded ni despacha", async () => {
  const entered = deferred();
  const release = deferred();
  let holdResult = false;
  const h = await newHarness({ setStorage: async (value, defaultSet) => {
    const sessions = value.bridgeStateV5?.sessions || [];
    const isResultWrite = sessions.some(s => s.log?.some(row => row.role === "CEREBRO" && row.text === "resultado bajo barrera"));
    if (holdResult && isResultWrite) {
      holdResult = false;
      entered.resolve();
      await release.promise;
    }
    defaultSet(value);
  } });
  const id = (await h.state()).sessions[0].id;
  await start(h, id);
  const active = (await h.state()).sessions[0];
  const originalLastForwarded = active.lastForwarded;
  holdResult = true;
  const completing = complete(h, active, { jobId: active.activeJobId, text: "resultado bajo barrera" });
  await entered.promise;
  const stopped = await h.call({ type: "STOP", sessionId: id });
  assert.equal(stopped.ok, true);
  assert.equal(stopped.state.sessions[0].status, "STOPPED");
  assert.equal(stopped.state.sessions[0].running, false);
  release.resolve();
  await completing;
  const after = (await h.state()).sessions[0];
  assert.equal(after.status, "STOPPED");
  assert.equal(after.running, false);
  assert.equal(after.stopRequested, true);
  assert.equal(after.iteration, 0);
  assert.equal(after.lastForwarded, originalLastForwarded);
  assert.equal(after.activeJobId, null);
  assert.equal(after.activeRole, null);
  assert.equal(h.sent.length, 1, "la respuesta antigua no debe despachar el siguiente turno");
  assert.equal(h.persisted().bridgeStateV5.sessions[0].status, "STOPPED", "una escritura antigua no debe ganar la persistencia final");
});

test("STOP y START nuevo mientras dispatchTurn antiguo espera: no hay ABA ni envío del trabajo A", async () => {
  const firstEntered = deferred();
  const secondEntered = deferred();
  const releaseA = deferred();
  const releaseB = deferred();
  let calls = 0;
  const h = await newHarness({ getTab: async (id, tabs) => {
    calls++;
    const thisCall = calls;
    if (thisCall === 1) { firstEntered.resolve(); await releaseA.promise; }
    else if (thisCall === 2) { secondEntered.resolve(); await releaseB.promise; }
    if (!tabs.has(id)) throw new Error("pestaña inexistente");
    return { ...tabs.get(id) };
  } });
  const id = (await h.state()).sessions[0].id;
  const startA = start(h, id, { seed: "trabajo A" });
  await firstEntered.promise;
  const stop = await h.call({ type: "STOP", sessionId: id });
  assert.equal(stop.state.sessions[0].status, "STOPPED");
  const startB = start(h, id, { seed: "trabajo B" });
  await secondEntered.promise;
  releaseB.resolve();
  const startBResult = await startB;
  assert.equal(startBResult.ok, true, startBResult.error);
  const stateB = (await h.state()).sessions[0];
  const jobB = stateB.activeJobId;
  assert.ok(jobB);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].message.text, "trabajo B");
  releaseA.resolve();
  await startA;
  const afterA = (await h.state()).sessions[0];
  assert.equal(afterA.status, stateB.status);
  assert.equal(afterA.activeJobId, jobB);
  assert.equal(afterA.activeRole, "CEREBRO");
  assert.equal(afterA.running, true);
  assert.equal(afterA.stopRequested, false);
  assert.equal(h.sent.length, 1, "A no puede enviar después de perder autoridad");
  await complete(h, afterA, { jobId: "job-A-obsoleto", text: "respuesta A tardía" });
  const afterStale = (await h.state()).sessions[0];
  assert.equal(afterStale.activeJobId, jobB);
  assert.equal(afterStale.iteration, 0);
  assert.equal(h.sent.length, 1);
});
