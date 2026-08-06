// ============================================================
// Garment segmentation — produces a real shirt mask, not a box
// ============================================================
//
// WHY NOT A NEURAL SEGMENTER
// --------------------------
// The brief asks for placement that is *deterministic* rather than
// AI-estimated. A learned segmenter re-introduces exactly the variance we are
// trying to remove: its mask shifts with pose, lighting and crop, so the print
// rectangle derived from it shifts too. Classical region growing on a solid
// colour garment is fully deterministic — identical pixels in, identical mask
// out, every run — and on flat-colour POD blanks it is also *more* accurate
// than a body segmenter, because it snaps to the true fabric edge instead of
// to an anatomical torso estimate.
//
// The object detector is still used, but only to pick a search region. It
// never touches the geometry.
//
// HOW WRINKLES ARE IGNORED
// ------------------------
// A fold does not change what colour the fabric *is*, only how much light
// reaches it. Splitting colour into chromaticity (hue-ish, intensity
// invariant) and luminance (intensity) lets us match on chromaticity with a
// tight threshold and on luminance with a loose one. Folds, shadows and
// highlights move luminance a long way and chromaticity barely at all, so the
// region grows straight through them — which is the whole trick.

/** Long-edge resolution the mask is computed at. Fixed so results are
 *  resolution-independent: the same shot at 1000px and 4000px yields the same
 *  normalized mask. */
const WORK_SIZE = 256;

/** Chromaticity distance allowed within the garment. */
const CHROMA_TOL = 0.055;
/** Luminance distance allowed within the garment (0..1). Deliberately loose —
 *  this is the axis wrinkles and studio lighting move along. */
const LUMA_TOL = 0.42;
/** For near-grey garments chromaticity is numerically unstable, so we switch
 *  to a luminance-dominant metric below this saturation. */
const ACHROMATIC_SAT = 0.055;
const ACHROMATIC_LUMA_TOL = 0.15;
/** Even in the achromatic path a *little* chromaticity discrimination is kept.
 *  A white tee on a cream backdrop differs by ~0.013 here — without this gate
 *  the region grows straight out into the background. */
const ACHROMATIC_CHROMA_TOL = 0.012;

/**
 * Luminance-gradient above which growth is blocked.
 *
 * This is the safety net that thresholds alone cannot provide. A garment
 * boundary is a *sharp* luminance step (~0.1 over one or two pixels) even when
 * the two colours are similar; a fold is a *soft* ramp (~0.015 per pixel) even
 * when the luminance swing is large. Blocking on gradient therefore separates
 * "edge of the shirt" from "shadow on the shirt" by shape rather than by
 * colour — so a white shirt on cream stays contained, while folds still grow
 * through.
 */
const EDGE_BLOCK = 0.17;
/** A mask covering more of the frame than this has certainly leaked. */
const LEAK_RATIO = 0.82;

/**
 * @typedef {Object} GarmentMask
 * @property {Uint8Array} data   1 = garment, 0 = not, row-major
 * @property {number} width      mask width in working pixels
 * @property {number} height     mask height in working pixels
 * @property {number} confidence 0..1
 * @property {string} method     which tier produced it
 */

/** Split a pixel into shading-invariant chromaticity + luminance. */
function decompose(r, g, b) {
  const sum = r + g + b;
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (sum < 12) return { cr: 1 / 3, cg: 1 / 3, luma, sat: 0 };
  const cr = r / sum;
  const cg = g / sum;
  // Saturation proxy: how far chromaticity sits from the neutral point.
  const sat = Math.hypot(cr - 1 / 3, cg - 1 / 3);
  return { cr, cg, luma, sat };
}

function similar(a, b, achromatic) {
  const dc = Math.hypot(a.cr - b.cr, a.cg - b.cg);
  if (achromatic) {
    // Grey/black/white fabric: luminance carries the signal, but keep a tight
    // chromaticity gate so a warm-tinted backdrop is still rejected.
    return (
      Math.abs(a.luma - b.luma) <= ACHROMATIC_LUMA_TOL &&
      dc <= ACHROMATIC_CHROMA_TOL &&
      b.sat < ACHROMATIC_SAT * 2.2
    );
  }
  return dc <= CHROMA_TOL && Math.abs(a.luma - b.luma) <= LUMA_TOL;
}

/** Per-pixel luminance-gradient magnitude, via central differences. */
function gradientField(pixels, width, height) {
  const luma = new Float32Array(width * height);
  for (let i = 0, p = 0; i < luma.length; i++, p += 4) {
    luma[i] = (0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2]) / 255;
  }
  const grad = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx = luma[i + 1] - luma[i - 1];
      const gy = luma[i + width] - luma[i - width];
      grad[i] = Math.hypot(gx, gy);
    }
  }
  return grad;
}

/** Draw an image into a working-resolution canvas and read its pixels. */
function readPixels(image) {
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  const scale = WORK_SIZE / Math.max(iw, ih);
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, w, h);

  // Throws SecurityError on a tainted canvas; the caller degrades to a tier
  // that needs no pixel access.
  return { pixels: ctx.getImageData(0, 0, w, h).data, width: w, height: h };
}

/**
 * Pick the garment colour by sampling a grid across the expected chest band
 * and taking the largest chromaticity cluster. Sampling many points and
 * clustering (rather than averaging one patch) keeps necklaces, hair, skin and
 * background out of the seed colour.
 */
function findGarmentColor(pixels, width, roi) {
  const samples = [];
  const x0 = Math.round(roi.x + roi.w * 0.3);
  const x1 = Math.round(roi.x + roi.w * 0.7);
  const y0 = Math.round(roi.y + roi.h * 0.22);
  const y1 = Math.round(roi.y + roi.h * 0.55);

  for (let y = y0; y <= y1; y += 2) {
    for (let x = x0; x <= x1; x += 2) {
      const i = (y * width + x) * 4;
      if (pixels[i + 3] < 200) continue;
      samples.push({ ...decompose(pixels[i], pixels[i + 1], pixels[i + 2]), x, y });
    }
  }
  if (samples.length === 0) return null;

  // Greedy clustering in chromaticity+luma space. O(n·k) with tiny k.
  const clusters = [];
  for (const s of samples) {
    let hit = null;
    for (const c of clusters) {
      if (
        Math.hypot(c.cr - s.cr, c.cg - s.cg) < CHROMA_TOL * 0.9 &&
        Math.abs(c.luma - s.luma) < 0.3
      ) {
        hit = c;
        break;
      }
    }
    if (hit) {
      hit.n++;
      hit.cr += (s.cr - hit.cr) / hit.n;
      hit.cg += (s.cg - hit.cg) / hit.n;
      hit.luma += (s.luma - hit.luma) / hit.n;
      hit.members.push(s);
    } else {
      clusters.push({ cr: s.cr, cg: s.cg, luma: s.luma, sat: s.sat, n: 1, members: [s] });
    }
  }

  clusters.sort((a, b) => b.n - a.n);
  const best = clusters[0];
  // Coverage of the dominant cluster is a good early confidence signal: a
  // clean blank shirt gives one big cluster, a busy crop gives many small ones.
  best.coverage = best.n / samples.length;
  return best;
}

/** Multi-seed BFS region grow constrained to garment colour and bounded by
 *  luminance edges. */
function growRegion(pixels, width, height, seedColor, seeds, grad) {
  const mask = new Uint8Array(width * height);
  const achromatic = seedColor.sat < ACHROMATIC_SAT;
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  for (const s of seeds) {
    const idx = s.y * width + s.x;
    if (!mask[idx]) {
      mask[idx] = 1;
      queue[tail++] = idx;
    }
  }

  while (head < tail) {
    const idx = queue[head++];
    const x = idx % width;
    const y = (idx / width) | 0;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (mask[nIdx]) continue;

        const p = nIdx * 4;
        if (pixels[p + 3] < 200) continue;
        // Never cross a hard edge — that is the garment outline.
        if (grad[nIdx] > EDGE_BLOCK) continue;
        const c = decompose(pixels[p], pixels[p + 1], pixels[p + 2]);
        if (similar(seedColor, c, achromatic)) {
          mask[nIdx] = 1;
          queue[tail++] = nIdx;
        }
      }
    }
  }
  return mask;
}

// ---- morphology ------------------------------------------------------

function dilate(mask, width, height) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (mask[i]) {
        out[i] = 1;
        continue;
      }
      let hit = 0;
      for (let dy = -1; dy <= 1 && !hit; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (mask[ny * width + nx]) {
            hit = 1;
            break;
          }
        }
      }
      out[i] = hit;
    }
  }
  return out;
}

function erode(mask, width, height) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      let all = 1;
      for (let dy = -1; dy <= 1 && all; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            all = 0;
            break;
          }
          if (!mask[ny * width + nx]) {
            all = 0;
            break;
          }
        }
      }
      out[i] = all;
    }
  }
  return out;
}

/**
 * Close then open: seals fold gaps, then drops speckle.
 *
 * The close is deliberately wide (4 dilations). Real garment photography puts
 * sharp shadow lines in the fabric — a deep fold on an oversized tee reads as
 * a hard edge, not a soft ramp — so the grow stage leaves the shirt in
 * fragments. Without a close wide enough to bridge those seams,
 * `largestComponent` keeps one fragment and the torso measures half its true
 * width, which is what produced absurdly small prints.
 */
function cleanup(mask, width, height) {
  let m = mask;
  for (let i = 0; i < 4; i++) m = dilate(m, width, height);
  for (let i = 0; i < 5; i++) m = erode(m, width, height);
  m = dilate(m, width, height);
  return m;
}

/** Keep only the largest 4-connected component — drops background patches
 *  that happen to share the shirt's colour. */
function largestComponent(mask, width, height) {
  const labels = new Int32Array(mask.length).fill(-1);
  const queue = new Int32Array(mask.length);
  let bestLabel = -1;
  let bestSize = 0;
  let label = 0;

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = label;
    let size = 0;

    while (head < tail) {
      const idx = queue[head++];
      size++;
      const x = idx % width;
      const y = (idx / width) | 0;
      const neighbours = [
        x > 0 ? idx - 1 : -1,
        x < width - 1 ? idx + 1 : -1,
        y > 0 ? idx - width : -1,
        y < height - 1 ? idx + width : -1,
      ];
      for (const n of neighbours) {
        if (n >= 0 && mask[n] && labels[n] === -1) {
          labels[n] = label;
          queue[tail++] = n;
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = label;
    }
    label++;
  }

  const out = new Uint8Array(mask.length);
  if (bestLabel === -1) return { mask: out, size: 0 };
  for (let i = 0; i < mask.length; i++) if (labels[i] === bestLabel) out[i] = 1;
  return { mask: out, size: bestSize };
}

/**
 * Segment the garment.
 *
 * @param {HTMLImageElement} image
 * @param {{x:number,y:number,w:number,h:number}|null} roiNorm
 *        Normalized region of interest (from the person detector), or null to
 *        use a centred prior.
 * @returns {GarmentMask|null}
 */
export function segmentGarment(image, roiNorm) {
  let read;
  try {
    read = readPixels(image);
  } catch {
    return null; // tainted canvas — caller degrades
  }
  const { pixels, width, height } = read;

  const roi = roiNorm
    ? {
        x: roiNorm.x * width,
        y: roiNorm.y * height,
        w: roiNorm.w * width,
        h: roiNorm.h * height,
      }
    : { x: width * 0.2, y: height * 0.1, w: width * 0.6, h: height * 0.8 };

  const color = findGarmentColor(pixels, width, roi);
  if (!color) return null;

  // Seed from the cluster members themselves — every one is already known to
  // be garment-coloured, so the fill starts from solid ground.
  const seeds = color.members.filter((_, i) => i % 3 === 0).slice(0, 400);
  if (seeds.length === 0) return null;

  const grad = gradientField(pixels, width, height);
  let mask = growRegion(pixels, width, height, color, seeds, grad);
  mask = cleanup(mask, width, height);
  const { mask: largest, size } = largestComponent(mask, width, height);

  // A region covering most of the frame is a leak into the background, not a
  // garment. Reject it so the caller's second pass or fallback takes over
  // rather than printing onto a bogus chest area.
  if (size > width * height * LEAK_RATIO) return null;

  const fillRatio = size / (roi.w * roi.h);
  // Confidence blends "did the seed look like one clean fabric" with "did the
  // grown region come out a plausible size for a torso inside the ROI".
  const sizeScore = fillRatio > 0.12 && fillRatio < 1.6 ? 1 : Math.max(0, 1 - Math.abs(fillRatio - 0.5));
  const confidence = Math.max(0, Math.min(1, color.coverage * 0.55 + sizeScore * 0.45));

  return {
    data: largest,
    width,
    height,
    confidence,
    method: roiNorm ? "region-grow+roi" : "region-grow+prior",
  };
}
