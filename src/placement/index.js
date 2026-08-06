// ============================================================
// Placement pipeline — orchestrator
// ============================================================
//
// Order of authority, highest first:
//
//   1. Pinned lock   — a human dragged it. Reused verbatim.
//   2. Chest lock    — this template was measured before. Reused verbatim.
//   3. Fresh measure — segment the garment, find landmarks, solve, validate.
//   4. Neutral       — everything failed; a safe centred print.
//
// Tiers 1 and 2 involve no detection at all, which is what makes repeat
// renders bit-identical. Tier 3 runs once per template, ever.

// Side-effect import: registers the WebGL/CPU backends that coco-ssd needs.
// Without it the model loads into a runtime with no backend and every detect()
// call throws — which is exactly the failure mode this refactor exists to
// remove, so it must not be tree-shaken away.
import "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import { NEUTRAL_PLACEMENT, makePlacement, deriveHeight, fromLegacy } from "./contract.js";
import { analyzeArtwork } from "./artwork.js";
import { segmentGarment } from "./garmentMask.js";
import { computeChestArea } from "./chestArea.js";
import { solvePlacement, refitLocked } from "./solve.js";
import { enforce } from "./validate.js";
import { createLockStore, lockToChest, importPlacements } from "./templateLock.js";

export { createLockStore, importPlacements, lockToChest };
export { analyzeArtwork } from "./artwork.js";
export { canvasRectForInk } from "./artwork.js";
export * from "./contract.js";

/** Detection confidence below which a second segmentation pass is run. */
const RESEGMENT_THRESHOLD = 0.95;

// ---- caches ---------------------------------------------------------
// Keyed by image src. Measuring a template twice in one session is pure waste
// and — more importantly — a chance for the two results to disagree.
const artworkCache = new Map();
const chestCache = new Map();
const imageCache = new Map();
let modelPromise = null;

export function clearPlacementCaches() {
  artworkCache.clear();
  chestCache.clear();
  imageCache.clear();
}

function loadModel() {
  if (!modelPromise) {
    modelPromise = cocoSsd.load().catch((err) => {
      modelPromise = null;
      throw err;
    });
  }
  return modelPromise;
}

export function loadImage(src, crossOrigin = true) {
  if (imageCache.has(src)) return imageCache.get(src);
  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
  imageCache.set(src, promise);
  return promise;
}

export async function getArtworkAnalysis(src) {
  if (artworkCache.has(src)) return artworkCache.get(src);
  const promise = loadImage(src, false).then(analyzeArtwork);
  artworkCache.set(src, promise);
  return promise;
}

/**
 * Locate the person, purely to give segmentation a search region.
 *
 * NOTE: the previous implementation called `model.estimateObjects()`, which is
 * not a method on coco-ssd — the correct name is `detect()`. That call threw a
 * TypeError on every invocation, so detection never once completed and every
 * mockup silently fell back to a hard-coded default box. Fixing this one
 * identifier is what makes the rest of the pipeline reachable at all.
 */
async function findPersonROI(image) {
  try {
    const model = await loadModel();
    const predictions = await model.detect(image, 20, 0.35);
    const people = predictions.filter((p) => p.class === "person");
    if (people.length === 0) return null;

    // Largest person — in a lifestyle shot the subject dominates the frame.
    const person = people.sort((a, b) => b.bbox[2] * b.bbox[3] - a.bbox[2] * a.bbox[3])[0];
    const [x, y, w, h] = person.bbox;
    const iw = image.naturalWidth || image.width;
    const ih = image.naturalHeight || image.height;
    return {
      x: Math.max(0, x / iw),
      y: Math.max(0, y / ih),
      w: Math.min(1, w / iw),
      h: Math.min(1, h / ih),
      score: person.score,
    };
  } catch {
    // Model unavailable (offline, blocked CDN, WebGL refused). Segmentation
    // still works from a centred prior, so this is not fatal.
    return null;
  }
}

/**
 * Measure a mockup: segment the garment, then derive landmarks and the
 * printable chest area. Cached per template.
 *
 * Runs a second segmentation pass when the first is not confident, per the
 * brief. The two passes use different search regions, and the better-scoring
 * result wins — deterministically, since both are pure functions of the image.
 */
async function measureTemplate(templateId, mockupImage, artwork, log) {
  if (chestCache.has(templateId)) return chestCache.get(templateId);

  const promise = (async () => {
    const roi = await findPersonROI(mockupImage);
    log?.(`roi=${roi ? `${(roi.score * 100).toFixed(0)}%` : "none (centred prior)"}`);

    let garment = segmentGarment(mockupImage, roi);
    let chest = garment ? computeChestArea(garment, artwork) : null;

    if (!chest || chest.confidence < RESEGMENT_THRESHOLD) {
      // Second pass. If the ROI was the constraint, drop it; if there was no
      // ROI, tighten to a torso-biased window. Either way we get an
      // independent measurement to compare against.
      const altRoi = roi
        ? { x: Math.max(0, roi.x - 0.05), y: roi.y, w: Math.min(1, roi.w + 0.1), h: roi.h * 0.75 }
        : { x: 0.25, y: 0.15, w: 0.5, h: 0.6 };
      const garment2 = segmentGarment(mockupImage, altRoi);
      const chest2 = garment2 ? computeChestArea(garment2, artwork) : null;

      log?.(
        `pass1=${chest ? chest.confidence.toFixed(2) : "fail"} pass2=${chest2 ? chest2.confidence.toFixed(2) : "fail"}`,
      );

      if (chest2 && (!chest || chest2.confidence > chest.confidence)) {
        garment = garment2;
        chest = chest2;
      }
    }

    return chest;
  })();

  chestCache.set(templateId, promise);
  return promise;
}

/**
 * Resolve the placement for one template + one artwork.
 *
 * @param {Object} args
 * @param {string} args.templateId   stable id (the R2 key)
 * @param {string} args.mockupSrc
 * @param {string} args.artworkSrc
 * @param {ReturnType<createLockStore>} args.locks
 * @param {number} [args.opacity]
 * @param {(msg:string)=>void} [args.log]
 * @returns {Promise<{placement, chest, artwork, imageAspect, report}>}
 */
export async function resolvePlacement({
  templateId,
  mockupSrc,
  artworkSrc,
  locks,
  opacity = 100,
  log,
}) {
  const trace = (msg) => log?.(`[placement:${templateId}] ${msg}`);

  const [mockupImage, artwork] = await Promise.all([
    loadImage(mockupSrc),
    getArtworkAnalysis(artworkSrc),
  ]);

  const imageAspect =
    (mockupImage.naturalWidth || mockupImage.width) /
    (mockupImage.naturalHeight || mockupImage.height);

  trace(
    `artwork ${artwork.orientation} visibleAspect=${artwork.visibleAspect.toFixed(3)} ` +
      `padding=${(artwork.paddingRatio * 100).toFixed(1)}%`,
  );

  // ---- tiers 1 & 2: locked ----
  const lock = locks?.get(templateId);
  if (lock) {
    const chest = lockToChest(lock);
    const placement =
      lock.kind === "pinned"
        ? refitLocked(
            makePlacement({ ...chest, opacity, source: "locked", confidence: 1 }),
            artwork,
            imageAspect,
            chest.height,
          )
        : solvePlacement(chest, artwork, imageAspect, opacity, "locked");

    const { placement: safe, repairs, validation } = enforce(
      placement,
      chest,
      artwork,
      imageAspect,
    );
    trace(`LOCKED (${lock.kind}) → ${fmt(safe)}${repairs.length ? ` repairs=${repairs}` : ""}`);
    return {
      placement: safe,
      chest,
      artwork,
      imageAspect,
      report: { tier: "locked", lockKind: lock.kind, validation, repairs },
    };
  }

  // ---- tier 3: measure ----
  let chest = null;
  try {
    chest = await measureTemplate(templateId, mockupImage, artwork, trace);
  } catch (err) {
    trace(`measurement error: ${err.message}`);
  }

  if (chest) {
    const solved = solvePlacement(chest, artwork, imageAspect, opacity, "solved");
    const { placement: safe, repairs, validation } = enforce(solved, chest, artwork, imageAspect);

    trace(
      `SOLVED conf=${chest.confidence.toFixed(2)} pose=${chest.analysis.pose} ` +
        `angle=${chest.analysis.cameraAngle} occl=${(chest.analysis.occlusionRatio * 100).toFixed(0)}% ` +
        `→ ${fmt(safe)}${repairs.length ? ` repairs=${repairs}` : ""}`,
    );

    // Freeze it. Every future artwork on this template skips detection.
    locks?.setChest(templateId, chest);

    return {
      placement: safe,
      chest,
      artwork,
      imageAspect,
      report: { tier: "solved", validation, repairs, analysis: chest.analysis },
    };
  }

  // ---- tier 4: neutral ----
  const neutral = makePlacement({ ...NEUTRAL_PLACEMENT, opacity });
  const { placement: safe } = enforce(neutral, null, artwork, imageAspect);
  trace(`FALLBACK → ${fmt(safe)}`);
  return {
    placement: safe,
    chest: null,
    artwork,
    imageAspect,
    report: { tier: "fallback", validation: null, repairs: [] },
  };
}

function fmt(p) {
  return `c=(${p.centerX.toFixed(3)},${p.centerY.toFixed(3)}) w=${p.width.toFixed(3)} rot=${p.rotation.toFixed(1)}°`;
}

export { deriveHeight, fromLegacy };
