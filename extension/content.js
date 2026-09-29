const SOURCE_APP = "gesture-control-app";
const SOURCE_EXTENSION = "gesture-control-extension";
let cursor = null;
let hud = null;
let hudCanvas = null;
let pointer = { x: 0.5, y: 0.5 };

const connections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

function ensureCursor() {
  if (cursor?.isConnected) return cursor;
  cursor = document.createElement("div");
  cursor.id = "gesture-control-cursor";
  Object.assign(cursor.style, {
    position: "fixed", zIndex: "2147483647", width: "22px", height: "22px", borderRadius: "999px",
    background: "#57e5ff", border: "3px solid white", boxShadow: "0 0 18px rgba(87,229,255,.75)",
    pointerEvents: "none", transform: "translate(-50%, -50%)", left: "50%", top: "50%"
  });
  document.documentElement.appendChild(cursor);
  return cursor;
}

function ensureHud() {
  if (hud?.isConnected && hudCanvas) return hudCanvas;
  hud = document.createElement("div");
  Object.assign(hud.style, {
    position: "fixed", zIndex: "2147483646", right: "14px", top: "14px", width: "180px", height: "138px",
    borderRadius: "14px", overflow: "hidden", background: "rgba(3,7,17,.86)", border: "1px solid rgba(87,229,255,.45)",
    backdropFilter: "blur(10px)", pointerEvents: "none"
  });
  hudCanvas = document.createElement("canvas");
  hudCanvas.width = 360; hudCanvas.height = 276;
  hudCanvas.style.width = "180px"; hudCanvas.style.height = "138px";
  hud.appendChild(hudCanvas);
  document.documentElement.appendChild(hud);
  return hudCanvas;
}

function applyCommand(command) {
  if (!command) return;
  if (command.action === "pointer") {
    pointer = { x: command.x, y: command.y };
    const el = ensureCursor();
    el.style.left = `${Math.max(0, Math.min(1, pointer.x)) * innerWidth}px`;
    el.style.top = `${Math.max(0, Math.min(1, pointer.y)) * innerHeight}px`;
  }
  if (command.action === "click") {
    pointer = { x: command.x, y: command.y };
    const x = Math.max(0, Math.min(1, pointer.x)) * innerWidth;
    const y = Math.max(0, Math.min(1, pointer.y)) * innerHeight;
    const el = document.elementFromPoint(x, y);
    if (el instanceof HTMLElement) el.click();
  }
  if (command.action === "scroll") window.scrollBy({ top: command.deltaY, behavior: "auto" });
}

function drawFrame(frame) {
  if (!frame?.landmarks || frame.landmarks.length !== 21) return;
  const canvas = ensureHud();
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#57e5ff"; ctx.lineWidth = 5; ctx.lineCap = "round";
  for (const [a,b] of connections) {
    ctx.beginPath();
    ctx.moveTo(frame.landmarks[a].x * canvas.width, frame.landmarks[a].y * canvas.height);
    ctx.lineTo(frame.landmarks[b].x * canvas.width, frame.landmarks[b].y * canvas.height);
    ctx.stroke();
  }
  ctx.fillStyle = "#ffffff";
  for (const p of frame.landmarks) {
    ctx.beginPath(); ctx.arc(p.x * canvas.width, p.y * canvas.height, 6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.font = "bold 22px Arial"; ctx.fillStyle = "#8af7c7"; ctx.fillText(frame.gesture || "HAND", 12, canvas.height - 14);
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.source !== SOURCE_APP) return;
  if (event.data.type === "probe-extension") {
    window.postMessage({ source: SOURCE_EXTENSION, type: "ready" }, "*");
  }
  if (event.data.type === "gesture-command") chrome.runtime.sendMessage({ type: "GESTURE_COMMAND", command: event.data.command });
  if (event.data.type === "gesture-frame") chrome.runtime.sendMessage({ type: "GESTURE_FRAME", frame: event.data.frame });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "APPLY_GESTURE_COMMAND") applyCommand(message.command);
  if (message?.type === "APPLY_GESTURE_FRAME") drawFrame(message.frame);
});

window.postMessage({ source: SOURCE_EXTENSION, type: "ready" }, "*");
