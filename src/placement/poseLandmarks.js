// ============================================================
// Pose landmarks — the print area from anatomy, not from colour
// ============================================================
//
// WHY THIS REPLACES COLOUR SEGMENTATION FOR MODEL SHOTS
// -----------------------------------------------------
// Region growing measures the *garment*, which means it has to separate shirt
// from room using colour. On real lifestyle photography that is a losing
// battle: a beige wall, a cream sofa and pale wood often differ from the shirt
// by less than the shirt's own fold shadows do. Tightening the threshold
// fragments the garment, loosening it leaks into the furniture, and no single
// value serves twelve different scenes.
//
// Pose estimation sidesteps the problem entirely. Shoulders and hips are found
// from body structure, so the answer does not depend on what colour the shirt
// is, what is behind it, or how creased it is. And because the landmarks are
// anatomical, a seated model and a standing one are handled by the same
// arithmetic — no pose classification, no special cases.
//
// The chest print area is then pure anatomy:
//
//   width   ∝ shoulder separation
//   top     ∝ a fraction of that separation below the shoulder line
//   axis    = shoulder midpoint → hip midpoint
//   rotation= the shoulder line's own tilt
//
// Every one of those is a measurement, not a guess, and every one is invariant
// to camera distance because it is expressed as a multiple of shoulder width.

import * as tf from "@tensorflow/tfjs";
import * as poseDetection from "@tensorflow-models/pose-detection";
import { mapRectIntoQuad, quadTaper } from "./homography.js";
import { PERSPECTIVE_ENABLED } from "./contract.js";

/**
 * Bring a usable TFJS backend up before any model touches a tensor.
 *
 * pose-detection registers a WebGPU backend, which then wins tfjs's priority
 * ordering — but registration is not initialisation, so the first tensor
 * allocation throws "The highest priority backend 'webgpu' has not yet been
 * initialized". WebGL is asked for first because it is the mature path for
 * these models and is available essentially everywhere; if it cannot start we
 * fall back to whatever `tf.ready()` settles on, including plain CPU.
 */
let backendPromise = null;
function ensureBackend() {
  if (!backendPromise) {
    backendPromise = (async () => {
      try {
        await tf.setBackend("webgl");
        await tf.ready();
        if (tf.getBackend() === "webgl") return "webgl";
      } catch {
        /* fall through */
      }
      await tf.ready();
      return tf.getBackend();
    })().catch((err) => {
      backendPromise = null;
      throw err;
    });
  }
  return backendPromise;
}

/** Minimum keypoint score to trust a landmark. */
const MIN_SCORE = 0.35;

// Print geometry, in multiples of shoulder separation.
//
// Fitted to twelve hand-calibrated mockups rather than guessed: for each one,
// the shoulder landmarks were measured and solved against the box a human had
// actually chosen, then the medians taken. The first pass used textbook
// proportions and placed every print about a sixth of a shoulder-span too low
// and appreciably too narrow.
const TOP_BELOW_SHOULDER = 0.165; // print top, below the shoulder line
const PRINT_WIDTH = 0.9; // print width
const PRINT_HEIGHT = 0.943; // print height
/** Chest area cannot extend past this fraction of the shoulder→hip distance. */
const MAX_TORSO_FRACTION = 0.96;

/** Shoulder tilt below this is treated as a turned torso, not a lean. */
const ROTATION_DEADZONE = 9;
/** How much of the remaining tilt to actually apply. */
const ROTATION_DAMPING = 0.5;
const MAX_ROTATION = 6;

/** Below this much taper the torso is effectively flat; skip the warp. */
const MIN_TAPER = 0.03;

/**
 * Perspective warping is built and tested but not emitted. The switch lives in
 * the contract — see `PERSPECTIVE_ENABLED` there for why it is enforced at the
 * placement boundary rather than only here, where quads are produced.
 *
 * The quad is still computed and then discarded, so the code stays exercised by
 * the test suite instead of rotting.
 */
const EMIT_PERSPECTIVE = PERSPECTIVE_ENABLED;

let detectorPromise = null;
let detectorKey = null;

/**
 * @param {string} [modelUrl] Overrides the hosted weights. Only used by the
 *   offline test harness, which cannot reach the CDN; production leaves it
 *   unset and the packaged default URL is used.
 */
function loadDetector(modelUrl) {
  const key = modelUrl ?? "default";
  if (!detectorPromise || detectorKey !== key) {
    detectorKey = key;
    detectorPromise = ensureBackend()
      .then(() =>
        poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
          // Thunder over Lightning: these are still photographs, not video,
          // so accuracy is worth far more than milliseconds.
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER,
          ...(modelUrl ? { modelUrl } : {}),
        }),
      )
      .catch((err) => {
        detectorPromise = null;
        detectorKey = null;
        throw err;
      });
  }
  return detectorPromise;
}

const pick = (kps, name) => {
  const k = kps.find((p) => p.name === name);
  return k && k.score >= MIN_SCORE ? k : null;
};

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Detect the chest print area from body landmarks.
 *
 * @param {HTMLImageElement} image
 * @param {import('./artwork.js').ArtworkAnalysis} artwork
 * @returns {Promise<import('./chestArea.js').ChestArea|null>}
 */
export async function chestAreaFromPose(image, { modelUrl } = {}) {
  let poses;
  try {
    const detector = await loadDetector(modelUrl);
    poses = await detector.estimatePoses(image, { maxPoses: 1, flipHorizontal: false });
  } catch {
    return null; // model unavailable — caller falls back to the garment mask
  }
  if (!poses || poses.length === 0) return null;

  const kps = poses[0].keypoints ?? [];
  const lS = pick(kps, "left_shoulder");
  const rS = pick(kps, "right_shoulder");
  if (!lS || !rS) return null; // without both shoulders there is no chest

  const lH = pick(kps, "left_hip");
  const rH = pick(kps, "right_hip");

  const W = image.naturalWidth || image.width;
  const H = image.naturalHeight || image.height;

  const shoulderMid = mid(lS, rS);
  const shoulderSpan = dist(lS, rS);
  if (shoulderSpan < W * 0.06) return null; // subject too small to trust

  // Torso axis. With both hips we measure it; with neither we fall back to
  // straight down, which is correct for a frontal shot and is only used to
  // cap the print height.
  const hipMid = lH && rH ? mid(lH, rH) : lH || rH || null;
  const torsoLength = hipMid ? dist(shoulderMid, hipMid) : shoulderSpan * 1.5;

  // Rotation from the shoulder line — a far more stable estimator than the
  // garment silhouette's centre, which wanders with sleeves and hands.
  const dx = rS.x - lS.x;
  const dy = rS.y - lS.y;
  let rotation = (Math.atan2(dy, dx) * 180) / Math.PI;
  // Keypoints are ordered left-then-right in image space for a frontal subject;
  // normalise so a level shoulder line reads as 0.
  if (rotation > 90) rotation -= 180;
  if (rotation < -90) rotation += 180;

  // Heavily damped, and off entirely below a real lean.
  //
  // A shoulder line tilts for two reasons that look identical here: the model
  // genuinely leaning, and the near shoulder sitting closer to the camera on a
  // turned torso. Only the first should rotate the print. Across twelve
  // hand-calibrated mockups — several with shoulder tilts of eight to eleven
  // degrees — a human chose zero rotation every single time, so the tilt these
  // photographs carry is the second kind. A wrongly rotated print is also far
  // more visible than a missed one, which settles the direction to err in.
  if (Math.abs(rotation) < ROTATION_DEADZONE) rotation = 0;
  else {
    rotation = Math.sign(rotation) * (Math.abs(rotation) - ROTATION_DEADZONE) * ROTATION_DAMPING;
    rotation = Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, rotation));
  }

  // Print band, anchored to the shoulder line and scaled by shoulder span.
  const printW = shoulderSpan * PRINT_WIDTH;
  let printH = shoulderSpan * PRINT_HEIGHT;

  // Never run past the waist. On a seated model the torso is foreshortened, so
  // this cap is what keeps the print off the lap without any pose branching.
  const maxH = torsoLength * MAX_TORSO_FRACTION - shoulderSpan * TOP_BELOW_SHOULDER;
  if (maxH > shoulderSpan * 0.3) printH = Math.min(printH, maxH);

  // Walk down the torso axis from the shoulder midpoint.
  const axis = hipMid
    ? { x: (hipMid.x - shoulderMid.x) / torsoLength, y: (hipMid.y - shoulderMid.y) / torsoLength }
    : { x: 0, y: 1 };

  const topOffset = shoulderSpan * TOP_BELOW_SHOULDER;
  const centreOffset = topOffset + printH / 2;
  const centre = {
    x: shoulderMid.x + axis.x * centreOffset,
    y: shoulderMid.y + axis.y * centreOffset,
  };

  const confidence = Math.min(
    1,
    (lS.score + rS.score) / 2 * 0.6 + (lH && rH ? 0.4 : lH || rH ? 0.2 : 0.05),
  );

  // ---- perspective -----------------------------------------------------
  // Shoulders and hips bound the torso, and that quad is trapezoidal exactly
  // when the body is turned: the near shoulder is closer to the lens, so it
  // images wider than the far one. Nothing has to infer the camera angle — the
  // shape of the quad *is* the measurement.
  //
  // The print rectangle is expressed in the torso's own flat coordinates and
  // carried into the photograph by the quad's projective map, so it inherits
  // whatever perspective the torso has.
  const quad =
    lH && rH ? buildPrintQuad({ lS, rS, lH, rH }, shoulderSpan, printH, W, H) : null;
  const perspective = EMIT_PERSPECTIVE ? quad : null;

  return {
    centerX: centre.x / W,
    centerY: centre.y / H,
    width: printW / W,
    height: printH / H,
    rotation,
    perspective,
    confidence,
    landmarks: {
      shoulderSpan: shoulderSpan / W,
      shoulderMidY: shoulderMid.y / H,
      hipMidY: hipMid ? hipMid.y / H : null,
      torsoLength: torsoLength / H,
    },
    analysis: {
      source: "pose",
      pose: classify(shoulderMid, hipMid, shoulderSpan, torsoLength),
      cameraAngle: angleFrom(lS, rS, kps),
      occlusionRatio: 0,
      occluded: false,
      collarDetected: true,
    },
  };
}

/**
 * The print area as a quad that follows the torso's perspective.
 *
 * Returns normalized image coordinates as [x0,y0,x1,y1,x2,y2,x3,y3], corners
 * clockwise from top-left, or null when the torso is too close to flat to be
 * worth warping — below the taper gate the quad is noise and warping would
 * cost sharpness for nothing.
 */
function buildPrintQuad({ lS, rS, lH, rH }, shoulderSpan, printH, W, H) {
  // Order by image x, not by anatomical side: for a frontal subject the
  // model's left shoulder sits on the image right, and a turned or mirrored
  // shot can swap them again.
  const shoulderLeft = lS.x <= rS.x ? lS : rS;
  const shoulderRight = lS.x <= rS.x ? rS : lS;
  const hipLeft = lH.x <= rH.x ? lH : rH;
  const hipRight = lH.x <= rH.x ? rH : lH;

  // Separate perspective from anatomy before building the quad.
  //
  // Shoulders are wider than hips on everyone, so the raw shoulder→hip quad is
  // a trapezoid even for a subject facing straight at the lens. Warping on that
  // taper skews the print for a reason that has nothing to do with the camera —
  // and a t-shirt's side seams hang close to vertical regardless of the body
  // narrowing underneath.
  //
  // The perspective signal is the *asymmetry* between the two sides: when a
  // torso turns, the near half foreshortens less than the far half. Dividing
  // out the symmetric component leaves exactly that.
  const shoulderMidPt = { x: (lS.x + rS.x) / 2, y: (lS.y + rS.y) / 2 };
  const hipMidPt = { x: (lH.x + rH.x) / 2, y: (lH.y + rH.y) / 2 };

  const halfLeftS = Math.abs(shoulderLeft.x - shoulderMidPt.x);
  const halfRightS = Math.abs(shoulderRight.x - shoulderMidPt.x);
  const halfLeftH = Math.abs(hipLeft.x - hipMidPt.x);
  const halfRightH = Math.abs(hipRight.x - hipMidPt.x);
  if (halfLeftS < 1 || halfRightS < 1) return null;

  // Symmetric narrowing = anatomy. Divide it out.
  const anatomical = (halfLeftH + halfRightH) / (halfLeftS + halfRightS);
  if (!(anatomical > 0.05)) return null;

  const skewLeft = halfLeftH / (anatomical * halfLeftS);
  const skewRight = halfRightH / (anatomical * halfRightS);

  // Bottom edge: the shoulder line carried down the torso axis, keeping each
  // side's own foreshortening but none of the body's taper.
  const axisX = hipMidPt.x - shoulderMidPt.x;
  const axisY = hipMidPt.y - shoulderMidPt.y;

  const torso = [
    [shoulderLeft.x, shoulderLeft.y],
    [shoulderRight.x, shoulderRight.y],
    [shoulderRight.x + axisX + (halfRightS * (skewRight - 1)), shoulderRight.y + axisY],
    [shoulderLeft.x + axisX - (halfLeftS * (skewLeft - 1)), shoulderLeft.y + axisY],
  ];

  if (quadTaper(torso) < MIN_TAPER) return null;

  // Torso-local space: u across the shoulder line, v from shoulders to hips.
  const torsoLength = Math.hypot(axisX, axisY);
  if (torsoLength < 1) return null;

  const vTop = (shoulderSpan * TOP_BELOW_SHOULDER) / torsoLength;
  const vHeight = printH / torsoLength;
  if (vTop + vHeight > 1.15) return null; // print would run past the hips

  const mapped = mapRectIntoQuad(torso, {
    x: (1 - PRINT_WIDTH) / 2,
    y: vTop,
    w: PRINT_WIDTH,
    h: vHeight,
  });
  if (!mapped) return null;

  return mapped.flatMap(([x, y]) => [x / W, y / H]);
}

/**
 * Seated torsos are foreshortened: the shoulder-to-hip distance shrinks
 * relative to shoulder width, which is measurable rather than assumed.
 */
function classify(shoulderMid, hipMid, shoulderSpan, torsoLength) {
  if (!hipMid) return "unknown";
  const ratio = torsoLength / shoulderSpan;
  if (ratio < 1.15) return "seated";
  if (ratio < 1.5) return "relaxed";
  return "standing";
}

/** Foreshortening of the shoulder line tells us which way the body is turned. */
function angleFrom(lS, rS, kps) {
  const nose = kps.find((p) => p.name === "nose");
  if (!nose || nose.score < MIN_SCORE) return "unknown";
  const span = Math.abs(rS.x - lS.x);
  if (span < 1) return "unknown";
  const centre = (lS.x + rS.x) / 2;
  const offset = (nose.x - centre) / span;
  if (offset > 0.18) return "turned-right";
  if (offset < -0.18) return "turned-left";
  return "frontal";
}
