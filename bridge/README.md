# Bridge Experimental

Minimal Manifest V3 experiment for the Bridge project.

## Current scope

This first experiment only:

- detects existing chatgpt.com / chat.openai.com tabs;
- runs a content script inside matching tabs;
- routes a message through the extension service worker;
- exposes the detected tab list in a minimal popup.

It does not send prompts, read ChatGPT responses, assign CEREBRO/OBRERO roles, or run an automatic loop yet.

## Load in Chrome

1. Open chrome://extensions/.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select the repository's bridge/ directory.
5. Open two normal ChatGPT tabs.
6. Open the Bridge extension popup.

Expected result:

ChatGPT tabs detected: 2

The current implementation deliberately keeps dependencies at zero.
