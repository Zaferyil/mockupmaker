// ============================================================
// Homography — the projective map between two quadrilaterals
// ============================================================
//
// A garment photographed straight on presents its chest as a rectangle. Turn
// the model, and that rectangle becomes a trapezoid: the near shoulder is
// closer to the lens, so it images wider than the far one. Scaling and
// rotation cannot express that — only a projective transform can, because only
// a projective transform lets parallel lines converge.
//
// This module is deliberately pure arithmetic: no canvas, no DOM, no model.
// Given four point correspondences it returns the 3×3 matrix mapping one quad
// onto the other, which makes it trivially testable and impossible to make
// non-deterministic.

/**
 * Solve the 3×3 homography H with H·src = dst for four correspondences.
 *
 * Eight unknowns (h33 is fixed at 1), eight equations — two per point pair.
 * Built as a linear system and solved by Gaussian elimination with partial
 * pivoting, which is stable enough at this size and avoids pulling in a matrix
 * library for one function.
 *
 * @param {Array<[number,number]>} src four source points
 * @param {Array<[number,number]>} dst four destination points
 * @returns {number[]|null} row-major 3×3, or null if the quad is degenerate
 */
export function solveHomography(src, dst) {
  if (src.length !== 4 || dst.length !== 4) return null;

  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  const h = solveLinear(A, b);
  if (!h) return null;
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/** Gaussian elimination with partial pivoting. Mutates copies, not the inputs. */
function solveLinear(Ain, bin) {
  const n = bin.length;
  const M = Ain.map((row, i) => [...row, bin[i]]);

  for (let col = 0; col < n; col++) {
    // Pivot on the largest magnitude to keep the division well-conditioned.
    let best = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[best][col])) best = r;
    }
    if (Math.abs(M[best][col]) < 1e-12) return null; // singular — degenerate quad
    if (best !== col) {
      const t = M[best];
      M[best] = M[col];
      M[col] = t;
    }

    const pivot = M[col][col];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / pivot;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }

  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = M[i][n] / M[i][i];
  return out;
}

/** Apply a homography to a point. */
export function project(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  if (Math.abs(w) < 1e-12) return [x, y];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

/**
 * Homography mapping the unit square onto a quad.
 *
 * Quads are given corner-first clockwise from top-left, matching the order the
 * rest of the pipeline uses: [tl, tr, br, bl].
 */
export function unitSquareTo(quad) {
  return solveHomography(
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    quad,
  );
}

/**
 * Map a rectangle expressed in a quad's own normalized space into image space.
 *
 * This is how a print area inside a torso inherits the torso's perspective: the
 * rectangle is defined in flat local coordinates, and the quad's projective map
 * carries it into the photograph — so a print sitting mid-chest on a turned
 * model comes out trapezoidal to exactly the degree the torso is.
 *
 * @param {Array<[number,number]>} quad target quad [tl,tr,br,bl]
 * @param {{x:number,y:number,w:number,h:number}} rect in 0..1 local space
 * @returns {Array<[number,number]>|null} the mapped quad
 */
export function mapRectIntoQuad(quad, rect) {
  const H = unitSquareTo(quad);
  if (!H) return null;
  const { x, y, w, h } = rect;
  return [
    project(H, x, y),
    project(H, x + w, y),
    project(H, x + w, y + h),
    project(H, x, y + h),
  ];
}

/**
 * How far a quad departs from a parallelogram, as a fraction of its width.
 *
 * Used as the gate for warping at all: below a couple of percent the taper is
 * measurement noise rather than perspective, and warping on noise costs
 * sharpness for no visible gain, so a straight-on shot stays pixel-clean.
 */
export function quadTaper(quad) {
  const [tl, tr, br, bl] = quad;
  const topW = Math.hypot(tr[0] - tl[0], tr[1] - tl[1]);
  const botW = Math.hypot(br[0] - bl[0], br[1] - bl[1]);
  const maxW = Math.max(topW, botW);
  if (maxW < 1e-9) return 0;

  const widthTaper = Math.abs(topW - botW) / maxW;

  // A turned torso also shears: the two vertical edges stop being parallel.
  const leftAngle = Math.atan2(bl[1] - tl[1], bl[0] - tl[0]);
  const rightAngle = Math.atan2(br[1] - tr[1], br[0] - tr[0]);
  const shear = Math.abs(leftAngle - rightAngle) / Math.PI;

  return Math.max(widthTaper, shear);
}
