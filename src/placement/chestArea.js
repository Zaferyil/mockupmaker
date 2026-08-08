// ============================================================
// Chest area — landmarks and the printable region, from the mask
// ============================================================
//
// WHY LANDMARKS INSTEAD OF FRACTIONS OF A BOX
// -------------------------------------------
// The old code derived the print area from fractions of a person bounding box
// (`py + ph * 0.15`). A bounding box changes shape with pose and crop, so the
// same shirt photographed sitting vs standing produced print rectangles at
// different heights — which is exactly the "some too high, some too low"
// symptom.
//
// Garment landmarks do not move with pose. The collar is the collar whether
// the model is sitting, walking or leaning. So every number here is anchored
// to a landmark (collar bottom, shoulder line, armpit, torso centre axis) and
// then expressed as a multiple of *torso width*.
//
// Torso width is the unit that makes this scale- and camera-invariant: a 12in
// print on a 20in chest is 0.6 chest-widths whether the camera was two metres
// away or five. Nothing here is measured in pixels or in image fractions.
//
// EVERY MOCKUP IS MEASURED INDEPENDENTLY. No constant in this file encodes an
// assumption about a particular shot, pose or framing.

/** Print band geometry, in multiples of torso width. These are the standard
 *  commercial proportions for an adult front chest print. */
const COLLAR_DROP = 0.13; // gap between collar bottom and print top
const MAX_PRINT_HEIGHT = 0.8; // print band height ceiling
// Keep well off the side seams. A real chest print spans roughly 11-12in on a
// 20-22in garment width, i.e. a little over half. Leaving only 6% each side
// produced prints running seam to seam.
const SIDE_SAFE = 0.18;

/**
 * @typedef {Object} ChestArea
 * @property {number} centerX      normalized 0..1
 * @property {number} centerY      normalized 0..1
 * @property {number} width        normalized fraction of image width
 * @property {number} height       normalized fraction of image height
 * @property {number} rotation     degrees
 * @property {number[]|null} perspective normalized quad, 8 numbers
 * @property {number} confidence   0..1
 * @property {Object} landmarks    diagnostic detail
 * @property {Object} analysis     pose / angle / occlusion report
 */

const median = (arr) => {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Row-wise run-length encoding of the mask. */
function encodeRows(mask, width, height) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    const runs = [];
    let start = -1;
    for (let x = 0; x < width; x++) {
      const on = mask[y * width + x] === 1;
      if (on && start === -1) start = x;
      if ((!on || x === width - 1) && start !== -1) {
        const end = on ? x : x - 1;
        // Discard hairline runs — jewellery edges, stray antialiasing.
        if (end - start >= 2) runs.push({ x0: start, x1: end, w: end - start + 1 });
        start = -1;
      }
    }
    const total = runs.reduce((s, r) => s + r.w, 0);
    rows.push({ y, runs, total });
  }
  return rows;
}

/** The run on a given row that straddles the torso axis. */
function runAtAxis(row, axisX) {
  return row.runs.find((r) => r.x0 <= axisX && r.x1 >= axisX) ?? null;
}

export function computeChestArea(garment, artwork) {
  const { data: mask, width, height } = garment;
  const rows = encodeRows(mask, width, height);

  const filled = rows.filter((r) => r.total > 0);
  if (filled.length < 8) return null;

  const topY = filled[0].y;
  const bottomY = filled[filled.length - 1].y;
  const garmentHeight = bottomY - topY;
  if (garmentHeight < 8) return null;

  // Torso axis: median centre of the widest rows, which are the shoulder/sleeve
  // band and therefore the most reliable indicator of where the body is.
  const sorted = [...filled].sort((a, b) => b.total - a.total);
  const widest = sorted.slice(0, Math.max(3, Math.floor(filled.length * 0.2)));
  const axisX = Math.round(
    median(
      widest.map((r) => {
        const lo = Math.min(...r.runs.map((x) => x.x0));
        const hi = Math.max(...r.runs.map((x) => x.x1));
        return (lo + hi) / 2;
      }),
    ),
  );

  // ---- collar -------------------------------------------------------
  // The neck opening is a gap that *straddles the torso axis*: fabric on both
  // sides, skin in the middle. A gap between a sleeve and the body is lateral
  // and never contains the axis, which is how the two are told apart.
  let collarBottomY = topY;
  const collarSearchEnd = topY + Math.max(4, Math.round(garmentHeight * 0.42));
  for (let y = topY; y <= Math.min(collarSearchEnd, bottomY); y++) {
    const row = rows[y];
    if (row.runs.length < 2) continue;
    const straddles = row.runs.some((r) => r.x1 < axisX) && row.runs.some((r) => r.x0 > axisX);
    if (straddles && !runAtAxis(row, axisX)) collarBottomY = y;
  }
  // No detectable notch (flat-lay, or collar out of frame): fall back to a
  // proportional drop from the garment top.
  const collarDetected = collarBottomY > topY;
  if (!collarDetected) collarBottomY = topY + Math.round(garmentHeight * 0.1);

  // ---- armpit / torso width ----------------------------------------
  // Above the armpit the axis run includes both sleeves, so it is wide. Below
  // it the run is the torso alone. The armpit is the sharpest drop in that
  // run's width.
  const axisWidths = [];
  for (let y = topY; y <= bottomY; y++) {
    const run = runAtAxis(rows[y], axisX);
    axisWidths.push({ y, w: run ? run.w : 0 });
  }

  let armpitY = collarBottomY + Math.round(garmentHeight * 0.25);
  let sharpestDrop = 0;
  const scanFrom = Math.round(topY + garmentHeight * 0.12);
  const scanTo = Math.round(topY + garmentHeight * 0.62);
  for (let y = scanFrom; y < scanTo; y++) {
    const a = axisWidths[y - topY]?.w ?? 0;
    const b = axisWidths[y - topY + 3]?.w ?? 0;
    const drop = a - b;
    if (drop > sharpestDrop) {
      sharpestDrop = drop;
      armpitY = y + 3;
    }
  }

  // Torso width: median axis-run width from the armpit down. Median rejects
  // the rows where a hand, a mug or a phone cuts into the silhouette.
  const torsoBandStart = Math.max(armpitY, collarBottomY + 2);
  const torsoBandEnd = Math.min(bottomY, torsoBandStart + Math.round(garmentHeight * 0.55));
  const torsoWidths = [];
  const torsoCenters = [];
  const leftEdges = [];
  const rightEdges = [];
  for (let y = torsoBandStart; y <= torsoBandEnd; y++) {
    const row = rows[y];
    const run = runAtAxis(row, axisX);
    if (!run) continue;

    // Below the armpit there are no sleeves, so the garment's true width is
    // the full silhouette — not just the run through the axis. Deep folds can
    // still split a row into neighbouring runs; merging any run that touches
    // the torso recovers the real width instead of measuring one fragment.
    let x0 = run.x0;
    let x1 = run.x1;
    const reach = run.w * 0.55;
    for (const r of row.runs) {
      if (r === run) continue;
      if (r.x1 >= x0 - reach && r.x0 <= x1 + reach) {
        x0 = Math.min(x0, r.x0);
        x1 = Math.max(x1, r.x1);
      }
    }

    torsoWidths.push(x1 - x0 + 1);
    torsoCenters.push({ y, cx: (x0 + x1) / 2 });
    leftEdges.push({ y, x: x0 });
    rightEdges.push({ y, x: x1 });
  }
  if (torsoWidths.length < 4) return null;
  const torsoWidth = median(torsoWidths);
  if (torsoWidth < 6) return null;

  // ---- tilt ----------------------------------------------------------
  const rotation = fitTilt(torsoCenters, torsoWidth);

  // ---- print band ----------------------------------------------------
  const printTopY = collarBottomY + COLLAR_DROP * torsoWidth;
  const availableH = Math.min(
    MAX_PRINT_HEIGHT * torsoWidth,
    bottomY - printTopY - 0.08 * torsoWidth,
  );
  if (availableH <= 4) return null;

  const bandCenterY = printTopY + availableH / 2;
  const centerXAtBand = interpolateCenter(torsoCenters, bandCenterY, axisX);

  const usableWidth = torsoWidth * (1 - SIDE_SAFE * 2);
  // The artwork's own analysis decides how much of the chest it should take —
  // a banner fills the width, a tall design must not run to the hem.
  const recommended = artwork?.recommendedWidthOfChest ?? 0.86;
  let printWidth = usableWidth * recommended;

  // ---- occlusion ------------------------------------------------------
  // Arms folded across the chest, hair, a mug, a necklace: all of them are
  // holes in the garment mask inside the print band. Measure them, and pull
  // the band in if they intrude.
  const occlusion = measureOcclusion(
    mask,
    width,
    height,
    centerXAtBand,
    bandCenterY,
    printWidth,
    availableH,
  );

  let printHeight = availableH;
  let finalCenterY = bandCenterY;
  if (occlusion.ratio > 0.12 && occlusion.clean) {
    // Retreat to the largest clean horizontal band rather than printing over
    // an arm.
    printHeight = occlusion.clean.h;
    finalCenterY = occlusion.clean.cy;
    printWidth = Math.min(printWidth, occlusion.clean.w);
  }

  // ---- perspective ----------------------------------------------------
  const perspective = buildPerspectiveQuad(
    leftEdges,
    rightEdges,
    printTopY,
    printTopY + printHeight,
    width,
    height,
  );

  const confidence = scoreConfidence({
    garment,
    collarDetected,
    torsoWidths,
    torsoWidth,
    occlusion,
    garmentHeight,
    height,
  });

  return {
    centerX: centerXAtBand / width,
    centerY: finalCenterY / height,
    width: printWidth / width,
    height: printHeight / height,
    rotation,
    perspective,
    confidence,
    landmarks: {
      collarBottom: collarBottomY / height,
      shoulderTop: topY / height,
      armpit: armpitY / height,
      hem: bottomY / height,
      torsoWidth: torsoWidth / width,
      axisX: axisX / width,
    },
    analysis: {
      pose: classifyPose(rotation, garmentHeight / height, torsoWidth / width),
      cameraAngle: classifyAngle(leftEdges, rightEdges, axisX),
      shirtTilt: rotation,
      occlusionRatio: occlusion.ratio,
      occluded: occlusion.ratio > 0.12,
      collarDetected,
    },
  };
}

/**
 * Tilt of the torso centre line, in degrees — or 0 when the evidence is weak.
 *
 * The centre line is a *noisy* estimator. A hand resting against the hip, a
 * sleeve hanging wider on one side, or a slightly turned body all shift the
 * silhouette centre without the print needing to rotate at all. Fitting a line
 * through that noise produced tilts of up to 18 degrees on models who were
 * sitting essentially upright, and a wrongly rotated print is far more visible
 * — and far worse commercially — than a missed real tilt.
 *
 * So the fit now has to earn its result: the residual must be small relative to
 * the torso width, and the magnitude is clamped hard. Anything short of clear
 * evidence returns exactly 0.
 */
function fitTilt(centers, torsoWidth) {
  const n = centers.length;
  if (n < 8) return 0;

  let sy = 0;
  let sx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of centers) {
    sy += p.y;
    sx += p.cx;
    syy += p.y * p.y;
    sxy += p.y * p.cx;
  }
  const denom = n * syy - sy * sy;
  if (Math.abs(denom) < 1e-6) return 0;

  const slope = (n * sxy - sy * sx) / denom; // dx/dy
  const intercept = (sx - slope * sy) / n;

  // Residual: how well a straight line actually describes the centre line.
  let sse = 0;
  for (const p of centers) {
    const predicted = slope * p.y + intercept;
    sse += (p.cx - predicted) ** 2;
  }
  const rms = Math.sqrt(sse / n);

  // A wandering centre line means the silhouette is asymmetric, not tilted.
  if (torsoWidth > 0 && rms / torsoWidth > 0.06) return 0;

  const deg = Math.atan(slope) * (180 / Math.PI);

  // Same deadzone the pose path uses. A silhouette centre-line tilt of a couple
  // of degrees is measurement noise, and it was reaching the output as a
  // visible 2.5-degree rotation on prints that should have been square. Both
  // paths now have to clear the same bar before anything is rotated.
  if (Math.abs(deg) < 9) return 0;
  return Math.max(-6, Math.min(6, Math.sign(deg) * (Math.abs(deg) - 9) * 0.5));
}

function interpolateCenter(centers, y, fallback) {
  if (centers.length === 0) return fallback;
  let best = centers[0];
  let bestD = Math.abs(centers[0].y - y);
  for (const c of centers) {
    const d = Math.abs(c.y - y);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best.cx;
}

/**
 * Fraction of the print band that is not garment, plus the tallest fully clean
 * sub-band to retreat to.
 */
function measureOcclusion(mask, width, height, cx, cy, w, h) {
  const x0 = Math.max(0, Math.round(cx - w / 2));
  const x1 = Math.min(width - 1, Math.round(cx + w / 2));
  const y0 = Math.max(0, Math.round(cy - h / 2));
  const y1 = Math.min(height - 1, Math.round(cy + h / 2));
  if (x1 <= x0 || y1 <= y0) return { ratio: 0, clean: null };

  let holes = 0;
  let total = 0;
  const rowClean = [];
  for (let y = y0; y <= y1; y++) {
    let rowHoles = 0;
    for (let x = x0; x <= x1; x++) {
      total++;
      if (mask[y * width + x] !== 1) {
        holes++;
        rowHoles++;
      }
    }
    rowClean.push(rowHoles / (x1 - x0 + 1) < 0.04);
  }

  // Longest consecutive run of clean rows.
  let bestLen = 0;
  let bestStart = 0;
  let curLen = 0;
  let curStart = 0;
  for (let i = 0; i < rowClean.length; i++) {
    if (rowClean[i]) {
      if (curLen === 0) curStart = i;
      curLen++;
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
    } else {
      curLen = 0;
    }
  }

  const clean =
    bestLen > 6
      ? {
          h: bestLen,
          cy: y0 + bestStart + bestLen / 2,
          w: x1 - x0 + 1,
        }
      : null;

  return { ratio: total > 0 ? holes / total : 0, clean };
}

/**
 * Trapezoid formed by the garment's own left and right edges across the print
 * band. This is a measurement of the fabric silhouette, not an inference about
 * 3D shape — when the model is turned, the two edges converge and the quad
 * reproduces that convergence.
 */
function buildPerspectiveQuad(leftEdges, rightEdges, yTop, yBottom, width, height) {
  const near = (arr, y) =>
    arr.reduce((best, p) => (Math.abs(p.y - y) < Math.abs(best.y - y) ? p : best), arr[0]);
  if (leftEdges.length < 4 || rightEdges.length < 4) return null;

  const lt = near(leftEdges, yTop);
  const lb = near(leftEdges, yBottom);
  const rt = near(rightEdges, yTop);
  const rb = near(rightEdges, yBottom);

  const topW = rt.x - lt.x;
  const botW = rb.x - lb.x;
  if (topW <= 0 || botW <= 0) return null;

  // A sub-2% taper is noise, not perspective; skip the warp entirely so a
  // straight-on shot stays pixel-clean.
  const taper = Math.abs(topW - botW) / Math.max(topW, botW);
  if (taper < 0.02) return null;

  return [
    lt.x / width,
    yTop / height,
    rt.x / width,
    yTop / height,
    rb.x / width,
    yBottom / height,
    lb.x / width,
    yBottom / height,
  ];
}

function scoreConfidence({
  garment,
  collarDetected,
  torsoWidths,
  torsoWidth,
  occlusion,
  garmentHeight,
  height,
}) {
  // Consistency of the torso width down the body — a clean segmentation gives
  // a near-constant width, a leaky one wobbles.
  const spread = median(torsoWidths.map((w) => Math.abs(w - torsoWidth))) / torsoWidth;
  const stability = Math.max(0, 1 - spread * 3);
  const framing = Math.min(1, garmentHeight / (height * 0.35));
  const clear = Math.max(0, 1 - occlusion.ratio * 2.5);

  return Math.max(
    0,
    Math.min(
      1,
      garment.confidence * 0.3 +
        stability * 0.3 +
        clear * 0.2 +
        framing * 0.12 +
        (collarDetected ? 0.08 : 0),
    ),
  );
}

function classifyPose(rotation, garmentHeightNorm, torsoWidthNorm) {
  const tilt = Math.abs(rotation);
  if (tilt > 9) return "leaning";
  // A seated torso is foreshortened: wide relative to its visible height.
  if (garmentHeightNorm < 0.42 && torsoWidthNorm > 0.3) return "seated";
  if (tilt > 4) return "relaxed";
  return "standing";
}

function classifyAngle(leftEdges, rightEdges, axisX) {
  if (leftEdges.length < 4 || rightEdges.length < 4) return "unknown";
  const l = median(leftEdges.map((p) => p.x));
  const r = median(rightEdges.map((p) => p.x));
  const leftSpan = axisX - l;
  const rightSpan = r - axisX;
  if (leftSpan <= 0 || rightSpan <= 0) return "unknown";
  const ratio = leftSpan / rightSpan;
  if (ratio > 1.25) return "turned-right";
  if (ratio < 0.8) return "turned-left";
  return "frontal";
}
