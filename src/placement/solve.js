// ============================================================
// Solver — fits a measured artwork into a measured chest area
// ============================================================
//
// The chest area is a property of the mockup. The artwork aspect is a property
// of the design. This module is the only place the two meet, and it is pure:
// same inputs, same output, no I/O, no model, no randomness. That is what
// makes the pipeline reproducible.

import { makePlacement, deriveHeight } from "./contract.js";
import { mapRectIntoQuad } from "./homography.js";

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

  const height = deriveHeight(width, artAspect, imageAspect);

  return makePlacement({
    centerX: chest.centerX,
    centerY: chest.centerY,
    width,
    rotation: chest.rotation,
    opacity,
    source,
    confidence: chest.confidence,
    perspective: artworkQuad(chest, width, height),
  });
}

/**
 * The quad the artwork itself occupies, not the one the print area does.
 *
 * `chest.perspective` describes the whole printable surface. Warping the
 * artwork straight onto it would stretch a design to fill the entire chest,
 * destroying the contain-fit that the width solve just established. So the
 * fitted rectangle is re-expressed in the print area's own local coordinates
 * and carried through the same projective map — the artwork keeps its size and
 * its centring, and inherits only the perspective.
 *
 * @returns {number[]|null} normalized quad, or null when there is no warp
 */
function artworkQuad(chest, width, height) {
  if (!chest.perspective || !(chest.width > 0) || !(chest.height > 0)) return null;

  const quad = [
    [chest.perspective[0], chest.perspective[1]],
    [chest.perspective[2], chest.perspective[3]],
    [chest.perspective[4], chest.perspective[5]],
    [chest.perspective[6], chest.perspective[7]],
  ];

  // Where the artwork sits inside the print area, in 0..1 local space. Contain
  // fit centres it, so one axis is the full extent and the other is inset.
  const local = {
    x: (1 - width / chest.width) / 2,
    y: (1 - height / chest.height) / 2,
    w: width / chest.width,
    h: height / chest.height,
  };
  if (!(local.w > 0) || !(local.h > 0)) return null;

  const mapped = mapRectIntoQuad(quad, local);
  return mapped ? mapped.flatMap(([x, y]) => [x, y]) : null;
}
