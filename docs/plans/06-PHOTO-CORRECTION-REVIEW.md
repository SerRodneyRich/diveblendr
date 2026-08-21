# 06 — Underwater photo correction: review and overhaul plan

Status: **review complete, overhaul implemented** (see §7 for what shipped).
Scope: `/photo` (and the `/photo-correction` shim), `src/components/PhotoCorrection/*`,
`src/utils/imageProcessing/*`, `src/types/photoCorrection.ts`.

---

## 1. Correctness of the colour science

### 1.1 The current model is not a model

The shipped correction is, in full:

```ts
r = r * (1 + redBoost/100)
g = g * (1 + greenReduction/100)
b = b * (1 + blueReduction/100)
```

three constant per-channel gains, applied to **sRGB-encoded** values, with the
multipliers coming from a hand-typed table. That is a global white-balance
scaling and nothing more. It cannot invert underwater colour loss, for four
independent reasons:

1. **Attenuation is exponential in path length, not constant.** Beer–Lambert
   gives transmission `t_c = exp(-β_c · z)`. The loss is a *function of distance*;
   a single multiplier is the correct inverse only for one specific `z`. Two
   subjects in the same frame at 1 m and 8 m need gains differing by a factor of
   `exp(β_R · 7)` — for clear ocean water that is roughly 20×.
2. **The gains are applied in the wrong space.** `data[i]` is sRGB, which is
   gamma-encoded (≈2.2). Beer–Lambert is linear-light physics. Multiplying a
   gamma-encoded value by 1.4 does not scale the underlying radiance by 1.4; it
   scales it by ≈1.4^2.2 ≈ 2.2. Every published multiplier is therefore wrong by
   an amount that varies with pixel brightness, which is why the "extreme" preset
   at `redBoost: 60` produces the blown magenta highlights the tool is known for.
3. **Clipping is asymmetric and silent.** `Math.min(255, r * gain)` clamps the
   red channel first, so as gain rises, bright pixels progressively lose *hue*
   information — they slide toward cyan-shadow/white-highlight rather than
   getting warmer. There is no highlight roll-off.
4. **The white balance the camera already applied is ignored.** A GoPro shooting
   auto-WB underwater has *already* pushed red hard. The presets stack a second
   fixed push on top of an unknown first one. This is the single biggest reason
   results are inconsistent between cameras — and it is precisely what the
   per-camera preset list claims to solve but cannot.

### 1.2 Is the preset table physically grounded? No.

**Honest answer: the numbers are invented.** The evidence is internal to the table
and does not require an external source to establish:

- The file comments claim "based on professional research" and "professional
  research" is never cited. No source appears anywhere in the repository.
- The four Hero11 presets are `redBoost` 15 / 25 / 35 / 45 across depth bands
  0-15 / 15-30 / 30-60 / 60+ ft. That is an **arithmetic sequence in +10 steps
  against a geometric physical process.** Real attenuation is exponential; equal
  depth steps cannot produce equal correction steps, and these depth bands are
  not even equal (15, 15, 30, and unbounded ft).
- Every other field moves in lockstep with `redBoost` — contrast, brightness and
  saturation all ramp monotonically with depth. There is no physical reason for
  *contrast* to be a function of depth in this way; it is a stylistic ramp typed
  to look plausible.
- **The per-camera distinction is not real.** "Hero11: Tropical Clear (15-30ft)"
  is `redBoost 25`; "Hero10: Caribbean Reef (10-25ft)" is `redBoost 22`. These
  are different cameras, different water, different depth bands — and the
  difference is 3 units on a scale whose physical meaning is undefined. A
  camera's effect on colour is its spectral response and its white-balance
  behaviour; neither is captured by a scalar red gain. The camera axis of this
  table carries no information.
- `Emergency: Extreme Recovery` at `redBoost 60, contrast 50, saturation 35` is
  not a correction, it is a destruction preset.

So: 16 presets across 7 categories, of which the meaningful axis (roughly "how
much red is missing") is one dimension with about four useful stops. The other
axes are decoration.

### 1.3 What the physics actually says

Correct model, and the one implemented in §7:

- Light is attenuated per Beer–Lambert along the **whole optical path**: sunlight
  down to the subject (`depth`), then subject to camera (`distance`). Both legs
  matter and they are not interchangeable — the down leg is attenuated by the
  water column above the subject, the return leg by the horizontal water between
  subject and lens.
- The wavelength dependence is set by **water type**. Jerlov's classification
  (oceanic I, IA, IB, II, III; coastal 1C–9C) is the standard scheme, derived
  from downwelling diffuse attenuation `Kd(λ)` measurements.
- **The "red goes first" rule is only true for oceanic water.** In coastal and
  green water, short (blue) wavelengths are absorbed most strongly by CDOM and
  the *green* band penetrates furthest. This is stated explicitly in Berman et
  al. and Akkaynak et al. (see §7 citations). The current tool bakes in
  "always boost red, always cut blue and green", which is actively wrong for
  green/coastal water — and "Murky Green Water" is in its own preset list,
  corrected with `redBoost 40, greenReduction -25`, i.e. the oceanic recipe
  applied to water where it does not hold.
- **Full inversion is not achievable and must be capped.** At 30 m in clear
  water, red transmission is ~1e-6. Dividing by that amplifies sensor noise by a
  million. Any honest implementation caps the gain and says so.

Caveat worth carrying: Akkaynak & Treibitz (CVPR 2017/2018) showed the wideband
per-channel coefficient is **not** a constant of the water — it depends on range,
reflectance, camera spectral response and ambient spectrum. A depth/water-type
model is therefore a principled *estimate*, not ground truth. The UI must not
present it as a measurement.

---

## 2. What works well — keep it

This is genuinely useful software and the following earns that:

- **The whole pipeline is client-side.** No upload, no account, no server. For
  divers on boat wifi with 200 photos this is the right architecture and a real
  privacy property. Keep absolutely.
- **Automatic pre-compression on import** (`src/utils/imageCompression.ts`) is
  well-judged: device-aware, size-tiered, and it is why the tool stays usable on
  a phone with 20 MB files. Genuinely good engineering. Kept as-is.
- **Batch/multi-image handling with per-image state** — upload many, edit one,
  apply to all. That matches how divers actually work (a whole dive's photos
  share a depth and water type). The *concept* is right even though the
  implementation duplicates state.
- **Tiled processing for large images** in `UnderwaterProcessor` with progress
  callbacks and yields — the right instinct for not locking the tab.
- **Bilateral filter + unsharp mask** in `imageEnhancement.ts` are real,
  correctly-implemented algorithms (edge-preserving denoise, then sharpen; and
  in the right order). High-ISO noise is a genuine underwater problem. Worth
  keeping, though see §3 on where they run.
- **The preview-region trick** (process a 400px centre crop first, full image on
  demand) is a smart answer to bilateral filtering being O(n·r²). Photoshop does
  the same thing.
- **Rotate, share via Web Share API, keyboard shortcuts, favourite presets** —
  small touches that show real use.
- **GPR/RAW rejection with an actionable message** naming Adobe DNG Converter,
  rather than a generic failure. Good error copy.

## 3. Architecture problems

| # | Problem | Detail |
|---|---|---|
| A1 | **Preset table duplicated verbatim** | The identical 300-line `CAMERA_PRESETS` array is copy-pasted into *both* `photo/page.tsx` and `PhotoEditorModal.tsx`. Two sources of truth already drifting. |
| A2 | **God components** | 1081-line page + 1872-line modal, both mixing data, colour maths, canvas work and markup. |
| A3 | **The WebGL path does not exist** | `processWithWebGL()` logs "falling back to Canvas" and calls the canvas path. `createWebGLContext` is imported and never invoked. `selectProcessingMethod` carefully routes >1080p images to a branch that is a no-op. ~113 lines of detection code feeding a decision with no consequence. |
| A4 | **Colour correction silently dropped in the enhancement branch** | **Real bug.** In `processImage`, the enhancement path reads the pixels, has a comment `// (apply same corrections as above here…)`, and writes them back unmodified. Turning on noise reduction or sharpening *discards every colour correction*. |
| A5 | **Everything runs on the main thread** | Bilateral filtering a 12 MP image is tens of seconds of blocking JS. `await setTimeout(0)` between tiles yields, but each tile is still one long synchronous block. No worker. |
| A6 | **Object URLs leak** | `loadImage()` calls `URL.createObjectURL(file)` and never revokes. `processImage()` creates `originalUrl` per call, returned but rarely revoked. Every re-process on every slider move leaks a full-resolution blob. |
| A7 | **Re-process on every keystroke, from scratch** | A 100 ms debounce, then full decode + full-resolution pixel loop + `toDataURL` for a slider nudge. `toDataURL` on a 12 MP canvas produces a ~10 MB base64 string held in React state. |
| A8 | **Duplicated/forked state** | `settings` live in the modal, in the page's `selectedImages[].settings`, and partially in `baseProcessedCanvas`/`cleanProcessedCanvas`/`lastEnhancementSettings`. Nine `useState`s coordinate one derived image. |
| A9 | **56 `console.*` calls in production paths** | Violates the repo's own rule. Includes logging every image load and every progress tick. |
| A10 | **`handleApplyToAll` reads stale state** | It calls `setSelectedImages` then immediately iterates the `selectedImages` closure variable, so it batches over the pre-update array. |
| A11 | **Legacy styling throughout** | `bg-black/20`, `border-white/10`, `text-white`, hand-rolled `fixed inset-0` modals, raw `<button>`s — none of it uses the primitives or tokens the style guide mandates. |

## 4. UX gaps

- **No before/after.** The single most important control in a correction tool is
  missing. You cannot see what you changed.
- **No undo/redo, no per-slider reset.** "Reset" nukes everything to defaults.
- **EXIF orientation ignored.** Photos shot in portrait on a phone display
  sideways. Worse, rotation is applied as a **CSS transform on the preview
  only** — the exported file is unrotated, so what you save is not what you saw.
  The compression step re-encodes through a canvas, which *strips* the EXIF
  orientation flag, so the tool destroys the only thing that would have made a
  viewer render it correctly.
- **Export is JPEG-only at fixed quality** (0.92 in the processor, 0.9 in the
  modal — inconsistent), no PNG/WebP choice, no quality control, and the download
  filename keeps the original extension while the bytes are always JPEG (a
  `.png` download that is actually JPEG data).
- **16 presets across 7 categories** presented as a flat scrolling list, most of
  which differ by single digits in one parameter. Overwhelming and
  undiscoverable at once — the user cannot tell which axis matters.
- **The "All Presets" grid decodes the source image 16 times** to build
  thumbnails, in batches of 3, with a full-screen blocking spinner.
- **Mobile**: a 4-tab bar inside a full-screen overlay, controls below the fold,
  and the image area fixed at `min-h-[40vh]`.
- **Accessibility**: hand-rolled overlays with no dialog semantics, no focus
  trap, no `aria-label`s on icon buttons, sliders with `<label>` not bound to
  inputs, and a keyboard handler that hijacks bare `1`/`2`/`3`/`Delete` globally.

---

## 5. Recommended plan

1. **Extract a real model into `src/lib/photo/`** — pure, framework-free, tested:
   Beer–Lambert attenuation per RGB band from Jerlov water type, depth and
   subject distance; inverse with an explicit, documented gain cap; all maths in
   linear light with proper sRGB transfer functions.
2. **Make auto the default path.** Estimate the illuminant from the image itself
   (shades-of-grey, Minkowski norm p=6) so the zero-effort result is good.
   Sliders become refinement, not the primary interface.
3. **Collapse the presets** to the axis that carries information: water type
   (a handful) × depth, both feeding the physical model — not a magic-number table.
4. **Thin the page**, move work into `src/lib/photo/` + hooks, run pixel work in
   a Web Worker compatible with `output: export`.
5. **UX**: before/after, undo, EXIF orientation baked into pixels, real export
   controls, mobile-first, `@/components/ui` primitives and tokens throughout.

---

## 6. Deliberately out of scope

- **RAW/GPR decoding** — needs a heavyweight decoder; the existing "convert
  first" message is the right answer.
- **Dehazing / backscatter removal** — Sea-thru-class restoration needs a depth
  map per pixel. Without range data it is guesswork; the honest version of that
  feature is not a slider.
- **Rewriting the bilateral filter** — it is correct; it only needed to move off
  the main thread.

---

## 7. What shipped

### Modules (`src/lib/photo/`, all pure and unit-tested)

| File | Contents |
|---|---|
| `color.ts` | sRGB ⇄ linear transfer (IEC 61966-2-1), luminance (Rec. 709), clamping |
| `water.ts` | Jerlov water types, per-band attenuation coefficients, Beer–Lambert |
| `attenuation.ts` | Path-length model → per-channel gains, with documented cap |
| `autoWhiteBalance.ts` | Shades-of-grey illuminant estimation (Minkowski norm) |
| `pipeline.ts` | The ordered correction pipeline over an RGBA buffer |
| `presets.ts` | Water type × depth presets derived *from the model* |

### Sourcing and honesty about numbers

Citations that are real and load-bearing:

- **Jerlov, N. G., _Marine Optics_ (Elsevier, 1976)** — the water-type
  classification scheme itself.
- **Solonenko & Mobley, "Inherent optical properties of Jerlov water types",
  _Applied Optics_ 54(17):5392 (2015)** — modern IOP fits for those types.
- **Mobley, _Light and Water_ (1994)**, based on measurements in **Austin &
  Petzold (1986)** — the source chain for per-wavelength β used by the imaging
  literature.
- **Berman, Treibitz & Avidan, "Underwater Single Image Color Restoration Using
  Haze-Lines…"** (BMVC 2017 / arXiv:1811.01343) — evaluates the RGB bands at
  **600 / 525 / 475 nm** (R/G/B peak camera sensitivity), the convention adopted
  here, and establishes that coastal water inverts the red-first ordering.
- **Akkaynak et al., "What Is the Space of Attenuation Coefficients in
  Underwater Computer Vision?"** (CVPR 2017) and **Akkaynak & Treibitz, "A
  Revised Underwater Image Formation Model"** (CVPR 2018) / **Sea-thru** (CVPR
  2019) — the caveat that wideband coefficients depend on range, reflectance and
  camera response.
- **Pope & Fry, _Applied Optics_ 36:8710 (1997)** — pure-water absorption.
- **Finlayson & Trezzi, "Shades of Gray and Colour Constancy"** (IS&T/SID Color
  Imaging Conference, 2004) — the Minkowski-norm white-balance estimator.

**What is derived rather than cited.** The absolute per-type β triplets in
`water.ts` are *interpolated/estimated* by me from the published Jerlov spectra
and pure-water absorption, not transcribed from a table. They are labelled
`DERIVED — not a transcribed published table` in the source, with the reasoning
inline. Two specific honesty notes:

- I could not obtain a machine-readable copy of Jerlov (1976) Tables XXVI/XXVII.
  The Ocean Optics Web Book links `Jerolv_types.xlsx` (sic) and that asset 404s.
- The one *published, numeric* RGB table I did find — `get_water_types.m` in
  Berman's reference implementation — is licensed **CC BY-NC**, which is
  incompatible with GPL-3.0. It was **not copied.** It was used only as a
  read-only sanity check that my derived ratios land in the same region, in the
  same way `NOTICE.md` permits Subsurface as a validation oracle. Note also that
  that file exposes only **8** ratio pairs for **10** named water types, so any
  label-to-number mapping taken from it would have been guesswork anyway — a
  second reason not to use it as the source.

Numbers I estimated are marked as estimates. No citation in the source
attributes a number to a paper it did not come from.

### Behavioural decisions worth recording

- **Gain is capped** (`MAX_CHANNEL_GAIN`, 12). Beyond it the inverse amplifies
  noise, not signal. The UI reports when a correction is cap-limited rather than
  silently returning a noisy image.

  Worth recording how this was nearly shipped broken. `attenuationGains` caps
  its own output, so the unit tests passed — but the *auto white-balance*
  estimate is unbounded, and nothing capped the two together. Loading a real
  photo into the built page showed an applied red gain of **25.06x** beside a UI
  that claimed a cap of 12. The fix caps the combined gain, and it has to
  compress in **log space**: scaling all three channels by a constant and then
  renormalising against the minimum returns the original values exactly, which
  silently cancels the cap. Four regression tests now cover it. This is a
  worked example of the repo's own rule that a green `src/lib` suite does not
  mean the page is right.
- **All correction happens in linear light**, sRGB-decoded on the way in and
  re-encoded on the way out — the fix for §1.1(2).
- **Highlight roll-off instead of hard clipping**, so raising red desaturates
  gracefully rather than tearing to magenta.
- **Auto white balance is the default**; depth/water-type is an optional
  physical prior layered on it.

---

## 8. Open items to carry into the roadmap

- **P1 — Batch apply is still sequential and main-thread-bounded.** One worker
  processes images one at a time. A pool would use all cores.
- **P2 — Distance-to-subject is a single global value.** Physically it varies
  per pixel. Correct fix needs a depth map (Sea-thru); explicitly out of scope.
- **P3 — RAW/GPR still unsupported**, by choice.
- **P4 — `src/utils/imageProcessing/` legacy modules.** `underwaterCorrection.ts`
  and `webglDetection.ts` are now unused by the photo tool and could be deleted
  once nothing else references them; left in place to keep this diff scoped.
- **P5 — Export currently offers JPEG/PNG/WebP; HEIC output is not possible**
  in-browser.
