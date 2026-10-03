chrome.runtime.sendMessage({
  type: "BRIDGE_CONTENT_READY"
}).catch(() => {
  // The extension context can disappear during an extension reload.
});
