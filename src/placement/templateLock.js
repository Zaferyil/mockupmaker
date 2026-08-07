// ============================================================
// Template Lock — geometry is measured once, then reused forever
// ============================================================
//
// THE CENTRAL IDEA
// ----------------
// A mockup's printable chest area is a property of the *photograph*. It does
// not depend on which design gets printed on it. So it should be measured
// exactly once, stored, and reused for every artwork thereafter.
//
// That is what removes the remaining variance. Even a perfect detector run
// twice on the same JPEG can differ by a pixel; running it zero times cannot.
// After the first solve, a template's geometry is frozen and every subsequent
// upload is a pure arithmetic fit into a fixed box.
//
// TWO KINDS OF LOCK
// -----------------
//   'chest'  — a measured chest area. Artwork-independent, so each new design
//              is fitted into it on its own terms (honouring its own aspect
//              ratio and trim).
//   'pinned' — a rectangle a human dragged. Its centre, width and rotation are
//              authoritative and are reused verbatim; only the height is
//              re-derived per artwork. Human calibration outranks the solver
//              and is never overwritten by it.
//
// Every hand-calibrated placement already in the R2 bucket is imported as a
// 'pinned' lock, so existing good mockups keep their exact appearance.

const LOCK_VERSION = 2;

/**
 * @typedef {Object} TemplateLock
 * @property {string} templateId
 * @property {'chest'|'pinned'} kind
 * @property {number} centerX
 * @property {number} centerY
 * @property {number} width      chest width, or pinned artwork width
 * @property {number} height     chest height (chest locks only)
 * @property {number} rotation
 * @property {number[]|null} perspective
 * @property {number} confidence
 * @property {number} version
 */

export function createLockStore(initial = {}) {
  const locks = new Map();
  for (const [id, rec] of Object.entries(initial)) {
    if (rec) locks.set(id, rec);
  }

  return {
    has: (id) => locks.has(id),
    get: (id) => locks.get(id) ?? null,

    /** Record measured chest geometry. Never overwrites a pinned lock. */
    setChest(id, chest) {
      const existing = locks.get(id);
      if (existing?.kind === "pinned") return existing;
      const lock = {
        templateId: id,
        kind: "chest",
        centerX: chest.centerX,
        centerY: chest.centerY,
        width: chest.width,
        height: chest.height,
        rotation: chest.rotation,
        perspective: chest.perspective,
        confidence: chest.confidence,
        version: LOCK_VERSION,
      };
      locks.set(id, lock);
      return lock;
    },

    /** Record a human adjustment. Always wins. */
    setPinned(id, placement, derivedHeight) {
      const lock = {
        templateId: id,
        kind: "pinned",
        centerX: placement.centerX,
        centerY: placement.centerY,
        width: placement.width,
        height: derivedHeight ?? 0,
        rotation: placement.rotation ?? 0,
        perspective: placement.perspective ?? null,
        confidence: 1,
        version: LOCK_VERSION,
      };
      locks.set(id, lock);
      return lock;
    },

    /** Clear a lock so the next render re-measures from scratch. */
    clear(id) {
      locks.delete(id);
    },

    /** Serializable snapshot for the R2 `/placements` endpoint. */
    toJSON() {
      return Object.fromEntries(locks);
    },

    size: () => locks.size,
  };
}

/**
 * Convert a locked template into a chest-area-shaped object the solver can
 * consume, so both lock kinds take the same code path downstream.
 */
export function lockToChest(lock) {
  return {
    centerX: lock.centerX,
    centerY: lock.centerY,
    width: lock.width,
    // The rectangle a human calibrated IS the print area.
    //
    // Earlier versions treated a pinned lock as a width and left height
    // unconstrained. That makes the rendered size depend entirely on each
    // design's aspect ratio: a square design and a portrait one at the same
    // width come out very different heights, which is the "it changes my
    // design's size" complaint. Nothing about the artwork should decide how
    // big the print is — the calibrated box should.
    //
    // With a real height, every design is fitted *inside* the same rectangle,
    // touching it on whichever axis binds first and keeping its own
    // proportions exactly. Legacy records carry height 0; those fall back to a
    // square area so they still behave sanely until recalibrated.
    height: lock.kind === "chest" ? lock.height : lock.height > 0 ? lock.height : lock.width,
    rotation: lock.rotation,
    perspective: lock.perspective,
    confidence: lock.confidence,
    landmarks: null,
    analysis: { fromLock: true, kind: lock.kind },
  };
}

/**
 * Import whatever the `/placements` endpoint returned.
 *
 * Handles three generations of record: v2 locks, v1 canonical placements, and
 * the original percent boxes. Older formats are all treated as pinned, because
 * the only reason any of them exists is that a human put it there.
 */
export function importPlacements(raw, fromLegacy) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;

  for (const [id, rec] of Object.entries(raw)) {
    if (!rec || typeof rec !== "object" || id.startsWith("__")) continue;

    if (rec.version === LOCK_VERSION && rec.kind) {
      out[id] = rec;
      continue;
    }

    const placement = fromLegacy(rec);
    if (!placement) continue;

    out[id] = {
      templateId: id,
      kind: "pinned",
      centerX: placement.centerX,
      centerY: placement.centerY,
      width: placement.width,
      height: 0,
      rotation: placement.rotation ?? 0,
      perspective: null,
      confidence: 1,
      version: LOCK_VERSION,
    };
  }
  return out;
}
