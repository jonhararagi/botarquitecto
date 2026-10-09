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
  "button.composer-submit-btn"
];

const STOP_SELECTORS = [
  "button[data-testid=\"stop-button\"]",
  "button[aria-label*=\"Stop\"]",
  "button[aria-label*=\"Detener\"]"
];

const BRIDGE_DONE_MARKER = "[[BRIDGE_DONE]]";
const RESPONSE_STABLE_MS = 2000;
let activeJobId = null;

function firstVisible(selectors) {
  for (const selector of selectors) {
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
      const style = getComputedStyle(node);
      if (style.display !== "none" && style.visibility !== "hidden") return node;
    }
  }
  return null;
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

const COPY_RESPONSE_SELECTORS = [
  'button[data-testid="copy-turn-action-button"]',
  'button[aria-label*="Copy response" i]',
  'button[aria-label*="Copiar respuesta" i]',
  'button[aria-label="Copy" i]',
  'button[aria-label="Copiar" i]',
  'button[title*="Copy response" i]',
  'button[title*="Copiar respuesta" i]'
];

function getCopyResponseButton(node) {
  if (!node) return null;

  const roots = [
    node,
    node.closest("article"),
    node.closest('[data-testid^="conversation-turn-"]'),
    node.parentElement
  ].filter(Boolean);

  for (const root of roots) {
    for (const selector of COPY_RESPONSE_SELECTORS) {
      const button = root.querySelector(selector);
      if (button && !button.disabled && button.getAttribute("aria-disabled") !== "true") {
        return button;
      }
    }
  }

  return null;
}

function copyResponseFromChat(node, expectedText) {
  const button = getCopyResponseButton(node);
  if (!button) {
    throw new Error("No está disponible la opción «Copiar respuesta» para la respuesta de origen");
  }

  const copied = stripBridgeMarker(expectedText);
  if (!copied) throw new Error("«Copiar respuesta» está activa pero la respuesta de origen está vacía");

  // El botón pertenece al mismo turno assistant recién generado.
  // Usamos ese turno como única fuente de verdad; no leemos el último texto
  // global del chat ni buscamos mensajes anteriores/recibidos.
  return copied;
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
    try {
      document.execCommand("insertText", false, text);
    } catch {
      element.textContent = text;
    }
  }

  element.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    inputType: "insertText",
    data: text
  }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
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

async function waitForSendButton(timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const button = firstVisible(SEND_SELECTORS);
    if (button && !button.disabled && button.getAttribute("aria-disabled") !== "true") return button;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error("ChatGPT send button not found or disabled");
}

function stripBridgeMarker(text) {
  const value = String(text || "").trim();
  const index = value.lastIndexOf(BRIDGE_DONE_MARKER);
  return index === -1 ? value : value.slice(0, index).trim();
}

function isGenerationStopped() {
  return !firstVisible(STOP_SELECTORS);
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
      const generationStopped = isGenerationStopped();
      const minimumDelayReached = Date.now() - sentAt >= minTurnDelayMs;

      if (stable && generationStopped && minimumDelayReached) {
        return copyResponseFromChat(latestNode, current);
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

async function sendAndWait(text, timeoutMs = 60000, minTurnDelayMs = 0) {
  const input = await waitForInput(10000);
  const beforeNode = getLatestAssistantNode();
  const beforeText = getAssistantText(beforeNode);

  insertText(input, text);

  const button = await waitForSendButton(10000);
  button.click();

  return waitForCompletedResponse(
    beforeNode,
    beforeText,
    Date.now(),
    timeoutMs,
    minTurnDelayMs
  );
}

async function reportTurnComplete(message, result) {
  const response = await chrome.runtime.sendMessage({
    type: "TURN_COMPLETE",
    sessionId: String(message.sessionId || ""),
    jobId: String(message.jobId || ""),
    role: message.role || "ChatGPT",
    ...result
  });

  if (!response?.ok) {
    throw new Error(response?.error || "BRIDGE no confirmó la finalización del turno");
  }
}

async function runTurn(message) {
  try {
    const text = await sendAndWait(
      message.text,
      Number(message.timeoutMs) || 60000,
      Number(message.minTurnDelayMs) || 0
    );

    await reportTurnComplete(message, { ok: true, text });
  } catch (error) {
    try {
      await reportTurnComplete(message, {
        ok: false,
        error: error.message || String(error)
      });
    } catch (reportError) {
      console.error("BRIDGE no pudo confirmar el resultado del turno", reportError);
    }
  } finally {
    if (activeJobId === message.jobId) activeJobId = null;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "START_TURN") {
    if (activeJobId && activeJobId !== message.jobId) {
      sendResponse({ ok: false, error: "Esta pestaña ya está ejecutando otro turno" });
      return;
    }

    activeJobId = String(message.jobId || "");
    runTurn({ ...message, role: message.role || "ChatGPT" });
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
