const pageActions = new Set(["pointer", "click", "scroll"]);

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "GESTURE_COMMAND") void handleCommand(message.command, sender.tab?.id);
  if (message?.type === "GESTURE_FRAME") void forwardToActive({ type: "APPLY_GESTURE_FRAME", frame: message.frame }, sender.tab?.id);
});

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0];
}

async function forwardToActive(payload, sourceTabId) {
  const tab = await activeTab();
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, payload);
  } catch {
    // Restricted pages such as chrome:// intentionally reject content scripts.
  }
}

async function handleCommand(command, sourceTabId) {
  if (!command?.action) return;
  const tab = await activeTab();
  if (!tab?.id) return;

  if (pageActions.has(command.action)) {
    await forwardToActive({ type: "APPLY_GESTURE_COMMAND", command }, sourceTabId);
    return;
  }

  try {
    if (command.action === "history_back") await chrome.tabs.goBack(tab.id);
    if (command.action === "history_forward") await chrome.tabs.goForward(tab.id);
  } catch {
    // No navigation history or restricted tab.
  }
}
