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

function getInput() {
  return firstVisible(INPUT_SELECTORS);
}

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

async function sendAndWait(text, timeoutMs = 120000, minTurnDelayMs = 10000) {
  const input = await waitForInput(10000);
  const beforeNode = getLatestAssistantNode();
  const beforeText = getAssistantText(beforeNode);

  insertText(input, text);

  const button = await waitForSendButton(10000);
  button.click();

  const sentAt = Date.now();
  const stableRequiredMs = 1800;
  let lastText = "";
  let stableSince = 0;

  while (Date.now() - sentAt < timeoutMs) {
    const latestNode = getLatestAssistantNode();
    const current = getAssistantText(latestNode);
    const isNewNode = latestNode && latestNode !== beforeNode;
    const isUpdatedResponse = current && current !== beforeText;
    const hasNewResponse = Boolean(current && (isNewNode || isUpdatedResponse));

    if (hasNewResponse) {
      if (current !== lastText) {
        lastText = current;
        stableSince = Date.now();
      } else if (
        stableSince &&
        Date.now() - stableSince >= stableRequiredMs &&
        Date.now() - sentAt >= minTurnDelayMs
      ) {
        return current;
      }
    }

    await new Promise(r => setTimeout(r, 250));
  }

  throw new Error("Timeout waiting for complete ChatGPT response");
}

async function runTurn(message) {
  try {
    const text = await sendAndWait(
      message.text,
      Number(message.timeoutMs) || 120000,
      Number(message.minTurnDelayMs) || 10000
    );

    await chrome.runtime.sendMessage({
      type: "TURN_COMPLETE",
      jobId: message.jobId,
      ok: true,
      text,
      role: message.role || "ChatGPT"
    });
  } catch (error) {
    await chrome.runtime.sendMessage({
      type: "TURN_COMPLETE",
      jobId: message.jobId,
      ok: false,
      error: error.message || String(error),
      role: message.role || "ChatGPT"
    });
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
    runTurn({
      ...message,
      role: message.role || "ChatGPT"
    });

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

chrome.runtime.sendMessage({
  type: "BRIDGE_CONTENT_READY"
}).catch(() => {});
