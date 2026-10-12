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
  assert.match(content, /const terminalJobIds = new Set\(\)/);
  assert.match(content, /terminalJobIds\.has\(incomingJobId\)/);
  assert.match(content, /activeJobId === incomingJobId/);
  assert.doesNotMatch(content, /retryComposerSubmission/, "an ambiguous click must not trigger an automatic second send");
  assert.match(content, /no se reintentó para evitar duplicar el mensaje/);
  assert.match(content, /function findVisibleStopControl\(/);
  assert.match(content, /const generationStopped = generationObserved && !stopControl/);
  assert.match(content, /current !== beforeText/);
  assert.match(content, /Date\.now\(\) - stableSince >= RESPONSE_STABLE_MS/);
  assert.match(content, /function responseTextFromSourceTurn\(/);
  assert.match(content, /return String\(text \|\| ""\)\.replace\(\/\\s\+\/g, " "\)\.trim\(\);/, "composer whitespace normalization must use the whitespace character class");
  assert.match(content, /function findEnabledSendButton\(input\)/);
  assert.match(content, /function findComposerScopedSendButton/);
  assert.match(content, /isAfterComposerInput/);
  assert.ok(content.includes("scope.querySelectorAll(\"button, [role='button']\")"));
  assert.match(content, /aria-label.*enviar.*i/);
  assert.match(content, /document\.execCommand\("insertText", false, text\) === true/);
  assert.match(content, /BRIDGE no pudo insertar el mensaje en el cuadro de ChatGPT/);
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

test("control panel preserves all edited settings and tab selections until save", async () => {
  const boundedSetting = /function boundedNumber\(el,fallback,min,max\)/;
  assert.match(await controlPromise, boundedSetting);
  assert.equal((await controlPromise).split("maxIterations:boundedNumber(iterations,10,1,100)").length - 1, 2, "SAVE_SESSION and START_LOOP must use the bounded numeric parser");
  const control = await controlPromise;
  assert.match(control, /brainSelectionDirty=false,workerSelectionDirty=false/);
  assert.match(control, /fillTabs\(brain,brainSelectionDirty\?selectedBrainTabId:x\.brainTabId\)/);
  assert.match(control, /fillTabs\(worker,workerSelectionDirty\?selectedWorkerTabId:x\.workerTabId\)/);
  assert.match(control, /brain\.onchange=\(\)=>\{selectedBrainTabId=Number\(brain\.value\)\|\|null;brainSelectionDirty=true\}/);
  assert.match(control, /worker\.onchange=\(\)=>\{selectedWorkerTabId=Number\(worker\.value\)\|\|null;workerSelectionDirty=true\}/);
  assert.match(control, /iterationsDirty=false/);
  assert.match(control, /if\(!iterationsDirty&&document\.activeElement!==iterations\)iterations\.value=x\.maxIterations\?\?10/);
  assert.match(control, /iterations\.addEventListener\("input",\(\)=>\{iterationsDirty=true\}\)/);
  assert.match(control, /sessionName\.addEventListener\("input",\(\)=>\{sessionNameDirty=true\}\)/);
  assert.match(control, /brainTimeout\.addEventListener\("input",\(\)=>\{brainTimeoutDirty=true\}\)/);
  assert.match(control, /workerTimeout\.addEventListener\("input",\(\)=>\{workerTimeoutDirty=true\}\)/);
  assert.match(control, /minTurnDelay\.addEventListener\("input",\(\)=>\{minTurnDelayDirty=true\}\)/);
  assert.match(control, /if\(!workerTimeoutDirty&&document\.activeElement!==workerTimeout\)workerTimeout\.value=Math\.round\(\(x\.workerTimeoutMs\|\|600000\)\/1000\)/);
  assert.match(control, /iterationsDirty=false;brainTimeoutDirty=false;workerTimeoutDirty=false;minTurnDelayDirty=false/);
  assert.match(control, /workerTimeoutMs:boundedNumber\(workerTimeout,600,5,1800\)\*1000/);
});


test("Manifest V3 host grants, worker and content-script contracts remain aligned for Chromium", async () => {
  const [manifest, worker, content] = await Promise.all([
    manifestPromise.then(JSON.parse),
    workerPromise,
    contentPromise
  ]);
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, "service-worker.js");
  assert.deepEqual([...manifest.permissions].sort(), ["storage", "tabs"]);
  assert.deepEqual([...manifest.host_permissions].sort(), [
    "https://chat.openai.com/*",
    "https://chatgpt.com/*"
  ]);
  assert.deepEqual([...manifest.content_scripts[0].matches].sort(), [...manifest.host_permissions].sort());
  assert.deepEqual(manifest.content_scripts[0].js, ["content.js"]);
  assert.equal(manifest.content_scripts[0].run_at, "document_idle");
  // Chrome and Brave expose Chromium chrome.* APIs; no browser.* shim is needed.
  assert.match(worker, /chrome\.tabs\.sendMessage/);
  assert.match(worker, /chrome\.runtime\.onMessage\.addListener/);
  assert.match(content, /chrome\.runtime\.onMessage\.addListener/);
  assert.match(content, /BRIDGE_CONTENT_READY/);
  assert.match(content, /message\?\.type === "BRIDGE_PING"/);
  assert.doesNotMatch(worker + "\\n" + content, /\bbrowser\.(?:runtime|tabs|storage)\b/);
  assert.equal((worker.match(/chrome\.runtime\.onMessage\.addListener/g) || []).length, 1);
  assert.equal((content.match(/chrome\.runtime\.onMessage\.addListener/g) || []).length, 1);
  assert.ok(!manifest.permissions.includes("debugger"));
  assert.ok(!manifest.permissions.includes("nativeMessaging"));
  assert.ok(!manifest.host_permissions.some(host => host === "<all_urls>" || host === "*://*/*"));
});

test("send diagnostics define distinct, sanitized terminal categories for failure phases", async () => {
  const content = await contentPromise;
  assert.match(content, /function sendFailureCode\(error, diagnostic\)/);
  for (const code of [
    "composer_not_found", "composer_disconnected", "text_insertion_failed",
    "composer_text_desynchronized", "send_button_disabled", "send_button_not_found",
    "send_control_changed_before_click", "send_control_unavailable_or_unassociated",
    "click_failed", "submission_unconfirmed", "response_timeout_after_submission"
  ]) {
    assert.ok(content.includes('return "' + code + '"'), "missing diagnostic category: " + code);
  }
  assert.match(content, /console\.info\("\[BRIDGE_SEND_DIAG\]"/);
  assert.doesNotMatch(content, /console\.(?:info|log|warn|error)\([^\n]*(?:expectedText|responseText|message\.text)/);
});
