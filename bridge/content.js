const INPUT_SELECTORS = [
  "#prompt-textarea",
  "textarea[name=\"prompt-textarea\"]",
  "div[contenteditable=\"true\"][role=\"textbox\"]"
];

const SEND_SELECTORS = [
  "button[data-testid=\"send-button\"]",
  "button[aria-label=\"Send prompt\"]",
  "button[aria-label=\"Send message\"]",
  "form[data-chatgpt-composer] button[aria-label=\"Send\"]",
  "button.composer-submit-btn",
  "button[data-testid*=\"send\" i]",
  "button[aria-label*=\"send\" i]",
  "button[aria-label*=\"enviar\" i]",
  "button[title*=\"send\" i]",
  "button[title*=\"enviar\" i]"
];

const STOP_SELECTORS = [
  "button[data-testid=\"stop-button\"]",
  "button[aria-label*=\"Stop\"]",
  "button[aria-label*=\"Detener\"]"
];

const BRIDGE_DONE_MARKER = "[[BRIDGE_DONE]]";
const RESPONSE_STABLE_MS = 2000;
let activeJobId = null;
let generationObserved = false;
const terminalJobIds = new Set();

function rememberTerminalJobId(jobId) {
  terminalJobIds.add(jobId);
  if (terminalJobIds.size > 256) terminalJobIds.delete(terminalJobIds.values().next().value);
}

function isVisible(node) {
  if (!node) return false;
  const style = getComputedStyle(node);
  return style.display !== "none" && style.visibility !== "hidden";
}

function firstVisible(selectors) {
  for (const selector of selectors) {
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
      if (isVisible(node)) return node;
    }
  }
  return null;
}

function isEnabled(node) {
  return isVisible(node) &&
    !node.disabled &&
    node.getAttribute("aria-disabled") !== "true";
}

function readComposerText(element) {
  if (!element) return "";
  if (element.matches?.("textarea, input")) return String(element.value ?? "");
  return String(element.innerText ?? element.textContent ?? "");
}

function normalizeComposerText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function getInput() { return firstVisible(INPUT_SELECTORS); }

function getAssistantNodes() {
  const direct = [...document.querySelectorAll('[data-message-author-role="assistant"]')];
  if (direct.length) return direct;

  return [...document.querySelectorAll("article")].filter(article => {
    const role = article.getAttribute("data-message-author-role");
    if (role && role !== "assistant") return false;
    const body = article.querySelector(".markdown, [data-markdown-text-style='assistant-message']");
    const text = (body?.innerText || article.innerText || "").trim();
    return Boolean(body) && text.length > 0;
  });
}

function getLatestAssistantNode() {
  const nodes = getAssistantNodes();
  return nodes[nodes.length - 1] || null;
}

function getAssistantText(node) {
  if (!node) return "";
  const body = node.querySelector(".markdown, [data-markdown-text-style='assistant-message']");
  return (body?.innerText || node.innerText || node.textContent || "").trim();
}

// Lee el texto del turno assistant exacto que acabamos de estabilizar.
// No dependemos de que ChatGPT mantenga un botón de copiar visible en su DOM:
// sus selectores cambian entre versiones y no son la fuente del contenido.
function responseTextFromSourceTurn(node, expectedText) {
  if (!node || node !== getLatestAssistantNode()) {
    throw new Error("La respuesta de origen cambió antes de confirmarse");
  }
  const responseText = stripBridgeMarker(expectedText);
  if (!responseText) throw new Error("La respuesta de origen está vacía");
  return responseText;
}

function dispatchComposerInput(element, text) {
  element.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    inputType: "insertText",
    data: text
  }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function insertText(element, text) {
  element.focus();

  if (element.matches("textarea, input")) {
    const proto = element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(element, text);
    else element.value = text;
  } else {
    element.textContent = "";
    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, text) === true;
    } catch {
      inserted = false;
    }

    // execCommand may return false without throwing, leaving a blank composer.
    // Fall back to setting the editable node, then fire input/change for React.
    if (!inserted || normalizeComposerText(readComposerText(element)) !== normalizeComposerText(text)) {
      element.textContent = text;
    }
  }

  dispatchComposerInput(element, text);

  // Verify insertion; a failed execCommand must not leave BRIDGE waiting for an
  // enabled Send button when the text never reached the composer.
  if (normalizeComposerText(readComposerText(element)) !== normalizeComposerText(text)) {
    if (element.matches("textarea, input")) element.value = text;
    else element.textContent = text;
    dispatchComposerInput(element, text);
  }

  if (normalizeComposerText(readComposerText(element)) !== normalizeComposerText(text)) {
    throw new Error("BRIDGE no pudo insertar el mensaje en el cuadro de ChatGPT");
  }
}

async function waitForInput(timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const input = getInput();
    if (input) return input;
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error("ChatGPT input not found");
}

function controlLabel(button) {
  return [
    button.getAttribute?.("data-testid"),
    button.getAttribute?.("aria-label"),
    button.getAttribute?.("title"),
    button.innerText,
    button.textContent
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().toLowerCase();
}

function isClearlyAuxiliaryControl(button) {
  const label = controlLabel(button);
  return /voice|audio|microphone|\bmic\b|dictat|record|attach|upload|\bfile\b|\btool(s)?\b|\bplus\b|stop|cancel|clear|search|menu|settings|camera|image|hablar|voz|micr[oó]fono|dictado|grabar|adjuntar|subir|archivo|herramienta|detener|cancelar|borrar|buscar|men[uú]|configuraci[oó]n|c[aá]mara/.test(label);
}

function isAfterComposerInput(input, control) {
  try {
    // Node.DOCUMENT_POSITION_FOLLOWING is 4. Using the relation keeps the
    // fallback inside the composer branch rather than clicking page controls.
    return Boolean(input.compareDocumentPosition(control) & 4);
  } catch {
    return false;
  }
}

function findComposerScopedSendButton(input) {
  // Recent ChatGPT composer variants may expose an icon-only send control with
  // no stable test-id, accessible label, title, or surrounding form.
  // Walk only a short chain of ancestors that contain the actual composer.
  let scope = input?.parentElement || null;
  for (let depth = 0; scope && depth < 8; depth++, scope = scope.parentElement) {
    if (!scope.querySelectorAll) continue;
    const controls = [...scope.querySelectorAll("button, [role='button']")].filter(isVisible);
    if (!controls.length) continue;

    const labeled = controls.filter(button => {
      const label = controlLabel(button);
      return /\b(send|enviar|submit|mandar)\b/.test(label) &&
        !isClearlyAuxiliaryControl(button);
    });
    if (labeled.length) return labeled.find(isEnabled) || labeled[0];

    const submitControls = controls.filter(button => {
      const type = String(button.getAttribute?.("type") || "").toLowerCase();
      const testId = String(button.getAttribute?.("data-testid") || "").toLowerCase();
      return type === "submit" || /submit|composer-send/.test(testId);
    });
    if (submitControls.length) return submitControls.find(isEnabled) || submitControls[0];

    // Last-resort icon-only fallback: only consider a compact group of up to
    // five controls in DOM order after the composer. Known voice, upload, tool,
    // stop, and navigation controls are excluded; the final adjacent enabled
    // control is the send action in the composer toolbar.
    if (controls.length <= 5) {
      const adjacent = controls.filter(button =>
        isAfterComposerInput(input, button) && !isClearlyAuxiliaryControl(button)
      );
      if (adjacent.length) {
        const enabled = adjacent.filter(isEnabled);
        return enabled.length ? enabled[enabled.length - 1] : adjacent[adjacent.length - 1];
      }
    }
  }

  // Older layouts still expose the composer as a form.
  const form = input?.closest?.("form");
  if (form?.querySelectorAll) {
    const buttons = [...form.querySelectorAll("button, [role='button']")].filter(isVisible);
    const labeledSend = buttons.find(button => {
      const label = controlLabel(button);
      return /\b(send|enviar|submit|mandar)\b/.test(label) &&
        !isClearlyAuxiliaryControl(button);
    });
    if (labeledSend) return labeledSend;

    const submits = buttons.filter(button =>
      String(button.getAttribute?.("type") || "").toLowerCase() === "submit"
    );
    if (submits.length) return submits.find(isEnabled) || submits[0];
  }

  return null;
}

function findEnabledSendButton(input) {
  // Search known accessibility contracts first. A disabled match must not mask
  // another enabled send button exposed under a different label/DOM contract.
  for (const selector of SEND_SELECTORS) {
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
      if (isEnabled(node)) return node;
    }
  }

  const scoped = findComposerScopedSendButton(input);
  if (scoped && isEnabled(scoped)) return scoped;
  return null;
}

async function waitForSendButton(timeoutMs, input, expectedText) {
  const started = Date.now();
  let sawVisibleCandidate = false;
  while (Date.now() - started < timeoutMs) {
    for (const selector of SEND_SELECTORS) {
      for (const node of document.querySelectorAll(selector)) {
        if (isVisible(node)) sawVisibleCandidate = true;
      }
    }

    const actualText = normalizeComposerText(readComposerText(input));
    const expected = normalizeComposerText(expectedText);
    if (actualText !== expected) {
      throw new Error("El texto no quedó correctamente insertado en el cuadro de ChatGPT");
    }

    if (findComposerScopedSendButton(input)) sawVisibleCandidate = true;
    const button = findEnabledSendButton(input);
    if (button) return button;
    await new Promise(r => setTimeout(r, 200));
  }

  if (sawVisibleCandidate) {
    throw new Error("El botón de envío de ChatGPT sigue deshabilitado después de insertar el mensaje");
  }
  throw new Error("No se encontró un botón de envío reconocible en el compositor de ChatGPT");
}

function stripBridgeMarker(text) {
  const value = String(text || "").trim();
  const index = value.lastIndexOf(BRIDGE_DONE_MARKER);
  return index === -1 ? value : value.slice(0, index).trim();
}

function findVisibleStopControl() {
  const selected = firstVisible(STOP_SELECTORS);
  if (selected) {
    generationObserved = true;
    return selected;
  }

  // DOM/test-id contracts change; inspect visible controls for Stop semantics
  // when the preferred selectors no longer match.
  const fallback = [...document.querySelectorAll("button, [role='button']")].find(node => {
    if (!isVisible(node)) return false;
    return /\b(stop|detener|cancel generation|cancelar generación|stop generating|detener respuesta)\b/.test(controlLabel(node));
  }) || null;
  if (fallback) generationObserved = true;
  return fallback;
}

async function waitForCompletedResponse(beforeNode, beforeText, sentAt, timeoutMs, minTurnDelayMs) {
  let lastText = "";
  let stableSince = 0;
  let sawNewResponse = false;

  const deadline = sentAt + timeoutMs + RESPONSE_STABLE_MS;

  while (Date.now() < deadline) {
    const latestNode = getLatestAssistantNode();
    const current = getAssistantText(latestNode);
    const isNewNode = latestNode && latestNode !== beforeNode;
    const isUpdatedResponse = current && current !== beforeText;
    const hasNewResponse = Boolean(current && (isNewNode || isUpdatedResponse));

    if (hasNewResponse) {
      sawNewResponse = true;

      if (current !== lastText) {
        lastText = current;
        stableSince = Date.now();
      }

      const stable = stableSince && Date.now() - stableSince >= RESPONSE_STABLE_MS;
      const stopControl = findVisibleStopControl();
      const generationStopped = generationObserved && !stopControl;
      const minimumDelayReached = Date.now() - sentAt >= minTurnDelayMs;

      if (stable && generationStopped && minimumDelayReached) {
        return responseTextFromSourceTurn(latestNode, current);
      }
    }

    await new Promise(r => setTimeout(r, 250));
  }

  throw new Error(
    sawNewResponse
      ? "Timeout esperando que terminara la respuesta de ChatGPT"
      : "Timeout esperando una respuesta nueva de ChatGPT"
  );
}

async function waitForComposerSubmission(input, beforeNode, beforeText, expectedText, timeoutMs = 1800) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const composerText = normalizeComposerText(readComposerText(input));
    const latestNode = getLatestAssistantNode();
    const latestText = getAssistantText(latestNode);
    const responseChanged = Boolean(latestNode && latestText &&
      (latestNode !== beforeNode || latestText !== beforeText));
    const stopControl = findVisibleStopControl();
    if (composerText !== normalizeComposerText(expectedText) || responseChanged || stopControl) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  return false;
}

async function sendAndWait(text, timeoutMs = 60000, minTurnDelayMs = 0) {
  const input = await waitForInput(10000);
  const beforeNode = getLatestAssistantNode();
  const beforeText = getAssistantText(beforeNode);

  insertText(input, text);

  const button = await waitForSendButton(10000, input, text);
  generationObserved = false;
  const sentAt = Date.now();
  button.click();

  const submitted = await waitForComposerSubmission(input, beforeNode, beforeText, text);
  if (!submitted) {
    throw new Error("ChatGPT no confirmó el envío de forma inequívoca; no se reintentó para evitar duplicar el mensaje");
  }

  return waitForCompletedResponse(
    beforeNode,
    beforeText,
    sentAt,
    timeoutMs,
    minTurnDelayMs
  );
}

async function runTurn(message) {
  let completion;
  try {
    const text = await sendAndWait(message.text, Number(message.timeoutMs) || 60000, Number(message.minTurnDelayMs) || 0);
    completion = { ok: true, text };
  } catch (error) {
    completion = { ok: false, error: error?.message || String(error) };
  }
  // Deliver one terminal report only. Delivery failure is not a ChatGPT result
  // and must not trigger a second TURN_COMPLETE for this execution.
  try {
    const response = await chrome.runtime.sendMessage({
      type: "TURN_COMPLETE", sessionId: message.sessionId, jobId: message.jobId,
      role: message.role, ...completion
    });
    if (!response?.ok || response?.accepted !== true) {
      console.error("BRIDGE TURN_COMPLETE no aceptado por el worker", response?.error || "respuesta sin confirmación");
    }
  } catch (deliveryError) {
    console.error("BRIDGE no pudo entregar TURN_COMPLETE al worker", deliveryError?.message || String(deliveryError));
  } finally {
    if (activeJobId === message.jobId) {
      activeJobId = null;
      rememberTerminalJobId(message.jobId);
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "START_TURN") {
    const incomingJobId = typeof message.jobId === "string" ? message.jobId.trim() : "";
    if (!incomingJobId || typeof message.sessionId !== "string" || !message.sessionId.trim() ||
        !["CEREBRO", "OBRERO"].includes(message.role)) {
      sendResponse({ ok: false, error: "START_TURN mal formado: identidad de sesión, trabajo o rol inválida" });
      return;
    }

    if (activeJobId) {
      if (activeJobId === incomingJobId) {
        sendResponse({ ok: true, started: false, duplicate: true });
      } else {
        sendResponse({ ok: false, error: "Esta pestaña ya está ejecutando otro turno" });
      }
      return;
    }

    if (terminalJobIds.has(incomingJobId)) {
      sendResponse({ ok: true, started: false, duplicate: true });
      return;
    }

    activeJobId = incomingJobId;
    generationObserved = false;
    runTurn({ ...message, jobId: incomingJobId, role: message.role });
    sendResponse({ ok: true, started: true });
    return;
  }

  if (message?.type === "READ_LATEST") {
    sendResponse({ ok: true, text: getAssistantText(getLatestAssistantNode()) });
  }

  if (message?.type === "BRIDGE_PING") {
    sendResponse({ ok: true });
  }
});

chrome.runtime.sendMessage({ type: "BRIDGE_CONTENT_READY" }).catch(() => {});
