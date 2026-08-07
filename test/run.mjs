// Headless verification of the deterministic placement core.
//   npm run test:placement
//
// Starts a vite dev server, drives the harness page in Chromium, and asserts
// the invariants the placement pipeline is supposed to guarantee.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";

const PORT = process.env.PORT ?? 5178;
const URL = process.env.HARNESS_URL ?? `http://127.0.0.1:${PORT}/test/harness.html`;

/** Prefer a preinstalled Chromium; fall back to whatever playwright manages. */
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!existsSync(root)) return undefined;
  const dir = readdirSync(root)
    .filter((d) => d.startsWith("chromium-"))
    .sort()
    .pop();
  if (!dir) return undefined;
  const bin = `${root}/${dir}/chrome-linux/chrome`;
  return existsSync(bin) ? bin : undefined;
}

let server = null;
if (!process.env.HARNESS_URL) {
  server = spawn("npx", ["vite", "--port", String(PORT), "--host", "127.0.0.1"], {
    stdio: "ignore",
    detached: false,
  });
  // Wait for the dev server to answer.
  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`);
      if (res.ok || res.status === 404) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      server.kill();
      throw new Error("vite dev server did not start");
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

const shutdown = () => {
  if (server && !server.killed) server.kill("SIGTERM");
};
process.on("exit", shutdown);

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

await page.goto(URL, { waitUntil: "load" });
await page.waitForFunction(() => window.__RESULTS__ !== undefined, null, { timeout: 60000 });
const r = await page.evaluate(() => window.__RESULTS__);
await browser.close();

if (errors.length) {
  console.log("page errors:", errors.slice(0, 5));
}

let failures = 0;
const check = (name, pass, detail) => {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!pass) failures++;
};

console.log("\n=== deterministic placement core ===\n");

check("determinism: identical input → identical output", r.determinism.identical);

const ci = r.colorInvariance;
check(
  "colour invariance: centre within 2% across 6 shirt colours",
  ci.cxSpread !== null && ci.cxSpread < 0.02 && ci.cySpread < 0.02,
  `cxSpread=${ci.cxSpread} cySpread=${ci.cySpread} wSpread=${ci.wSpread}`,
);
for (const s of ci.samples) if (s.error) console.log(`      ! ${s.shirtColor}: ${s.error}`);

check(
  "translation: placement tracks a moved garment",
  Math.abs(r.translation.delta - r.translation.expected) < 0.02,
  `delta=${r.translation.delta} expected=${r.translation.expected}`,
);

check(
  "scale invariance: print scales with garment",
  Math.abs(r.scale.ratio - r.scale.expected) < 0.08,
  `ratio=${r.scale.ratio} expected=${r.scale.expected}`,
);

const p = r.padding;
check(
  "transparent padding detected",
  p.paddedPaddingRatio > 0.3 && p.tightPaddingRatio < 0.05,
  `tight=${p.tightPaddingRatio} padded=${p.paddedPaddingRatio}`,
);
check(
  "padded and tight artwork render identical ink",
  Math.abs(p.tightInk.w - p.paddedInk.w) < 1 && Math.abs(p.tightInk.h - p.paddedInk.h) < 1,
  `tightInk=${JSON.stringify(p.tightInk)} paddedInk=${JSON.stringify(p.paddedInk)}`,
);
check(
  "padded PNG is drawn larger to compensate",
  p.paddedDrawnCanvas.w > p.tightDrawnCanvas.w * 1.3,
  `tightCanvas=${p.tightDrawnCanvas.w} paddedCanvas=${p.paddedDrawnCanvas.w}`,
);

for (const a of r.aspect) {
  check(
    `aspect preserved: ${a.name}`,
    Math.abs(a.renderedAspect - a.sourceAspect) / a.sourceAspect < 0.01,
    `source=${a.sourceAspect} rendered=${a.renderedAspect}`,
  );
}
const cxs = r.aspect.map((a) => a.cx);
const cys = r.aspect.map((a) => a.cy);
check(
  "different artwork shapes share one centre",
  Math.max(...cxs) - Math.min(...cxs) < 0.02 && Math.max(...cys) - Math.min(...cys) < 0.02,
  `cx spread=${(Math.max(...cxs) - Math.min(...cxs)).toFixed(4)} cy spread=${(Math.max(...cys) - Math.min(...cys)).toFixed(4)}`,
);
check("all solved placements valid", r.aspect.every((a) => a.valid));

check(
  "QC repairs an illegal placement",
  r.qc.brokenValid === false && r.qc.fixedValid === true,
  `repairs=[${r.qc.repairs.join(",")}] → ${JSON.stringify(r.qc.fixed)}`,
);

// Rotation is deliberately conservative. Real lifestyle shots produced tilts
// of up to 18 degrees on models sitting upright, because the garment
// silhouette centre wanders with sleeves and hands. A wrongly rotated print is
// far more damaging commercially than a missed real tilt, so the contract is
// now a *safety* property: never rotate without strong evidence, and never
// beyond the clamp.
check(
  "rotation: straight garment is never rotated",
  Math.abs(r.tilt.straight) < 0.01,
  `straight=${r.tilt.straight}°`,
);
check(
  "rotation: never exceeds the ±7° clamp",
  Math.abs(r.tilt.leaning) <= 7.0001,
  `leaning=${r.tilt.leaning}° pose=${r.tilt.pose}`,
);

check(
  "shading leaves un-printed pixels untouched (no halo)",
  r.shadingHalo.maxDiffOutside <= 1,
  `maxDiff outside print = ${r.shadingHalo.maxDiffOutside}`,
);
check(
  "shading is still applied on the print itself",
  r.shadingHalo.diffOnPrint > 2,
  `diff on print = ${r.shadingHalo.diffOnPrint}`,
);

check(
  "no stretching: a circle renders as a circle",
  Math.abs(r.distortion.renderedAspect - 1) <= 0.01,
  `rendered ${r.distortion.rendered} (aspect ${r.distortion.renderedAspect})`,
);
// The locked rectangle is the print area: every artwork fits inside it,
// touching one axis, keeping its own proportions. This replaces the older
// "reuse the stored width" rule, under which each design's aspect ratio
// decided how large the print came out.
const lf = r.lockedFit;
check(
  "every artwork fits inside the locked print area",
  lf.fits.every((f) => f.withinW && f.withinH),
  `box ${lf.box.w}x${lf.box.h}; ` + lf.fits.map((f) => `${f.name} ${f.w}x${f.h}`).join(", "),
);
check(
  "each artwork touches the print area on one axis",
  lf.fits.every((f) => f.touches),
  lf.fits.map((f) => `${f.name}:${f.touches}`).join(" "),
);
check(
  "proportions preserved for every artwork shape",
  lf.fits.every((f) => f.aspectOk),
  lf.fits.map((f) => `${f.name}:${f.aspectOk}`).join(" "),
);

const sc = r.scatter;
check(
  "solid-edged artwork keeps its exact bounds",
  Math.abs(sc.plainTrim.w - sc.expectedW) < 0.005 && Math.abs(sc.plainTrim.h - sc.expectedH) < 0.005,
  `trim ${sc.plainTrim.w}x${sc.plainTrim.h}, expected ${sc.expectedW}x${sc.expectedH}`,
);
check(
  "decorative scatter does not inflate the trim box",
  Math.abs(sc.confettiAspect - sc.plainAspect) / sc.plainAspect < 0.05,
  `plain ${sc.plainAspect} vs confetti ${sc.confettiAspect} (trim ${sc.confettiTrim.w}x${sc.confettiTrim.h})`,
);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
shutdown();
process.exit(failures === 0 ? 0 : 1);
