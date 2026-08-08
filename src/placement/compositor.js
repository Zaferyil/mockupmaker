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
import { unitSquareTo, project } from "./homography.js";
import { deriveHeight } from "./contract.js";

/** Grid subdivision for the projective warp. Error falls off quadratically,
 *  so 16 is already sub-pixel for the tapers a garment presents. */
const WARP_GRID = 16;
/** Outward expansion of each triangle's clip, in pixels, to hide seams. */
const SEAM_OVERLAP = 0.5;
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

/** Axis-aligned bounds of a normalized quad, in canvas pixels. */
function quadBounds(quadNorm, canvasWidth, canvasHeight) {
  const xs = [quadNorm[0], quadNorm[2], quadNorm[4], quadNorm[6]].map((v) => v * canvasWidth);
  const ys = [quadNorm[1], quadNorm[3], quadNorm[5], quadNorm[7]].map((v) => v * canvasHeight);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 1);
  const y0 = Math.max(0, Math.floor(Math.min(...ys)) - 1);
  const x1 = Math.min(canvasWidth, Math.ceil(Math.max(...xs)) + 1);
  const y1 = Math.min(canvasHeight, Math.ceil(Math.max(...ys)) + 1);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/** Axis-aligned bounds of a rect rotated about its own centre, clamped to the canvas. */
function rotatedBounds(rect, rotationDeg, canvasWidth, canvasHeight) {
  let { x, y, w, h } = rect;
  if (rotationDeg) {
    const rad = (rotationDeg * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const rw = w * cos + h * sin;
    const rh = w * sin + h * cos;
    x = x + w / 2 - rw / 2;
    y = y + h / 2 - rh / 2;
    w = rw;
    h = rh;
  }
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(canvasWidth, Math.ceil(x + w));
  const y1 = Math.min(canvasHeight, Math.ceil(y + h));
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/**
 * Render the artwork onto its own transparent layer.
 *
 * Drawing to a separate layer rather than straight onto the photo is what
 * makes correct shading possible: the layer's alpha channel says exactly which
 * pixels the print covers, so the fabric's light field can be applied to those
 * pixels and to nothing else.
 *
 * Compositing directly meant the shading pass had only an axis-aligned
 * rectangle to work from, and it brightened everything inside it — background,
 * skin, whatever happened to fall in the box. Straight-on prints mostly hid
 * this because the rectangle hugged the artwork; rotating one enlarges the
 * rectangle sharply and the halo became obvious.
 *
 * @returns {{canvas: HTMLCanvasElement, bounds: {x,y,w,h}, ink: {x,y,w,h}}|null}
 */
function renderArtworkLayer(artworkImage, artwork, placement, canvasWidth, canvasHeight) {
  const ink = inkRectFor(placement, artwork, canvasWidth, canvasHeight);

  // The PNG's transparent padding means the full bitmap must be drawn larger
  // than the ink target and offset — otherwise the design lands small and
  // off-centre by half the padding asymmetry.
  const full = canvasRectForInk(artwork, ink);

  // A warped print lands inside its quad, which can reach well outside the
  // upright rectangle — so the layer has to be sized from whichever the
  // artwork will actually occupy, or the warp gets clipped.
  const bounds = placement.perspective
    ? quadBounds(placement.perspective, canvasWidth, canvasHeight)
    : rotatedBounds(full, placement.rotation, canvasWidth, canvasHeight);
  if (bounds.w < 1 || bounds.h < 1) return null;

  const layer = document.createElement("canvas");
  layer.width = bounds.w;
  layer.height = bounds.h;
  const lctx = layer.getContext("2d", { willReadFrequently: true });

  // Work in full-canvas coordinates, offset into the layer.
  lctx.translate(-bounds.x, -bounds.y);

  if (placement.perspective) {
    // The quad already encodes orientation and taper together — applying
    // `rotation` as well would count the tilt twice.
    drawWarped(lctx, artworkImage, artwork, placement.perspective, canvasWidth, canvasHeight);
  } else {
    if (placement.rotation) {
      const cx = ink.x + ink.w / 2;
      const cy = ink.y + ink.h / 2;
      lctx.translate(cx, cy);
      lctx.rotate((placement.rotation * Math.PI) / 180);
      lctx.translate(-cx, -cy);
    }
    lctx.drawImage(artworkImage, full.x, full.y, full.w, full.h);
  }

  return { canvas: layer, bounds, ink };
}

/**
 * Warp the artwork onto a quadrilateral through a true projective transform.
 *
 * Canvas 2D offers only affine transforms, which cannot make parallel lines
 * converge — so a perspective warp has to be assembled from affine pieces. The
 * surface is subdivided into a grid, each cell's corners are carried through
 * the homography, and each resulting triangle is drawn with the affine map that
 * takes its source triangle onto it. Affine interpolation is exact *within* a
 * triangle, so the only error is the projective curvature across one cell, and
 * that falls off quadratically with subdivision.
 *
 * The previous implementation scaled horizontal slices independently. That
 * reproduced a symmetric trapezoid but nothing else: it could not shear, could
 * not handle a quad whose verticals are not parallel, and ignored the corner
 * positions entirely. A turned torso needs all three.
 */
function drawWarped(ctx, image, artwork, quadNorm, canvasWidth, canvasHeight) {
  const quad = [
    [quadNorm[0] * canvasWidth, quadNorm[1] * canvasHeight],
    [quadNorm[2] * canvasWidth, quadNorm[3] * canvasHeight],
    [quadNorm[4] * canvasWidth, quadNorm[5] * canvasHeight],
    [quadNorm[6] * canvasWidth, quadNorm[7] * canvasHeight],
  ];

  const H = unitSquareTo(quad);
  if (!H) return false;

  const sw = image.naturalWidth || image.width;
  const sh = image.naturalHeight || image.height;

  // Source-side trim: the quad describes where the *ink* goes, so the
  // transparent padding around it must be excluded rather than warped in.
  const t = artwork.trim;
  const sx0 = t.x * sw;
  const sy0 = t.y * sh;
  const sW = t.w * sw;
  const sH = t.h * sh;
  if (sW < 1 || sH < 1) return false;

  // Project the grid once; every triangle reads from this.
  const pts = [];
  for (let j = 0; j <= WARP_GRID; j++) {
    for (let i = 0; i <= WARP_GRID; i++) {
      const u = i / WARP_GRID;
      const v = j / WARP_GRID;
      pts.push({ u, v, p: project(H, u, v) });
    }
  }
  const at = (i, j) => pts[j * (WARP_GRID + 1) + i];

  for (let j = 0; j < WARP_GRID; j++) {
    for (let i = 0; i < WARP_GRID; i++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i + 1, j + 1);
      const d = at(i, j + 1);
      drawTriangle(ctx, image, sx0, sy0, sW, sH, a, b, c);
      drawTriangle(ctx, image, sx0, sy0, sW, sH, a, c, d);
    }
  }
  return true;
}

/**
 * Draw one source triangle onto one destination triangle.
 *
 * Solves the affine map taking the three source corners onto the destination
 * corners, clips to the destination triangle, and lets drawImage fill it. The
 * clip is expanded by a hair so neighbouring triangles overlap slightly —
 * without it, antialiasing along shared edges leaves visible seams.
 */
function drawTriangle(ctx, image, sx0, sy0, sW, sH, A, B, C) {
  const x0 = sx0 + A.u * sW;
  const y0 = sy0 + A.v * sH;
  const x1 = sx0 + B.u * sW;
  const y1 = sy0 + B.v * sH;
  const x2 = sx0 + C.u * sW;
  const y2 = sy0 + C.v * sH;

  const [u0, v0] = A.p;
  const [u1, v1] = B.p;
  const [u2, v2] = C.p;

  const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(det) < 1e-9) return;

  const a = ((u1 - u0) * (y2 - y0) - (u2 - u0) * (y1 - y0)) / det;
  const b = ((u2 - u0) * (x1 - x0) - (u1 - u0) * (x2 - x0)) / det;
  const c = ((v1 - v0) * (y2 - y0) - (v2 - v0) * (y1 - y0)) / det;
  const d = ((v2 - v0) * (x1 - x0) - (v1 - v0) * (x2 - x0)) / det;
  const e = u0 - a * x0 - b * y0;
  const f = v0 - c * x0 - d * y0;

  ctx.save();
  ctx.beginPath();
  const cx = (u0 + u1 + u2) / 3;
  const cy = (v0 + v1 + v2) / 3;
  const grow = (px, py) => {
    const dx = px - cx;
    const dy = py - cy;
    const len = Math.hypot(dx, dy) || 1;
    return [px + (dx / len) * SEAM_OVERLAP, py + (dy / len) * SEAM_OVERLAP];
  };
  const [gx0, gy0] = grow(u0, v0);
  const [gx1, gy1] = grow(u1, v1);
  const [gx2, gy2] = grow(u2, v2);
  ctx.moveTo(gx0, gy0);
  ctx.lineTo(gx1, gy1);
  ctx.lineTo(gx2, gy2);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, c, b, d, e, f);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}


/**
 * Transfer the garment's shading onto the printed pixels — and only those.
 *
 * The light field is read from the pristine photograph, so it describes the
 * fabric rather than the composite that already carries the print. Each
 * pixel's correction is then weighted by the artwork layer's alpha, so
 * uncovered pixels are multiplied by exactly 1 and come through untouched.
 * That weighting is what removes the rectangular halo that used to surround a
 * rotated print.
 *
 * @param {CanvasRenderingContext2D} ctx  canvas holding mockup + artwork
 * @param {HTMLImageElement} mockupImage  the untouched photograph
 * @param {{canvas: HTMLCanvasElement, bounds: {x,y,w,h}}} layer
 */
export function applyFabricShading(ctx, mockupImage, layer) {
  const { bounds } = layer;
  const { x, y, w, h } = bounds;
  if (w <= 2 || h <= 2) return false;

  try {
    // Light field from the original fabric, sampled over the same region.
    const src = document.createElement("canvas");
    src.width = w;
    src.height = h;
    const sctx = src.getContext("2d", { willReadFrequently: true });
    sctx.drawImage(
      mockupImage,
      (x / ctx.canvas.width) * (mockupImage.naturalWidth || mockupImage.width),
      (y / ctx.canvas.height) * (mockupImage.naturalHeight || mockupImage.height),
      (w / ctx.canvas.width) * (mockupImage.naturalWidth || mockupImage.width),
      (h / ctx.canvas.height) * (mockupImage.naturalHeight || mockupImage.height),
      0,
      0,
      w,
      h,
    );
    const sd = sctx.getImageData(0, 0, w, h).data;

    // Alpha of the print itself.
    const ad = layer.canvas
      .getContext("2d", { willReadFrequently: true })
      .getImageData(0, 0, w, h).data;

    // Mean luminance over the *covered* pixels only — averaging the whole box
    // would drag the reference toward the background and tint the print.
    let mean = 0;
    let covered = 0;
    for (let i = 0; i < sd.length; i += 4) {
      if (ad[i + 3] < 8) continue;
      mean += 0.299 * sd[i] + 0.587 * sd[i + 1] + 0.114 * sd[i + 2];
      covered++;
    }
    if (covered < 16) return false;
    mean /= covered;
    if (mean < 8) return false; // near-black fabric carries no usable shading

    const target = ctx.getImageData(x, y, w, h);
    const td = target.data;

    for (let i = 0; i < td.length; i += 4) {
      const alpha = ad[i + 3];
      if (alpha < 8) continue; // not printed here — leave the photo alone
      const luma = 0.299 * sd[i] + 0.587 * sd[i + 1] + 0.114 * sd[i + 2];
      // Ratio around the mean: >1 where the fabric catches light, <1 in folds.
      let factor = 1 + (luma / mean - 1) * SHADING_STRENGTH * (alpha / 255);
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

  const layer = renderArtworkLayer(artworkImage, artwork, placement, canvas.width, canvas.height);
  if (!layer) return null;

  ctx.save();
  ctx.globalAlpha = placement.opacity / 100;
  ctx.drawImage(layer.canvas, layer.bounds.x, layer.bounds.y);
  ctx.restore();

  if (shading) applyFabricShading(ctx, mockupImage, layer);
  return layer.ink;
}
