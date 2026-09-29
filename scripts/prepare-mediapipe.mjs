import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = path.join(
  root,
  "node_modules",
  "@mediapipe",
  "hands",
);
const target = path.join(
  root,
  "public",
  "mediapipe",
  "hands",
);

if (!existsSync(source)) {
  throw new Error(
    "@mediapipe/hands assets were not found. Run npm install first.",
  );
}

await mkdir(path.dirname(target), { recursive: true });
await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });

console.log("MediaPipe Hands assets copied to /public/mediapipe/hands");
