// Renders the app icons from electron/assets/logo.svg: the window and
// installer icon (512 px; electron-builder makes the .ico from it) and the
// tray icon (16 px, 32 px for 200% displays). Run after changing the logo:
//   node scripts/make-icons.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "electron", "assets");
const svg = readFileSync(path.join(assets, "logo.svg"));

for (const [name, size] of [
  ["icon.png", 512],
  ["tray.png", 16],
  ["tray@2x.png", 32],
]) {
  await sharp(svg, { density: Math.ceil((72 * size) / 100) * 4 })
    .resize(size, size)
    .png()
    .toFile(path.join(assets, name));
  console.log(`${name}: ${size}×${size}`);
}
