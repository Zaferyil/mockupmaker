// ============================================================
// Solver — fits a measured artwork into a measured chest area
// ============================================================
//
// The chest area is a property of the mockup. The artwork aspect is a property
// of the design. This module is the only place the two meet, and it is pure:
// same inputs, same output, no I/O, no model, no randomness. That is what
// makes the pipeline reproducible.

import { makePlacement, deriveHeight } from "./contract.js";

/**
 * Fit artwork inside a chest area, preserving aspect ratio.
 *
 * Uses "contain" semantics: the artwork touches the chest box on its binding
 * axis and leaves slack on the other. It can therefore never be cropped and
 * never be stretched — the two failure modes the brief calls out — because
 * only one axis is ever solved for and the other is derived.
 *
 * @param {import('./chestArea.js').ChestArea} chest
 * @param {import('./artwork.js').ArtworkAnalysis} artwork
 * @param {number} imageAspect  mockup width / height
 * @param {number} opacity
 * @param {string} source
 */
export function solvePlacement(chest, artwork, imageAspect, opacity = 100, source = "solved") {
  // Both boxes are normalized against different axes (width vs height), so
  // compare them in true pixel-aspect terms before deciding which one binds.
  const chestPixelAspect = (chest.width / chest.height) * imageAspect;
  const artAspect = artwork.visibleAspect;

  let width;
  if (artAspect >= chestPixelAspect) {
    // Wider than the chest box → width binds.
    width = chest.width;
  } else {
    // Taller than the chest box → height binds; back-solve the width.
    const height = chest.height;
    width = (height / imageAspect) * artAspect;
  }

  return makePlacement({
    centerX: chest.centerX,
    centerY: chest.centerY,
    width,
    rotation: chest.rotation,
    opacity,
    source,
    confidence: chest.confidence,
    perspective: chest.perspective,
  });
}

/**
 * Re-fit an existing locked placement to a *different* artwork.
 *
 * Template Lock reuses centre, width and rotation. Height is not stored, so it
 * is re-derived from the new artwork's aspect — which is precisely why two
 * different designs land in the same spot at the same scale instead of one of
 * them being stretched to match the other's box.
 *
 * The one adjustment: if the new artwork is much taller, honouring the stored
 * width would run it past the hem, so width is reduced until the derived
 * height fits the locked band.
 *
 * @param {import('./contract.js').Placement} locked
 * @param {import('./artwork.js').ArtworkAnalysis} artwork
 * @param {number} imageAspect
 * @param {number} maxHeight  normalized height ceiling from the locked chest
 */
export function refitLocked(locked, artwork, imageAspect, maxHeight) {
  let width = locked.width;
  const height = deriveHeight(width, artwork.visibleAspect, imageAspect);

  if (maxHeight > 0 && height > maxHeight) {
    width = width * (maxHeight / height);
  }

  return makePlacement({
    ...locked,
    width,
    source: "locked",
  });
}
