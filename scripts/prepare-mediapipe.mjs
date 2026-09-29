import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceWasm = path.join(
  root,
  "node_modules",
  "@mediapipe",
  "tasks-vision",
  "wasm",
);
const publicDir = path.join(root, "public", "mediapipe");
const targetWasm = path.join(publicDir, "wasm");
const modelPath = path.join(publicDir, "hand_landmarker.task");

const MODEL_URLS = [
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  "https://cdn.jsdelivr.net/npm/expo-vision-camera-v4-mediapipe@1.4.0/hand_landmarker.task",
];

if (!existsSync(sourceWasm)) {
  throw new Error(
    "MediaPipe WASM assets were not found in node_modules. Run npm install first.",
  );
}

await mkdir(publicDir, { recursive: true });
await rm(targetWasm, { recursive: true, force: true });
await cp(sourceWasm, targetWasm, { recursive: true });

let modelDownloaded = false;
let lastError = null;

for (const url of MODEL_URLS) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());

    if (bytes.byteLength < 1_000_000) {
      throw new Error(
        `Downloaded model is unexpectedly small: ${bytes.byteLength} bytes`,
      );
    }

    await writeFile(modelPath, bytes);
    modelDownloaded = true;
    console.log(
      `MediaPipe model prepared from ${new URL(url).hostname} (${Math.round(bytes.byteLength / 1024 / 1024)} MB)`,
    );
    break;
  } catch (error) {
    lastError = error;
    console.warn(`Could not download MediaPipe model from ${url}`, error);
  }
}

if (!modelDownloaded) {
  throw new Error(
    `Could not prepare hand_landmarker.task: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

console.log("MediaPipe browser assets are available under /mediapipe");
