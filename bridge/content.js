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

const ASSISTANT_SELECTORS = [
  '[data-message-author-role="assistant"]',
  '[data-message-author-role="assistant"] .markdown',
  'article'
];

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
    const text = article.innerText?.trim() || "";
    return text.length > 0;
  });
}

function getLatestAssistantText() {
  const nodes = getAssistantNodes();
  if (!nodes.length) return "";
  const node = nodes[nodes.length - 1];
  const body = node.querySelector(".markdown, [data-markdown-text-style='assistant-message']");
  return (body?.innerText || node.innerText || node.textContent || "").trim();
}

function insertText(element, text) {
  element.focus();

  if (element.matches("textarea, input")) {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype, "value"
    )?.set || Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype, "value"
    )?.set;
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

async function sendAndWait(text, timeoutMs = 120000) {
  const input = await waitForInput(10000);
  const beforeCount = getAssistantNodes().length;
  const beforeText = getLatestAssistantText();

  insertText(input, text);

  const button = await waitForSendButton(10000);
  button.click();

  const started = Date.now();
  let lastText = "";
  let stableSince = 0;

  while (Date.now() - started < timeoutMs) {
    const nodes = getAssistantNodes();
    const current = getLatestAssistantText();

    if (nodes.length > beforeCount && current && current !== beforeText) {
      if (current !== lastText) {
        lastText = current;
        stableSince = Date.now();
      } else if (stableSince && Date.now() - stableSince >= 1400) {
        return current;
      }
    }

    await new Promise(r => setTimeout(r, 250));
  }

  throw new Error("Timeout waiting for complete ChatGPT response");
}

chrome.runtime.sendMessage({
  type: "BRIDGE_CONTENT_READY",
  tabId: chrome.runtime?.id ? null : null
}).catch(() => {});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SEND_AND_WAIT") {
    sendAndWait(String(message.text || ""), Number(message.timeoutMs) || 120000)
      .then(text => sendResponse({ ok: true, text }))
      .catch(error => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (message?.type === "READ_LATEST") {
    sendResponse({ ok: true, text: getLatestAssistantText() });
  }
});