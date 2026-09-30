const HOST_NAME = "com.leoo1992.gesture_control";
const pageActions = new Set(["pointer", "click", "scroll"]);

let nativePort = null;
let nativeReady = false;
let nativeEnabled = true;
let reconnectTimer = null;

chrome.runtime.onInstalled.addListener(() => {
  connectNativeHost();
});

chrome.runtime.onStartup.addListener(() => {
  connectNativeHost();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PROBE_NATIVE_HOST") {
    connectNativeHost();
    sendResponse({ ready: nativeReady, enabled: nativeEnabled });
    return;
  }

  if (message?.type === "GESTURE_COMMAND") {
    void handleCommand(message.command, sender.tab?.id);
  }

  if (message?.type === "GESTURE_FRAME") {
    void handleFrame(message.frame, sender.tab?.id);
  }
});

function connectNativeHost() {
  if (nativePort) return;

  try {
    const port = chrome.runtime.connectNative(HOST_NAME);
    nativePort = port;
    nativeReady = false;

    port.onMessage.addListener((message) => {
      if (message?.type === "ready") {
        nativeReady = true;
        nativeEnabled = message.enabled !== false;
        broadcastNativeStatus();
      }

      if (message?.type === "status") {
        nativeEnabled = message.enabled !== false;
        broadcastNativeStatus();
      }
    });

    port.onDisconnect.addListener(() => {
      nativePort = null;
      nativeReady = false;
      nativeEnabled = false;
      broadcastNativeStatus();

      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectNativeHost, 2500);
    });

    port.postMessage({ type: "ping" });
  } catch {
    nativePort = null;
    nativeReady = false;
    nativeEnabled = false;
    broadcastNativeStatus();
  }
}

function sendNative(payload) {
  if (!nativePort || !nativeReady) return false;

  try {
    nativePort.postMessage(payload);
    return true;
  } catch {
    nativePort = null;
    nativeReady = false;
    nativeEnabled = false;
    broadcastNativeStatus();
    return false;
  }
}

async function broadcastNativeStatus() {
  const tabs = await chrome.tabs.query({});

  await Promise.all(
    tabs
      .filter((tab) => tab.id)
      .map(async (tab) => {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: "NATIVE_STATUS",
            ready: nativeReady,
            enabled: nativeEnabled,
          });
        } catch {
          // Restricted pages do not accept content scripts.
        }
      }),
  );
}

async function activeTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  return tabs[0];
}

async function forwardToActive(payload) {
  const tab = await activeTab();
  if (!tab?.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, payload);
  } catch {
    // Restricted pages such as chrome:// intentionally reject content scripts.
  }
}

async function handleFrame(frame) {
  connectNativeHost();

  if (sendNative({ type: "frame", frame })) {
    return;
  }

  await forwardToActive({
    type: "APPLY_GESTURE_FRAME",
    frame,
  });
}

async function handleCommand(command) {
  if (!command?.action) return;

  connectNativeHost();

  if (sendNative({ type: "command", command })) {
    return;
  }

  const tab = await activeTab();
  if (!tab?.id) return;

  if (pageActions.has(command.action)) {
    await forwardToActive({
      type: "APPLY_GESTURE_COMMAND",
      command,
    });
    return;
  }

  try {
    if (command.action === "history_back") {
      await chrome.tabs.goBack(tab.id);
    }

    if (command.action === "history_forward") {
      await chrome.tabs.goForward(tab.id);
    }
  } catch {
    // No history or restricted tab.
  }
}

connectNativeHost();
