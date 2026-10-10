import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const workerPromise = read("../service-worker.js");
const contentPromise = read("../content.js");
const controlPromise = read("../control.js");
const manifestPromise = read("../manifest.json");

test("session creation uses the canonical session model factory", async () => {
  const worker = await workerPromise;
  assert.match(worker, /function createSessionModel\(/);
  assert.match(worker, /const s = createSessionModel\(name\);/);
  assert.doesNotMatch(worker, /createSessionObject\(/, "undefined legacy factory must not remain");
});

test("START_LOOP rejects identical tabs and tabs owned by another running session", async () => {
  const worker = await workerPromise;
  assert.match(worker, /requestedBrainTabId === requestedWorkerTabId/);
  assert.match(worker, /if \(other\.id === s\.id \|\| !other\.running\) continue/);
  assert.match(worker, /Una de las pestañas seleccionadas ya está ocupada por otra sesión activa/);
});

test("iteration and timeout settings are bounded before execution", async () => {
  const worker = await workerPromise;
  assert.match(worker, /Math\.max\(1, Math\.min\(100, Number\(message\.maxIterations\) \|\| 10\)\)/);
  assert.match(worker, /Math\.max\(5000, Math\.min\(1800000, Number\(message\.brainTimeoutMs\) \|\| 60000\)\)/);
  assert.match(worker, /Math\.max\(5000, Math\.min\(1800000, Number\(message\.workerTimeoutMs\) \|\| 600000\)\)/);
  assert.match(worker, /if \(s\.iteration >= s\.maxIterations\)/);
});

test("TURN_COMPLETE validates session, active job, role, sender tab, and acceptance", async () => {
  const worker = await workerPromise;
  assert.ok(worker.includes("senderTabId !== assignedTabId"));
  assert.ok(worker.includes("s.activeRole !== role"));
  assert.ok(worker.includes('typeof message.ok !== "boolean"'));
  assert.ok(worker.includes("s.activeJobId !== jobId"));
  assert.ok(worker.includes("accepted: true"));
  assert.ok(worker.includes("if (!sessionId || !jobId"));
});

test("content script rejects overlapping jobs and waits for a stable new response", async () => {
  const content = await contentPromise;
  assert.match(content, /if \(activeJobId && activeJobId !== message\.jobId\)/);
  assert.match(content, /current !== beforeText/);
  assert.match(content, /Date\.now\(\) - stableSince >= RESPONSE_STABLE_MS/);
  assert.match(content, /function responseTextFromSourceTurn\(/);
  assert.doesNotMatch(content, /getCopyResponseButton|No está disponible la opción «Copiar respuesta»/);
  assert.ok(content.includes("sessionId: message.sessionId"));
  assert.ok(content.includes("response?.accepted !== true"));
});

test("saveState serializes writes, coalesces pending requests, and does not recurse on stale revisions", async () => {
  const worker = await workerPromise;
  assert.match(worker, /let saveQueueRunning = false/);
  assert.match(worker, /let pendingSaveWaiters = \[\]/);
  assert.match(worker, /async function drainSaveQueue\(\)/);
  assert.match(worker, /await chrome\.storage\.local\.set\(\{ \[STORAGE_KEY\]: payload \}\)/);
  assert.match(worker, /for \(const waiter of batch\) waiter\.reject\(error\)/);
  assert.doesNotMatch(worker, /saveRevision/);
  assert.doesNotMatch(worker, /if \(revision !== saveRevision\) await saveState\(\)/);
});

test("manifest remains MV3 with only the intended ChatGPT hosts", async () => {
  const manifest = JSON.parse(await manifestPromise);
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual([...manifest.host_permissions].sort(), [
    "https://chat.openai.com/*",
    "https://chatgpt.com/*"
  ]);
  assert.ok(manifest.permissions.includes("tabs"));
  assert.ok(manifest.permissions.includes("storage"));
  assert.ok(!manifest.permissions.includes("debugger"));
  assert.ok(!manifest.permissions.includes("nativeMessaging"));
});

test("control panel preserves all edited settings until save", async () => {
  const control = await controlPromise;
  assert.match(control, /iterationsDirty=false/);
  assert.match(control, /if\(!iterationsDirty&&document\.activeElement!==iterations\)iterations\.value=x\.maxIterations\|\|10/);
  assert.match(control, /iterations\.addEventListener\("input",\(\)=>\{iterationsDirty=true\}\)/);
  assert.match(control, /sessionName\.addEventListener\("input",\(\)=>\{sessionNameDirty=true\}\)/);
  assert.match(control, /brainTimeout\.addEventListener\("input",\(\)=>\{brainTimeoutDirty=true\}\)/);
  assert.match(control, /workerTimeout\.addEventListener\("input",\(\)=>\{workerTimeoutDirty=true\}\)/);
  assert.match(control, /minTurnDelay\.addEventListener\("input",\(\)=>\{minTurnDelayDirty=true\}\)/);
  assert.match(control, /if\(!workerTimeoutDirty&&document\.activeElement!==workerTimeout\)workerTimeout\.value=Math\.round\(\(x\.workerTimeoutMs\|\|600000\)\/1000\)/);
  assert.match(control, /iterationsDirty=false;brainTimeoutDirty=false;workerTimeoutDirty=false;minTurnDelayDirty=false/);
  assert.match(control, /workerTimeoutMs:\(\+workerTimeout\.value\|\|600\)\*1000/);
});
