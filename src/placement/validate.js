// ============================================================
// Quality control — verify before export, recompute on failure
// ============================================================
//
// Every placement is checked against the chest area it claims to sit in, and
// against the invariants that must hold for any commercial print. A failure is
// not a warning: `enforce()` returns a corrected placement, so a bad number can
// never reach the exported PNG.

import { TOLERANCE, makePlacement, deriveHeight } from "./contract.js";

/** Smallest and largest sane print, as a fraction of image width. */
const MIN_WIDTH = 0.08;
const MAX_WIDTH = 0.92;

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} ok
 * @property {string[]} failures
 * @property {Object} metrics
 */

/**
 * @param {import('./contract.js').Placement} placement
 * @param {import('./chestArea.js').ChestArea|null} chest reference geometry
 * @param {import('./artwork.js').ArtworkAnalysis} artwork
 * @param {number} imageAspect
 * @returns {ValidationResult}
 */
export function validatePlacement(placement, chest, artwork, imageAspect) {
  const failures = [];
  const height = deriveHeight(placement.width, artwork.visibleAspect, imageAspect);

  // --- not cropped: the whole artwork must lie inside the frame ---
  const left = placement.centerX - placement.width / 2;
  const right = placement.centerX + placement.width / 2;
  const top = placement.centerY - height / 2;
  const bottom = placement.centerY + height / 2;
  if (left < -0.001 || right > 1.001 || top < -0.001 || bottom > 1.001) {
    failures.push("cropped");
  }

  // --- size is appropriate ---
  if (placement.width < MIN_WIDTH) failures.push("too-small");
  if (placement.width > MAX_WIDTH) failures.push("too-large");

  // --- not stretched ---
  // Height is derived, so a mismatch here means something wrote a height by
  // hand and bypassed the contract.
  const renderedAspect = (placement.width / height) * imageAspect;
  if (Math.abs(renderedAspect - artwork.visibleAspect) / artwork.visibleAspect > 0.01) {
    failures.push("stretched");
  }

  const metrics = { height, renderedAspect };

  if (chest) {
    // --- centred within the printable chest area ---
    const dx = Math.abs(placement.centerX - chest.centerX);
    const dy = Math.abs(placement.centerY - chest.centerY);
    if (dx > TOLERANCE.center) failures.push("off-center-x");
    if (dy > TOLERANCE.center) failures.push("off-center-y");

    // --- inside the printable area, not just inside the frame ---
    if (placement.width > chest.width * (1 + TOLERANCE.width) + 0.001) {
      failures.push("exceeds-chest-width");
    }
    if (height > chest.height * 1.02 + 0.001) failures.push("exceeds-chest-height");

    // --- follows the shirt ---
    if (Math.abs(placement.rotation - chest.rotation) > TOLERANCE.rotation) {
      failures.push("rotation-mismatch");
    }

    metrics.dx = dx;
    metrics.dy = dy;
  }

  return { ok: failures.length === 0, failures, metrics };
}

/**
 * Validate and repair. Returns a placement that passes, or the closest legal
 * one if the reference geometry itself was unusable.
 *
 * Repairs are deterministic corrections toward the reference, never retries
 * with different parameters — so enforcing twice changes nothing.
 */
export function enforce(placement, chest, artwork, imageAspect) {
  let current = placement;
  const applied = [];

  for (let pass = 0; pass < 3; pass++) {
    const result = validatePlacement(current, chest, artwork, imageAspect);
    if (result.ok) return { placement: current, repairs: applied, validation: result };

    const next = { ...current };

    if (chest) {
      if (result.failures.includes("off-center-x")) next.centerX = chest.centerX;
      if (result.failures.includes("off-center-y")) next.centerY = chest.centerY;
      if (result.failures.includes("rotation-mismatch")) next.rotation = chest.rotation;
      if (result.failures.includes("exceeds-chest-width")) next.width = chest.width;
      if (result.failures.includes("exceeds-chest-height")) {
        next.width = (chest.height / imageAspect) * artwork.visibleAspect;
      }
    }

    if (result.failures.includes("too-large")) next.width = Math.min(next.width, MAX_WIDTH);
    if (result.failures.includes("too-small")) next.width = Math.max(next.width, MIN_WIDTH);

    if (result.failures.includes("cropped")) {
      // Pull back inside the frame, shrinking only if centring alone cannot fix it.
      const h = deriveHeight(next.width, artwork.visibleAspect, imageAspect);
      if (next.width > 1) next.width = 0.9;
      const h2 = deriveHeight(next.width, artwork.visibleAspect, imageAspect);
      if (h2 > 1) next.width = next.width * (0.96 / h2);
      const hf = deriveHeight(next.width, artwork.visibleAspect, imageAspect);
      next.centerX = Math.min(1 - next.width / 2, Math.max(next.width / 2, next.centerX));
      next.centerY = Math.min(1 - hf / 2, Math.max(hf / 2, next.centerY));
      void h;
    }

    applied.push(...result.failures);
    current = makePlacement(next);
  }

  return {
    placement: current,
    repairs: applied,
    validation: validatePlacement(current, chest, artwork, imageAspect),
  };
}
