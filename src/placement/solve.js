// ============================================================
// Solver — fits a measured artwork into a measured chest area
// ============================================================
//
// The chest area is a property of the mockup. The artwork aspect is a property
// of the design. This module is the only place the two meet, and it is pure:
// same inputs, same output, no I/O, no model, no randomness. That is what
// makes the pipeline reproducible.

import { makePlacement } from "./contract.js";

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
