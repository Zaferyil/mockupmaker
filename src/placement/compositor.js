// ============================================================
// Compositor — draws the artwork onto the mockup
// ============================================================
//
// RENDER ORDER
// ------------
//   1. base photograph
//   2. artwork (trim-aware, rotated, optionally warped)
//   3. fabric shading transferred *on top of* the artwork
//
// Step 3 must come last. A print that is composited over the photo and then
// left alone reads as a sticker, because the garment's own folds and shadows
// stop at its edge. Re-applying the fabric's luminance over the artwork is
// what makes it read as ink on cloth.
//
// The shading is transferred as a *normalized luminance ratio*, not as the
// pixels themselves. Multiplying raw pixels would tint the artwork with the
// shirt colour — a white logo on a pink tee would come out pink. Dividing each
// pixel's luminance by the region's mean luminance yields a pure light/dark
// field with the colour removed, so folds transfer and hue does not.

import { canvasRectForInk } from "./artwork.js";
import { deriveHeight } from "./contract.js";

/** Horizontal slices used to fake a homography. More slices = smoother taper. */
const WARP_SLICES = 72;
/** How strongly fabric shading shows through the print. */
const SHADING_STRENGTH = 0.55;

/**
 * Pixel rectangle the *visible ink* should occupy.
 */
export function inkRectFor(placement, artwork, canvasWidth, canvasHeight) {
  const imageAspect = canvasWidth / canvasHeight;
  const h = deriveHeight(placement.width, artwork.visibleAspect, imageAspect);
  const w = placement.width * canvasWidth;
  const hp = h * canvasHeight;
  return {
    x: placement.centerX * canvasWidth - w / 2,
    y: placement.centerY * canvasHeight - hp / 2,
    w,
    h: hp,
  };
}

/**
 * Draw the artwork.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement} artworkImage
 * @param {import('./artwork.js').ArtworkAnalysis} artwork
 * @param {import('./contract.js').Placement} placement
 */
export function drawArtwork(ctx, artworkImage, artwork, placement) {
  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;
  const ink = inkRectFor(placement, artwork, canvasWidth, canvasHeight);

  // The PNG's transparent padding means the full bitmap must be drawn larger
  // than the ink target and offset — otherwise the design lands small and
  // off-centre by half the padding asymmetry.
  const full = canvasRectForInk(artwork, ink);

  ctx.save();
  ctx.globalAlpha = placement.opacity / 100;

  const cx = ink.x + ink.w / 2;
  const cy = ink.y + ink.h / 2;
  if (placement.rotation) {
    ctx.translate(cx, cy);
    ctx.rotate((placement.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  if (placement.perspective) {
    drawWarped(ctx, artworkImage, full, placement.perspective, canvasWidth, canvasHeight, ink);
  } else {
    ctx.drawImage(artworkImage, full.x, full.y, full.w, full.h);
  }

  ctx.restore();
  return ink;
}

/**
 * Approximate a homography with horizontal slices.
 *
 * Canvas 2D has no perspective transform. Slicing the image and giving each
 * slice its own affine scale reproduces a trapezoid to well under a pixel at
 * this slice count, which is all the taper a garment silhouette ever shows.
 */
function drawWarped(ctx, image, full, quad, canvasWidth, canvasHeight, ink) {
  const [ltx, lty, rtx, , rbx, rby, lbx] = [
    quad[0] * canvasWidth,
    quad[1] * canvasHeight,
    quad[2] * canvasWidth,
    quad[3] * canvasHeight,
    quad[4] * canvasWidth,
    quad[5] * canvasHeight,
    quad[6] * canvasWidth,
    quad[7] * canvasHeight,
  ];

  const topWidth = rtx - ltx;
  const bottomWidth = rbx - lbx;
  if (!(topWidth > 0) || !(bottomWidth > 0)) {
    ctx.drawImage(image, full.x, full.y, full.w, full.h);
    return;
  }

  // Express the taper relative to the band, then apply it to the artwork rect
  // so the warp scales with the print rather than with the garment.
  const bandTop = lty;
  const bandHeight = rby - lty || 1;
  const sh = image.naturalHeight || image.height;
  const sw = image.naturalWidth || image.width;

  for (let i = 0; i < WARP_SLICES; i++) {
    const t0 = i / WARP_SLICES;
    const t1 = (i + 1) / WARP_SLICES;

    const destY0 = full.y + full.h * t0;
    const destY1 = full.y + full.h * t1;

    // Where this slice sits within the garment band, so the correct local
    // taper is sampled even if the print does not fill the band.
    const bandT = Math.min(1, Math.max(0, (destY0 - bandTop) / bandHeight));
    const scale = lerp(topWidth, bottomWidth, bandT) / topWidth;

    const centerX = full.x + full.w / 2;
    const sliceW = full.w * scale;
    const destX = centerX - sliceW / 2;

    ctx.drawImage(
      image,
      0,
      sh * t0,
      sw,
      Math.max(1, sh * (t1 - t0)),
      destX,
      destY0,
      sliceW,
      // +0.5px overlap kills seam lines between slices.
      Math.max(1, destY1 - destY0 + 0.5),
    );
  }
  void ink;
}

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Transfer the garment's shading onto the artwork that was just drawn.
 *
 * Called with the pristine mockup image so the light field is read from the
 * fabric, not from the composite that already has the print on it.
 *
 * @param {CanvasRenderingContext2D} ctx     canvas holding mockup + artwork
 * @param {HTMLImageElement} mockupImage     the untouched photograph
 * @param {{x,y,w,h}} region                 ink rect returned by drawArtwork
 */
export function applyFabricShading(ctx, mockupImage, region) {
  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;

  const x = Math.max(0, Math.floor(region.x));
  const y = Math.max(0, Math.floor(region.y));
  const w = Math.min(canvasWidth - x, Math.ceil(region.w));
  const h = Math.min(canvasHeight - y, Math.ceil(region.h));
  if (w <= 2 || h <= 2) return false;

  try {
    // Light field from the original fabric.
    const src = document.createElement("canvas");
    src.width = w;
    src.height = h;
    const sctx = src.getContext("2d", { willReadFrequently: true });
    sctx.drawImage(mockupImage, x, y, w, h, 0, 0, w, h);
    const shade = sctx.getImageData(0, 0, w, h);
    const sd = shade.data;

    let mean = 0;
    for (let i = 0; i < sd.length; i += 4) {
      mean += 0.299 * sd[i] + 0.587 * sd[i + 1] + 0.114 * sd[i + 2];
    }
    mean /= sd.length / 4;
    if (mean < 8) return false; // near-black fabric carries no usable shading

    // Composite that came out of drawArtwork.
    const target = ctx.getImageData(x, y, w, h);
    const td = target.data;

    for (let i = 0; i < td.length; i += 4) {
      const luma = 0.299 * sd[i] + 0.587 * sd[i + 1] + 0.114 * sd[i + 2];
      // Ratio around the mean: >1 where the fabric catches light, <1 in folds.
      let factor = luma / mean;
      factor = 1 + (factor - 1) * SHADING_STRENGTH;
      factor = Math.min(1.6, Math.max(0.45, factor));
      td[i] = Math.min(255, td[i] * factor);
      td[i + 1] = Math.min(255, td[i + 1] * factor);
      td[i + 2] = Math.min(255, td[i + 2] * factor);
    }

    ctx.putImageData(target, x, y);
    return true;
  } catch {
    // Tainted canvas — the print is still correctly placed, just flatter.
    return false;
  }
}

/**
 * Full render: photograph, then artwork, then fabric shading.
 */
export function renderMockup(ctx, mockupImage, artworkImage, artwork, placement, { shading = true } = {}) {
  const canvas = ctx.canvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(mockupImage, 0, 0, canvas.width, canvas.height);

  if (!artworkImage || !artwork) return null;

  const ink = drawArtwork(ctx, artworkImage, artwork, placement);
  if (shading) applyFabricShading(ctx, mockupImage, ink);
  return ink;
}
