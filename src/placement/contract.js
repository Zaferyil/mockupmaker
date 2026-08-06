// ============================================================
// Placement contract — the single source of truth for geometry
// ============================================================
//
// WHY THIS EXISTS
// ---------------
// Placement used to be expressed as {left, top, width, height} in *percent*,
// which has two fatal properties for a POD pipeline:
//
//   1. `height` is a free variable. Nothing stopped it from drifting out of
//      sync with `width`, which is how artwork got stretched.
//   2. A top-left anchor moves when the size changes. Resizing a design
//      shifted it up-left, so "same placement" never survived a resize.
//
// The canonical record below is center-anchored and stores exactly one size
// axis. Height is *derived* from the artwork's own aspect ratio at render
// time, so stretching is not merely discouraged — it is unrepresentable.
//
// All values are normalized fractions of the mockup's own dimensions, never
// pixels, so a 1000px and a 4000px render of the same shot produce identical
// records.

/**
 * @typedef {Object} Placement
 * @property {number} centerX   0..1 fraction of image width
 * @property {number} centerY   0..1 fraction of image height
 * @property {number} width     0..1 fraction of image width
 * @property {number} rotation  degrees, positive = clockwise
 * @property {number} opacity   0..100
 * @property {'locked'|'solved'|'fallback'|'manual'} source
 * @property {number} confidence 0..1
 * @property {number[]|null} perspective 8-element quad [x0,y0,x1,y1,x2,y2,x3,y3]
 *                                        normalized, or null for no warp
 */

/** Tolerances from the spec. Exceeding any of these triggers a recompute. */
export const TOLERANCE = {
  center: 0.02, // 2% of image dimension
  width: 0.01, //  1% of image width
  rotation: 1.0, // 1 degree
};

/**
 * Fallback used only when every detection tier fails. Chosen to sit on the
 * chest of a typical centered POD lifestyle shot rather than to fill the frame.
 */
export const NEUTRAL_PLACEMENT = Object.freeze({
  centerX: 0.5,
  centerY: 0.4,
  width: 0.3,
  rotation: 0,
  opacity: 100,
  source: "fallback",
  confidence: 0,
  perspective: null,
});

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Build a valid Placement, clamping every field into a legal range. */
export function makePlacement(p) {
  return {
    centerX: clamp01(p.centerX),
    centerY: clamp01(p.centerY),
    width: Math.min(0.95, Math.max(0.02, p.width)),
    rotation: Number.isFinite(p.rotation) ? p.rotation : 0,
    opacity: Math.min(100, Math.max(0, p.opacity ?? 100)),
    source: p.source ?? "solved",
    confidence: clamp01(p.confidence ?? 0),
    perspective: Array.isArray(p.perspective) && p.perspective.length === 8 ? p.perspective : null,
  };
}

/**
 * Derive the drawn height from width + the artwork's aspect ratio.
 *
 * This is the function that makes stretching impossible: height is never
 * stored, never edited, and never round-tripped — it is recomputed from the
 * artwork every single time it is needed.
 *
 * @param {number} width          normalized width (fraction of image width)
 * @param {number} artworkAspect  artwork width / height
 * @param {number} imageAspect    mockup width / height
 * @returns {number} normalized height (fraction of image height)
 */
export function deriveHeight(width, artworkAspect, imageAspect) {
  if (!(artworkAspect > 0) || !(imageAspect > 0)) return width;
  return (width / artworkAspect) * imageAspect;
}

// ------------------------------------------------------------
// Legacy adapter
// ------------------------------------------------------------
// The R2 bucket already holds hand-calibrated placements in the old percent
// format. Those are the most valuable data in the whole system — a human
// eyeballed each one — so they are migrated, never discarded.

/** Old {left,top,width,height,opacity} in percent → canonical Placement. */
export function fromLegacy(legacy) {
  if (!legacy || typeof legacy !== "object") return null;
  if (typeof legacy.centerX === "number") return makePlacement(legacy); // already canonical

  const { left, top, width, height, opacity } = legacy;
  if (![left, top, width, height].every((v) => typeof v === "number")) return null;

  return makePlacement({
    centerX: (left + width / 2) / 100,
    centerY: (top + height / 2) / 100,
    width: width / 100,
    rotation: 0,
    opacity: opacity ?? 100,
    // A stored legacy record only exists because a human dragged it there.
    // That outranks anything the solver can produce.
    source: "manual",
    confidence: 1,
    perspective: null,
  });
}

/**
 * Canonical Placement → old percent format, for the drag/resize UI and the
 * canvas compositor, which both still think in a top-left box.
 */
export function toBox(placement, artworkAspect, imageAspect) {
  const height = deriveHeight(placement.width, artworkAspect, imageAspect);
  return {
    left: (placement.centerX - placement.width / 2) * 100,
    top: (placement.centerY - height / 2) * 100,
    width: placement.width * 100,
    height: height * 100,
    opacity: placement.opacity,
    rotation: placement.rotation,
  };
}

/** Old percent box (as produced by dragging) → canonical Placement. */
export function fromBox(box, source = "manual") {
  return makePlacement({
    centerX: (box.left + box.width / 2) / 100,
    centerY: (box.top + box.height / 2) / 100,
    width: box.width / 100,
    rotation: box.rotation ?? 0,
    opacity: box.opacity ?? 100,
    source,
    confidence: source === "manual" ? 1 : 0.5,
    perspective: null,
  });
}
