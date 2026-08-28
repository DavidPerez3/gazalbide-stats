import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const REQUIRED_ASSETS = [
  { path: "public/assets/le-gazal/characters/pol-idle-v5.webp", minWidth: 1000, minHeight: 1500 },
  { path: "public/assets/le-gazal/characters/pol-run-v5.webp", minWidth: 1000, minHeight: 1500 },
  { path: "public/assets/le-gazal/characters/pol-horns-v5.webp", minWidth: 1000, minHeight: 1500 },
  { path: "public/assets/le-gazal/characters/pelos-idle-v5.webp", minWidth: 1000, minHeight: 1500 },
  { path: "public/assets/le-gazal/characters/pelos-power-v5.webp", minWidth: 1000, minHeight: 1500 },
  { path: "public/assets/le-gazal/characters/pelos-point-v5.webp", minWidth: 1000, minHeight: 1500 },
  { path: "public/assets/le-gazal/characters/duo-clutch-v5.webp", minWidth: 1400, minHeight: 1000 },
  { path: "public/assets/le-gazal/characters/duo-madness-v5.webp", minWidth: 1400, minHeight: 1000 },
];

function readExtendedWebpSize(buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 12, 16) !== "VP8X") {
    throw new Error("must use a VP8X WebP container");
  }

  return {
    width: buffer.readUIntLE(24, 3) + 1,
    height: buffer.readUIntLE(27, 3) + 1,
    hasAlpha: Boolean(buffer[20] & 0x10),
  };
}

function validateAsset({ path: relativePath, minWidth, minHeight }) {
  const absolutePath = path.join(ROOT, relativePath);
  const buffer = fs.readFileSync(absolutePath);

  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error(`${relativePath} is not a valid WebP file`);
  }

  if (buffer.readUInt32LE(4) + 8 !== buffer.length) {
    throw new Error(`${relativePath} has an invalid or truncated RIFF container`);
  }

  const { width, height, hasAlpha } = readExtendedWebpSize(buffer);
  if (width < minWidth || height < minHeight) {
    throw new Error(
      `${relativePath} is only ${width}x${height}; expected at least ${minWidth}x${minHeight}`
    );
  }

  if (!hasAlpha) {
    throw new Error(`${relativePath} must preserve its transparent background`);
  }

  console.log(`Validated ${relativePath} (${width}x${height})`);
}

for (const asset of REQUIRED_ASSETS) validateAsset(asset);
