import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
const BG = "#0a0a0a";
const FG = "#ffffff";

// SVG chữ "HM" căn giữa; padPct = viền an toàn cho maskable
function svg(size, padPct) {
  const fontSize = Math.round(size * (padPct ? 0.32 : 0.42));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" rx="${padPct ? 0 : Math.round(size * 0.18)}" fill="${BG}"/>
    <text x="50%" y="50%" dy="0.35em" text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif" font-weight="700"
      font-size="${fontSize}" fill="${FG}">HM</text>
  </svg>`;
}

async function png(size, name, padPct = 0) {
  await sharp(Buffer.from(svg(size, padPct))).png().toFile(join(OUT, name));
  console.log("wrote", name);
}

await mkdir(OUT, { recursive: true });
await png(192, "icon-192.png");
await png(512, "icon-512.png");
await png(512, "maskable-512.png", 0.1); // nền phủ toàn khung, chữ nhỏ hơn
await png(180, "apple-touch-icon.png");
