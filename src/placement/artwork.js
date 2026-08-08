// ============================================================
// Artwork analysis — measures the design, not the PNG canvas
// ============================================================
//
// WHY THIS EXISTS
// ---------------
// Exported POD artwork almost never fills its own canvas. A 4500x5400 PNG
// routinely carries 10-25% transparent margin, and the margin is rarely
// symmetric. Scaling by the *canvas* box therefore does two wrong things at
// once: the design renders smaller than requested, and it sits off-centre by
// half the margin asymmetry.
//
// That single bug explains "some are shifted left, some are shifted right,
// some are slightly resized" better than any detection failure does, because
// it varies per artwork file rather than per mockup.
//
// Everything downstream consumes the *trimmed* box: the visible ink is what
// gets centred and scaled, and the transparent padding is carried along as a
// render-time offset.

/** Resolution the alpha scan runs at. Trim ratios are scale-invariant, so a
 *  small scan is exact enough and keeps large PNGs cheap. */
const SCAN_SIZE = 400;
/** Alpha at or below this is treated as empty. Catches near-transparent
 *  anti-aliased fringes that would otherwise inflate the visible box. */
const ALPHA_FLOOR = 12;

/**
 * @typedef {Object} ArtworkAnalysis
 * @property {number} canvasWidth      px, full PNG
 * @property {number} canvasHeight     px, full PNG
 * @property {number} canvasAspect     canvas w/h
 * @property {{x:number,y:number,w:number,h:number}} trim
 *           Visible ink box as fractions of the canvas.
 * @property {number} visibleAspect    trimmed w/h — the ratio that matters
 * @property {'portrait'|'landscape'|'square'} orientation
 * @property {number} inkCoverage      0..1 fraction of trimmed box with ink
 * @property {number} paddingRatio     0..1 fraction of canvas that is padding
 * @property {number} recommendedWidthOfChest
 *           Fraction of printable chest width this artwork should occupy.
 * @property {boolean} hasAlpha
 */

/**
 * Measure an artwork image.
 * @param {HTMLImageElement} image
 * @returns {ArtworkAnalysis}
 */
export function analyzeArtwork(image) {
  const cw = image.naturalWidth || image.width;
  const ch = image.naturalHeight || image.height;
  const canvasAspect = cw / ch;

  const fallback = () => ({
    canvasWidth: cw,
    canvasHeight: ch,
    canvasAspect,
    trim: { x: 0, y: 0, w: 1, h: 1 },
    visibleAspect: canvasAspect,
    orientation: orientationOf(canvasAspect),
    inkCoverage: 1,
    paddingRatio: 0,
    recommendedWidthOfChest: recommendFor(canvasAspect),
    hasAlpha: false,
  });

  const scale = Math.min(1, SCAN_SIZE / Math.max(cw, ch));
  const w = Math.max(1, Math.round(cw * scale));
  const h = Math.max(1, Math.round(ch * scale));

  let data;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(image, 0, 0, w, h);
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return fallback();
  }

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let inkPixels = 0;
  let anyTransparent = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      if (a <= ALPHA_FLOOR) {
        anyTransparent = true;
        continue;
      }
      inkPixels++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  // Fully opaque or fully empty — nothing to trim.
  if (maxX < 0) return fallback();

  // The trim box must contain EVERY visible pixel.
  //
  // An earlier version discarded a fraction of a percent of the ink mass at
  // each edge, on the theory that scattered decoration should not decide the
  // design's size. That was wrong, and backwards: the excluded pixels are
  // still drawn. The renderer scales the whole PNG so that the *trim* box
  // lands on the placement box, so anything cropped out of the trim renders
  // outside the placement — scattered hearts and flowers ended up past the
  // garment entirely, and the tighter the trim the larger the overspill.
  //
  // Bounding every visible pixel is what makes "the design exactly fills its
  // box" true, and that identity is what keeps the box, the preview and the
  // export describing the same thing.
  const trim = {
    x: minX / w,
    y: minY / h,
    w: (maxX - minX + 1) / w,
    h: (maxY - minY + 1) / h,
  };

  const visibleAspect = (trim.w * cw) / (trim.h * ch);
  const trimmedArea = (maxX - minX + 1) * (maxY - minY + 1);

  return {
    canvasWidth: cw,
    canvasHeight: ch,
    canvasAspect,
    trim,
    visibleAspect,
    orientation: orientationOf(visibleAspect),
    inkCoverage: trimmedArea > 0 ? inkPixels / trimmedArea : 1,
    paddingRatio: 1 - trim.w * trim.h,
    recommendedWidthOfChest: recommendFor(visibleAspect),
    hasAlpha: anyTransparent,
  };
}

function orientationOf(aspect) {
  if (aspect > 1.15) return "landscape";
  if (aspect < 0.87) return "portrait";
  return "square";
}

/**
 * How much of the printable chest width this artwork should occupy.
 *
 * Mirrors how real POD print files are specified: a wide design is limited by
 * chest width, a tall design is limited by chest height, and a tall design
 * that used the full width would run from collar to hem and look wrong. These
 * ratios are the standard commercial proportions, not tuned constants.
 */
function recommendFor(aspect) {
  if (aspect > 1.6) return 0.96; // banner — width-bound
  if (aspect > 1.15) return 0.92; // landscape
  if (aspect >= 0.87) return 0.86; // square
  if (aspect > 0.6) return 0.78; // portrait
  return 0.66; // tall/vertical — height-bound, keep it off the hem
}

/**
 * Where to draw the *full* PNG so that its visible ink lands exactly on the
 * target rectangle.
 *
 * The renderer is given a target for the ink. Because the PNG carries padding,
 * the full bitmap has to be drawn larger than that target and offset by the
 * padding — this returns those numbers so the compositor stays dumb.
 *
 * @param {ArtworkAnalysis} art
 * @param {{x:number,y:number,w:number,h:number}} inkTarget  px rect for the ink
 * @returns {{x:number,y:number,w:number,h:number}} px rect for the whole PNG
 */
export function canvasRectForInk(art, inkTarget) {
  const { trim } = art;
  if (trim.w <= 0 || trim.h <= 0) return inkTarget;
  const fullW = inkTarget.w / trim.w;
  const fullH = inkTarget.h / trim.h;
  return {
    x: inkTarget.x - trim.x * fullW,
    y: inkTarget.y - trim.y * fullH,
    w: fullW,
    h: fullH,
  };
}
