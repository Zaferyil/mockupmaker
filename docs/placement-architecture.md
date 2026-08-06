# Deterministic artwork placement

Replaces the AI-estimated placement that produced inconsistent results with a
measured, locked and validated pipeline.

## The root cause

The previous implementation called:

```js
const predictions = await model.estimateObjects(mockupImg);
```

`estimateObjects` is not a method on coco-ssd — the API is `detect()`. That
line threw a `TypeError` on **every single invocation**, and the throw was
swallowed by a `catch` that logged `"Advanced detection skipped"`. Detection
therefore never completed once, for any mockup, ever.

Every symptom follows from this:

| Symptom | Cause |
| --- | --- |
| Old mockups placed perfectly | Hand-dragged and saved to R2 `_placements.json` |
| New mockups placed badly | No saved record → hard-coded `DEFAULT_PLACEMENT` (76%×60%) |
| "Some too high, some too low" | A mix of hand-calibrated and default records |
| "Some slightly resized" | Transparent PNG padding (see below) |

The hand-calibrated records were the only thing that ever worked — which is
also the strongest argument for the Template Lock design.

## Pipeline

```
artwork PNG ──► artwork.js      trim, aspect, orientation, recommended size
                                        │
mockup photo ──► garmentMask.js ──► chestArea.js ──► solve.js ──► validate.js ──► compositor.js
                 shirt mask         landmarks +      fit,          tolerance      artwork, then
                 (region grow)      print band       preserve AR   check + repair fabric shading
                                        │
                                  templateLock.js  measured once, reused forever
```

Resolution order, highest authority first:

1. **Pinned lock** — a human dragged it. Reused verbatim, never overwritten.
2. **Chest lock** — this template was measured before. Reused verbatim.
3. **Fresh measurement** — segment, find landmarks, solve, validate, then lock.
4. **Neutral fallback** — everything failed; a safe centred print.

Tiers 1 and 2 run no detection at all. That is what makes repeat renders
identical: the only way to guarantee two runs agree is for the second one not
to run.

## Why each change improves accuracy

### `contract.js` — centre-anchored, one size axis

The old record was `{left, top, width, height}`. Two failure modes were baked
in: `height` was a free variable that could drift out of sync with `width`
(stretching), and a top-left anchor shifts the design whenever the size changes
(so "same placement" never survived a resize).

The canonical record stores `centerX, centerY, width, rotation`. Height is
*derived* from the artwork's aspect ratio at render time. Stretching is not
discouraged — it is unrepresentable.

All values are normalized fractions, so a 1000px and a 4000px render of the
same shot produce the same record.

### `artwork.js` — measures the design, not the PNG canvas

Exported POD artwork routinely carries 10–25% transparent margin, and the
margin is rarely symmetric. Scaling by the canvas box makes the design render
smaller than requested *and* sit off-centre by half the margin asymmetry.

This is the best explanation for "some shifted left, some shifted right, some
slightly resized", because it varies per artwork file rather than per mockup.

Everything downstream consumes the alpha-trimmed box. Verified by test: the
same visible design with and without 25% padding renders byte-identical ink.

### `garmentMask.js` — a real mask, not a bounding box

Classical region growing, not a neural segmenter. A learned model re-introduces
the variance we are removing: its mask shifts with pose and crop, so the print
rectangle shifts with it. Region growing on a flat-colour blank is fully
deterministic and snaps to the true fabric edge.

Three mechanisms make it robust:

- **Chromaticity/luminance split.** A fold changes how much light reaches the
  fabric, not what colour it is. Matching tightly on chromaticity and loosely on
  luminance grows straight through wrinkles and studio shadows.
- **Achromatic path.** Black/white/grey fabric has degenerate chromaticity, so
  the metric flips to luminance-dominant with a tight chroma gate.
- **Edge barrier.** Growth is blocked across sharp luminance gradients. A
  garment boundary is a sharp step (~0.1 over 1–2px) even when the colours are
  close; a fold is a soft ramp (~0.015/px) even when the swing is large.
  Discriminating by *shape* rather than colour is what contains a white shirt on
  a cream backdrop — a case that pure thresholds cannot solve, and which occurs
  in the real `ivory` and `White` mockups.

Removing the edge barrier regresses colour spread from 0.5% to 16.3%.

### `chestArea.js` — landmarks, not fractions of a box

The old code derived the print area from fractions of a person bounding box
(`py + ph * 0.15`). A bounding box changes shape with pose and crop, so the same
shirt sitting vs standing produced print rectangles at different heights.

Landmarks do not move with pose. The collar is the collar whether the model is
seated, walking or leaning. Detected here:

- **Collar** — a mask gap that *straddles the torso axis*. A gap between sleeve
  and body is lateral and never contains the axis, which is how the two are
  distinguished.
- **Armpit** — the sharpest drop in the axis-run width, where sleeves end.
- **Torso width** — median run width below the armpit. The median rejects rows
  where a hand, mug or phone cuts the silhouette.
- **Tilt** — least-squares fit of the torso centre line.
- **Occlusion** — holes inside the print band (arms, hair, accessories). When
  significant, the band retreats to the largest clean sub-band.

Every dimension is a multiple of **torso width**, which is what makes the result
camera-invariant: a 12in print on a 20in chest is 0.6 chest-widths whether the
camera was two metres away or five.

### `solve.js` — contain, never cover

Only one axis is ever solved for; the other is derived. The artwork can
therefore never be cropped and never be stretched.

`refitLocked` handles a new artwork on a locked template: centre, width and
rotation are reused; height re-derives from the new artwork's own ratio. Width
is reduced only if the derived height would run past the locked band.

### `validate.js` — QC with automatic repair

Every placement is checked before export against: cropped, too small, too
large, stretched, off-centre beyond 2%, exceeding the chest area, rotation
mismatch beyond 1°. Failures return a **corrected** placement, so a bad number
cannot reach the exported PNG. Repairs are deterministic corrections toward the
reference, so enforcing twice changes nothing.

### `compositor.js` — artwork before lighting

Render order is photo → artwork → fabric shading. A print composited over the
photo and then left alone reads as a sticker, because the garment's folds stop
at its edge.

Shading is transferred as a **normalized luminance ratio**, not as pixels.
Multiplying raw pixels would tint the artwork with the shirt colour — a white
logo on a pink tee would come out pink. Dividing each pixel's luminance by the
region mean yields a pure light/dark field with colour removed.

Perspective is applied by slicing the artwork horizontally and giving each slice
its own affine scale, reproducing the trapezoid measured from the garment
silhouette. Warping is skipped entirely below 2% taper so straight-on shots stay
pixel-clean.

## Data migration

Existing R2 `_placements.json` records are in the old percent format. They are
imported as **pinned** locks — the only reason such a record exists is that a
human put it there, so it outranks the solver and is never overwritten. Existing
good mockups keep their exact appearance.

## Verification

```
npm run test:placement
```

Generates synthetic shirts (varying colour, scale, position, tilt) plus
synthetic artwork (varying aspect and padding), runs the pipeline headlessly and
asserts the invariants:

| Check | Result |
| --- | --- |
| Identical input → identical output | exact match |
| Centre across 6 shirt colours | 0.5% spread (tolerance 2%) |
| Tracks a translated garment | 0.1196 vs 0.12 expected |
| Scales with garment size | 1.315 vs 1.3 expected |
| Padded vs tight artwork ink | identical |
| Aspect preserved (square/wide/tall) | exact |
| Different artwork shapes share a centre | 0.0000 spread |
| QC repairs an illegal placement | recovers to valid |
| Rotation follows a leaning garment | 0° → −6.3° |

## Known approximations

Stated plainly rather than implied:

- **Perspective** is a trapezoid measured from the garment silhouette, not a
  true homography. Recovering a real homography from a single uncalibrated
  photo without markers is not solvable; the silhouette taper is a real
  measurement and is applied only when it exceeds 2%.
- **Fabric shading** is a luminance transfer from the photo. Genuine
  displacement mapping needs per-mockup depth maps, which these R2 photos do
  not carry.
- **Pose and camera angle** are geometric classifications from the mask
  (tilt, foreshortening, edge asymmetry), reported for diagnostics. They label
  the measurement; they do not drive it.
