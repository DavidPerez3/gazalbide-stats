import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const MIN_WIDTH = 800;
const MIN_HEIGHT = 1200;
const REQUIRED_ASSETS = [
  "public/assets/le-gazal/characters/pol-clutch-v4.webp",
  "public/assets/le-gazal/characters/pelos-idle-v4.webp",
];

function readExtendedWebpSize(buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 12, 16) !== "VP8X") {
    throw new Error("must use a VP8X WebP container");
  }

  return {
    width: buffer.readUIntLE(24, 3) + 1,
    height: buffer.readUIntLE(27, 3) + 1,
  };
}

function validateAsset(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  const buffer = fs.readFileSync(absolutePath);

  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error(`${relativePath} is not a valid WebP file`);
  }

  if (buffer.readUInt32LE(4) + 8 !== buffer.length) {
    throw new Error(`${relativePath} has an invalid or truncated RIFF container`);
  }

  const { width, height } = readExtendedWebpSize(buffer);
  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    throw new Error(
      `${relativePath} is only ${width}x${height}; expected at least ${MIN_WIDTH}x${MIN_HEIGHT}`
    );
  }

  console.log(`Validated ${relativePath} (${width}x${height})`);
}

for (const asset of REQUIRED_ASSETS) validateAsset(asset);
