import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "public", "icons");

mkdirSync(outDir, { recursive: true });

const oasis = { r: 13, g: 79, b: 39, alpha: 1 };

/**
 * Maskable-friendly icon: oasis background + rounded parchment tile (safe zone).
 */
async function makeIcon(size, filename) {
  const innerRatio = 0.72;
  const inner = Math.round(size * innerRatio);
  const pad = Math.floor((size - inner) / 2);
  const rx = Math.round(inner * 0.18);
  const rounded = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${inner}" height="${inner}"><rect width="100%" height="100%" rx="${rx}" fill="#cec5b8"/></svg>`,
  );

  await sharp({
    create: { width: size, height: size, channels: 4, background: oasis },
  })
    .composite([{ input: rounded, left: pad, top: pad }])
    .png()
    .toFile(path.join(outDir, filename));
}

await makeIcon(180, "apple-touch-icon.png");
await makeIcon(192, "icon-192.png");
await makeIcon(512, "icon-512.png");

console.log("Wrote PWA icons to public/icons/");
