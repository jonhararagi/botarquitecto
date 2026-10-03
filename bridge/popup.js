const status = document.getElementById("status");
const list = document.getElementById("tabs");
const refresh = document.getElementById("refresh");

async function refreshTabs() {
  status.textContent = "Detecting ChatGPT tabs...";
  list.replaceChildren();

  try {
    const response = await chrome.runtime.sendMessage({
      type: "LIST_CHATGPT_TABS"
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Unknown error");
    }

    const tabs = response.tabs || [];
    status.textContent = "ChatGPT tabs detected: " + tabs.length;

    for (const tab of tabs) {
      const item = document.createElement("li");
      item.textContent = "tabId=" + tab.id + " — " + (tab.title || "ChatGPT");
      list.appendChild(item);
    }
  } catch (error) {
    status.textContent = "Error: " + error.message;
  }
}

refresh.addEventListener("click", refreshTabs);
refreshTabs();
