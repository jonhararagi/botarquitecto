const CHATGPT_PATTERNS = [
  /^https:\/\/chatgpt\.com\//,
  /^https:\/\/chat\.openai\.com\//
];

function isChatGPTTab(tab) {
  return typeof tab?.url === "string" &&
    CHATGPT_PATTERNS.some((pattern) => pattern.test(tab.url));
}

async function getChatGPTTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter(isChatGPTTab)
    .map((tab) => ({
      id: tab.id,
      windowId: tab.windowId,
      title: tab.title || "",
      url: tab.url
    }));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "LIST_CHATGPT_TABS") {
    getChatGPTTabs()
      .then((tabs) => sendResponse({ ok: true, tabs }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "BRIDGE_CONTENT_READY") {
    sendResponse({
      ok: true,
      tabId: sender.tab?.id ?? null
    });
  }
});
