import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const workerPromise = read("../service-worker.js");
const contentPromise = read("../content.js");
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

test("turn completion is bound to the active job and an assigned tab", async () => {
  const worker = await workerPromise;
  assert.match(worker, /jobId !== s\.activeJobId/);
  assert.match(worker, /sender\.tab\?\.id !== s\.brainTabId && sender\.tab\?\.id !== s\.workerTabId/);
  assert.match(worker, /if \(result === s\.lastForwarded\) return failSession\(s, "Respuesta duplicada detectada"\)/);
});

test("content script rejects overlapping jobs and waits for a stable new response", async () => {
  const content = await contentPromise;
  assert.match(content, /if \(activeJobId && activeJobId !== message\.jobId\)/);
  assert.match(content, /current !== beforeText/);
  assert.match(content, /Date\.now\(\) - stableSince >= RESPONSE_STABLE_MS/);
  assert.match(content, /No está disponible la opción «Copiar respuesta»/);
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
