// Rasterise the brand mark into the PNG sizes a web app manifest needs.
// Run once; the PNGs are committed. Kept out of the build so a deploy never
// depends on a browser being available.
import { chromium } from "playwright";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const svg = readFileSync("/home/user/mockupmaker/public/favicon.svg", "utf8");
const d = readdirSync("/opt/pw-browsers").filter((x) => x.startsWith("chromium-")).sort().pop();
const browser = await chromium.launch({ executablePath: `/opt/pw-browsers/${d}/chrome-linux/chrome`,
  args: ["--no-sandbox"] });

// `inset` is the fraction of the square left empty around the mark. Android
// crops maskable icons to a circle, so those need a wide safe zone.
async function render(size, inset, out) {
  const page = await browser.newPage({ viewport: { width: size, height: size },
    deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><style>
    html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden}
    body{background:#ffffff;display:flex;align-items:center;justify-content:center}
    svg{width:${Math.round(size * (1 - inset * 2))}px;height:auto;display:block}
  </style>${svg}`);
  const buf = await page.screenshot({ omitBackground: false });
  writeFileSync(out, buf);
  await page.close();
  console.log(`${out}  ${size}x${size}  inset ${inset}`);
}

await render(192, 0.16, "/home/user/mockupmaker/public/icon-192.png");
await render(512, 0.16, "/home/user/mockupmaker/public/icon-512.png");
await render(512, 0.28, "/home/user/mockupmaker/public/icon-maskable-512.png");
await render(180, 0.16, "/home/user/mockupmaker/public/apple-touch-icon.png");
await browser.close();
console.log(existsSync("/home/user/mockupmaker/public/icon-512.png") ? "done" : "MISSING");
